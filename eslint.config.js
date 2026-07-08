'use strict';

// Flat config (ESLint 9+). Scoped to plain .js files — index.html/settings.html
// inline <script> blocks aren't linted (would need eslint-plugin-html; not worth
// the extra dependency for a couple of small inline scripts).
const js = require('@eslint/js');
const globals = require('globals');

// - ignoreRestSiblings: buildSafeConfig(cfg) does `const { vaultPath, port,
//   ...safe } = cfg` specifically to exclude those keys from the rest object;
//   they're intentionally "unused" bindings.
// - caughtErrors: 'none' + allowEmptyCatch: the codebase deliberately swallows
//   errors in several spots (e.g. `catch (_) {}` when closing a stream that
//   may already be closed) rather than treating every catch as a bug.
const sharedRules = {
  'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
  'no-empty': ['error', { allowEmptyCatch: true }]
};

module.exports = [
  js.configs.recommended,
  {
    ignores: ['node_modules/**', 'vendor/**', 'docs/**']
  },
  {
    // Node/CommonJS: the server, CLI entry, dev/test scripts, and this config.
    files: ['parser.js', 'bin/cli.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: sharedRules
  },
  {
    // Web worker: importScripts/self/postMessage, no module system. `d3` comes
    // from importScripts('/vendor/d3.min.js') at runtime, not a static import.
    files: ['worker.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.worker, d3: 'readonly' }
    },
    rules: sharedRules
  },
  {
    // Dual-environment UMD-style helper (loaded as a <script> in the browser,
    // required as CommonJS in Node tests) — needs both global sets.
    files: ['renderer-core.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.browser, ...globals.node }
    },
    rules: sharedRules
  }
];
