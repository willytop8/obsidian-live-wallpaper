# Obsidian Live Wallpaper

> Your knowledge graph, drifting quietly behind your desktop icons.

![demo](docs/demo.gif)

A tiny tool that turns your Obsidian vault's graph view into a live, animated desktop wallpaper. New notes appear within seconds of saving. Tag-based coloring, particle effects, hub glow, and 8 built-in themes — all configurable from a browser settings page.

**macOS and Windows.**

## Why

The Obsidian graph view is beautiful and almost nobody looks at it, because it's buried two clicks deep inside the app. This project moves it to the one screen you actually stare at all day.

## Install

You'll need [Node.js](https://nodejs.org) (v14+) and a wallpaper host app:

- **macOS**: [Plash](https://apps.apple.com/us/app/plash/id1494023538) (free, Mac App Store)
- **Windows**: [Lively Wallpaper](https://www.rocksdanister.com/lively/) (free, open source)

```bash
git clone https://github.com/willytop8/obsidian-live-wallpaper.git
cd obsidian-live-wallpaper
npm install
cp config.example.json config.json
```

Edit `config.json` and set `vaultPath` to your Obsidian vault. Then:

```bash
npm start
```

Point your wallpaper host to `http://localhost:3000`:

- **Plash**: menu bar → **Add Website** → paste `http://localhost:3000`
- **Lively**: click **+** → **Open URL** → paste `http://localhost:3000`

Open `http://localhost:3000/settings.html` to customize everything.

For autostart and troubleshooting, see the platform-specific guides:
- [`macos-setup.md`](macos-setup.md)
- [`windows-setup.md`](windows-setup.md)

## How it works

Three layers, each ignorant of the others:

```
┌──────────┐    graph.json    ┌──────────┐  localhost:3000  ┌────────────┐
│  parser  │ ───────────────▶ │ renderer │ ───────────────▶ │ Plash /    │
│ (Node)   │                  │  (d3)    │                  │ Lively     │
└──────────┘                  └──────────┘                  └────────────┘
```

1. **`parser.js`** watches your vault, parses `[[wikilinks]]` and tags from every `.md` file, writes `graph.json`, and serves everything on `localhost:3000`.
2. **`index.html`** loads `graph.json`, runs a d3 force simulation on a fullscreen canvas, polls for updates.
3. **Plash / Lively** renders the page as your desktop wallpaper.

The clean separation means only the host changes per platform.

## Configuration

Edit `config.json` directly, or use the settings page at `http://localhost:3000/settings.html`.

| Option | Default | Description |
|--------|---------|-------------|
| `vaultPath` | — | Absolute path to your Obsidian vault |
| `accent` | `#7c5cff` | Default node and edge color |
| `background` | `#0a0a0f` | Canvas background color |
| `refreshMs` | `5000` | Polling interval in ms (increase for 2000+ notes) |
| `nodeGlow` | `true` | Radial glow halo around each node |
| `particles` | `true` | Dots flowing along edges |
| `clusterByTag` | `true` | Same-tag nodes gravitate together |
| `edgeColoring` | `true` | Edges inherit source node's tag color |
| `backgroundGradient` | `true` | Subtle radial vignette with accent tint |
| `depthOfField` | `true` | Peripheral nodes dimmer and smaller |
| `noteFlare` | `true` | New notes flash white when they appear |
| `hubLabels` | `false` | Show names on most-connected nodes |
| `tagColors` | `{}` | Map of Obsidian tag → hex color |

### Tag-based coloring

The parser reads the first tag from each note's frontmatter (`tags: [project, ...]`) or the first inline `#tag` in the body. If that tag has a color in `tagColors`, the node renders in that color instead of the accent.

### Presets

The settings page includes 8 one-click themes: Default, Cyberpunk, Synthwave, Ember, Ocean, Forest, Monochrome, and Solar.

## License

MIT. Built by [William Ricchiuti](https://william-ricchiuti.com).
