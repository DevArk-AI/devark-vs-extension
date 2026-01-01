/**
 * Cursor Integration Module
 *
 * Provides integration with Cursor IDE's internal database and state
 * for detecting active chats, extracting messages, and managing context.
 */

// Types
export * from './types';

// Core components
export { CursorSessionReader } from './session-reader';
export { SessionTracker } from './session-tracker';

// Active composer detection
export { ActiveComposerDetector } from './active-composer-detector';
export type { ActiveComposerInfo, ActiveComposerChangeHandler } from './active-composer-detector';

// Context management
export { ContextManager } from './context-manager';
export type { ChatContext, CoPilotContext, ContextChangeHandler } from './context-manager';
