#!/usr/bin/env node
// Screenshot each preset at a set of synthetic vault sizes using headless Chrome.
//
// Usage:
//   node scripts/screenshot-presets.js audit      # old 8 presets (from settings.html) at 200/2000/35000
//   node scripts/screenshot-presets.js new        # new presets.json at thumbnail size
//   node scripts/screenshot-presets.js new-large  # new presets at 200/2000/10000 for record
//
// Assumes the HTTP server is already running at 127.0.0.1:<port from config.json>.
// Does NOT POST to /api/config (keeps the user's real cfg untouched); presets
// are injected via the ?synthetic=N&cfgjson=... query params which bypass polling.

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HOST = '127.0.0.1';
const PORT = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')).port || 3000; }
  catch { return 3000; }
})();

function waitForServer(ms = 20000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const ping = () => {
      const req = http.request({ host: HOST, port: PORT, path: '/', method: 'HEAD', timeout: 1000 }, res => {
        res.resume(); resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > ms) reject(new Error('server never came up'));
        else setTimeout(ping, 300);
      });
      req.end();
    };
    ping();
  });
}

function screenshot(url, outPath, { width = 1280, height = 720, delayMs = 3500 } = {}) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      `--window-size=${width},${height}`,
      `--virtual-time-budget=${delayMs}`,
      `--screenshot=${outPath}`,
      url
    ];
    const proc = spawn(CHROME, args, { stdio: 'ignore' });
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('chrome timeout')); }, delayMs + 90000);
    proc.on('exit', code => {
      clearTimeout(timer);
      if (fs.existsSync(outPath)) resolve();
      else reject(new Error(`chrome exit ${code}, no file`));
    });
  });
}

// Read the 8 "old" presets by scraping settings.html PRESETS array.
function readOldPresets() {
  const settings = fs.readFileSync(path.join(ROOT, 'settings.html'), 'utf8');
  const m = settings.match(/const PRESETS = (\[[\s\S]*?\n\]);/);
  if (!m) throw new Error('PRESETS array not found in settings.html');
  // eslint-disable-next-line no-eval
  return eval(m[1]);
}

function readNewPresets() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'presets.json'), 'utf8'));
}

function buildUrl(size, cfg, { perf = false, oneshot = true } = {}) {
  const qs = new URLSearchParams();
  qs.set('synthetic', String(size));
  qs.set('cfgjson', encodeURIComponent(JSON.stringify(cfg)));
  if (oneshot) qs.set('oneshot', '1');
  if (perf) qs.set('perf', '1');
  return `http://${HOST}:${PORT}/?${qs.toString()}`;
}

function delayForSize(size) {
  // oneshot mode captures after the first few draws finish, so a modest
  // budget is enough even for 35k. The outer chrome timeout is the real cap.
  if (size <= 2000) return 1200;
  if (size <= 10000) return 2500;
  return 4000;
}

async function main() {
  const mode = process.argv[2] || 'audit';
  await waitForServer();

  if (mode === 'audit') {
    const presets = readOldPresets();
    const sizes = [200, 2000, 35000];
    const outDir = path.join(ROOT, 'docs/audit');
    fs.mkdirSync(outDir, { recursive: true });
    for (const preset of presets) {
      for (const size of sizes) {
        const out = path.join(outDir, `${preset.name.toLowerCase()}-${size}.png`);
        const url = buildUrl(size, preset.config);
        process.stdout.write(`audit ${preset.name} ${size} → `);
        try { await screenshot(url, out, { delayMs: delayForSize(size) }); console.log('ok'); }
        catch (e) { console.log('FAIL', e.message); }
      }
    }
  } else if (mode === 'new') {
    const presets = readNewPresets();
    const outDir = path.join(ROOT, 'docs/presets');
    fs.mkdirSync(outDir, { recursive: true });
    for (const preset of presets) {
      const out = path.join(outDir, `${preset.name.toLowerCase()}.png`);
      const url = buildUrl(2000, preset.config);
      process.stdout.write(`thumb ${preset.name} → `);
      try { await screenshot(url, out, { width: 960, height: 540, delayMs: 6000 }); console.log('ok'); }
      catch (e) { console.log('FAIL', e.message); }
    }
  } else if (mode === 'new-large') {
    const presets = readNewPresets();
    const sizes = [200, 2000, 10000];
    const outDir = path.join(ROOT, 'docs/new-presets');
    fs.mkdirSync(outDir, { recursive: true });
    for (const preset of presets) {
      for (const size of sizes) {
        const out = path.join(outDir, `${preset.name.toLowerCase()}-${size}.png`);
        const url = buildUrl(size, preset.config);
        process.stdout.write(`new ${preset.name} ${size} → `);
        try { await screenshot(url, out, { delayMs: delayForSize(size) }); console.log('ok'); }
        catch (e) { console.log('FAIL', e.message); }
      }
    }
  } else {
    console.error('unknown mode', mode);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
