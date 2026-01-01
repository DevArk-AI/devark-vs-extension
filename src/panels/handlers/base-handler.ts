/**
 * BaseMessageHandler - Abstract base class for domain-specific message handlers
 *
 * Each handler:
 * - Declares which message types it handles via getHandledMessageTypes()
 * - Implements handleMessage() to process messages
 * - Uses send() for type-safe messaging or sendMessage() for legacy
 * - Accesses shared state via SharedContext
 */

import * as vscode from 'vscode';
import type {
  ExtensionMessageType,
  ExtensionMessageData,
} from '../../shared/webview-protocol';

/**
 * Interface for sending messages back to webview
 */
export interface MessageSender {
  sendMessage(type: string, data: unknown): void;
}

/**
 * Context passed to handlers during construction
 */
export interface HandlerContext {
  extensionUri: vscode.Uri;
  context: vscode.ExtensionContext;
}

/**
 * Abstract base class - all domain handlers extend this
 */
export abstract class BaseMessageHandler {
  protected messageSender: MessageSender;
  protected extensionUri: vscode.Uri;
  protected extensionContext: vscode.ExtensionContext;

  constructor(messageSender: MessageSender, handlerContext: HandlerContext) {
    this.messageSender = messageSender;
    this.extensionUri = handlerContext.extensionUri;
    this.extensionContext = handlerContext.context;
  }

  /**
   * Send typed message to webview (preferred)
   */
  protected send<T extends ExtensionMessageType>(
    type: T,
    ...args: undefined extends ExtensionMessageData<T>
      ? [data?: ExtensionMessageData<T>]
      : [data: ExtensionMessageData<T>]
  ): void {
    const [data] = args;
    this.messageSender.sendMessage(type, data);
  }


  /**
   * Return array of message types this handler processes
   * Used by coordinator to route messages
   */
  abstract getHandledMessageTypes(): string[];

  /**
   * Handle a message - implementation in each domain handler
   * @returns true if message was handled, false otherwise
   */
  abstract handleMessage(type: string, data: unknown): Promise<boolean>;

  /**
   * Optional: Initialize async resources
   */
  async initialize(): Promise<void> {
    // Override in subclasses if needed
  }

  /**
   * Optional: Clean up resources
   */
  dispose(): void {
    // Override in subclasses if needed
  }
}
