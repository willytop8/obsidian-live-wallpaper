# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0]

First stable release.

### Fixed
- **Blank first-paint / blank synthetic render.** The viewport-cull quadtree was
  populated from the cached `__hasPoint` flag, which isn't set until the first
  `buildFramePoints` runs. The tree was first built during graph load (before any
  frame), so it started empty and every node was culled — a blank flash on first
  paint in live mode, and a permanently empty frame in synthetic/`oneshot` mode.
  It now builds from the live position check.
- **Flat/light presets rendered on black.** The canvas is opaque (`alpha:false`),
  so presets with `backgroundGradient: false` never painted `cfg.background` and
  showed solid black regardless of the configured color. Light, flat themes
  (e.g. Mist, Ink) were unusable. The base color is now filled every frame; the
  opaque gradient still overrides it for gradient presets.

### Added
- **Color by folder.** New `nodeColorMode: 'folder'` colors nodes by their
  top-level vault folder via a deterministic palette (the parser now emits each
  node's folder). Edges inherit node color across tag/age/folder modes.
- **Per-preset label fonts.** New `labelFont` (`sans` / `mono` / `serif`);
  Blueprint ships monospace, Ink / Library / Parchment ship serif.
- **Auto light/dark.** With `autoTheme` on, the renderer swaps to a preset's
  `lightAccent` / `lightBackground` (and drops glow) when the OS is in light mode,
  reacting live to the system preference.
- **Preset cross-fade.** Switching presets briefly fades the previous look out
  instead of cutting hard. Small slider tweaks still apply instantly.
- **Live config reload.** Editing `config.json` by hand now applies visual
  changes immediately (vaultPath/port still need a restart, and you're told so).
- **`npx` / CLI runner.** `npx obsidian-live-wallpaper --vault <path> [--port N]`
  scaffolds a config in the working directory and starts the server, so the
  wallpaper can run without cloning the repo. Also available as `olw`.
- **Unit tests for shared pure helpers** (`renderer-core.js`, used by both the
  browser renderer and Node tests), plus parser tag/wikilink edge-case tests and
  a reduced-motion render assertion.
- **Release automation & repo hygiene:** tag-triggered npm release workflow,
  CodeQL scanning, Dependabot, issue/PR templates, and a full preset gallery in
  the README.
- Friendlier failures: a helpful message when the port is in use, and a hint
  when no Markdown files are found under the vault path.
- **Respects `prefers-reduced-motion`.** When the OS requests reduced motion, the
  renderer drops drift, particles, and flares regardless of the active preset,
  and updates live if the setting changes.
- Render loop now pauses while the page is hidden (display asleep, Space
  switched, wallpaper covered), eliminating render work and saving battery.
- After the scene has been calm for 30s the loop steps down from 30fps to ~15fps,
  so a static wallpaper costs almost nothing; any change escalates back.
- Renderer smoke test (`npm run smoke:render`): boots the server against a
  throwaway vault and asserts in headless Chrome that representative presets draw
  nodes without uncaught JS errors. Skips cleanly when no Chrome is present, so
  `npm test` stays green on machines without a browser. Runs for real in CI.
- Cross-platform Chrome discovery (`scripts/find-chrome.js`) used by the
  screenshot and renderer-smoke tooling (macOS / Windows / Linux + Playwright /
  Puppeteer caches).
- Preset thumbnails for all 18 presets, so the settings preset picker shows a
  preview for every theme.
- GitHub Actions CI running the test suite on Node 18, 20, and 22.

### Changed
- `drawEdges` groups edges with nested color→bucket maps instead of allocating a
  fresh string key per link every frame, reducing GC pressure on large vaults.
- The renderable-node ranking is cached and rebuilt only when the graph reloads,
  instead of re-sorting every node on each scene-tuning refresh (e.g. on resize).
- Vault scan guards against symlink cycles via resolved-realpath tracking.
- `scripts/screenshot-presets.js` finds Chrome cross-platform instead of
  assuming the macOS install path.

## [0.1.0]

Initial public preview: vault parser + file watcher, d3 force-graph renderer on a
fullscreen canvas, live updates over SSE, settings page, preset system, and the
six-phase large-vault performance work (worker-based simulation, glow sprite
atlas, batched draws, static layer caching, viewport culling, adaptive frame
rate). See `docs/perf-roadmap.md`, `docs/theme-audit.md`, and `docs/theme-axes.md`.
