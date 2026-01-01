/**
 * MenuPanelV2 - Redesigned Dashboard Panel
 *
 * Uses the new v2 UI components:
 * - Tab-based navigation (CO-PILOT / SUMMARIES)
 * - LLM drop-up selector
 * - Prompt scoring and improvement
 * - Session summaries
 *
 * All message handling is consolidated in V2MessageHandler to avoid
 * maintaining separate message type whitelists that can get out of sync.
 */

import * as vscode from 'vscode';
import { BasePanel } from './BasePanel';
import { V2MessageHandler } from './V2MessageHandler';
import type { StatusBarManager } from '../status-bar/StatusBarManager';

export class MenuPanelV2 extends BasePanel {
  public static currentPanel: MenuPanelV2 | undefined;
  private messageHandler: V2MessageHandler | undefined;
  private static statusBarManager: StatusBarManager | undefined;
  private static extensionContext: vscode.ExtensionContext | undefined;

  private constructor(extensionUri: vscode.Uri) {
    super(extensionUri);
  }

  /**
   * Set the extension context for persistent storage
   */
  public static setExtensionContext(context: vscode.ExtensionContext): void {
    MenuPanelV2.extensionContext = context;
  }

  /**
   * Set the status bar manager for integration
   */
  public static setStatusBarManager(manager: StatusBarManager): void {
    MenuPanelV2.statusBarManager = manager;
  }

  /**
   * Creates or shows the Menu panel V2
   */
  public static render(extensionUri: vscode.Uri): void {
    const factory = (uri: vscode.Uri) => new MenuPanelV2(uri);
    BasePanel.createOrShow(extensionUri, MenuPanelV2, factory);
  }

  /**
   * Get the panel ID
   */
  protected getPanelId(): string {
    return 'vibe-log-menu-v2';
  }

  /**
   * Get the panel title
   */
  protected getPanelTitle(): string {
    return 'DevArk';
  }

  /**
   * Get the HTML content for the WebView
   * This loads the React AppV2
   */
  protected getHtmlContent(webview: vscode.Webview): string {
    // Get path to the bundled React app (using the same bundle, AppV2 is included)
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'menu', 'index.js')
    );

    // Get path to the bundled CSS (includes redesign.css)
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'menu', 'index.css')
    );

    const nonce = this._getNonce();

    return `
      <link nonce="${nonce}" rel="stylesheet" href="${styleUri}">
      <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
    `;
  }

  /**
   * Override to inject logo URI
   */
  protected _getHtmlForWebview(webview: vscode.Webview): string {
    // Get the logo URI
    const logoUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'resources', 'icon.svg')
    );

    // Get base HTML
    const baseHtml = super._getHtmlForWebview(webview);

    // Inject logo URI for the header
    return baseHtml.replace(
      'window.vscode = vscode;',
      `window.vscode = vscode;
      window.VIBE_LOG_LOGO_URI = "${logoUri}";`
    );
  }

  /**
   * Override _createPanel to initialize message handler
   */
  protected _createPanel(column: vscode.ViewColumn | undefined): void {
    super._createPanel(column);

    // Create message handler after panel is created
    if (this._panel && MenuPanelV2.extensionContext) {
      this.messageHandler = new V2MessageHandler(
        this._panel,
        this.extensionUri,
        MenuPanelV2.extensionContext
      );

      // Initialize the message handler (loads history from storage)
      this.messageHandler.initialize().then(() => {
        console.log('[MenuPanelV2] Message handler initialized with persistent storage');
      });

      // Set status bar manager if available
      if (MenuPanelV2.statusBarManager) {
        this.messageHandler.setStatusBarManager(MenuPanelV2.statusBarManager);
      }
    }
  }


  /**
   * Handle messages from the WebView
   * All messages are routed through V2MessageHandler - no separate routing needed
   */
  protected handleMessage(message: any): void {
    console.log('[MenuPanelV2] Received message:', message.type);

    if (this.messageHandler) {
      this.messageHandler.handleMessage(message);
    } else {
      console.warn('[MenuPanelV2] No message handler available for:', message.type);
    }
  }

  /**
   * Override dispose to clean up resources
   */
  public dispose(): void {
    // Dispose message handler (which will dispose AutoAnalyzeService)
    if (this.messageHandler) {
      this.messageHandler.dispose();
      this.messageHandler = undefined;
    }

    // Call parent dispose
    super.dispose();
  }

  /**
   * Get the current panel instance
   */
  public static getCurrentPanel(): MenuPanelV2 | undefined {
    return BasePanel.instance as MenuPanelV2 | undefined;
  }
}
