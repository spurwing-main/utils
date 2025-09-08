/**
 * ESLint configuration
 * Project Policy:
 * - No silent failures: empty catch blocks forbidden repository-wide.
 * - Enforce modern, explicit, low‑complexity style.
 * - Any intentional deviation must be documented with a code comment referencing "POLICY-EXCEPTION".
 */
import importPlugin from 'eslint-plugin-import';

export default [
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['node_modules/**', 'dist/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        // Browser environment
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        // Node environment
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        // ES2022 globals
        globalThis: 'readonly'
      }
    },
    plugins: {
      import: importPlugin
    },
    rules: {
      // Code safety / clarity
      'no-empty': 'error',
      'no-unused-vars': ['warn', { args: 'none', ignoreRestSiblings: true }],
      'consistent-return': 'error',
      'eqeqeq': ['error', 'always'],
      // Modern JS
      'no-var': 'error',
      'prefer-const': 'error',
      'object-shorthand': 'error',
      'arrow-body-style': ['error', 'as-needed'],
      'prefer-arrow-callback': 'error',
      // Console: allow surfaced operational info only; debug uses gated logger
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      // Import plugin rules (manually selected subset for essential functionality)
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/no-mutable-exports': 'error'
    }
  }
];