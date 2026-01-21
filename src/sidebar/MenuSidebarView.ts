/**
 * MenuSidebarView - Sidebar WebView Provider
 *
 * Displays the DevArk interface in the VS Code sidebar
 * Uses WebviewViewProvider instead of WebviewPanel for always-visible integration
 *
 * All message handling is consolidated in V2MessageHandler to avoid
 * maintaining separate message type whitelists that can get out of sync.
 */

import * as vscode from 'vscode';
import { V2MessageHandler } from '../panels/V2MessageHandler';
import type { StatusBarManager } from '../status-bar/StatusBarManager';

export class MenuSidebarView implements vscode.WebviewViewProvider {
  public static readonly viewType = 'devark-sidebar-webview';
  private _view?: vscode.WebviewView;
  private messageHandler?: V2MessageHandler;
  private static statusBarManager?: StatusBarManager;
  private static extensionContext?: vscode.ExtensionContext;
  private static _instance: MenuSidebarView | undefined;
  private badgeCount = 0;

  constructor(private readonly extensionUri: vscode.Uri) {
    MenuSidebarView._instance = this;
  }

  /**
   * Get the singleton instance of MenuSidebarView
   */
  public static getInstance(): MenuSidebarView | undefined {
    return MenuSidebarView._instance;
  }

  public setBadge(count: number, tooltip: string): void {
    if (this._view) {
      this._view.badge = count > 0 ? { tooltip, value: count } : undefined;
    }
    this.badgeCount = count;
  }

  public incrementBadge(tooltip?: string): void {
    this.badgeCount++;
    this.setBadge(this.badgeCount, tooltip || `${this.badgeCount} new event${this.badgeCount === 1 ? '' : 's'}`);
  }

  public clearBadge(): void {
    this.setBadge(0, '');
  }

  /**
   * Set the extension context for persistent storage
   */
  public static setExtensionContext(context: vscode.ExtensionContext): void {
    MenuSidebarView.extensionContext = context;
  }

  /**
   * Set the status bar manager for integration
   */
  public static setStatusBarManager(manager: StatusBarManager): void {
    MenuSidebarView.statusBarManager = manager;
  }

  /**
   * Called when the view is first visible
   */
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void | Thenable<void> {
    this._view = webviewView;

    // Restore badge if notifications occurred before view was available
    if (this.badgeCount > 0) {
      this._view.badge = {
        tooltip: `${this.badgeCount} new event${this.badgeCount === 1 ? '' : 's'}`,
        value: this.badgeCount
      };
    }

    // Configure webview options
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    // Set HTML content
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Create message handler
    if (MenuSidebarView.extensionContext) {
      this.messageHandler = new V2MessageHandler(
        webviewView,
        this.extensionUri,
        MenuSidebarView.extensionContext
      );

      // Initialize the message handler (loads history from storage)
      this.messageHandler.initialize().then(() => {
        console.log('[MenuSidebarView] Message handler initialized with persistent storage');
      });

      // Set status bar manager if available
      if (MenuSidebarView.statusBarManager) {
        this.messageHandler.setStatusBarManager(MenuSidebarView.statusBarManager);
      }
    }

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(
      (message) => {
        this.handleMessage(message);
      },
      undefined,
      []
    );

    // Handle view disposal
    webviewView.onDidDispose(() => {
      this.dispose();
    });

    // Clear badge when sidebar becomes visible (VIB-74)
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.clearBadge();
      }
    });

    // Listen for theme changes and notify webview (VIB-65)
    vscode.window.onDidChangeActiveColorTheme((colorTheme) => {
      const themeType = colorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';
      this._view?.webview.postMessage({ type: 'themeChanged', data: { theme: themeType } });
    });
  }

  /**
   * Send a message to the webview
   */
  public postMessage(message: any): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * Handle messages from the webview
   * All messages are routed through V2MessageHandler - no separate routing needed
   */
  private handleMessage(message: any): void {
    console.log('[MenuSidebarView] Received message:', message.type);

    if (this.messageHandler) {
      this.messageHandler.handleMessage(message);
    } else {
      console.warn('[MenuSidebarView] No message handler available for:', message.type);
    }
  }


  /**
   * Get the HTML content for the webview
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Get paths to resources
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'index.css')
    );

    // Logo URIs for theme-aware switching (VIB-65)
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'resources', 'devark-icon.svg')
    );
    const logoWhiteUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'resources', 'devark-icon-white.svg')
    );

    // Detect current theme for initial load
    const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark';

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:;">
  <link nonce="${nonce}" rel="stylesheet" href="${styleUri}">
  <title>DevArk</title>
  <style nonce="${nonce}">
    /* Sidebar-specific adjustments */
    body {
      padding: 0;
      margin: 0;
      overflow-x: hidden;
    }

    /* Make content fit sidebar width */
    .vl-app {
      max-width: 100%;
      width: 100%;
    }

    /* Adjust spacing for narrow sidebar */
    .vl-header {
      padding: var(--space-sm) var(--space-md);
    }

    .vl-content {
      padding: var(--space-md);
    }

    /* Make tabs stack vertically on very narrow screens */
    @media (max-width: 400px) {
      .vl-tabs {
        flex-direction: column;
        gap: var(--space-xs);
      }

      .vl-tab {
        width: 100%;
        text-align: center;
      }
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    window.vscode = vscode;
    window.DEVARK_LOGO_URI = "${logoUri}";
    window.DEVARK_LOGO_WHITE_URI = "${logoWhiteUri}";
    window.DEVARK_INITIAL_THEME = "${theme}";
    window.DEVARK_VERSION = "${process.env.EXTENSION_VERSION}";
    window.IS_SIDEBAR = true;
  </script>
  <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate a nonce for CSP
   */
  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose of resources
   */
  public dispose(): void {
    if (this.messageHandler) {
      this.messageHandler.dispose();
      this.messageHandler = undefined;
    }
    this._view = undefined;
  }
}
