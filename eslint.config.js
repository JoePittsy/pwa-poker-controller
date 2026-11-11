// Lint for mistakes, not style: names that do not exist, things declared and never used, and the like.
import globals from 'globals';

export default [
  { ignores: ['node_modules/', '_site/'] },
  {
    files: ['js/**/*.js', 'sw.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser, ...globals.serviceworker } },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error', 'no-unreachable': 'error', 'no-const-assign': 'error', 'no-import-assign': 'error',
      'no-self-assign': 'error', 'no-redeclare': 'error', 'no-dupe-args': 'error', 'use-isnan': 'error', 'valid-typeof': 'error',
    },
  },
  { files: ['test/**/*.js', 'eslint.config.js'], languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node }, rules: { 'no-undef': 'error', 'no-unused-vars': 'error' } },
];
