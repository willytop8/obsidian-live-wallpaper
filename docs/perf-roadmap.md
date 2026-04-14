# Large-vault performance roadmap

Target: smooth playback of non-default presets (Ambient, Neon, Galaxy, Ember, etc.) on vaults up to ~35k notes / ~120k links. Baseline measured on "Classic" (everything off) which already runs fine; the work here is closing the gap for the expensive presets.

The phases are ordered by dependency and risk, not visual impact. Each phase is a self-contained agent brief — ship one, measure, then move on. Frame time probe (Phase 0) is a prerequisite so every later phase has a number to point at.

---

## Phase 0 — Instrumentation (prereq, ~half day)

**Agent brief.** Add a lightweight perf probe to `index.html` that samples `performance.now()` around `buildFramePoints`, `drawEdges`, `drawNodes`, `drawClusterHalos`, and the d3 tick callback. Accumulate rolling 1-second averages, expose them at `window.__perf` and paint them (opt-in via `?perf=1` query param) as a small HUD in the corner. Also log `nodes.length`, `links.length`, `particlePool.length`, and `sim.alpha()`.

**Acceptance.** With `?perf=1` on a synthetic 35k/120k graph, HUD shows per-section ms and FPS. Without the flag, zero overhead.

**Why first.** Every later phase needs a before/after number. Without this we're guessing.

---

## Phase 1 — Cheap wins, no architecture change (1–2 days)

All four items are independent, low-risk, and each should produce a measurable delta.

### 1a. Cheap change detection
Replace `graphHash(graph)` (which sorts and joins every node + link as a string) with a rolling hash: `nodes.length ^ links.length ^ (rolling xor of first/last 16 node ids) ^ sum(link source/target hashCodes)`. Single pass, no allocation. Feature-flag it behind `cfg.fastHash` so we can A/B.

### 1b. Freeze simulation on convergence
When `sim.alpha() < 0.02` for 30 consecutive frames, call `sim.stop()`. Restart (`sim.alpha(0.3).restart()`) only when `loadGraph` detects new nodes or links. Keep `forceCluster` gated on sim running, since it currently runs on every tick forever.

### 1c. Kill the per-frame sort in `drawNodes`
Remove the `[...nodes].sort(...)` copy entirely. Replace with a two-pass draw: pass 1 draws non-ghost / low-importance (< 0.3), pass 2 draws high-importance + flared. No allocation, same z-order effect.

### 1d. Add `ultra` tier to `buildSceneTuning`
Current thresholds end at `massive: nodes > 3000`. Add:

```
ultra: nodes > 10000 || links > 40000
```

Ultra disables halos entirely, caps rendered nodes at 4000, sets `linkStep = Math.max(16, Math.ceil(linkCount/2000))`, disables glow unconditionally, forces `skipSort: true`, drops particles to cap 20 or off, and tightens `labelMinImportance` to 0.7.

**Acceptance.** On a 35k/120k synthetic graph with "Ambient" preset: `graphHash` drops below 5ms (from ~200ms), steady-state frame time in `drawNodes` drops ≥20%, sim stops ticking within 3s of load.

---

## Phase 2 — Rendering overhaul (2–3 days)

These are the biggest per-frame wins and can ship together since they all touch the draw pipeline.

### 2a. Glow sprite atlas
Pre-render one 128×128 offscreen canvas containing a soft radial-gradient glow in white. In `drawNodes`, replace the per-node `createRadialGradient` with `ctx.drawImage(glowSprite, x - r, y - r, size, size)` plus a tinted multiply (use `globalCompositeOperation = 'lighter'` or pre-tint into per-accent sprites cached in a Map keyed by color hex). This is the single biggest win — radial gradients are the hottest call in the profiler.

### 2b. Batch draws by color
In both `drawNodes` and `drawEdges`, group by color first, issue one `strokeStyle`/`fillStyle` + one `beginPath` per color group, then stroke/fill once. Canvas2D state changes cost ~1µs each; at 35k nodes that's 35ms of pure overhead we can reclaim.

### 2c. Static layer on OffscreenCanvas
`drawBackgroundGradient` + `drawClusterHalos` only change when (a) window resizes, (b) sim is running and moves meaningfully, or (c) config changes. Render them into an `OffscreenCanvas` once, `drawImage` it each frame. Invalidate the cache when sim restarts, and throttle halo re-render to once every 500ms max while sim runs.

### 2d. Particle pool pre-allocation
Replace `push`/`splice` with a fixed-size array of `particleCap` slots and an `active: bool` flag per slot. Iterate slots, skip inactive. Eliminates GC pressure from the particle system.

**Acceptance.** "Ambient" on 35k/120k holds ≥30fps with glow enabled. Frame time for `drawNodes` drops ≥50% vs Phase 1 baseline.

---

## Phase 3 — Viewport culling & render caps (2 days)

Needs Phase 2's static layer in place first (so the cached halos don't get partially culled).

### 3a. Build a quadtree of node positions
Rebuild on sim settle or every N seconds while running. Use d3-quadtree (already in vendor'd d3). Store in `sceneTuning.quadtree`.

### 3b. Viewport cull
Before `drawNodes` / `drawEdges`, compute visible-rect (with ~100px margin) and query the quadtree. Edges are culled if *both* endpoints are outside. Skip drawing + skip flare/label computation for culled nodes. Most 35k vaults have the majority of the graph offscreen at any moment — this should roughly halve draw work on typical aspect ratios.

### 3c. `maxRenderedNodes` cap
New config field, default 5000 (UI-tunable). When `nodes.length` exceeds it, rank by `importance` once per graph load and store a `renderable: bool` flag. All draw paths respect the flag. Incident edges to non-renderable nodes are also skipped.

**Acceptance.** "Neon" (the most expensive preset) holds ≥30fps on 35k/120k with `maxRenderedNodes: 5000`. Lowering it to 2000 yields ≥50fps.

---

## Phase 4 — Main-thread relief (3–5 days, higher risk)

Optional if Phases 1–3 already hit target frame rate. Still worth it for responsiveness (avoids jank during d3 tick storms on graph reload).

### 4a. Adaptive frame rate
When the scene is "calm" (sim stopped, no active flares, particles below 20% of cap, no config change in last 5s), drop to 30fps via `setTimeout(breathe, 33)` instead of `requestAnimationFrame`. Escalate back to rAF on any change.

### 4b. d3 force sim in a Web Worker
Move the simulation into `worker.js`. Main thread posts `{ nodes, links }`; worker runs d3-forceSimulation, transfers back `Float32Array` of positions on each tick (via `postMessage` with transfer list). Main thread reads the buffer into node.x/y before `buildFramePoints`. This removes the single biggest main-thread blocker during graph load.

**Acceptance.** Scrolling the settings page during a 35k graph load doesn't stutter. Calm-scene CPU usage drops ≥40%.

---

## Phase 5 — Ultra-dense theme drop-in (1 day, can run parallel to Phase 6)

A single new preset tuned specifically for 35k+ vaults, shipped before the broader theme rework so large-vault users have something usable immediately.

**Agent brief.** Add a "Dense" preset with:
- `motionMode: 'light'`
- `particles: false`, `noteFlare: false`
- `clusterHalos: false`, `backgroundGradient: true` (cached, cheap)
- `nodeGlow: true` but visually tiny — introduce a new cfg field `glowIntensity` (0–1, default 1) and let Dense use 0.35. The glow sprite system from Phase 2a makes this a one-line change.
- `edgeColoring: false`, `linkOpacity: 0.08` (edges become ambient texture, not individual lines)
- `hubLabels: true`, `hubLabelCount: 8`, `labelMinImportance: 0.55` — labels are what you actually navigate 35k notes by
- `depthOfField: true` — perceptually reduces how many nodes you're tracking
- `autoScaleLargeVaults: true`, and hard-set `maxRenderedNodes: 6000`

The point of this theme: treat the graph as a *field* rather than individual dots. Sparse labels + faint edges + subtle glow reads as "galaxy of knowledge" without asking the GPU to individually render 35k glowing orbs.

---

## Phase 6 — Theme system rework (separate agent, 3–4 days)

Standalone follow-up. The current 8 presets cluster tightly around "purple + dark background + vary a few flags." This phase is design, not perf — keep it on its own agent so perf work isn't gated on aesthetic debate.

**Agent brief.** Do not start until Phases 1–2 are merged (so any new theme can rely on the glow sprite + static layer).

1. **Audit the existing presets.** For each of the 8, capture a screenshot on a small (~200 node), medium (~2000), and large (~35000) synthetic vault. Note what's visually distinct vs. redundant. My read: Classic, Minimal, Monochrome, and Embedded are near-duplicates; Ambient and Galaxy are near-duplicates.

2. **Define theme variance axes.** Propose 4–5 orthogonal axes that a preset can vary along, e.g.:
   - *Palette:* monochrome / dual-tone / polychrome-by-tag / gradient-spectrum
   - *Density read:* field (faint edges, no halos) / constellation (bright nodes, few edges) / network (edges dominant)
   - *Motion:* still / drift / showcase
   - *Surface:* flat / gradient / vignette / textured
   - *Labeling:* none / hubs-only / heavy

Each new preset should hit a distinct point in this space. Target ~10 presets covering genuinely different looks, not 8 variations on "dark purple."

3. **Design new presets.** Concrete proposals worth exploring:
   - **Blueprint** — white nodes + pale cyan edges on near-black, monospace labels, no glow. Technical/CAD feel.
   - **Parchment** — warm cream background, sepia nodes, hand-drawn-feel thin edges. Light mode.
   - **Botanical** — tag colors mapped to a green→amber→red spectrum by "age" (last modified metadata). Needs a parser.js change to emit `mtime` per node.
   - **Constellation** — pure black bg, bright white-hot nodes, no edges at all, only halos. Labels on hubs only. Reads as stars.
   - **Topographic** — edges replaced with contour-like bezier curves between clustered groups. New render path; bigger lift but visually distinct.
   - **High-contrast accessible** — meets WCAG AA for any labels, designed for screenshots/demos.
   - Keep Ambient, Neon, and the new Dense (Phase 5). Retire Classic/Minimal/Monochrome/Embedded or collapse into one "Plain" preset.

4. **Add a theme-level `glowIntensity` and `edgeStyle` ('line' | 'curve' | 'none').** Unlocks the Constellation and Topographic looks without forking the render path per theme.

5. **Ship a theme picker with screenshots** in settings.html. The current dot-only picker gives no preview of what the user is about to apply.

**Acceptance.** 10 presets, each passing a blind "which one is this" test against screenshots of the other 9. Every preset holds ≥30fps on a 10k-node vault; Dense + Plain hold ≥30fps on 35k.

---

## Sequencing summary

```
Phase 0 (probe) ─┐
                 ├─ Phase 1 (cheap wins) ─┐
                 │                         ├─ Phase 2 (render overhaul) ─┐
                 │                         │                               ├─ Phase 3 (culling)
                 │                         │                               └─ Phase 4 (worker) [optional]
                 │                         └─ Phase 5 (Dense theme)
                 │
                 └─ Phase 6 (theme rework) — starts after Phase 2 merges
```

Phases 1, 2, 5 are the minimum viable "large vaults stop lagging" release. Phase 3 is the ceiling-raise. Phase 4 is polish. Phase 6 is the separate aesthetic track.
