# Obsidian Live Wallpaper

> Your knowledge graph, drifting quietly behind your desktop icons.

![demo](docs/demo.gif)

A tiny tool that turns your Obsidian vault's graph view into a live, animated desktop wallpaper. New notes appear within seconds of saving. Zero labels, fully ambient — meant to be glanced at, not read.

**macOS and Windows today. Linux on the roadmap.**

## Why

The Obsidian graph view is beautiful and almost nobody looks at it, because it's buried two clicks deep inside the app. This project moves it to the one screen you actually stare at all day.

## Install (macOS, ~5 minutes)

You'll need [Node.js](https://nodejs.org) (v14+) and the free [Plash](https://apps.apple.com/us/app/plash/id1494023538) app from the Mac App Store.

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

Open Plash → **Add Website** → paste `file:///absolute/path/to/obsidian-live-wallpaper/index.html`. Done.

For autostart and troubleshooting, see [`macos-setup.md`](macos-setup.md).

### Windows

Follow the same clone/install steps above, then use [Lively Wallpaper](https://www.rocksdanister.com/lively/) (free) instead of Plash. Full guide: [`windows-setup.md`](windows-setup.md).

## How it works

Three layers, each ignorant of the others:

```
┌──────────┐    graph.json    ┌──────────┐    file://     ┌───────┐
│  parser  │ ───────────────▶ │ renderer │ ─────────────▶ │ Plash │
│ (Node)   │                  │  (d3)    │                │ (Mac) │
└──────────┘                  └──────────┘                └───────┘
```

1. **`parser.js`** watches your vault, parses `[[wikilinks]]` from every `.md` file, writes `graph.json`.
2. **`index.html`** loads `graph.json`, runs a d3 force simulation on a fullscreen canvas, polls for updates every 5 seconds.
3. **Plash** renders the HTML file as your desktop wallpaper.

The clean separation is the whole reason the Windows/Linux ports are nearly free — only the host changes.

## Configuration

`config.json`:

```json
{
  "vaultPath": "/Users/you/Vault",
  "accent": "#7c5cff",
  "background": "#0a0a0f",
  "refreshMs": 5000,
  "linkOpacity": 0.18,
  "nodeGlow": true,
  "tagColors": {
    "project": "#00ffd5",
    "idea": "#ff6b9d",
    "reference": "#ffa94d"
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `vaultPath` | — | Absolute path to your Obsidian vault |
| `accent` | `#7c5cff` | Default node and edge color |
| `background` | `#0a0a0f` | Canvas background color |
| `refreshMs` | `5000` | Polling interval in ms (increase for 2000+ notes) |
| `linkOpacity` | `0.18` | Edge line opacity (0–1) |
| `nodeGlow` | `true` | Radial glow halo around each node |
| `tagColors` | `{}` | Map of Obsidian tag → hex color |

### Tag-based coloring

The parser reads the first tag from each note's frontmatter (`tags: [project, ...]`) or the first inline `#tag` in the body. If that tag has a color in `tagColors`, the node renders in that color instead of the accent.

Notes with no tags use the `accent` color. Tags not listed in `tagColors` also fall back to `accent`.

## Roadmap

- [x] macOS (Plash)
- [x] Windows (Lively Wallpaper)
- [x] Tag-based node coloring
- [x] Visual customization (background, glow, link opacity)
- [ ] Linux X11 (xwinwrap + Chromium)
- [ ] Linux Wayland (headless render → swww)
- [ ] Per-monitor configs

PRs welcome, especially for the platform ports.

## License

MIT. Built by [William Ricchiuti](https://william-ricchiuti.com).
