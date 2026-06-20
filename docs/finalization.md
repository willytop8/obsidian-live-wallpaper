# Finalization

A take-stock pass on what's left to call Obsidian Live Wallpaper "done." The
heavy engineering already exists — the six-phase large-vault performance work
(`perf-roadmap.md`), the worker-based simulation, viewport culling, the glow
sprite atlas, and an 18-preset theme system designed against five orthogonal
axes (`theme-axes.md`). This document records the closing pass that shipped in
1.0.0 and the prioritized backlog beyond it.

## Shipped in this pass (1.0.0)

Two of these were latent **bugs** found while auditing the render pipeline, not
just polish:

1. **Blank first-paint / blank synthetic render (bug).** The cull quadtree was
   populated from the cached `__hasPoint` flag, which is only set after the
   first `buildFramePoints`. Because the tree is first built during graph load
   (before any frame), it started empty and culled every node — a blank flash on
   first paint in live mode, and a permanently empty frame in synthetic/oneshot
   mode (which is what the screenshot tooling uses). Now built from the live
   position check.

2. **Flat/light presets rendered on black (bug).** The canvas is opaque
   (`alpha:false`), so presets with `backgroundGradient: false` never painted
   `cfg.background` and showed solid black. Light, flat themes (Mist, Ink) were
   unusable as designed. The base color is now filled each frame.

3. **Render pauses while hidden.** When the display sleeps, the Space is
   switched, or the wallpaper is fully covered, the loop stops drawing and
   resumes within 250ms. Wallpaper hosts can keep a covered webview "visible," so
   this is a real battery win on laptops beyond the browser's own rAF throttle.

4. **Lower edge-draw GC pressure.** `drawEdges` grouped edges with a fresh
   template-literal key per link every frame (up to ~120k throwaway strings/frame
   on a large vault). Replaced with nested color→bucket maps; identical output,
   far less garbage.

5. **Renderer smoke test + CI.** `npm run smoke:render` boots the real server
   against a throwaway vault and asserts in headless Chrome that representative
   presets actually draw nodes with no uncaught JS errors (it reads a drawn-node
   count the renderer now exposes in the page title). It skips cleanly without a
   browser, so `npm test` stays green for users, and runs for real in GitHub
   Actions across Node 18/20/22.

6. **All 18 presets have thumbnails.** The eight newest (Synthwave, Mist,
   Crystalline, Confetti, Abyss, Ink, Library, Vapor) were missing previews in
   the settings picker; all were generated and visually verified.

7. **Cross-platform tooling + release hygiene.** Chrome discovery now works on
   macOS/Windows/Linux (and Playwright/Puppeteer caches) instead of a hardcoded
   path; added `CHANGELOG`, `CONTRIBUTING`, `SECURITY`, README badges, symlink-
   cycle protection in the vault walk, and bumped to 1.0.0.

## Shipped in the follow-up pass

- **Respects `prefers-reduced-motion`** — drift, particles, and flares are
  dropped when the OS requests reduced motion, with a live media-query listener.
- **Cached renderable ranking** — `applyRenderableCap` no longer re-sorts every
  node on each scene-tuning refresh; the order is cached and invalidated only on
  graph reload.
- **Deeper idle throttle** — after 30s calm the loop steps from 30fps to ~15fps.
- **`npx` / CLI runner** — `npx obsidian-live-wallpaper --vault <path> [--port N]`
  (and `olw`) scaffold a config in the working directory and start the server
  without cloning; static assets are still served from the installed package.

## Shipped in the feature pass

Everything that remained in the Tier 1–4 backlog has now landed, except the few
items noted under "Remaining" below.

- **Color by folder** — `nodeColorMode: 'folder'`; parser emits each node's
  top-level folder, renderer maps it to a deterministic palette, and edge
  coloring follows node color across all modes.
- **Per-preset label fonts** — `labelFont` (`sans`/`mono`/`serif`); Blueprint is
  mono, Ink/Library/Parchment are serif.
- **Auto light/dark** — `autoTheme` swaps to `lightAccent`/`lightBackground` and
  drops glow when the OS is in light mode, reacting live.
- **Preset cross-fade** — preset-level changes fade the previous frame out over
  ~240ms; slider tweaks stay instant.
- **Live config reload** — manual `config.json` edits apply visual changes
  immediately (vaultPath/port still need a restart, and the log says so).
- **Particle draw batching** and **worker snapshot-buffer reuse** — the two
  remaining micro-optimizations, done.
- **Shared `renderer-core.js`** — pure helpers (hashing, color, clamp, label
  truncation) extracted and unit-tested in Node while the browser loads them as
  globals; plus parser tag/wikilink edge-case tests.
- **Friendlier failures** — port-in-use guidance and an empty-vault hint.
- **Distribution** — tag-triggered npm release workflow, CodeQL, Dependabot,
  issue/PR templates, and a full preset gallery in the README.

## Remaining (intentionally not done)

- **Actually publishing to npm.** The release workflow is wired and runs the test
  suite on a `v*` tag, but publishing needs the maintainer's `NPM_TOKEN` secret —
  a credentialed action, not a code change.
- **Live custom-config preview in settings.** A thumbnail of the *unsaved* config
  in the settings page. Nice-to-have; the wallpaper itself already updates live as
  you edit, which covers most of the need.
- **Visual-regression golden images.** The renderer smoke catches crashes and the
  blank-frame class; a perceptual pixel diff would catch subtler color/layout
  drift. Deferred — it needs an image-diff dependency and a pinned headless
  environment to avoid font-rendering flake across machines.
- **Homebrew cask / bespoke installer.** `npx obsidian-live-wallpaper` is already
  the one-line install; a cask adds reach but also a separate tap to maintain.

## How to regenerate preset thumbnails

```bash
npm start                                 # terminal 1 (needs a real config.json)
node scripts/screenshot-presets.js new    # terminal 2 → docs/presets/<name>.png
```

Chrome is found automatically; override with `CHROME=/path/to/chrome`. For visual
consistency across all 18 (font rendering in particular), regenerate the whole
set in a single environment.
