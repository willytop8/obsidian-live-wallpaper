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

async function runDuplicateFailure(tmpRoot) {
  const vaultDir = path.join(tmpRoot, 'duplicate-vault');
  const outFile = path.join(tmpRoot, 'duplicate-graph.json');

  writeFile(path.join(vaultDir, 'Alpha.md'), '# Alpha\n');
  writeFile(path.join(vaultDir, 'Beta.md'), '# Beta\n');
  writeFile(path.join(vaultDir, 'nested', 'Beta.md'), '# Duplicate Beta\n');

  let error;
  try {
    buildGraph(vaultDir, outFile);
  } catch (nextError) {
    error = nextError;
  }
  assert(error, 'expected duplicate basenames to fail');
  assert(error.message.includes('duplicate note basenames are not supported'), 'missing duplicate basename error');
  assert(error.message.includes('nested/Beta.md'), 'expected duplicate error to list conflicting paths');
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-live-wallpaper-smoke-'));
  try {
    await runHappyPath(tmpRoot);
    await runDuplicateFailure(tmpRoot);
    console.log('smoke: ok');
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(`smoke: failed: ${error.message}`);
  process.exit(1);
});
