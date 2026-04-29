const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const {
  buildGraph,
  createRequestHandler,
  sanitizePersistedConfig,
  sanitizeConfigPatch,
  applyFsEventToState,
  rebuildGraphState,
  materializeGraph,
  scanVaultEntries
} = require('../parser.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function createMockRequest(method, url, body, headers = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = headers;
  process.nextTick(() => {
    if (body !== undefined) {
      req.emit('data', Buffer.from(body));
    }
    req.emit('end');
  });
  return req;
}

function createMockResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    writableEnded: false,
    writeHead(statusCode, headers = {}) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    write(chunk = '') {
      this.body += chunk;
    },
    end(chunk = '') {
      this.body += chunk;
      this.writableEnded = true;
    }
  };
}

async function runHandler(handler, method, url, body, headers = {}) {
  const req = createMockRequest(method, url, body, headers);
  const res = createMockResponse();
  await handler(req, res);
  return res;
}

async function runHappyPath(tmpRoot) {
  const vaultDir = path.join(tmpRoot, 'happy-vault');
  const outFile = path.join(tmpRoot, 'happy-graph.json');

  writeFile(path.join(vaultDir, 'Alpha.md'), '# Alpha\n\n[[Beta]]\n#project\n');
  writeFile(path.join(vaultDir, 'Beta.md'), '# Beta\n\n[[Alpha]]\n');
  const config = sanitizePersistedConfig({
    vaultPath: vaultDir,
    port: 4310,
    accent: '#7c5cff',
    background: '#0a0a0f',
    refreshMs: 1000,
    linkOpacity: 0.18,
    nodeGlow: true,
    particles: true,
    particleSpeed: 1,
    particleDensity: 0.3,
    motionMode: 'balanced',
    clusterByTag: true,
    clusterHalos: true,
    backgroundGradient: true,
    hubLabels: false,
    hubLabelCount: 5,
    labelMinImportance: 0.22,
    edgeColoring: true,
    depthOfField: true,
    noteFlare: true,
    autoScaleLargeVaults: true,
    tagColors: {
      project: '#00ffd5'
    }
  });

  const initial = buildGraph(vaultDir, outFile);
  assert(initial.nodes.length === 2, 'expected 2 nodes in initial graph');
  assert(initial.links.length === 2, 'expected 2 links in initial graph');
  assert(initial.discoveredTags.project === 1, 'expected discovered tag counts');
  const stored = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert(stored.nodes.length === 2, 'expected graph.json to be written');

  const handler = createRequestHandler({
    cfg: config,
    configPath: path.join(tmpRoot, 'config.json'),
    outPath: outFile,
    discoveredTags: initial.discoveredTags
  });

  const configRes = await runHandler(handler, 'GET', '/api/config');
  const safeConfig = JSON.parse(configRes.body);
  assert(configRes.statusCode === 200, 'expected config route to return 200');
  assert(safeConfig.hubLabels === false, 'expected sanitized config response');
  assert(safeConfig.port === undefined, 'config response should not expose port');
  assert(safeConfig.vaultPath === undefined, 'config response should not expose vaultPath');

  const tagsRes = await runHandler(handler, 'GET', '/api/tags');
  const tags = JSON.parse(tagsRes.body);
  assert(tags.project === 1, 'expected tag route to return discovered tags');

  const faviconRes = await runHandler(handler, 'GET', '/favicon.ico');
  assert(faviconRes.statusCode === 204, 'expected favicon route to return 204');

  const patch = sanitizeConfigPatch({ hubLabels: true, hubLabelCount: 7 });
  assert(patch.hubLabels === true && patch.hubLabelCount === 7, 'expected config patch sanitization to work');

  writeFile(path.join(vaultDir, 'Gamma.md'), '# Gamma\n\n[[Alpha]]\n');
  const rebuilt = buildGraph(vaultDir, outFile);
  assert(rebuilt.nodes.length === 3, 'expected rebuild to include new note');
}

async function runDuplicateBasenames(tmpRoot) {
  const vaultDir = path.join(tmpRoot, 'duplicate-vault');
  const outFile = path.join(tmpRoot, 'duplicate-graph.json');

  // Alpha is unique, Beta appears twice — root and nested/
  writeFile(path.join(vaultDir, 'Alpha.md'), '# Alpha\n\n[[Beta]]\n');
  writeFile(path.join(vaultDir, 'Beta.md'), '# Beta root\n\n[[Alpha]]\n');
  writeFile(path.join(vaultDir, 'nested', 'Beta.md'), '# Beta nested\n\n[[Alpha]]\n');

  const result = buildGraph(vaultDir, outFile);

  // Should produce 3 nodes, not crash
  assert(result.nodes.length === 3, `expected 3 nodes, got ${result.nodes.length}`);

  // Alpha stays short since it's unique
  const ids = result.nodes.map(n => n.id).sort();
  assert(ids.includes('Alpha'), 'expected unique basename to keep short id');

  // Both Betas should have folder-prefixed IDs
  assert(ids.some(id => id === 'Beta' || id.endsWith('/Beta')) === false || ids.filter(id => id === 'Beta' || id.includes('Beta')).length === 2,
    'expected both Beta notes to appear as nodes');
  const betaIds = ids.filter(id => id.includes('Beta'));
  assert(betaIds.length === 2, `expected 2 Beta nodes, got ${betaIds.length}`);
  assert(betaIds.every(id => id.includes('/')), 'expected duplicate basenames to use folder/basename IDs');

  // [[Beta]] in Alpha.md should link to BOTH Betas
  const alphaLinks = result.links.filter(l => l.source === 'Alpha');
  assert(alphaLinks.length === 2, `expected Alpha to link to both Betas, got ${alphaLinks.length} links`);

  // Both Betas link back to Alpha
  const betaToAlpha = result.links.filter(l => l.target === 'Alpha' && l.source !== 'Alpha');
  assert(betaToAlpha.length === 2, `expected both Betas to link to Alpha, got ${betaToAlpha.length}`);

  // Duplicate nodes should have a label field with the short basename
  const betaNodes = result.nodes.filter(n => n.id.includes('Beta'));
  assert(betaNodes.every(n => n.label === 'Beta'), 'expected duplicate nodes to have label field');

  // Alpha should NOT have a label field (id is already the basename)
  const alphaNode = result.nodes.find(n => n.id === 'Alpha');
  assert(alphaNode.label === undefined, 'expected unique nodes to omit label field');

  // graph.json should be valid
  const stored = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  assert(stored.nodes.length === 3, 'expected graph.json to contain all 3 nodes');
}

async function runGhostNodes(tmpRoot) {
  const vaultDir = path.join(tmpRoot, 'ghost-vault');
  const outFile = path.join(tmpRoot, 'ghost-graph.json');

  writeFile(path.join(vaultDir, 'Alpha.md'), '# Alpha\n\n[[Beta]]\n[[Nonexistent]]\n[[Also Missing]]\n');
  writeFile(path.join(vaultDir, 'Beta.md'), '# Beta\n\n[[Nonexistent]]\n');

  // With showUnresolvedLinks on
  const withGhosts = buildGraph(vaultDir, outFile, { showUnresolvedLinks: true });
  assert(withGhosts.nodes.length === 4, `expected 4 nodes (2 real + 2 ghost), got ${withGhosts.nodes.length}`);
  const ghosts = withGhosts.nodes.filter(n => n.ghost);
  assert(ghosts.length === 2, `expected 2 ghost nodes, got ${ghosts.length}`);
  assert(ghosts.some(n => n.id === 'Nonexistent'), 'expected Nonexistent ghost node');
  assert(ghosts.some(n => n.id === 'Also Missing'), 'expected Also Missing ghost node');

  // Both Alpha and Beta link to Nonexistent
  const toNonexistent = withGhosts.links.filter(l => l.target === 'Nonexistent');
  assert(toNonexistent.length === 2, `expected 2 links to Nonexistent, got ${toNonexistent.length}`);

  // Only Alpha links to Also Missing
  const toAlsoMissing = withGhosts.links.filter(l => l.target === 'Also Missing');
  assert(toAlsoMissing.length === 1, `expected 1 link to Also Missing, got ${toAlsoMissing.length}`);

  // With showUnresolvedLinks off — no ghosts
  const withoutGhosts = buildGraph(vaultDir, outFile, { showUnresolvedLinks: false });
  assert(withoutGhosts.nodes.length === 2, `expected 2 nodes without ghosts, got ${withoutGhosts.nodes.length}`);
  assert(withoutGhosts.nodes.every(n => !n.ghost), 'expected no ghost nodes when disabled');
  // Only Alpha->Beta link (Beta has no real targets)
  assert(withoutGhosts.links.length === 1, `expected 1 link without ghosts, got ${withoutGhosts.links.length}`);
}

async function runConfigPatch(tmpRoot) {
  const vaultDir = path.join(tmpRoot, 'config-patch-vault');
  const outFile = path.join(tmpRoot, 'config-patch-graph.json');
  const configPath = path.join(tmpRoot, 'config-patch-config.json');

  writeFile(path.join(vaultDir, 'Alpha.md'), '# Alpha\n\n[[Beta]]\n[[Ghost]]\n');
  writeFile(path.join(vaultDir, 'Beta.md'), '# Beta\n\n');

  const cfg = sanitizePersistedConfig({
    vaultPath: vaultDir,
    port: 4311,
    accent: '#7c5cff',
    background: '#0a0a0f',
    refreshMs: 1000,
    linkOpacity: 0.18,
    nodeGlow: true,
    particles: true,
    particleSpeed: 1,
    particleDensity: 0.3,
    motionMode: 'balanced',
    clusterByTag: true,
    clusterHalos: true,
    backgroundGradient: true,
    hubLabels: false,
    hubLabelCount: 5,
    labelMinImportance: 0.22,
    edgeColoring: true,
    depthOfField: true,
    noteFlare: true,
    autoScaleLargeVaults: true,
    showUnresolvedLinks: true
  });

  writeJson(configPath, cfg);

  const entries = scanVaultEntries(vaultDir);
  const state = {
    cfg,
    configPath,
    outPath: outFile,
    entries,
    graphJson: '',
    graphVersion: 0,
    discoveredTags: {}
  };

  const handler = createRequestHandler(state);
  const postHeaders = { 'content-type': 'application/json' };

  // Valid patch: hubLabels + hubLabelCount
  const validRes = await runHandler(handler, 'POST', '/api/config',
    JSON.stringify({ hubLabels: true, hubLabelCount: 9 }), postHeaders);
  assert(validRes.statusCode === 200, `expected 200 from valid config patch, got ${validRes.statusCode}`);
  const updatedConfig = JSON.parse(validRes.body);
  assert(updatedConfig.hubLabels === true, 'expected hubLabels to be true after patch');
  assert(updatedConfig.hubLabelCount === 9, 'expected hubLabelCount to be 9 after patch');

  // Invalid JSON body
  const badJsonRes = await runHandler(handler, 'POST', '/api/config', '{ bad json }', postHeaders);
  assert(badJsonRes.statusCode === 400, `expected 400 for invalid JSON, got ${badJsonRes.statusCode}`);

  // Unknown config key
  const unknownKeyRes = await runHandler(handler, 'POST', '/api/config',
    JSON.stringify({ vaultPath: '/evil' }), postHeaders);
  assert(unknownKeyRes.statusCode === 400, `expected 400 for unknown key, got ${unknownKeyRes.statusCode}`);
  const unknownKeyError = JSON.parse(unknownKeyRes.body);
  assert(
    unknownKeyError.error && unknownKeyError.error.includes('unknown config key'),
    `expected "unknown config key" error, got: ${unknownKeyError.error}`
  );

  // Wrong type
  const wrongTypeRes = await runHandler(handler, 'POST', '/api/config',
    JSON.stringify({ hubLabels: 'yes' }), postHeaders);
  assert(wrongTypeRes.statusCode === 400, `expected 400 for wrong type, got ${wrongTypeRes.statusCode}`);

  // Wrong Content-Type header
  const wrongCtRes = await runHandler(handler, 'POST', '/api/config',
    JSON.stringify({ hubLabels: true }), { 'content-type': 'text/plain' });
  assert(wrongCtRes.statusCode === 415, `expected 415 for wrong Content-Type, got ${wrongCtRes.statusCode}`);

  // Missing Content-Type header (no content-type key)
  const noCtRes = await runHandler(handler, 'POST', '/api/config',
    JSON.stringify({ hubLabels: true }), {});
  assert(noCtRes.statusCode === 415, `expected 415 for missing Content-Type, got ${noCtRes.statusCode}`);

  // GAP 4: showUnresolvedLinks toggle triggers full rebuild
  const versionBefore = state.graphVersion;
  const toggleRes = await runHandler(handler, 'POST', '/api/config',
    JSON.stringify({ showUnresolvedLinks: false }), postHeaders);
  assert(toggleRes.statusCode === 200,
    `expected 200 from showUnresolvedLinks toggle, got ${toggleRes.statusCode}`);
  assert(state.graphVersion > versionBefore,
    `expected graphVersion to increment after showUnresolvedLinks toggle (was ${versionBefore}, now ${state.graphVersion})`);
  const graphData = JSON.parse(state.graphJson);
  assert(
    !graphData.nodes.some(n => n.ghost),
    'expected no ghost nodes in graphJson after showUnresolvedLinks: false'
  );
}

async function runIncrementalWatcher(tmpRoot) {
  const vaultDir = path.join(tmpRoot, 'watcher-vault');

  // Step 1: set up initial vault (Alpha links to Beta)
  writeFile(path.join(vaultDir, 'Alpha.md'), '# Alpha\n\n[[Beta]]\n');
  writeFile(path.join(vaultDir, 'Beta.md'), '# Beta\n\n');

  // Step 2: scan and materialize initial state
  const entries = scanVaultEntries(vaultDir);
  materializeGraph(entries, vaultDir, { showUnresolvedLinks: false });

  // Step 3: build minimal state object
  const state = {
    cfg: { vaultPath: vaultDir, showUnresolvedLinks: false },
    entries,
    graphJson: '',
    graphVersion: 0
  };

  // Step 4: write Gamma.md (links to Alpha)
  const gammaPath = path.join(vaultDir, 'Gamma.md');
  writeFile(gammaPath, '# Gamma\n\n[[Alpha]]\n');

  // Step 5: apply 'add' event
  const addedGamma = applyFsEventToState(state, 'add', gammaPath);
  assert(addedGamma === true, `expected applyFsEventToState to return true for add, got ${addedGamma}`);

  // Step 6: rebuild — 3 nodes
  const result3 = rebuildGraphState(state, { writeToDisk: false });
  assert(result3.nodes.length === 3, `expected 3 nodes after adding Gamma, got ${result3.nodes.length}`);

  // Step 7: delete Alpha.md from disk
  const alphaPath = path.join(vaultDir, 'Alpha.md');
  fs.unlinkSync(alphaPath);

  // Step 8: apply 'unlink' event
  const unlinkedAlpha = applyFsEventToState(state, 'unlink', alphaPath);
  assert(unlinkedAlpha === true, `expected applyFsEventToState to return true for unlink, got ${unlinkedAlpha}`);

  // Step 9: rebuild — 2 nodes (Gamma + Beta)
  const result2 = rebuildGraphState(state, { writeToDisk: false });
  assert(result2.nodes.length === 2, `expected 2 nodes after removing Alpha, got ${result2.nodes.length}`);

  // Step 10: unlinkDir — add a subdirectory note, confirm it appears, then remove the dir
  const subdirPath = path.join(vaultDir, 'subdir');
  const deltaPath = path.join(subdirPath, 'Delta.md');
  writeFile(deltaPath, '# Delta\n\n');

  const addedDelta = applyFsEventToState(state, 'add', deltaPath);
  assert(addedDelta === true, `expected applyFsEventToState to return true for adding Delta, got ${addedDelta}`);

  const result3b = rebuildGraphState(state, { writeToDisk: false });
  assert(result3b.nodes.length === 3, `expected 3 nodes after adding Delta, got ${result3b.nodes.length}`);

  fs.rmSync(subdirPath, { recursive: true });

  const removedDir = applyFsEventToState(state, 'unlinkDir', subdirPath);
  assert(removedDir === true, `expected applyFsEventToState to return true for unlinkDir, got ${removedDir}`);
  assert(!state.entries.has(deltaPath), 'expected Delta to be removed from entries after unlinkDir');
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-live-wallpaper-smoke-'));
  try {
    await runHappyPath(tmpRoot);
    await runDuplicateBasenames(tmpRoot);
    await runGhostNodes(tmpRoot);
    await runConfigPatch(tmpRoot);
    await runIncrementalWatcher(tmpRoot);
    console.log('smoke: ok');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`smoke: failed: ${error.message}`);
  process.exit(1);
});
