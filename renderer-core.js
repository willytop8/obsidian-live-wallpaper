// Pure, dependency-free helpers shared by the renderer (index.html) and Node
// tests. In the browser this file is loaded as a plain <script> and attaches the
// functions as globals; in Node it is required as a CommonJS module. Keeping
// these here lets scripts/smoke.js unit-test them without a browser.
(function (root) {
  'use strict';

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function truncateLabel(text, maxLength) {
    return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
  }

  function mixChannel(a, b, amount) {
    return Math.round(a * (1 - amount) + b * amount);
  }

  function hashStr(s) {
    let h = 0;
    if (!s) return 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h;
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
      return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  function graphHashFast(graph) {
    const ns = graph.nodes;
    const ls = graph.links;
    const nLen = ns.length;
    const lLen = ls.length;
    let h = (nLen ^ (lLen * 2654435761)) | 0;
    // Fold every node (not just a first/last-16 sample) so a change anywhere in
    // a large graph — e.g. renaming a link-less node in the middle — actually
    // changes the hash. Still O(n) with cheap per-node work, unlike
    // graphHashSlow's sort+join. Tag is folded in too since it affects
    // coloring/clustering and graphHashSlow already treats it as significant.
    for (let i = 0; i < nLen; i++) {
      const node = ns[i];
      h = (h + Math.imul(hashStr(node.id) ^ (i + 1), 2246822519)) | 0;
      if (node.tag) h ^= hashStr(node.tag);
    }
    let linkSum = 0;
    for (let i = 0; i < lLen; i++) {
      const link = ls[i];
      const s = typeof link.source === 'string' ? link.source : (link.source && link.source.id) || '';
      const t = typeof link.target === 'string' ? link.target : (link.target && link.target.id) || '';
      linkSum = (linkSum + hashStr(s) + Math.imul(hashStr(t), 31)) | 0;
    }
    return nLen + ':' + lLen + ':' + ((h ^ linkSum) >>> 0);
  }

  function graphHashSlow(graph) {
    const nodePart = graph.nodes
      .map(node => `${node.id}|${node.tag || ''}`)
      .sort()
      .join('\n');
    const linkPart = graph.links
      .map(link => {
        const source = typeof link.source === 'string' ? link.source : link.source && link.source.id;
        const target = typeof link.target === 'string' ? link.target : link.target && link.target.id;
        return `${source || ''}->${target || ''}`;
      })
      .sort()
      .join('\n');
    return `${nodePart}\n---\n${linkPart}`;
  }

  const api = { clamp, truncateLabel, mixChannel, hashStr, hslToHex, graphHashFast, graphHashSlow };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this);
