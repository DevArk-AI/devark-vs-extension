## Project Overview

DevArk VS Code Extension - Developer analytics for AI coding sessions. Tracks and analyzes Claude/Cursor sessions to help developers improve their AI-assisted coding workflows.

**Key Stack**: TypeScript, VS Code Extension API, React (webview), Tailwind CSS, esbuild, Vitest

The extension can analyze coding sessions locally. They can do that with local models 

Or it can connect to the devark cloud and sync manually or automatically using coding agents hooks and upload sessions to devark cloud where they are analyzed in the cloud.

## Common Commands

```bash
# Build for development
npm run compile

# Watch mode (rebuilds on changes)
npm run watch

# Production build
npm run build:production

# Type check (extension + webview)
npm run typecheck

# Run tests
npm test

# Lint
npm run lint

# Package .vsix for local install
npm run package
```

## Architecture

```text
src/
├── extension.ts          # Extension entry point, activation
├── commands/             # VS Code command handlers
├── services/             # Core services (session detection, LLM providers)
│   ├── llm/              # LLM provider implementations (Ollama, OpenRouter, etc.)
│   ├── cursor/           # Cursor IDE integration
│   └── claude/           # Claude session reading
├── webview/              # React sidebar UI
│   ├── components/       # React components
│   ├── hooks/            # React hooks
│   └── views/            # Main view components
├── types/                # TypeScript definitions
└── utils/                # Shared utilities

webview/                  # Webview entry point (index.tsx)
resources/                # Icons, images
test/                     # Vitest tests
```

## Key Patterns

### Extension Activation

Extension activates on `onStartupFinished`. Main entry is `src/extension.ts`.

### Webview Communication

Uses VS Code's webview message passing:

```typescript
// Extension -> Webview
panel.webview.postMessage({ type: 'update', data });

// Webview -> Extension
vscode.postMessage({ type: 'action', payload });
```

### LLM Provider System

Multiple LLM providers in `src/services/llm/`:

- Ollama (local)
- OpenRouter (cloud API)
- Cursor CLI
- Claude Agent SDK

Active provider configured via `devark.llm.activeProvider` setting.

### Configuration

All settings prefixed with `devark.` - see `package.json` contributes.configuration.

## Build System

Uses custom `build.js` with esbuild:

- Extension bundle: `dist/extension.js`
- Webview bundle: `dist/webview.js`
- Tailwind CSS processed separately

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm test:watch

# With coverage
npm test:coverage
```

## Important Notes

1. **Brand rename in progress** - Migrating from Vibe-Log to DevArk
2. **Reference project** - Original code at `../vibe-log/vibe-log-vscode`
3. **Cross-platform** - Must work on macOS, Windows, Linux
4. **Always run before finishing**: `npm run typecheck && npm run build:production && npm test`
5. **Avoid AI slop** - Keep code clean and minimal

## Release Process

See `docs/RELEASE_SETUP.md` for full instructions.

Quick release:

1. Update CHANGELOG.md
2. `npm version patch`
3. `git push origin main --tags`
4. GitHub Actions publishes to VS Code Marketplace
