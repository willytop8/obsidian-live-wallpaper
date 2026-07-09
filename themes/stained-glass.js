// themes/stained-glass.js — Voronoi tessellation / stained glass theme.
// Loaded as plain <script> after registry.js; THEMES is a global.
// Uses globals: cfg, nodes, links, ctx, canvas, sceneTuning, tick, innerWidth, innerHeight,
//   simAlpha, nodeColor(), edgeColor(), hexToRGB(), rgba(), finiteNumber(), hashStr(),
//   labelCandidates.

(function () {
  'use strict';

  const GRID = 6; // px per grid cell — 6px is fast enough at 1080p (~108K cells)
  let gridW = 0, gridH = 0;
  let grid = null; // flat array: each cell = { nodeId, distSq }
  let lastSimAlpha = 1;
  let nodeSnap = null; // snapshot of {id, fx, fy} to detect significant moves

  function snapKey(node) {
    return (node.__fx ? (node.__fx | 0) : 0) + ',' + (node.__fy ? (node.__fy | 0) : 0);
  }

  function needsRebuild() {
    if (simAlpha > 0.08) return false; // too much motion, skip rebuild
    if (!grid || grid.length === 0) return true;
    if (!nodeSnap || nodeSnap.length !== nodes.length) return true;
    // Rebuild if any important node moved more than GRID px
    let moved = 0;
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node.__fx) continue;
      const key = snapKey(node);
      if (key !== nodeSnap[i]) moved++;
      if (moved > nodes.length * 0.05) return true;
    }
    return false;
  }

  function rebuildGrid() {
    gridW = Math.ceil(innerWidth / GRID);
    gridH = Math.ceil(innerHeight / GRID);
    grid = new Array(gridW * gridH);
    nodeSnap = new Array(nodes.length);

    // Brute-force: for each grid cell, find nearest visible node
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        const cx = gx * GRID + GRID / 2;
        const cy = gy * GRID + GRID / 2;
        let best = null;
        let bestDist = Infinity;

        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node.__renderable === false) continue;
          if (!finiteNumber(node.__fx) || !finiteNumber(node.__fy)) continue;
          const dx = cx - node.__fx;
          const dy = cy - node.__fy;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestDist) { bestDist = d2; best = node; }
        }

        grid[gy * gridW + gx] = best ? { nodeId: best.id, node: best } : null;
      }
    }

    for (let i = 0; i < nodes.length; i++) {
      nodeSnap[i] = nodes[i].__fx ? snapKey(nodes[i]) : '';
    }
    lastSimAlpha = simAlpha;
  }

  THEMES.stainedGlass = {
    drawBackground: function () {
      ctx.fillStyle = '#100f18';
      ctx.fillRect(0, 0, innerWidth, innerHeight);
    },

    drawEdges: function () { /* No edges in stained glass */ },

    drawParticles: function () { /* No particles */ },

    drawNodes: function () { /* Nodes are defined by the cells, not drawn directly */ },

    drawLabels: function () {
      if (!cfg.hubLabels || sceneTuning.labelCount <= 0) return;

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = '11px sans-serif';

      let drawn = 0;
      for (let i = 0; i < labelCandidates.length && drawn < sceneTuning.labelCount; i++) {
        const node = labelCandidates[i];
        if ((node.importance || 0) < sceneTuning.labelMinImportance) continue;
        if (!finiteNumber(node.__fx) || !finiteNumber(node.__fy)) continue;
        if (node.__renderable === false) continue;

        ctx.shadowColor = nodeColor(node);
        ctx.shadowBlur = 4;
        ctx.fillText(node.__labelText, node.__fx, node.__fy + (node.r || 3) + 16);
        ctx.shadowBlur = 0;
        drawn++;
      }
    },

    drawFadeOverlay: null,
    drawStaticLayer: null,

    // Stained glass has its own main draw() — it composites cells + borders
    draw: function () {
      this.drawBackground();

      if (needsRebuild()) rebuildGrid();
      if (!grid || grid.length === 0) { this.drawLabels(); return; }

      const cellOpacity = (cfg.sgCellOpacity !== undefined ? cfg.sgCellOpacity : 0.45);
      const borderWidth = (cfg.sgBorderWidth !== undefined ? cfg.sgBorderWidth : 1.5);

      // Draw cell fills — one color per contiguous tag region
      // Simple approach: draw each grid cell as a filled rect in its node's color
      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          const cell = grid[gy * gridW + gx];
          if (!cell || !cell.node) continue;
          const color = nodeColor(cell.node);
          const [r, g, b] = hexToRGB(color);

          // Light-catch: slightly brighter near the node center
          const dx = (gx * GRID + GRID / 2) - cell.node.__fx;
          const dy = (gy * GRID + GRID / 2) - cell.node.__fy;
          const dist = Math.sqrt(dx * dx + dy * dy) / Math.max(innerWidth, innerHeight);
          const bright = 1 - dist * 0.4;

          ctx.fillStyle = rgba(
            Math.min(255, Math.floor(r * bright + 15)),
            Math.min(255, Math.floor(g * bright + 15)),
            Math.min(255, Math.floor(b * bright + 15)),
            cellOpacity
          );
          ctx.fillRect(gx * GRID, gy * GRID, GRID, GRID);
        }
      }

      // Draw borders between different-tag cells
      ctx.strokeStyle = 'rgba(8,8,16,0.55)';
      ctx.lineWidth = borderWidth;

      for (let gy = 0; gy < gridH; gy++) {
        for (let gx = 0; gx < gridW; gx++) {
          const idx = gy * gridW + gx;
          const cell = grid[idx];

          // Right neighbor
          if (gx < gridW - 1) {
            const right = grid[idx + 1];
            if (cell && right && cell.node !== right.node && (!cell.node.tag || !right.node.tag || cell.node.tag !== right.node.tag)) {
              ctx.beginPath();
              ctx.moveTo((gx + 1) * GRID, gy * GRID);
              ctx.lineTo((gx + 1) * GRID, (gy + 1) * GRID);
              ctx.stroke();
            }
          }

          // Bottom neighbor
          if (gy < gridH - 1) {
            const bottom = grid[idx + gridW];
            if (cell && bottom && cell.node !== bottom.node && (!cell.node.tag || !bottom.node.tag || cell.node.tag !== bottom.node.tag)) {
              ctx.beginPath();
              ctx.moveTo(gx * GRID, (gy + 1) * GRID);
              ctx.lineTo((gx + 1) * GRID, (gy + 1) * GRID);
              ctx.stroke();
            }
          }
        }
      }

      this.drawLabels();
    },
  };
})();
