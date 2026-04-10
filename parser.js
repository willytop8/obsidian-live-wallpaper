const fs = require('fs');
const path = require('path');
const http = require('http');
const chokidar = require('chokidar');

const cfgPath = path.join(__dirname, 'config.json');
if (!fs.existsSync(cfgPath)) {
  console.error('Missing config.json. Run: cp config.example.json config.json');
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
} catch (e) {
  console.error('Invalid config.json:', e.message);
  process.exit(1);
}

if (!cfg.vaultPath || typeof cfg.vaultPath !== 'string') {
  console.error('config.json: vaultPath is required and must be a string');
  process.exit(1);
}
if (!fs.existsSync(cfg.vaultPath)) {
  console.error(`config.json: vaultPath does not exist: ${cfg.vaultPath}`);
  process.exit(1);
}

const VAULT = cfg.vaultPath;
const OUT = path.join(__dirname, 'graph.json');
const PORT = cfg.port || 3000;
const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const TAGS_FLOW = /^tags:\s*\[([^\]]*)\]/m;
const TAGS_BLOCK = /^tags:\s*\n((?:\s*-\s+.+\n?)+)/m;
const TAGS_INLINE = /(?:^|\s)#([a-zA-Z][\w-/]*)/g;

let discoveredTags = {};

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

function build() {
  const files = {};
  const tags = {};
  const seen = {};
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) {
        const id = e.name.replace(/\.md$/, '');
        if (files[id] !== undefined) {
          if (!seen[id]) {
            console.warn(`duplicate basename: "${id}" — keeping last occurrence`);
            seen[id] = true;
          }
        }
        const content = fs.readFileSync(p, 'utf8');
        files[id] = content;
        const tag = extractTag(content);
        if (tag) tags[id] = tag;
      }
    }
  })(VAULT);

  const nodes = Object.keys(files).map(id => {
    const node = { id };
    if (tags[id]) node.tag = tags[id];
    return node;
  });
  const set = new Set(nodes.map(n => n.id));
  const links = [];
  const linkSet = new Set();
  for (const [src, content] of Object.entries(files)) {
    WIKILINK.lastIndex = 0;
    let m;
    while ((m = WIKILINK.exec(content)) !== null) {
      const tgt = m[1].trim();
      const key = src + '\0' + tgt;
      if (set.has(tgt) && tgt !== src && !linkSet.has(key)) {
        linkSet.add(key);
        links.push({ source: src, target: tgt });
      }
    }
  }

  // Track discovered tags with counts
  discoveredTags = {};
  for (const tag of Object.values(tags)) {
    discoveredTags[tag] = (discoveredTags[tag] || 0) + 1;
  }

  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ nodes, links }));
  fs.renameSync(tmp, OUT);
  const tagged = Object.keys(tags).length;
  console.log(`graph: ${nodes.length} nodes, ${links.length} links, ${tagged} tagged`);
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

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const url = req.url.split('?')[0];

  if (url === '/api/config' && req.method === 'GET') {
    const current = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    const { vaultPath, port, ...safe } = current;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(safe));
    return;
  }

  if (url === '/api/config' && req.method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req));
      const current = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const updated = { ...current, ...body };
      // Never overwrite vaultPath or port from the UI
      updated.vaultPath = current.vaultPath;
      if (current.port) updated.port = current.port;
      fs.writeFileSync(cfgPath, JSON.stringify(updated, null, 2));
      const { vaultPath, port, ...safe } = updated;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(safe));
    } catch (e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url === '/api/tags' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(discoveredTags));
    return;
  }

  // Static files
  let filePath = url === '/' ? '/index.html' : url;
  serveFile(res, path.join(__dirname, filePath));
});

// --- Start ---

build();

chokidar.watch(VAULT, {
  ignoreInitial: true,
  ignored: [/(^|[/\\])\./, /\.(?!md$)[^.]+$/],
  awaitWriteFinish: { stabilityThreshold: 300 }
}).on('all', () => { try { build(); } catch (e) { console.error(e); } });

server.listen(PORT, () => {
  console.log(`wallpaper:  http://localhost:${PORT}`);
  console.log(`settings:   http://localhost:${PORT}/settings.html`);
});
