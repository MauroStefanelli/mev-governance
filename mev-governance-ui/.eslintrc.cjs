/**
 * Minimal ESLint config for the frontend to allow running `npx eslint`.
 * Keeps rules permissive where appropriate and enables react-hooks checks.
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
  },
  extends: [
    'react-app',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'eslint:recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: {
    react: { version: 'detect' },
  },
  overrides: [
    {
      files: ["**/*.test.js", "**/*.spec.js", "src/**/*.{test,workflow,import}.js"],
      rules: {
        // skip test-specific rules when testing-library plugin is not installed in this environment
      },
    },
  ],
  rules: {
    // prefer warnings so build doesn't fail unexpectedly; we will fix progressively
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'react/prop-types': 'off',
    'react/react-in-jsx-scope': 'off', // modern React doesn't need React in scope for JSX
    'no-empty': ['warn', { allowEmptyCatch: true }],
    'react/no-unescaped-entities': ['warn', { forbid: ['>', '}', '"', "'"] }],
    // disable a couple of testing-library rules not available in this environment
    'testing-library/no-node-access': 'off',
    'testing-library/no-container': 'off',
    // allow console during cleanup phase
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  },
};
