import { describe, it, expect, vi } from 'vitest';
import { BaseMessageHandler, type MessageSender, type HandlerContext } from '../base-handler';
import type * as vscode from 'vscode';

// Mock vscode Uri
const mockUri = { fsPath: '/test/path' } as vscode.Uri;

// Concrete implementation for testing
class TestHandler extends BaseMessageHandler {
  public messagesHandled: string[] = [];

  getHandledMessageTypes(): string[] {
    return ['test', 'testMessage2'];
  }

  async handleMessage(type: string, data: unknown): Promise<boolean> {
    if (this.getHandledMessageTypes().includes(type)) {
      this.messagesHandled.push(type);
      // Use typed send() with a real message type from the protocol
      this.send('testResponse', { received: data });
      return true;
    }
    return false;
  }
}

describe('BaseMessageHandler', () => {
  it('should send messages through messageSender', async () => {
    const mockSender: MessageSender = {
      sendMessage: vi.fn(),
    };
    const mockContext: HandlerContext = {
      extensionUri: mockUri,
      context: {} as vscode.ExtensionContext,
    };

    const handler = new TestHandler(mockSender, mockContext);
    await handler.handleMessage('test', { foo: 'bar' });

    expect(mockSender.sendMessage).toHaveBeenCalledWith('testResponse', {
      received: { foo: 'bar' },
    });
  });

  it('should return true for handled messages', async () => {
    const mockSender: MessageSender = { sendMessage: vi.fn() };
    const mockContext: HandlerContext = {
      extensionUri: mockUri,
      context: {} as vscode.ExtensionContext,
    };

    const handler = new TestHandler(mockSender, mockContext);

    expect(await handler.handleMessage('test', {})).toBe(true);
    expect(await handler.handleMessage('unknownMessage', {})).toBe(false);
  });

  it('should return correct message types', () => {
    const mockSender: MessageSender = { sendMessage: vi.fn() };
    const mockContext: HandlerContext = {
      extensionUri: mockUri,
      context: {} as vscode.ExtensionContext,
    };

    const handler = new TestHandler(mockSender, mockContext);
    expect(handler.getHandledMessageTypes()).toEqual(['test', 'testMessage2']);
  });
});
