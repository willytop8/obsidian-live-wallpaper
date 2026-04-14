# Theme variance axes

Each preset is a point in a 5-dimensional space. If two presets land on the same point in every axis, one of them is redundant (see `theme-audit.md`). Distinct presets must differ on **at least two axes** — single-axis deltas read as "the same theme in a different shirt."

## The five axes

### 1. Palette — where color comes from
| Value | Meaning | Fields that drive it |
| --- | --- | --- |
| `mono` | One accent color; tag colors ignored | `edgeColoring: false`, tag colors unset |
| `dual` | Two colors in tension — accent + background hue intentional | `edgeColoring: false`, high-contrast `accent/background` pair |
| `tag` | Polychrome by tag (user-controlled) | `edgeColoring: true`, `nodeColorMode: 'tag'` |
| `age` | Spectrum by note mtime (green→red) | `nodeColorMode: 'age'` — needs `parser.js` mtime emission (now landed) |

### 2. Density read — how the graph *feels* visually
| Value | Meaning | Fields that drive it |
| --- | --- | --- |
| `field` | Faint edges or none; nodes blur into a gradient of points. Good for 35k. | `linkOpacity ≤ 0.12`, `glowIntensity ≤ 0.5`, `clusterHalos: false` |
| `constellation` | Edges gone entirely; bright hot nodes with halos; reads as stars | `edgeStyle: 'none'`, `clusterHalos: true`, `nodeGlow: true` |
| `network` | Edges visible and structural; the graph is literally a graph | `linkOpacity ≥ 0.2`, `edgeStyle: 'line' \| 'curve'` |

### 3. Motion — temporal behavior
| Value | Meaning | Fields that drive it |
| --- | --- | --- |
| `still` | No particles, no drift; pure layout | `particles: false`, `motionMode: 'light'`, `noteFlare: false` |
| `drift` | Subtle ambient motion, optional particles at low density | `motionMode: 'balanced'`, `particleDensity ≤ 0.25` |
| `showcase` | High-energy: dense particles, fast drift, flares | `motionMode: 'showcase'`, `particleDensity ≥ 0.35` |

### 4. Surface — the canvas backdrop
| Value | Meaning | Fields that drive it |
| --- | --- | --- |
| `flat` | Solid background, nothing else | `backgroundGradient: false`, `depthOfField: false` |
| `gradient` | Radial vignette with accent tint | `backgroundGradient: true`, `depthOfField: false` |
| `vignette` | Gradient + DoF (nodes dim at edges) | `backgroundGradient: true`, `depthOfField: true` |
| `light` | Light-mode — inverts the assumption that bg is near-black | `background: #e0d9c0`-ish, `nodeGlow: false` |

### 5. Labeling — text density
| Value | Meaning | Fields that drive it |
| --- | --- | --- |
| `none` | No hub labels | `hubLabels: false` |
| `hubs` | A small number of top-importance labels | `hubLabels: true`, `hubLabelCount ≤ 6` |
| `heavy` | Labels everywhere relevance exceeds a low bar | `hubLabels: true`, `hubLabelCount ≥ 8`, `labelMinImportance ≤ 0.2` |

## Why these five and not others

- **Palette** and **density read** are where the user's eye lands first; varying either changes what the graph *is*.
- **Motion** varies independently of the look at capture time, so it's the axis that most cheaply triples the design space.
- **Surface** is what distinguishes "screenshot-worthy" from "wallpaper-worthy" — flat reads as UI, vignette reads as ambient.
- **Labeling** is the only axis that directly affects *navigability* of a real vault. Dense/large vaults need heavy labels; small playful ones don't.

Color temperature, saturation, and line weight are *not* axes — they're tuning knobs *within* a palette. Motion speed is a tuning knob within motion. Treating them as independent axes is how we ended up with nine presets that clustered on four.

## Coverage target for the rework

Each proposed preset must be placeable on this table, and the 10 chosen points should span every value on every axis at least once:

| Preset | Palette | Density read | Motion | Surface | Labeling |
| --- | --- | --- | --- | --- | --- |
| Plain | mono | network | still | flat | none |
| Ambient | tag | field | drift | vignette | hubs |
| Neon | dual | network | showcase | vignette | hubs |
| Dense | mono | field | still | gradient | heavy |
| Blueprint | dual | network | still | flat | heavy |
| Parchment | dual | network | drift | light | hubs |
| Botanical | age | field | drift | gradient | hubs |
| Constellation | mono | constellation | drift | flat | hubs |
| Topographic | tag | field | still | vignette | none |
| Contrast | dual | network | still | flat | heavy |

Every axis is covered. No two presets match on more than three axes (spot-check: Blueprint and Contrast share `dual/network/still/flat` but diverge on labeling vs. palette hue — borderline but the accent pair `white+cyan` vs. `yellow+black` puts them in different rooms visually).
