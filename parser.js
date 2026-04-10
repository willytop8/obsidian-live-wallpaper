const fs = require('fs');
const path = require('path');
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

const VAULT = cfg.vaultPath;
const OUT = path.join(__dirname, 'graph.json');
const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;

function build() {
  const files = {};
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
        files[id] = fs.readFileSync(p, 'utf8');
      }
    }
  })(VAULT);

  const nodes = Object.keys(files).map(id => ({ id }));
  const set = new Set(nodes.map(n => n.id));
  const links = [];
  for (const [src, content] of Object.entries(files)) {
    WIKILINK.lastIndex = 0;
    let m;
    while ((m = WIKILINK.exec(content)) !== null) {
      const tgt = m[1].trim();
      if (set.has(tgt) && tgt !== src) links.push({ source: src, target: tgt });
    }
  }

  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ nodes, links }));
  fs.renameSync(tmp, OUT);
  console.log(`graph: ${nodes.length} nodes, ${links.length} links`);
}

build();
chokidar.watch(VAULT, {
  ignoreInitial: true,
  ignored: [/(^|[/\\])\./, /\.(?!md$)[^.]+$/],
  awaitWriteFinish: { stabilityThreshold: 300 }
}).on('all', () => { try { build(); } catch (e) { console.error(e); } });
