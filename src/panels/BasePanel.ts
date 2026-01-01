/**
 * BasePanel - Abstract base class for WebView panels
 *
 * Provides common functionality for all panels:
 * - Singleton pattern support
 * - WebView lifecycle management
 * - Message passing between extension and WebView
 * - CSP headers and security
 * - Theme detection
 */

import * as vscode from 'vscode';

export abstract class BasePanel {
  protected static instance: BasePanel | undefined;
  protected _panel: vscode.WebviewPanel | undefined;
  protected readonly _disposables: vscode.Disposable[] = [];
  protected readonly extensionUri: vscode.Uri;

  /**
   * Constructor - should be called by child classes
   */
  protected constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
  }

  /**
   * Abstract methods that child classes must implement
   */
  protected abstract getPanelId(): string;
  protected abstract getPanelTitle(): string;
  protected abstract getHtmlContent(webview: vscode.Webview): string;

  /**
   * Handle messages from WebView
   * Override this in child classes to handle specific messages
   */
  protected handleMessage(message: any): void {
    console.log(`[${this.getPanelId()}] Received message:`, message);
    // Default implementation - child classes should override
  }

  /**
   * Render the panel (creates or shows existing)
   * This is a static method that should be called by child classes
   */
  protected static createOrShow<T extends BasePanel>(
    extensionUri: vscode.Uri,
    PanelClass: { prototype: T },
    factory?: (uri: vscode.Uri) => T
  ): void {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // Check if the specific PanelClass already has an instance
    // Use the PanelClass's own static instance property, not BasePanel's
    const ClassWithInstance = PanelClass as unknown as typeof BasePanel & { instance?: BasePanel };

    // If we already have a panel of this specific class, show it
    if (ClassWithInstance.instance && ClassWithInstance.instance._panel) {
      ClassWithInstance.instance._panel.reveal(column);
      return;
    }

    // Otherwise, create a new panel using the factory
    if (!factory) {
      throw new Error('Factory is required for creating panel instances');
    }
    const newInstance = factory(extensionUri);

    // Set the instance on the specific PanelClass
    ClassWithInstance.instance = newInstance;
    newInstance._createPanel(column);
  }

  /**
   * Creates the WebView panel
   */
  protected _createPanel(column: vscode.ViewColumn | undefined): void {
    const panelId = this.getPanelId();
    const panelTitle = this.getPanelTitle();

    // Create and show a new webview panel
    this._panel = vscode.window.createWebviewPanel(
      panelId,
      panelTitle,
      column || vscode.ViewColumn.One,
      {
        // Enable JavaScript in the webview
        enableScripts: true,
        // Retain context when hidden
        retainContextWhenHidden: true,
        // Restrict the webview to only loading content from our extension's directory
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, 'dist'),
          vscode.Uri.joinPath(this.extensionUri, 'webview'),
          vscode.Uri.joinPath(this.extensionUri, 'resources')
        ]
      }
    );

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    // This happens when the user closes the panel or when the panel is closed programmatically
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => this.handleMessage(message),
      null,
      this._disposables
    );
  }

  /**
   * Updates the WebView content
   */
  protected _update(): void {
    if (!this._panel) {
      return;
    }

    const webview = this._panel.webview;
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  /**
   * Generates the HTML for the WebView
   * This includes:
   * - CSP headers for security
   * - Theme detection
   * - VSCode API setup
   * - Loading of child-specific content
   */
  protected _getHtmlForWebview(webview: vscode.Webview): string {
    // Get the HTML content from the child class
    const childContent = this.getHtmlContent(webview);

    // Get the current theme
    const theme = this._getTheme();

    // Generate a nonce for CSP
    const nonce = this._getNonce();

    // Basic HTML template with security and theme setup
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- Content Security Policy -->
    <meta http-equiv="Content-Security-Policy" content="
      default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}' ${webview.cspSource};
      font-src ${webview.cspSource};
      img-src ${webview.cspSource} https: data:;
      connect-src ${webview.cspSource} https:;
    ">

    <title>${this.getPanelTitle()}</title>

    <style nonce="${nonce}">
      body {
        padding: 0;
        margin: 0;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
      }

      #root {
        width: 100%;
        height: 100vh;
      }
    </style>
</head>
<body data-vscode-theme="${theme}">
    <div id="root"></div>

    <script nonce="${nonce}">
      // Acquire VS Code API (can only be called once)
      const vscode = acquireVsCodeApi();

      // Store theme for React app
      window.vscodeTheme = '${theme}';

      // Make vscode API available globally
      window.vscode = vscode;

      // Listen for theme changes
      window.addEventListener('message', event => {
        const message = event.data;
        if (message.type === 'themeChanged') {
          document.body.setAttribute('data-vscode-theme', message.theme);
          window.vscodeTheme = message.theme;
        }
      });
    </script>

    ${childContent}
</body>
</html>`;
  }

  /**
   * Get the current VSCode theme
   */
  protected _getTheme(): 'light' | 'dark' | 'high-contrast' {
    const theme = vscode.window.activeColorTheme.kind;
    switch (theme) {
      case vscode.ColorThemeKind.Light:
        return 'light';
      case vscode.ColorThemeKind.Dark:
        return 'dark';
      case vscode.ColorThemeKind.HighContrast:
      case vscode.ColorThemeKind.HighContrastLight:
        return 'high-contrast';
      default:
        return 'dark';
    }
  }

  /**
   * Generate a nonce for CSP
   */
  protected _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Send a message to the WebView
   */
  public postMessage(message: any): void {
    if (this._panel) {
      this._panel.webview.postMessage(message);
    }
  }

  /**
   * Dispose of the panel and clean up resources
   */
  public dispose(): void {
    // Clean up the instance on the specific class
    const constructor = this.constructor as unknown as typeof BasePanel & { instance?: BasePanel };
    constructor.instance = undefined;

    // Dispose of the panel
    if (this._panel) {
      this._panel.dispose();
    }

    // Dispose of all disposables
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  /**
   * Get the webview panel (useful for testing)
   */
  public getPanel(): vscode.WebviewPanel | undefined {
    return this._panel;
  }
}
