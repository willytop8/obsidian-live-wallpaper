**What this changes**

<!-- A short description of the change and why. -->

**Checklist**

- [ ] `npm test` passes (parser smoke + renderer smoke)
- [ ] For config/schema changes: updated `VALIDATORS` in `parser.js` and the `DEFAULTS` blocks in both `parser.js` and `index.html`
- [ ] For a new/changed preset: regenerated its thumbnail (`node scripts/screenshot-presets.js new`) and it fits the theme axes
- [ ] For visual changes: included a before/after screenshot
