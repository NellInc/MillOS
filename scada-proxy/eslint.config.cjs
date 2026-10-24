const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
const globals = require('globals');

module.exports = tseslint.config(
  { ignores: ['dist/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: {
      // The required TypeScript build resolves type-only names and declarations.
      'no-undef': 'off'
    }
  },
  {
    ...eslint.configs.recommended,
    files: ['tests/**/*.cjs', 'eslint.config.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node }
  }
);
