const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

// Load .env file if it exists (for local development)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      const value = valueParts.join('=').trim();
      if (!process.env[key.trim()]) {
        process.env[key.trim()] = value;
      }
    }
  });
}

/**
 * Copy sql.js WASM file to dist folder
 * Required for sql.js to work in VS Code extension
 */
function copySqlJsWasm() {
  const wasmSource = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  const wasmDest = path.join(__dirname, 'dist', 'sql-wasm.wasm');

  if (fs.existsSync(wasmSource)) {
    // Ensure dist folder exists
    if (!fs.existsSync(path.join(__dirname, 'dist'))) {
      fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
    }

    fs.copyFileSync(wasmSource, wasmDest);
    console.log('[build] Copied sql-wasm.wasm to dist/');
  } else {
    console.warn('[build] Warning: sql-wasm.wasm not found at', wasmSource);
  }
}

/**
 * Copy Cursor hooks scripts to dist folder
 * The hook scripts are executed by Cursor to capture prompts and responses
 */
function copyCursorHooks() {
  const hooksDir = path.join(__dirname, 'dist', 'cursor-hooks');

  // Ensure dist/cursor-hooks folder exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // List of Cursor hook scripts to copy
  const cursorHookFiles = [
    'before-submit-prompt.js',  // Captures prompts before submission
    'post-response.js',         // Captures responses after agent completes
  ];

  for (const hookFile of cursorHookFiles) {
    const hookSource = path.join(__dirname, 'src', 'cursor-hooks', hookFile);
    const hookDest = path.join(hooksDir, hookFile);

    if (fs.existsSync(hookSource)) {
      fs.copyFileSync(hookSource, hookDest);
      console.log(`[build] Copied Cursor hook ${hookFile} to dist/cursor-hooks/`);
    } else {
      console.warn(`[build] Warning: Cursor hook script not found at ${hookSource}`);
    }
  }
}

/**
 * Copy Claude Code hooks scripts to dist folder
 * The hook scripts are executed by Claude Code to capture prompts and responses
 */
function copyClaudeCodeHooks() {
  const hooksDir = path.join(__dirname, 'dist', 'claude-hooks');

  // Ensure dist/claude-hooks folder exists
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  // List of Claude Code hook scripts to copy
  const claudeHookFiles = [
    'user-prompt-submit.js',  // Captures prompts on submission
    'stop.js',                // Captures responses when agent stops
  ];

  for (const hookFile of claudeHookFiles) {
    const hookSource = path.join(__dirname, 'src', 'claude-hooks', hookFile);
    const hookDest = path.join(hooksDir, hookFile);

    if (fs.existsSync(hookSource)) {
      fs.copyFileSync(hookSource, hookDest);
      console.log(`[build] Copied Claude Code hook ${hookFile} to dist/claude-hooks/`);
    } else {
      console.warn(`[build] Warning: Claude Code hook script not found at ${hookSource}`);
    }
  }
}

/**
 * Copy icon fonts to dist folder
 * Required for custom status bar icon to work
 */
function copyIconFonts() {
  const fontsDir = path.join(__dirname, 'dist', 'resources', 'fonts');

  // Ensure dist/resources/fonts folder exists
  if (!fs.existsSync(fontsDir)) {
    fs.mkdirSync(fontsDir, { recursive: true });
  }

  const fontSource = path.join(__dirname, 'resources', 'fonts', 'devark-icons.woff');
  const fontDest = path.join(fontsDir, 'devark-icons.woff');

  if (fs.existsSync(fontSource)) {
    fs.copyFileSync(fontSource, fontDest);
    console.log('[build] Copied devark-icons.woff to dist/resources/fonts/');
  } else {
    console.warn('[build] Warning: devark-icons.woff not found at', fontSource);
  }
}

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {esbuild.Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  },
};

/**
 * Plugin to build CSS with Tailwind using PostCSS
 * @type {esbuild.Plugin}
 */
const tailwindPlugin = {
  name: 'tailwind-css',
  setup(build) {
    build.onEnd(() => {
      console.log('[tailwind] Processing CSS...');
      try {
        // Ensure dist/webview directory exists
        if (!fs.existsSync('./dist/webview')) {
          fs.mkdirSync('./dist/webview', { recursive: true });
        }

        // Process CSS with PostCSS/Tailwind for menu
        execSync(
          `npx postcss ./webview/menu/styles/globals.css -o ./dist/webview/index.css${production ? ' --env production' : ''}`,
          { stdio: 'inherit' }
        );

        console.log('[tailwind] CSS processed successfully');
      } catch (error) {
        console.error('[tailwind] CSS processing failed:', error);
      }
    });
  },
};

const extensionConfig = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: './dist/extension.js',
  // Mark ESM-only packages as external to avoid import.meta.url issues
  // @anthropic-ai/claude-agent-sdk uses import.meta.url internally for path resolution
  external: ['vscode', 'vibe-log-cli', '@anthropic-ai/claude-agent-sdk'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  plugins: [esbuildProblemMatcherPlugin],
  // Inject environment variables at build time
  define: {
    'process.env.NODE_ENV': JSON.stringify(production ? 'production' : 'development'),
    'process.env.EXTENSION_VERSION': JSON.stringify(require('./package.json').version),
  },
  tsconfigRaw: {
    compilerOptions: {
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  },
};

// Standalone sync script for hooks (CLI-free)
const devarkSyncConfig = {
  entryPoints: ['./src/bin/devark-sync.ts'],
  bundle: true,
  outfile: './dist/bin/devark-sync.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  banner: {
    js: '#!/usr/bin/env node',
  },
  plugins: [esbuildProblemMatcherPlugin],
};

const webviewConfig = {
  entryPoints: [
    './webview/menu/index.tsx',
  ],
  bundle: true,
  outdir: './dist/webview',
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: !production,
  minify: production,
  logLevel: 'info',
  jsx: 'automatic',
  loader: {
    '.tsx': 'tsx',
    '.ts': 'ts',
    '.css': 'css',
  },
  alias: {
    '@shared': './src/shared',
  },
  plugins: [esbuildProblemMatcherPlugin, tailwindPlugin],
};

async function main() {
  try {
    // Copy sql.js WASM file before building
    copySqlJsWasm();

    // Copy Cursor hooks script before building
    copyCursorHooks();

    // Copy Claude Code hooks script before building
    copyClaudeCodeHooks();

    // Copy icon fonts before building
    copyIconFonts();

    if (watch) {
      // Watch mode
      const extensionCtx = await esbuild.context(extensionConfig);
      const webviewCtx = await esbuild.context(webviewConfig);
      const vibeSyncCtx = await esbuild.context(devarkSyncConfig);

      await Promise.all([
        extensionCtx.watch(),
        webviewCtx.watch(),
        vibeSyncCtx.watch(),
      ]);

      console.log('[watch] Watching for changes...');
    } else {
      // One-time build
      await Promise.all([
        esbuild.build(extensionConfig),
        esbuild.build(webviewConfig),
        esbuild.build(devarkSyncConfig),
      ]);

      console.log('[build] Build complete');
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
