# Theme audit — current 9 presets

Screenshots of every current preset on a synthetic Barabási-like graph at 200, 2000, and 35000 nodes are in `docs/audit/<preset>-<size>.png`. Captured via headless Chrome with `?synthetic=N&oneshot=1&cfgjson=...` so no vault data leaks in and the layout is deterministic (pre-placed golden-angle spiral with tag clustering).

## Read

The roadmap's suspicion is confirmed. The existing 9 presets collapse into three visual equivalence classes at a glance; the rest of the config delta is noise that the eye does not pick up.

### Cluster A — Dim mono dots, no edges, cool hue
- **Classic** — accent `#7c5cff`, flat bg, no halos, no gradient, no labels.
- **Minimal** — accent `#d8e1ff`, subtle gradient, hubs on, halos off.
- **Monochrome** — accent `#b4bccd`, gradient on, hubs on, no halos.
- **Embedded** — accent `#7c5cff`, slightly lighter bg (`#1e1e2e`), particles "on" but at density 0.1, everything else suppressed.

All four read as *same-hue dot field on near-black with maybe a slightly lighter vignette.* The only honest differentiator in the Classic/Embedded pair is the background tint, and in the Minimal/Monochrome pair is the accent saturation. In a blind pick I could not tell Classic and Embedded apart, or Minimal and Monochrome apart, without checking the config JSON. The cluster is at most **one** preset of real information.

### Cluster B — Soft purple/blue with halos and gradient
- **Ambient** — `#7c5cff` on `#0a0a0f`, halos, gradient, DoF, particles on (density 0.28).
- **Galaxy** — `#89a7ff` on `#060916`, halos, gradient, DoF, particles on (density 0.32).

These are the same visual idea — halo-cloud + soft purple/blue glow on black — with a 10° hue shift and a 15% particle-density difference. Under normal motion both read as "ambient purple nebula." Worth **one** preset; Galaxy can retire.

### Cluster C — Distinct identity (keep)
- **Neon** — cyan `#00ffd5` on `#050816`. Reads as "high-contrast cyan mesh with particles." Distinct.
- **Ember** — warm orange `#ff7a45` on dark brown. The only warm-palette preset in the current set. Distinct.
- **Dense** — warm pale `#f5e6a8`, glow at 0.35, edges at 0.08, labels on heavy. At 35k this is the only preset that reads as a *field* instead of individual dots — it's doing the work the other eight presets cannot do on a large vault. Strongly keep.

## What gets retired / collapsed

| Current | Outcome |
| --- | --- |
| Classic | → collapse into a single "Plain" fallback |
| Minimal | → retire (lives inside Plain) |
| Monochrome | → retire (lives inside Plain) |
| Embedded | → retire (not a theme — it's a tuning hint for Obsidian-embed use) |
| Ambient | → keep as reference polychrome preset |
| Galaxy | → retire (dup of Ambient) |
| Neon | → keep |
| Ember | → retire — replaced by Botanical which is a more interesting use of the warm axis |
| Dense | → keep |

Net: three presets carried forward (**Ambient, Neon, Dense**), six retired, one fallback ("Plain"). The new seven slots are designed in `theme-axes.md` to hit genuinely orthogonal points in the variance space.

## Notes on the capture methodology

- Headless Chrome renders at `force-device-scale-factor=1` + `1280×720` for parity across runs.
- `?oneshot=1` draws 4 frames then exits the animation loop. The d3 sim worker is **bypassed** — synthetic nodes ship with a pre-computed spiral layout so captures are deterministic and 35k is capturable in ~3s wall time (a full sim-settle run would be >90s per shot and timed out).
- Consequence: motion-dependent effects (particle trails, drift offsets, flares) are *static* in these captures. The three motion modes are not distinguishable from audit shots alone, which is fine for this audit — motion is one of the five axes in `theme-axes.md` and is meant to be sampled independently of the look-and-feel.
- All 27 shots at `docs/audit/*.png`.
