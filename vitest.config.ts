import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/__tests__/*.ts', 'webview/**/*.test.tsx', 'webview/**/__tests__/*.tsx'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    coverage: {
      reporter: ['text', 'json', 'json-summary', 'html'],
      exclude: [
        // Default exclusions
        'node_modules/',
        'dist/',
        'test/',
        '**/*.d.ts',
        '**/*.config.*',

        // Test files and testing utilities
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/__tests__/**',
        'src/test/**',
        'src/llm/testing/**',

        // Type definitions
        '**/types/**',

        // Entry points & VS Code activation
        'src/extension.ts',
        'src/extension-state.ts',

        // Scripts/tooling
        'scripts/**',

        // Setup files
        'vitest.setup.ts',
      ],
    },
  },
});
