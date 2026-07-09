// themes/registry.js — loaded as plain <script>, attaches THEMES to window.
// Themes are registered by the individual theme files below.
// index.html dispatches to THEMES[cfg.theme] if cfg.theme and THEMES are defined.

const THEMES = {};
window.THEMES = THEMES;

// Default theme: every function is null → fall back to index.html's inline rendering.
THEMES.default = { draw: null, drawBackground: null, drawStaticLayer: null, drawEdges: null, drawParticles: null, drawNodes: null, drawLabels: null, drawFadeOverlay: null, draw: null };
