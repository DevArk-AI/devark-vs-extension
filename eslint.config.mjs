import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import node from 'eslint-plugin-node';
import vitest from 'eslint-plugin-vitest';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '*.min.js',
      '*.bundle.js',
      'build.js',
      'scripts/**',
      '.cursor/**',
      '.claude/**',
      '.github/**',
      'resources/**',
      '*.woff',
      '*.woff2',
      '*.ttf',
      '*.svg',
      '*.png',
      'postcss.config.js',
      'tailwind.config.js',
      'src/cursor-hooks/*.js',
      'src/claude-hooks/*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        project: ['./tsconfig.json', './tsconfig.webview.json'],
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      node,
      vitest,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'node/no-missing-import': 'off',
      'node/no-unsupported-features/es-syntax': 'off',
      'no-console': [
        'warn',
        {
          allow: ['warn', 'error'],
        },
      ],
    },
  },
  {
    files: ['webview/**/*', 'src/shared/**/*'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.webview.json'],
      },
    },
    rules: {
      'node/no-unsupported-features/es-syntax': 'off',
    },
  },
  {
    files: ['src/**/*'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      'node/no-unsupported-features/es-syntax': 'off',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', '**/__tests__/**/*'],
    languageOptions: {
      parserOptions: {
        project: false,
      },
      globals: {
        ...vitest.environments.env.globals,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
