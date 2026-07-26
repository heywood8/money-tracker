const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactNative = require('eslint-plugin-react-native');

module.exports = [
  {
    ignores: [
      'node_modules/',
      'build/',
      'dist/',
      '.next/',
      'coverage/',
      'drizzle/',
      'android/',
      'ios/',
      '**/*.config.js',
      // Allow app.config.js to be linted even though other "*.config.js" files are ignored
      '!app.config.js',
      '!./app.config.js',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react,
      'react-native': reactNative,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...reactNative.configs.all.rules,

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-native/no-color-literals': 'off',
      'react-native/no-inline-styles': 'warn',
      'no-console': [
        'off',
        {
          allow: ['warn', 'error'],
        },
      ],
      'no-unused-vars': 'off',
      // React Native 0.85 removed `StyleSheet.absoluteFillObject` (only
      // `absoluteFill` is exported). Spreading the missing property is a silent
      // no-op — the style simply loses `position: absolute` and the view falls
      // back into normal flow, with no error anywhere. That cost two separate
      // mis-diagnoses in this codebase, so fail the build on it instead.
      'no-restricted-properties': [
        'error',
        {
          object: 'StyleSheet',
          property: 'absoluteFillObject',
          message: 'Removed in RN 0.85 — use StyleSheet.absoluteFill (spreading the missing property silently drops position: absolute).',
        },
      ],
      quotes: [
        'warn',
        'single',
        {
          avoidEscape: true,
        },
      ],
      semi: ['warn', 'always'],
      indent: ['warn', 2],
      'comma-dangle': ['warn', 'always-multiline'],
      'object-curly-spacing': ['warn', 'always'],
    },
  },
];
