/**
 * Menu Panel - React Entry Point
 *
 * Full-featured dashboard for:
 * - Session upload (Claude + Cursor)
 * - Hooks management
 * - Report generation
 * - Authentication
 * - Status dashboard
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import { AppV2 } from './AppV2';
// Legacy App imports kept for reference - can be removed later
// import { AppProvider } from './state/AppContext';
// import { App } from './App';

// Import global styles
import './styles/globals.css';
import './styles/redesign.css';

// Extend Window interface to include vscode API
declare global {
  interface Window {
    vscode: any;
    vscodeTheme: string;
    VIBE_LOG_LOGO_URI?: string;
  }
}

console.log('[Menu WebView] Script loaded');
console.log('[Menu WebView] Looking for root element...');

// V2 UI is now the default
console.log('[Menu WebView] Rendering V2 UI (primary)');

// Mount the React app
const container = document.getElementById('root');
console.log('[Menu WebView] Root element:', container);

if (container) {
  console.log('[Menu WebView] Creating React root...');
  try {
    const root = createRoot(container);
    console.log('[Menu WebView] Rendering AppV2...');

    // Always render V2 UI - it's the primary UI now
    root.render(
      <React.StrictMode>
        <AppV2 />
      </React.StrictMode>
    );
    console.log('[Menu WebView] AppV2 rendered successfully!');
  } catch (error) {
    console.error('[Menu WebView] Error rendering app:', error);
  }
} else {
  console.error('[Menu WebView] ERROR: Root element not found!');
}
