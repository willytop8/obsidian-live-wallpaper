const fs = require('fs');
const path = require('path');
const http = require('http');
const chokidar = require('chokidar');

const cfgPath = path.join(__dirname, 'config.json');
const OUT = path.join(__dirname, 'graph.json');
// DEFAULTS is canonical — clients fetch defaults via /api/defaults.
const DEFAULTS = {
  accent: '#7c5cff',
  background: '#0a0a0f',
  refreshMs: 5000,
  port: 3000,
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
  showUnresolvedLinks: true,
  fastHash: true,
  glowIntensity: 1,
  edgeStyle: 'line',
  nodeColorMode: 'tag',
  maxRenderedNodes: 5000,
  ignorePaths: [],
  tagColors: {}
};
const PUBLIC_FILES = new Map([
  ['/', path.join(__dirname, 'index.html')],
  ['/index.html', path.join(__dirname, 'index.html')],
  ['/settings.html', path.join(__dirname, 'settings.html')],
  ['/vendor/d3.min.js', path.join(__dirname, 'vendor', 'd3.min.js')],
  ['/worker.js', path.join(__dirname, 'worker.js')],
  ['/presets.json', path.join(__dirname, 'presets.json')]
]);
const DOCS_DIR = path.join(__dirname, 'docs');
const DOCS_ALLOWED_EXTS = new Set(['.png', '.gif', '.jpg', '.svg', '.md', '.txt']);
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MOTION_MODES = new Set(['light', 'balanced', 'showcase']);
const EDGE_STYLES = new Set(['line', 'curve', 'none']);
const NODE_COLOR_MODES = new Set(['tag', 'age']);
const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const TAGS_FLOW = /^tags:\s*\[([^\]]*)\]/m;
const TAGS_BLOCK = /^tags:\s*\r?\n((?:\s*-\s+.+\r?\n?)+)/m;
const TAGS_INLINE = /(?:^|\s)#([a-zA-Z][\w-/]*)/g;
const STATIC_CACHE_CONTROL = 'public, max-age=86400';
const DYNAMIC_CACHE_CONTROL = 'no-cache';
const EVENT_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive'
};

function noteId(basename, filePath, vaultPath, duplicatedBasenames) {
  if (!duplicatedBasenames.has(basename)) return basename;
  const rel = path.relative(vaultPath, filePath).replace(/\.md$/, '').replace(/\\/g, '/');
  return rel.includes('/') ? rel : './' + rel;
}

function failConfig(message) {
  console.error(`config.json: ${message}`);
  process.exit(1);
}

function requireString(value, key) {
  if (typeof value !== 'string' || value.trim() === '') {
    failConfig(`${key} is required and must be a non-empty string`);
  }
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateHexColor(value, key) {
  if (typeof value !== 'string' || !HEX_COLOR.test(value)) {
    throw new Error(`${key} must be a 6-digit hex color like #7c5cff`);
  }
  return value;
}

function validateBoolean(value, key) {
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`);
  }
  return value;
}

function validateEnum(value, key, allowed) {
  if (typeof value !== 'string' || !allowed.has(value)) {
    throw new Error(`${key} must be one of: ${Array.from(allowed).join(', ')}`);
  }
  return value;
}

function validateInteger(value, key, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${key} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function validateNumber(value, key, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${key} must be a number between ${min} and ${max}`);
  }
  return value;
}

function sanitizeTagColors(value) {
  if (value === undefined) return { ...DEFAULTS.tagColors };
  if (!isPlainObject(value)) {
    throw new Error('tagColors must be an object of tag -> hex color');
  }
  const sanitized = {};
  for (const [tag, color] of Object.entries(value)) {
    if (typeof tag !== 'string' || tag.trim() === '') {
      throw new Error('tagColors keys must be non-empty strings');
    }
    sanitized[tag] = validateHexColor(color, `tagColors.${tag}`);
  }
  return sanitized;
}

function validateIgnorePaths(value, key) {
  if (!Array.isArray(value)) throw new Error(`${key} must be an array of strings`);
  for (let i = 0; i < value.length; i++) {
    if (typeof value[i] !== 'string' || value[i].trim() === '')
      throw new Error(`${key}[${i}] must be a non-empty string`);
  }
  return value.slice();
}

function isIgnoredPath(filePath, vaultPath, patterns) {
  if (!patterns || patterns.length === 0) return false;
  const rel = path.relative(vaultPath, filePath);
  if (!rel || rel.startsWith('..')) return true;
  for (const p of patterns) {
    if (rel === p || rel.startsWith(p + path.sep)) return true;
    if (rel.split(path.sep).includes(p)) return true;
  }
  return false;
}

// Single source of truth: each entry binds a validator, its args, and a
// default value. Used by sanitizePersistedConfig, sanitizeConfigPatch,
// and served to clients via /api/defaults so DEFAULTS never drifts.
const VALIDATORS = {
  accent:             { fn: validateHexColor },
  background:         { fn: validateHexColor },
  refreshMs:          { fn: validateInteger,  args: [1000, 60000] },
  linkOpacity:        { fn: validateNumber,   args: [0, 1] },
  nodeGlow:           { fn: validateBoolean },
  particles:          { fn: validateBoolean },
  particleSpeed:      { fn: validateNumber,   args: [0.1, 3] },
  particleDensity:    { fn: validateNumber,   args: [0.05, 1] },
  motionMode:         { fn: validateEnum,     args: [MOTION_MODES] },
  clusterByTag:       { fn: validateBoolean },
  clusterHalos:       { fn: validateBoolean },
  backgroundGradient: { fn: validateBoolean },
  hubLabels:          { fn: validateBoolean },
  hubLabelCount:      { fn: validateInteger,  args: [1, 50] },
  labelMinImportance: { fn: validateNumber,   args: [0, 1] },
  edgeColoring:       { fn: validateBoolean },
  depthOfField:       { fn: validateBoolean },
  noteFlare:          { fn: validateBoolean },
  autoScaleLargeVaults:{ fn: validateBoolean },
  showUnresolvedLinks:{ fn: validateBoolean },
  fastHash:           { fn: validateBoolean },
  glowIntensity:      { fn: validateNumber,   args: [0, 1] },
  edgeStyle:          { fn: validateEnum,     args: [EDGE_STYLES] },
  nodeColorMode:      { fn: validateEnum,     args: [NODE_COLOR_MODES] },
  maxRenderedNodes:   { fn: validateInteger,  args: [100, 100000] },
  ignorePaths:        { fn: validateIgnorePaths },
  tagColors:          { fn: sanitizeTagColors }
};

function sanitizePersistedConfig(raw) {
  if (!isPlainObject(raw)) {
    throw new Error('config root must be a JSON object');
  }
  const vaultPath = requireString(raw.vaultPath, 'vaultPath');
  const next = {
    vaultPath,
    port: raw.port === undefined ? DEFAULTS.port : validateInteger(raw.port, 'port', 1, 65535)
  };
  for (const [key, v] of Object.entries(VALIDATORS)) {
    next[key] = raw[key] !== undefined
      ? v.fn(raw[key], key, ...(v.args || []))
      : DEFAULTS[key];
  }
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`vaultPath does not exist: ${vaultPath}`);
  }
  return next;
}

function sanitizeConfigPatch(raw) {
  if (!isPlainObject(raw)) {
    throw new Error('request body must be a JSON object');
  }
  const patch = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = VALIDATORS[key];
    if (!v) {
      throw new Error(`unknown config key: ${key}`);
    }
    patch[key] = v.fn(value, key, ...(v.args || []));
  }
  return patch;
}

function readConfigFile(configPath = cfgPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return sanitizePersistedConfig(raw);
  } catch (e) {
    failConfig(e.message);
  }
}

function writeConfigFile(nextCfg, configPath = cfgPath) {
  const tmp = configPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(nextCfg, null, 2));
  fs.renameSync(tmp, configPath);
}

function extractTag(content) {
  const fm = content.match(FRONTMATTER);
  if (fm) {
    const flow = fm[1].match(TAGS_FLOW);
    if (flow) {
      const first = flow[1].split(',')[0].trim().replace(/['"#]/g, '');
      if (first) return first;
    }
    const block = fm[1].match(TAGS_BLOCK);
    if (block) {
      const firstLine = block[1].match(/^\s*-\s+(.+)/);
      if (firstLine) {
        const first = firstLine[1].trim().replace(/['"#]/g, '');
        if (first) return first;
      }
    }
  }
  TAGS_INLINE.lastIndex = 0;
  const inline = TAGS_INLINE.exec(content);
  if (inline) return inline[1];
  return null;
}

function extractWikilinks(content) {
  const result = [];
  WIKILINK.lastIndex = 0;
  let match;
  while ((match = WIKILINK.exec(content)) !== null) {
    const target = match[1].trim();
    if (target) result.push(target);
  }
  return result;
}

function isMarkdownPath(filePath) {
  return typeof filePath === 'string' && filePath.endsWith('.md');
}

function hasHiddenSegment(filePath, vaultPath) {
  const rel = path.relative(vaultPath, filePath);
  if (!rel || rel.startsWith('..')) return true;
  return rel.split(path.sep).some(part => part.startsWith('.'));
}

function parseMarkdownEntry(filePath) {
  try {
    const stat = fs.statSync(filePath);
    const basename = path.basename(filePath, '.md');
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      path: filePath,
      basename,
      mtimeMs: stat.mtimeMs,
      tag: extractTag(content),
      wikilinks: extractWikilinks(content)
    };
  } catch (_) {
    return null;
  }
}

function scanVaultEntries(vaultPath, ignorePaths) {
  const patterns = ignorePaths || [];
  const entries = new Map();
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const fullPath = path.join(dir, entry.name);
      if (isIgnoredPath(fullPath, vaultPath, patterns)) continue;
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const parsed = parseMarkdownEntry(fullPath);
        if (parsed) entries.set(fullPath, parsed);
      }
    }
  })(vaultPath);
  return entries;
}

function materializeGraph(entries, vaultPath, options = {}) {
  const showUnresolved = options.showUnresolvedLinks !== undefined
    ? options.showUnresolvedLinks
    : DEFAULTS.showUnresolvedLinks;
  const raw = Array.from(entries.values())
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(entry => ({ basename: entry.basename, filePath: entry.path, entry }));
  const basenameCounts = {};
  for (const item of raw) {
    basenameCounts[item.basename] = (basenameCounts[item.basename] || 0) + 1;
  }
  const duplicatedBasenames = new Set(
    Object.entries(basenameCounts)
      .filter(([, count]) => count > 1)
      .map(([basename]) => basename)
  );

  const files = {};
  const tags = {};
  const basenameToIds = {};
  for (const { basename, filePath, entry } of raw) {
    const id = noteId(basename, filePath, vaultPath, duplicatedBasenames);
    files[id] = {
      path: filePath,
      basename,
      wikilinks: entry.wikilinks,
      mtimeMs: entry.mtimeMs
    };
    if (entry.tag) tags[id] = entry.tag;
    if (!basenameToIds[basename]) basenameToIds[basename] = [];
    basenameToIds[basename].push(id);
  }

  if (duplicatedBasenames.size > 0) {
    const names = Array.from(duplicatedBasenames).sort().join(', ');
    console.log(`note: ${duplicatedBasenames.size} duplicate basename${duplicatedBasenames.size === 1 ? '' : 's'} resolved with folder prefix (${names})`);
  }

  const nodes = Object.keys(files).map(id => {
    const node = { id };
    if (files[id].basename !== id) node.label = files[id].basename;
    if (tags[id]) node.tag = tags[id];
    if (files[id].mtimeMs) node.mtime = files[id].mtimeMs;
    return node;
  });
  const nodeSet = new Set(nodes.map(node => node.id));
  const links = [];
  const linkSet = new Set();
  const ghostIds = new Set();
  for (const [sourceId, file] of Object.entries(files)) {
    for (const targetBasename of file.wikilinks) {
      const targetIds = basenameToIds[targetBasename] || (nodeSet.has(targetBasename) ? [targetBasename] : []);
      if (targetIds.length === 0 && showUnresolved && targetBasename.length > 0) {
        if (!ghostIds.has(targetBasename)) {
          ghostIds.add(targetBasename);
          nodes.push({ id: targetBasename, ghost: true });
          nodeSet.add(targetBasename);
        }
        const key = sourceId + '\0' + targetBasename;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: sourceId, target: targetBasename });
        }
        continue;
      }
      for (const targetId of targetIds) {
        if (targetId === sourceId) continue;
        const key = sourceId + '\0' + targetId;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: sourceId, target: targetId });
        }
      }
    }
  }

  const discoveredTags = {};
  for (const tag of Object.values(tags)) {
    discoveredTags[tag] = (discoveredTags[tag] || 0) + 1;
  }

  return {
    nodes,
    links,
    tagged: Object.keys(tags).length,
    discoveredTags
  };
}

function serializeGraph(result) {
  return JSON.stringify({ nodes: result.nodes, links: result.links });
}

function writeGraphFile(graphJson, outPath = OUT) {
  const tmp = outPath + '.tmp';
  fs.writeFileSync(tmp, graphJson);
  fs.renameSync(tmp, outPath);
}

function buildGraph(vaultPath, outPath = OUT, options = {}) {
  const entries = scanVaultEntries(vaultPath, options.ignorePaths);
  const result = materializeGraph(entries, vaultPath, options);
  writeGraphFile(serializeGraph(result), outPath);
  return result;
}

function buildSafeConfig(cfg) {
  const { vaultPath, port, ...safe } = cfg;
  return safe;
}

function defaultHeaders(contentType, cacheControl) {
  return {
    'Content-Type': contentType,
    'Cache-Control': cacheControl,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Resource-Policy': 'same-origin'
  };
}

function serveBuffer(res, body, contentType, cacheControl = DYNAMIC_CACHE_CONTROL) {
  res.writeHead(200, defaultHeaders(contentType, cacheControl));
  res.end(body);
}

function serveFile(res, filePath, cacheControl = STATIC_CACHE_CONTROL) {
  const ext = path.extname(filePath);
  const mime = {
    '.html': 'text/html',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  }[ext] || 'application/octet-stream';
  try {
    const stat = fs.statSync(filePath);
    res.writeHead(200, { ...defaultHeaders(mime, cacheControl), 'Content-Length': String(stat.size) });
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.writableEnded) {
        res.destroy();
      }
    });
  } catch (e) {
    if (!res.writableEnded) {
      res.writeHead(404, defaultHeaders('text/plain', DYNAMIC_CACHE_CONTROL));
      res.end('Not found');
    }
  }
}

function readBody(req, res) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      data += chunk;
      if (data.length > 1e6) {
        tooLarge = true;
        res.writeHead(413, defaultHeaders('application/json', DYNAMIC_CACHE_CONTROL));
        res.end(JSON.stringify({ error: 'request body too large' }));
        req.destroy();
        reject(new Error('request body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function broadcastEvent(state, event, payload) {
  if (!state.eventClients || state.eventClients.size === 0) return;
  const body = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of state.eventClients) {
    try {
      client.write(body);
    } catch (e) {
      state.eventClients.delete(client);
    }
  }
}

function rebuildGraphState(state, options = {}) {
  const result = materializeGraph(state.entries, state.cfg.vaultPath, {
    showUnresolvedLinks: state.cfg.showUnresolvedLinks
  });
  state.discoveredTags = result.discoveredTags;
  state.graphJson = serializeGraph(result);
  state.graphVersion = (state.graphVersion || 0) + 1;
  if (options.writeToDisk !== false) {
    writeGraphFile(state.graphJson, state.outPath);
  }
  const ghostCount = result.nodes.filter(node => node.ghost).length;
  const ghostMsg = ghostCount > 0 ? `, ${ghostCount} unresolved` : '';
  console.log(`graph: ${result.nodes.length} nodes, ${result.links.length} links, ${result.tagged} tagged${ghostMsg}`);
  return result;
}

function applyFsEventToState(state, event, filePath) {
  if (typeof filePath !== 'string') return false;
  if (!filePath.startsWith(state.cfg.vaultPath)) return false;

  if (event === 'unlinkDir') {
    let removed = false;
    for (const existingPath of state.entries.keys()) {
      if (existingPath === filePath || existingPath.startsWith(filePath + path.sep)) {
        state.entries.delete(existingPath);
        removed = true;
      }
    }
    return removed;
  }

  if (!isMarkdownPath(filePath) || hasHiddenSegment(filePath, state.cfg.vaultPath)
      || isIgnoredPath(filePath, state.cfg.vaultPath, state.cfg.ignorePaths)) {
    return false;
  }

  if (event === 'unlink') {
    return state.entries.delete(filePath);
  }

  if (event !== 'add' && event !== 'change') {
    return false;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  const nextEntry = parseMarkdownEntry(filePath);
  if (!nextEntry) return false;
  const prev = state.entries.get(filePath);
  state.entries.set(filePath, nextEntry);
  if (!prev) return true;
  return prev.mtimeMs !== nextEntry.mtimeMs
    || prev.tag !== nextEntry.tag
    || prev.basename !== nextEntry.basename
    || prev.wikilinks.length !== nextEntry.wikilinks.length
    || prev.wikilinks.some((link, index) => link !== nextEntry.wikilinks[index]);
}

function createRequestHandler(state) {
  if (!state.eventClients) state.eventClients = new Set();
  if (!state.safeConfig) state.safeConfig = buildSafeConfig(state.cfg);
  if (!state.graphVersion) state.graphVersion = 1;
  if (!state.configVersion) state.configVersion = 1;

  return async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, defaultHeaders('text/plain', DYNAMIC_CACHE_CONTROL));
      res.end();
      return;
    }

    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const url = requestUrl.pathname;

    if (url === '/favicon.ico') {
      res.writeHead(204, defaultHeaders('text/plain', DYNAMIC_CACHE_CONTROL));
      res.end();
      return;
    }

    if (url === '/events' && req.method === 'GET') {
      res.writeHead(200, { ...defaultHeaders('text/event-stream', DYNAMIC_CACHE_CONTROL), ...EVENT_HEADERS });
      res.write(`event: hello\ndata: ${JSON.stringify({ graphVersion: state.graphVersion, configVersion: state.configVersion })}\n\n`);
      state.eventClients.add(res);
      req.on('close', () => state.eventClients.delete(res));
      return;
    }

    if (url === '/api/state' && req.method === 'GET') {
      serveBuffer(res, JSON.stringify({
        graphVersion: state.graphVersion,
        configVersion: state.configVersion
      }), 'application/json');
      return;
    }

    if (url === '/api/config' && req.method === 'GET') {
      serveBuffer(res, JSON.stringify(state.safeConfig), 'application/json');
      return;
    }

    if (url === '/api/defaults' && req.method === 'GET') {
      serveBuffer(res, JSON.stringify(buildSafeConfig({ ...DEFAULTS })), 'application/json');
      return;
    }

    if (url === '/api/config' && req.method === 'POST') {
      if (req.headers['content-type'] !== 'application/json') {
        res.writeHead(415, defaultHeaders('application/json', DYNAMIC_CACHE_CONTROL));
        res.end(JSON.stringify({ error: 'Content-Type must be application/json' }));
        return;
      }
      try {
        const body = JSON.parse(await readBody(req, res));
        const patch = sanitizeConfigPatch(body);
        const updated = { ...state.cfg, ...patch, vaultPath: state.cfg.vaultPath, port: state.cfg.port };
        writeConfigFile(updated, state.configPath);
        state.cfg = updated;
        state.safeConfig = buildSafeConfig(updated);
        state.configVersion += 1;
        serveBuffer(res, JSON.stringify(state.safeConfig), 'application/json');
        broadcastEvent(state, 'config', { version: state.configVersion });
        if (Object.prototype.hasOwnProperty.call(patch, 'showUnresolvedLinks')) {
          rebuildGraphState(state);
          broadcastEvent(state, 'graph', { version: state.graphVersion });
        }
      } catch (e) {
        if (!res.writableEnded) {
          res.writeHead(400, defaultHeaders('application/json', DYNAMIC_CACHE_CONTROL));
          res.end(JSON.stringify({ error: e.message }));
        }
      }
      return;
    }

    if (url === '/api/tags' && req.method === 'GET') {
      serveBuffer(res, JSON.stringify(state.discoveredTags || {}), 'application/json');
      return;
    }

    if (url === '/graph.json' && req.method === 'GET') {
      const graphJson = state.graphJson || (state.outPath && fs.existsSync(state.outPath)
        ? fs.readFileSync(state.outPath, 'utf8')
        : JSON.stringify({ nodes: [], links: [] }));
      serveBuffer(res, graphJson, 'application/json');
      return;
    }

    if (url.startsWith('/docs/') && req.method === 'GET') {
      const rel = url.slice('/docs/'.length).replace(/\.\./g, '');
      const abs = path.join(DOCS_DIR, rel);
      if (
        (abs === DOCS_DIR || abs.startsWith(DOCS_DIR + path.sep)) &&
        DOCS_ALLOWED_EXTS.has(path.extname(abs)) &&
        fs.existsSync(abs) &&
        fs.statSync(abs).isFile()
      ) {
        serveFile(res, abs);
        return;
      }
    }

    const filePath = PUBLIC_FILES.get(url);
    if (!filePath) {
      res.writeHead(404, defaultHeaders('text/plain', DYNAMIC_CACHE_CONTROL));
      res.end('Not found');
      return;
    }
    const cacheControl = path.extname(filePath) === '.html' ? DYNAMIC_CACHE_CONTROL : STATIC_CACHE_CONTROL;
    serveFile(res, filePath, cacheControl);
  };
}

function startApp(options = {}) {
  const configPath = options.configPath || cfgPath;
  const outPath = options.outPath || path.join(path.dirname(configPath), 'graph.json');
  if (!fs.existsSync(configPath)) {
    console.error('Missing config.json. Run: cp config.example.json config.json');
    process.exit(1);
  }

  const cfg = readConfigFile(configPath);
  const state = {
    cfg,
    safeConfig: buildSafeConfig(cfg),
    configPath,
    outPath,
    discoveredTags: {},
    entries: scanVaultEntries(cfg.vaultPath, cfg.ignorePaths),
    graphJson: '',
    graphVersion: 0,
    configVersion: 1,
    eventClients: new Set()
  };

  const server = http.createServer(createRequestHandler(state));

  const rebuild = () => {
    const result = rebuildGraphState(state);
    broadcastEvent(state, 'graph', { version: state.graphVersion });
    return result;
  };

  try {
    rebuild();
  } catch (e) {
    console.error(`startup failed: ${e.message}`);
    process.exit(1);
  }

  let debounceTimer = null;
  const DEBOUNCE_MS = 400;
  const debouncedRebuild = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      try {
        rebuild();
      } catch (e) {
        console.error(`build failed: ${e.message}`);
      }
    }, DEBOUNCE_MS);
  };

  const chokidarIgnores = [/(^|[/\\])\./, /\.(?!md$)[^.]+$/];
  if (state.cfg.ignorePaths && state.cfg.ignorePaths.length) {
    const prefix = path.resolve(state.cfg.vaultPath) + path.sep;
    chokidarIgnores.push(filePath => isIgnoredPath(filePath, prefix, state.cfg.ignorePaths));
  }
  const watcher = chokidar.watch(state.cfg.vaultPath, {
    ignoreInitial: true,
    ignored: chokidarIgnores,
    awaitWriteFinish: { stabilityThreshold: 300 }
  });

  watcher.on('all', (event, filePath) => {
    try {
      if (applyFsEventToState(state, event, filePath)) {
        debouncedRebuild();
      }
    } catch (e) {
      console.error(`watch update failed: ${e.message}`);
    }
  }).on('error', e => {
    console.error('watcher error:', e.message);
  });

  server.listen(state.cfg.port, '127.0.0.1', () => {
    console.log(`wallpaper:  http://127.0.0.1:${state.cfg.port}`);
    console.log(`settings:   http://127.0.0.1:${state.cfg.port}/settings.html`);
  });

  server.on('error', e => {
    console.error(`server error: ${e.message}`);
    process.exit(1);
  });

  function shutdown() {
    watcher.close();
    for (const client of state.eventClients) {
      try { client.end(); } catch (_) {}
    }
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000);
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, watcher, state, rebuild };
}

if (require.main === module) {
  startApp();
}

module.exports = {
  DEFAULTS,
  VALIDATORS,
  sanitizePersistedConfig,
  sanitizeConfigPatch,
  noteId,
  buildGraph,
  createRequestHandler,
  readConfigFile,
  writeConfigFile,
  startApp,
  scanVaultEntries,
  materializeGraph,
  applyFsEventToState,
  rebuildGraphState
};
