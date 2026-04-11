const fs = require('fs');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const {
  buildGraph,
  createRequestHandler,
  sanitizePersistedConfig,
  sanitizeConfigPatch
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

function createMockRequest(method, url, body) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
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
    end(chunk = '') {
      this.body += chunk;
      this.writableEnded = true;
    }
  };
}

async function runHandler(handler, method, url, body) {
  const req = createMockRequest(method, url, body);
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

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-live-wallpaper-smoke-'));
  try {
    await runHappyPath(tmpRoot);
    await runDuplicateBasenames(tmpRoot);
    console.log('smoke: ok');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`smoke: failed: ${error.message}`);
  process.exit(1);
});
