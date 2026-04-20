# Obsidian Live Wallpaper

> Turn your Obsidian vault into an ambient desktop scene instead of another hidden sidebar.

![Demo](docs/demo.gif)

![Style showcase](docs/style-showcase.png)

Obsidian Live Wallpaper turns your vault graph into a live desktop backdrop: glowing nodes, tag-colored clusters, curated visual presets, smarter hub labels, and motion that stays atmospheric instead of noisy. It is built to feel like wallpaper first, graph tooling second.

**macOS, Windows, and Linux.**

## Why

The Obsidian graph view is beautiful and almost nobody looks at it, because it's buried two clicks deep inside the app. This project moves it to the one screen you actually stare at all day.

## What It Looks Like

The renderer is tuned for actual desktop use:

- curated presets instead of raw sliders only
- soft cluster halos for tag territories
- smarter labels that surface hubs without clutter
- large-vault-aware scaling so dense graphs stay elegant

**Polished look**

![Polished wallpaper preview](docs/wallpaper-preview.png)

**Classic look**

![Classic wallpaper preview](docs/classic-preview.png)

![Settings preview](docs/settings-preview.png)

## Install

You'll need [Node.js](https://nodejs.org) (v18+) and a wallpaper host app:

- **macOS**: [Plash](https://apps.apple.com/us/app/plash/id1494023538) (free, Mac App Store)
- **Windows**: [Lively Wallpaper](https://www.rocksdanister.com/lively/) (free, open source)
- **Linux**: KDE has native support; GNOME via [Hidamari](https://github.com/jeffshee/hidamari); tiling WMs via [xwinwrap](https://github.com/ujjwal96/xwinwrap)

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

Optional verification before posting or packaging:

```bash
npm test
```

Point your wallpaper host to `http://127.0.0.1:3000` (examples below assume the default port — change if you set a different `port` in `config.json`):

- **Plash**: menu bar → **Add Website** → paste `http://127.0.0.1:3000`
- **Lively**: click **+** → **Open URL** → paste `http://127.0.0.1:3000`

Open `http://127.0.0.1:3000/settings.html` to customize the visual settings. `vaultPath` and `port` stay in `config.json`.

### Use it inside Obsidian

You can also use the graph as a background inside Obsidian itself with the [Live Background](https://github.com/DynamicPlayerSector/obsidian-live-background) community plugin. Point it at `http://127.0.0.1:3000`. For use behind notes, the **Plain**, **Blueprint**, or **Parchment** presets stay out of the way; **Ambient** or **Neon** work better as a standalone wallpaper.

For autostart and troubleshooting, see the platform-specific guides:
- [`macos-setup.md`](macos-setup.md)
- [`windows-setup.md`](windows-setup.md)
- [`linux-setup.md`](linux-setup.md)

## How it works

Three layers, each ignorant of the others:

```
┌──────────┐    graph.json    ┌──────────┐  127.0.0.1:3000  ┌────────────┐
│  parser  │ ───────────────▶ │ renderer │ ───────────────▶ │ Plash /    │
│ (Node)   │                  │  (d3)    │                  │ Lively     │
└──────────┘                  └──────────┘                  └────────────┘
```

1. **`parser.js`** watches your vault, parses `[[wikilinks]]` and tags from every `.md` file, writes `graph.json`, and serves everything on the local loopback interface (`127.0.0.1:3000` by default).
2. **`index.html`** loads `graph.json`, runs a d3 force simulation on a fullscreen canvas, and updates automatically when your vault changes.
3. **Plash / Lively** renders the page as your desktop wallpaper.

The clean separation means only the host changes per platform.

## Configuration

Edit `config.json` for `vaultPath` and `port`. For everything else, use the settings page at `http://127.0.0.1:3000/settings.html` or edit `config.json` directly.

The renderer ships with a local vendored copy of D3, so the wallpaper still works offline after `npm install`.

| Option | Default | Description |
|--------|---------|-------------|
| `vaultPath` | — | Absolute path to your Obsidian vault |
| `port` | `3000` | Local HTTP port for the wallpaper server |
| `accent` | `#7c5cff` | Default node and edge color |
| `background` | `#0a0a0f` | Canvas background color |
| `refreshMs` | `5000` | Fallback refresh interval in ms when live updates are unavailable |
| `linkOpacity` | `0.18` | Base opacity for graph edges |
| `nodeGlow` | `true` | Radial glow halo around each node |
| `glowIntensity` | `1` | Glow halo strength (`0`–`1`); lower for flatter looks |
| `edgeStyle` | `"line"` | Edge rendering: `line`, `curve`, or `none` |
| `nodeColorMode` | `"tag"` | Node coloring: `tag` (by first tag) or `age` (by modified time) |
| `particles` | `true` | Dots flowing along edges |
| `particleSpeed` | `1` | Multiplier for particle travel speed |
| `particleDensity` | `0.3` | Particle spawn density along links |
| `motionMode` | `"balanced"` | Ambient movement profile: `light`, `balanced`, or `showcase` |
| `clusterByTag` | `true` | Same-tag nodes gravitate together |
| `clusterHalos` | `true` | Soft color fields behind major tag clusters |
| `edgeColoring` | `true` | Edges inherit source node's tag color |
| `backgroundGradient` | `true` | Subtle radial vignette with accent tint |
| `depthOfField` | `true` | Peripheral nodes dimmer and smaller |
| `noteFlare` | `true` | New notes flash white when they appear |
| `hubLabels` | `false` | Show names on most-connected nodes |
| `hubLabelCount` | `5` | Maximum number of node labels shown when `hubLabels` is on |
| `labelMinImportance` | `0.22` | Minimum node importance required before labels appear |
| `autoScaleLargeVaults` | `true` | Automatically reduces particles, labels, and edge density on dense graphs |
| `maxRenderedNodes` | `5000` | Hard cap on rendered nodes (`100`–`100000`); lowest-importance nodes drop first |
| `showUnresolvedLinks` | `true` | Show ghost nodes for `[[links]]` to notes that don't exist yet |
| `tagColors` | `{}` | Map of Obsidian tag → hex color |

### Tags vs links

Tags and links do different things in the wallpaper. **Links** (`[[wikilinks]]`) create **edges** between nodes — they define the graph structure. **Tags** (`#tag` in frontmatter or body) control **node color** and **clustering** — they're purely visual grouping. A note can have both, and they work independently.

### Unresolved links

With `showUnresolvedLinks` on (the default), any `[[wikilink]]` that points to a note that doesn't exist yet still appears in the graph as a dimmer, smaller "ghost" node. This lets you see the shape of your planned connections, not just what you've written so far. Turn it off if you only want real notes.

### Duplicate note names

If two markdown files share the same basename (e.g. `Index.md` in different folders), the parser automatically prefixes their node IDs with the folder path so both appear in the graph. A `[[Index]]` wikilink will connect to all notes named `Index`. Labels still show the short name.

### Coloring modes

Two ways to color nodes, set with `nodeColorMode`:

- **`tag`** (default) — each note picks up the color of its first tag. Set tag colors in `tagColors`, or leave it empty and everything uses the accent. Same-tag nodes pull toward each other when `clusterByTag` is on.
- **`age`** — fresh notes are green, stale ones fade to red. Good for seeing which parts of your vault you actually touch. Botanical uses this.

### Edge styles

`edgeStyle` changes how links are drawn. `line` is straight. `curve` gives soft bezier arcs. `none` hides edges entirely and lets clustering do the talking.

### Presets

Ten one-click looks, each a meaningfully different scene rather than a palette swap:

- **Plain** — minimal, still, mono accent
- **Ambient** — the default polychrome drift with hubs
- **Neon** — high-contrast cyber palette, heavy glow
- **Dense** — tight clusters for busy vaults
- **Blueprint** — technical drawing feel, muted on dark navy
- **Parchment** — warm paper tones, subtle motion
- **Botanical** — age-colored nodes, organic spread
- **Constellation** — edges hidden, nodes float in clusters
- **Topographic** — curved edges, map-like flow
- **Contrast** — bold single-accent, stripped-down

Swap between them from the settings page. For the design thinking behind the lineup, see [`docs/theme-axes.md`](docs/theme-axes.md).

### Large vaults

Big graphs turn into mush if you render everything. With `autoScaleLargeVaults` on (the default), the renderer quietly backs off as your vault grows:

| Vault size | What happens |
|------------|--------------|
| Up to ~350 nodes | Full fidelity — everything on |
| 350–900 nodes | Fewer particles, softer edges |
| 900–3,000 nodes | Fewer labels, lower glow, sparser particles |
| 3,000–10,000 nodes | Glow and halos off, labels tighten, depth effects back off, render scale drops to stay smooth |
| 10,000+ nodes | Particles off, halos off, labels limited to the biggest hubs, render scale drops further, hard cap of about 2,800 rendered nodes |

If you want a tighter ceiling, set `maxRenderedNodes` — least-connected notes drop first.

### Incremental parsing

The first launch reads your whole vault. After that, normal edits only rebuild the parts of the graph that actually changed, so quick note updates do not trigger a full vault re-scan. Rapid saves are grouped together, and the wallpaper refreshes automatically as those changes land.

## License

MIT. Built by [William Ricchiuti](https://william-ricchiuti.com).
