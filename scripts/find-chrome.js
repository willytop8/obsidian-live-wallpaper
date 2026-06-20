// Locate a Chrome/Chromium binary across platforms for the screenshot and
// renderer-smoke scripts. Resolution order:
//   1. CHROME / CHROME_PATH env var (explicit override)
//   2. Common per-OS install locations
//   3. A Playwright/Puppeteer browser cache (so CI that ran `playwright install`
//      or `@puppeteer/browsers install` just works without a system Chrome)
// Returns an absolute path, or null if nothing usable was found.
const fs = require('fs');
const os = require('os');
const path = require('path');

function firstExisting(paths) {
  for (const p of paths) {
    try { if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch (_) {}
  }
  return null;
}

function globNewest(roots, leaf) {
  // Tiny shallow glob: for each root, look one directory level down for a
  // matching browser dir and return the newest binary found.
  const hits = [];
  for (const root of roots) {
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const candidate = path.join(root, e.name, leaf);
      try {
        if (fs.existsSync(candidate)) hits.push({ p: candidate, m: fs.statSync(candidate).mtimeMs });
      } catch (_) {}
    }
  }
  hits.sort((a, b) => b.m - a.m);
  return hits.length ? hits[0].p : null;
}

function findChrome() {
  const env = process.env.CHROME || process.env.CHROME_PATH;
  if (env && fs.existsSync(env)) return env;

  const platform = process.platform;
  const candidates = [];
  if (platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    );
  } else if (platform === 'win32') {
    const pf = process.env['PROGRAMFILES'] || 'C:/Program Files';
    const pfx86 = process.env['PROGRAMFILES(X86)'] || 'C:/Program Files (x86)';
    candidates.push(
      path.join(pf, 'Google/Chrome/Application/chrome.exe'),
      path.join(pfx86, 'Google/Chrome/Application/chrome.exe'),
      path.join(pf, 'Microsoft/Edge/Application/msedge.exe')
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium'
    );
  }
  const direct = firstExisting(candidates);
  if (direct) return direct;

  // Browser caches written by Playwright / Puppeteer installers.
  const home = os.homedir();
  const leaf = platform === 'win32' ? 'chrome.exe'
    : platform === 'darwin' ? 'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
    : 'chrome';
  const pwRoots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(home, '.cache/ms-playwright'),
    path.join(home, 'Library/Caches/ms-playwright'),
    path.join(home, 'AppData/Local/ms-playwright')
  ].filter(Boolean);
  // Playwright stores chromium under chromium-<rev>/chrome-linux/chrome etc.
  const pwLeaf = platform === 'win32' ? 'chrome-win/chrome.exe'
    : platform === 'darwin' ? 'chrome-mac/Chromium.app/Contents/MacOS/Chromium'
    : 'chrome-linux/chrome';
  const pw = globNewest(pwRoots, pwLeaf);
  if (pw) return pw;

  const ppRoots = [
    process.env.PUPPETEER_CACHE_DIR,
    path.join(home, '.cache/puppeteer/chrome'),
    path.join(home, '.cache/puppeteer/chrome-headless-shell')
  ].filter(Boolean);
  return globNewest(ppRoots, leaf);
}

module.exports = { findChrome };

if (require.main === module) {
  const c = findChrome();
  if (c) { console.log(c); }
  else { console.error('no chrome found'); process.exit(1); }
}
