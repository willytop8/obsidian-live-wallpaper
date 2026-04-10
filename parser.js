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
const WIKILINK = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g;
const FRONTMATTER = /^---\n([\s\S]*?)\n---/;
const TAGS_FLOW = /^tags:\s*\[([^\]]*)\]/m;
const TAGS_BLOCK = /^tags:\s*\n((?:\s*-\s+.+\n?)+)/m;
const TAGS_INLINE = /(?:^|\s)#([a-zA-Z][\w-/]*)/g;

function extractTag(content) {
  const fm = content.match(FRONTMATTER);
  if (fm) {
    const flow = fm[1].match(TAGS_FLOW);
    if (flow) {
      const first = flow[1].split(',')[0].trim().replace(/['"]/g, '');
      if (first) return first;
    }
    const block = fm[1].match(TAGS_BLOCK);
    if (block) {
      const firstLine = block[1].match(/^\s*-\s+(.+)/);
      if (firstLine) {
        const first = firstLine[1].trim().replace(/['"]/g, '');
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

  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ nodes, links }));
  fs.renameSync(tmp, OUT);
  const tagged = Object.keys(tags).length;
  console.log(`graph: ${nodes.length} nodes, ${links.length} links, ${tagged} tagged`);
}

build();
chokidar.watch(VAULT, {
  ignoreInitial: true,
  ignored: [/(^|[/\\])\./, /\.(?!md$)[^.]+$/],
  awaitWriteFinish: { stabilityThreshold: 300 }
}).on('all', () => { try { build(); } catch (e) { console.error(e); } });
