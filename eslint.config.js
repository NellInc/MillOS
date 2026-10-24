import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import eslintCommentsPlugin from '@eslint-community/eslint-plugin-eslint-comments';

// Project rules that CLAUDE.md used to state only in prose. Each message names
// the fix, because the message is what the next editor reads.
const MILLOS_SYNTAX_RULES = [
  {
    selector:
      'JSXAttribute[name.name=/^polygonOffset(Factor|Units)$/] > JSXExpressionContainer > :matches(Literal, UnaryExpression)',
    message:
      'Hardcoded polygon offset. Use POLYGON_OFFSET.<preset>.factor/.units from src/constants/renderLayers.ts.',
  },
  {
    selector:
      'Property[key.name=/^polygonOffset(Factor|Units)$/] > :matches(Literal, UnaryExpression)',
    message:
      'Hardcoded polygon offset. Use POLYGON_OFFSET.<preset>.factor/.units from src/constants/renderLayers.ts.',
  },
  {
    selector:
      "AssignmentExpression[left.property.name='customProgramCacheKey'] CallExpression[callee.object.name=/^(Date|Math|performance)$/][callee.property.name=/^(now|random)$/]",
    message:
      'Non-deterministic shader cache key recompiles the program every frame. Key on the real shader config (CLAUDE.md: Shader Cache Key Bug).',
  },
  {
    selector:
      "JSXOpeningElement[name.name='planeGeometry'] > JSXAttribute[name.name='args'] ArrayExpression > Literal[raw=/\\./]:matches(:nth-child(3), :nth-child(4))",
    message:
      'planeGeometry args are (width, height, widthSegments, heightSegments); segment counts must be integers. A fractional segment count gives a NaN bounding sphere.',
  },
  {
    selector:
      "NewExpression[callee.property.name='PlaneGeometry'] > Literal[raw=/\\./]:matches(:nth-child(3), :nth-child(4))",
    message:
      'PlaneGeometry args are (width, height, widthSegments, heightSegments); segment counts must be integers. A fractional segment count gives a NaN bounding sphere.',
  },
  {
    selector:
      "CallExpression[callee.name='useFrame'] NewExpression[callee.object.name='THREE'][callee.property.name=/^(Vector2|Vector3|Vector4|Color|Quaternion|Matrix3|Matrix4|Euler|Box3|Sphere|Ray|Raycaster)$/]",
    message:
      'Allocation inside useFrame runs every frame and feeds the GC. Hoist a module-level reusable instance.',
  },
];

const NO_EMOJI_RULES = [
  {
    selector:
      ':matches(Literal[value=/\\p{Emoji_Presentation}/u], TemplateElement[value.raw=/\\p{Emoji_Presentation}/u], JSXText[value=/\\p{Emoji_Presentation}/u])',
    message: 'No emoji in the codebase. Use a lucide-react icon (CLAUDE.md: No Emojis).',
  },
];

export default tseslint.config(
  // Recommended base configs
  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  // Global ignores (replaces ignorePatterns)
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'scada-proxy/**',
      'src/test/**',
      'src/stores/index.ts', // Has circular dependency issues
      'src/0.10 Archive/**', // Archived code, no need to lint
      'coverage/**',
      '*.config.js',
      '*.config.ts',
    ],
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
      '@eslint-community/eslint-comments': eslintCommentsPlugin,
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

      'no-restricted-syntax': ['error', ...MILLOS_SYNTAX_RULES, ...NO_EMOJI_RULES],

      // A suppression must say why ("// eslint-disable-next-line rule -- reason"):
      // unexplained suppressions are how defects get hidden instead of fixed.
      '@eslint-community/eslint-comments/require-description': 'error',
    },
  },

  // Documented emoji exceptions: VCL wire-encoding glyphs are protocol, and the
  // mill emoji is permitted branding in the sidebar logo and loading screen.
  {
    files: [
      'src/utils/vclEncoder.ts',
      'src/utils/__tests__/vclEncoder.test.ts',
      'src/components/ui/VCLDebugPanel.tsx',
      'src/components/LoadingScreen.tsx',
      'src/components/ui-new/sidebar/ContextSidebar.tsx',
    ],
    rules: {
      'no-restricted-syntax': ['error', ...MILLOS_SYNTAX_RULES],
    },
  }
);
