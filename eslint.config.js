import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Recommended base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Global ignores (replaces ignorePatterns)
  {
    ignores: ['dist/**', 'node_modules/**', 'scada-proxy/**', 'src/test/**', 'coverage/**'],
  },

  // Node tools and browser-evaluated profiling callbacks live together in
  // scripts. Declare both environments so lint reports logic defects rather
  // than hundreds of false undefined-global findings.
  {
    files: [
      'scripts/**/*.{js,mjs,cjs}',
      '*.{js,mjs,cjs}',
      '*.config.{js,mjs,cjs,ts}',
      'vite.config.ts',
      'playwright.config.ts',
      'vitest.config.ts',
    ],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'preserve-caught-error': 'error',
    },
  },

  {
    files: ['e2e/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },

  // Main configuration for TypeScript files
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
        NodeJS: 'readonly',
        THREE: 'readonly',
        React: 'readonly',
        RequestInit: 'readonly',
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      // Hook call order is a runtime invariant that TypeScript cannot enforce.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off', // React Three Fiber patterns use refs in effects

      // TypeScript handles these
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'off',
      'no-undef': 'off',

      // Valid patterns that ESLint flags incorrectly
      'no-case-declarations': 'off',

      // TypeScript-specific rules to keep code clean
      '@typescript-eslint/no-explicit-any': 'off', // Too restrictive for 3D graphics code
      '@typescript-eslint/no-non-null-assertion': 'off', // Needed for Three.js refs
      '@typescript-eslint/ban-ts-comment': 'off', // Sometimes needed for library quirks

      // 3D animation code often has intentional patterns that look like bugs
      'no-constant-binary-expression': 'off', // Intentional in animation state machines
      'no-useless-assignment': 'off', // State-machine branches intentionally overwrite provisional values
      'preserve-caught-error': 'off', // Existing adapter errors are deliberately converted at boundaries
      'prefer-const': 'warn', // Warning only - valid reasons to use let exist
    },
  }
);
