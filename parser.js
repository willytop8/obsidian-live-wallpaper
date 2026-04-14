const fs = require('fs');
const path = require('path');
const http = require('http');
const chokidar = require('chokidar');

const cfgPath = path.join(__dirname, 'config.json');
const OUT = path.join(__dirname, 'graph.json');
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
  glowIntensity: 1,
  edgeStyle: 'line',
  nodeColorMode: 'tag',
  maxRenderedNodes: 5000,
  tagColors: {}
};
const PUBLIC_FILES = new Map([
  ['/', path.join(__dirname, 'index.html')],
  ['/index.html', path.join(__dirname, 'index.html')],
  ['/settings.html', path.join(__dirname, 'settings.html')],
  ['/vendor/d3.min.js', path.join(__dirname, 'vendor', 'd3.min.js')],
  ['/worker.js', path.join(__dirname, 'worker.js')],
  ['/presets.json', path.join(__dirname, 'presets.json')],
  ['/graph.json', OUT]
]);
const DOCS_DIR = path.join(__dirname, 'docs');
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MOTION_MODES = new Set(['light', 'balanced', 'showcase']);
const EDGE_STYLES = new Set(['line', 'curve', 'none']);
const NODE_COLOR_MODES = new Set(['tag', 'age']);

function noteId(basename, filePath, vaultPath, duplicatedBasenames) {
  if (!duplicatedBasenames.has(basename)) return basename;
  const rel = path.relative(vaultPath, filePath).replace(/\.md$/, '').replace(/\\/g, '/');
  // Root-level files have no folder separator — prefix with ./ so every
  // duplicate gets a visually distinct path-based ID
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

function sanitizePersistedConfig(raw) {
  if (!isPlainObject(raw)) {
    throw new Error('config root must be a JSON object');
  }
  const vaultPath = requireString(raw.vaultPath, 'vaultPath');
  const next = {
    vaultPath,
    port: raw.port === undefined ? DEFAULTS.port : validateInteger(raw.port, 'port', 1, 65535),
    accent: raw.accent === undefined ? DEFAULTS.accent : validateHexColor(raw.accent, 'accent'),
    background: raw.background === undefined ? DEFAULTS.background : validateHexColor(raw.background, 'background'),
    refreshMs: raw.refreshMs === undefined ? DEFAULTS.refreshMs : validateInteger(raw.refreshMs, 'refreshMs', 1000, 60000),
    linkOpacity: raw.linkOpacity === undefined ? DEFAULTS.linkOpacity : validateNumber(raw.linkOpacity, 'linkOpacity', 0, 1),
    nodeGlow: raw.nodeGlow === undefined ? DEFAULTS.nodeGlow : validateBoolean(raw.nodeGlow, 'nodeGlow'),
    particles: raw.particles === undefined ? DEFAULTS.particles : validateBoolean(raw.particles, 'particles'),
    particleSpeed: raw.particleSpeed === undefined ? DEFAULTS.particleSpeed : validateNumber(raw.particleSpeed, 'particleSpeed', 0.1, 3),
    particleDensity: raw.particleDensity === undefined ? DEFAULTS.particleDensity : validateNumber(raw.particleDensity, 'particleDensity', 0.05, 1),
    motionMode: raw.motionMode === undefined ? DEFAULTS.motionMode : validateEnum(raw.motionMode, 'motionMode', MOTION_MODES),
    clusterByTag: raw.clusterByTag === undefined ? DEFAULTS.clusterByTag : validateBoolean(raw.clusterByTag, 'clusterByTag'),
    clusterHalos: raw.clusterHalos === undefined ? DEFAULTS.clusterHalos : validateBoolean(raw.clusterHalos, 'clusterHalos'),
    backgroundGradient: raw.backgroundGradient === undefined ? DEFAULTS.backgroundGradient : validateBoolean(raw.backgroundGradient, 'backgroundGradient'),
    hubLabels: raw.hubLabels === undefined ? DEFAULTS.hubLabels : validateBoolean(raw.hubLabels, 'hubLabels'),
    hubLabelCount: raw.hubLabelCount === undefined ? DEFAULTS.hubLabelCount : validateInteger(raw.hubLabelCount, 'hubLabelCount', 1, 50),
    labelMinImportance: raw.labelMinImportance === undefined ? DEFAULTS.labelMinImportance : validateNumber(raw.labelMinImportance, 'labelMinImportance', 0, 1),
    edgeColoring: raw.edgeColoring === undefined ? DEFAULTS.edgeColoring : validateBoolean(raw.edgeColoring, 'edgeColoring'),
    depthOfField: raw.depthOfField === undefined ? DEFAULTS.depthOfField : validateBoolean(raw.depthOfField, 'depthOfField'),
    noteFlare: raw.noteFlare === undefined ? DEFAULTS.noteFlare : validateBoolean(raw.noteFlare, 'noteFlare'),
    autoScaleLargeVaults: raw.autoScaleLargeVaults === undefined ? DEFAULTS.autoScaleLargeVaults : validateBoolean(raw.autoScaleLargeVaults, 'autoScaleLargeVaults'),
    showUnresolvedLinks: raw.showUnresolvedLinks === undefined ? DEFAULTS.showUnresolvedLinks : validateBoolean(raw.showUnresolvedLinks, 'showUnresolvedLinks'),
    glowIntensity: raw.glowIntensity === undefined ? 1 : validateNumber(raw.glowIntensity, 'glowIntensity', 0, 1),
    edgeStyle: raw.edgeStyle === undefined ? 'line' : validateEnum(raw.edgeStyle, 'edgeStyle', EDGE_STYLES),
    nodeColorMode: raw.nodeColorMode === undefined ? 'tag' : validateEnum(raw.nodeColorMode, 'nodeColorMode', NODE_COLOR_MODES),
    maxRenderedNodes: raw.maxRenderedNodes === undefined ? 5000 : validateInteger(raw.maxRenderedNodes, 'maxRenderedNodes', 100, 100000),
    tagColors: sanitizeTagColors(raw.tagColors)
  };
  if (!fs.existsSync(vaultPath)) {
    throw new Error(`vaultPath does not exist: ${vaultPath}`);
  }
  return next;
}

function sanitizeConfigPatch(raw) {
  if (!isPlainObject(raw)) {
    throw new Error('request body must be a JSON object');
  }
  const allowed = new Set([
    'accent',
    'background',
    'refreshMs',
    'linkOpacity',
    'nodeGlow',
    'particles',
    'particleSpeed',
    'particleDensity',
    'motionMode',
    'clusterByTag',
    'clusterHalos',
    'backgroundGradient',
    'hubLabels',
    'hubLabelCount',
    'labelMinImportance',
    'edgeColoring',
    'depthOfField',
    'noteFlare',
    'autoScaleLargeVaults',
    'showUnresolvedLinks',
    'glowIntensity',
    'edgeStyle',
    'nodeColorMode',
    'maxRenderedNodes',
    'tagColors'
  ]);
  const patch = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.has(key)) {
      throw new Error(`unknown config key: ${key}`);
    }
    switch (key) {
      case 'accent':
      case 'background':
        patch[key] = validateHexColor(value, key);
        break;
      case 'refreshMs':
        patch[key] = validateInteger(value, key, 1000, 60000);
        break;
      case 'linkOpacity':
        patch[key] = validateNumber(value, key, 0, 1);
        break;
      case 'particleSpeed':
        patch[key] = validateNumber(value, key, 0.1, 3);
        break;
      case 'particleDensity':
        patch[key] = validateNumber(value, key, 0.05, 1);
        break;
      case 'motionMode':
        patch[key] = validateEnum(value, key, MOTION_MODES);
        break;
      case 'edgeStyle':
        patch[key] = validateEnum(value, key, EDGE_STYLES);
        break;
      case 'nodeColorMode':
        patch[key] = validateEnum(value, key, NODE_COLOR_MODES);
        break;
      case 'hubLabelCount':
        patch[key] = validateInteger(value, key, 1, 50);
        break;
      case 'maxRenderedNodes':
        patch[key] = validateInteger(value, key, 100, 100000);
        break;
      case 'labelMinImportance':
        patch[key] = validateNumber(value, key, 0, 1);
        break;
      case 'glowIntensity':
        patch[key] = validateNumber(value, key, 0, 1);
        break;
      case 'tagColors':
        patch[key] = sanitizeTagColors(value);
        break;
      default:
        patch[key] = validateBoolean(value, key);
        break;
    }
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

const crypto = require('crypto');

const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;
const TAGS_FLOW = /^tags:\s*\[([^\]]*)\]/m;
const TAGS_BLOCK = /^tags:\s*\r?\n((?:\s*-\s+.+\r?\n?)+)/m;
const TAGS_INLINE = /(?:^|\s)#([a-zA-Z][\w-/]*)/g;

// --- Incremental file cache ---
// Maps absolute file path → { hash, basename, content, tag, wikilinks[] }
const fileCache = new Map();

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

function contentHash(content) {
  return crypto.createHash('md5').update(content).digest('hex');
}

function extractWikilinks(content) {
  const result = [];
  WIKILINK.lastIndex = 0;
  let m;
  while ((m = WIKILINK.exec(content)) !== null) {
    const tgt = m[1].trim();
    if (tgt.length > 0) result.push(tgt);
  }
  return result;
}

function buildGraph(vaultPath, outPath = OUT, options = {}) {
  const showUnresolved = options.showUnresolvedLinks !== undefined ? options.showUnresolvedLinks : DEFAULTS.showUnresolvedLinks;
  const incremental = options.incremental !== false;

  // First pass: collect every .md file and detect which basenames appear more than once
  const raw = [];
  const basenameCounts = {};
  const currentPaths = new Set();
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const basename = e.name.replace(/\.md$/, '');
        raw.push({ basename, filePath: p });
        basenameCounts[basename] = (basenameCounts[basename] || 0) + 1;
        currentPaths.add(p);
      }
    }
  })(vaultPath);

  // Prune cache entries for deleted files
  for (const cachedPath of fileCache.keys()) {
    if (!currentPaths.has(cachedPath)) fileCache.delete(cachedPath);
  }

  const duplicatedBasenames = new Set(
    Object.entries(basenameCounts).filter(([, c]) => c > 1).map(([b]) => b)
  );

  // Second pass: assign IDs, read content (with incremental caching), extract tags
  const files = {};
  const tags = {};
  const basenameToIds = {};
  let cacheHits = 0;
  let cacheMisses = 0;
  for (const { basename, filePath } of raw) {
    const id = noteId(basename, filePath, vaultPath, duplicatedBasenames);
    let content, tag, wikilinks;

    if (incremental) {
      const cached = fileCache.get(filePath);
      // Fast check: use mtime+size to skip reading unchanged files
      let stat;
      try { stat = fs.statSync(filePath); } catch { continue; }
      const fingerprint = `${stat.mtimeMs}:${stat.size}`;

      if (cached && cached.fingerprint === fingerprint) {
        // File unchanged — reuse cached parse results without reading
        content = cached.content;
        tag = cached.tag;
        wikilinks = cached.wikilinks;
        cacheHits++;
      } else {
        // File is new or changed — read and parse
        content = fs.readFileSync(filePath, 'utf8');
        tag = extractTag(content);
        wikilinks = extractWikilinks(content);
        fileCache.set(filePath, { fingerprint, content, tag, wikilinks, basename, mtimeMs: stat.mtimeMs });
        cacheMisses++;
      }
      files[id] = { content, path: filePath, basename, wikilinks, mtimeMs: stat.mtimeMs };
      if (tag) tags[id] = tag;
      if (!basenameToIds[basename]) basenameToIds[basename] = [];
      basenameToIds[basename].push(id);
      continue;
    } else {
      content = fs.readFileSync(filePath, 'utf8');
      tag = extractTag(content);
      wikilinks = extractWikilinks(content);
    }

    const statNonInc = (() => { try { return fs.statSync(filePath); } catch { return null; } })();
    files[id] = { content, path: filePath, basename, wikilinks: wikilinks || extractWikilinks(content), mtimeMs: statNonInc ? statNonInc.mtimeMs : 0 };
    if (tag) tags[id] = tag;
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
  const nodeSet = new Set(nodes.map(n => n.id));
  const links = [];
  const linkSet = new Set();
  const ghostIds = new Set();
  for (const [src, file] of Object.entries(files)) {
    for (const tgt of file.wikilinks) {
      // Resolve wikilink by basename — may match multiple IDs if duplicated
      const targetIds = basenameToIds[tgt] || (nodeSet.has(tgt) ? [tgt] : []);
      if (targetIds.length === 0 && showUnresolved && tgt.length > 0) {
        // Unresolved wikilink — create a ghost node
        if (!ghostIds.has(tgt)) {
          ghostIds.add(tgt);
          nodes.push({ id: tgt, ghost: true });
          nodeSet.add(tgt);
        }
        const key = src + '\0' + tgt;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: src, target: tgt });
        }
        continue;
      }
      for (const targetId of targetIds) {
        if (targetId === src) continue;
        const key = src + '\0' + targetId;
        if (!linkSet.has(key)) {
          linkSet.add(key);
          links.push({ source: src, target: targetId });
        }
      }
    }
  }

  // Track discovered tags with counts
  const discoveredTags = {};
  for (const tag of Object.values(tags)) {
    discoveredTags[tag] = (discoveredTags[tag] || 0) + 1;
  }

  const tmp = outPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ nodes, links }));
  fs.renameSync(tmp, outPath);
  const tagged = Object.keys(tags).length;
  if (incremental && (cacheHits + cacheMisses) > 0) {
    console.log(`cache: ${cacheHits} unchanged, ${cacheMisses} re-parsed`);
  }
  return { nodes, links, tagged, discoveredTags };
}

// --- HTTP server ---

const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath);
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    });
    res.end(data);
  } catch (e) {
    res.writeHead(404);
    res.end('Not found');
  }
}

function readBody(req, res) {
  return new Promise((resolve, reject) => {
    let data = '';
    let tooLarge = false;
    req.on('data', c => {
      if (tooLarge) return;
      data += c;
      if (data.length > 1e6) {
        tooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'request body too large' }));
        req.destroy();
        reject(new Error('request body too large'));
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function createRequestHandler(state) {
  const publicFiles = new Map(PUBLIC_FILES);
  publicFiles.set('/graph.json', state.outPath);

  return async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    const url = requestUrl.pathname;

    if (url === '/favicon.ico') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === '/api/config' && req.method === 'GET') {
      const { vaultPath, port, ...safe } = state.cfg;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(safe));
      return;
    }

    if (url === '/api/config' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req, res));
        const patch = sanitizeConfigPatch(body);
        const updated = { ...state.cfg, ...patch, vaultPath: state.cfg.vaultPath, port: state.cfg.port };
        writeConfigFile(updated, state.configPath);
        state.cfg = updated;
        const { vaultPath, port, ...safe } = updated;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(safe));
      } catch (e) {
        if (!res.writableEnded) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      }
      return;
    }

    if (url === '/api/tags' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state.discoveredTags));
      return;
    }

    // Serve /docs/presets/*.png thumbnails for the theme picker.
    if (url.startsWith('/docs/') && req.method === 'GET') {
      const rel = url.slice('/docs/'.length).replace(/\.\./g, '');
      const abs = path.join(DOCS_DIR, rel);
      if (abs.startsWith(DOCS_DIR) && fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        serveFile(res, abs);
        return;
      }
    }

    const filePath = publicFiles.get(url);
    if (!filePath) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    serveFile(res, filePath);
  };
}

function startApp(options = {}) {
  const configPath = options.configPath || cfgPath;
  const outPath = options.outPath || path.join(path.dirname(configPath), 'graph.json');
  if (!fs.existsSync(configPath)) {
    console.error('Missing config.json. Run: cp config.example.json config.json');
    process.exit(1);
  }
  const state = {
    cfg: readConfigFile(configPath),
    configPath,
    outPath,
    discoveredTags: {}
  };
  const server = http.createServer(createRequestHandler(state));

  const rebuild = () => {
    const result = buildGraph(state.cfg.vaultPath, state.outPath, { showUnresolvedLinks: state.cfg.showUnresolvedLinks });
    state.discoveredTags = result.discoveredTags;
    const ghostCount = result.nodes.filter(n => n.ghost).length;
    const ghostMsg = ghostCount > 0 ? `, ${ghostCount} unresolved` : '';
    console.log(`graph: ${result.nodes.length} nodes, ${result.links.length} links, ${result.tagged} tagged${ghostMsg}`);
    return result;
  };

  try {
    rebuild();
  } catch (e) {
    console.error(`startup failed: ${e.message}`);
    process.exit(1);
  }

  // Debounce rebuild so rapid file saves (e.g. batch renames, sync)
  // collapse into a single parse instead of hammering the vault
  let debounceTimer = null;
  const DEBOUNCE_MS = 500;

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

  const watcher = chokidar.watch(state.cfg.vaultPath, {
    ignoreInitial: true,
    ignored: [/(^|[/\\])\./, /\.(?!md$)[^.]+$/],
    awaitWriteFinish: { stabilityThreshold: 300 }
  });

  watcher.on('all', debouncedRebuild)
  .on('error', e => {
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

  return { server, watcher, state, rebuild };
}

if (require.main === module) {
  startApp();
}

module.exports = {
  DEFAULTS,
  sanitizePersistedConfig,
  sanitizeConfigPatch,
  noteId,
  buildGraph,
  createRequestHandler,
  readConfigFile,
  writeConfigFile,
  startApp
};
