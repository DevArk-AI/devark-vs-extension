/**
 * VSCode WebView API Helper
 *
 * Provides type-safe access to VSCode API and message passing utilities.
 */

// VS Code webview global - injected by VS Code into webview context
declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(state: T): void;
};

import type {
  WebviewMessage,
  WebviewMessageData,
  ExtensionMessage,
  ExtensionMessageType,
  ExtensionMessageData,
} from '@shared/webview-protocol';

const vscode = (window as Window & { vscode: ReturnType<typeof acquireVsCodeApi> }).vscode;

/**
 * Send a typed message to the extension
 */
export function send<T extends WebviewMessage['type']>(
  type: T,
  ...args: WebviewMessageData<T> extends undefined ? [] : [data: WebviewMessageData<T>]
): void {
  const [data] = args;
  vscode.postMessage({ type, data });
}

/**
 * Listen for a specific message type from the extension
 */
export function onMessage<T extends ExtensionMessageType>(
  type: T,
  handler: (data: ExtensionMessageData<T>) => void
): () => void {
  const listener = (event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;
    if (message && message.type === type) {
      const data = 'data' in message ? message.data : undefined;
      handler(data as ExtensionMessageData<T>);
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/**
 * Listen for all messages from the extension (typed)
 */
export function onAnyMessage(
  handler: (message: ExtensionMessage) => void
): () => void {
  const listener = (event: MessageEvent<ExtensionMessage>) => {
    const message = event.data;
    if (message && message.type) {
      handler(message);
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

/**
 * Get the current VSCode theme
 */
export function getTheme(): 'light' | 'dark' | 'high-contrast' {
  const theme = (window as Window & { vscodeTheme?: string }).vscodeTheme || 'dark';
  if (theme.includes('light')) return 'light';
  if (theme.includes('high-contrast')) return 'high-contrast';
  return 'dark';
}

/**
 * Get webview state (persisted across reloads)
 */
export function getState<T = unknown>(): T | undefined {
  return vscode.getState() as T | undefined;
}

/**
 * Set webview state (persisted across reloads)
 */
export function setState<T = unknown>(state: T): void {
  vscode.setState(state);
}

// Re-export types for convenience
export type { WebviewMessage, ExtensionMessage } from '@shared/webview-protocol';
