/**
 * VSCode Adapters
 *
 * This module provides adapter functions that wrap VSCode APIs to replace CLI interactive UI elements.
 * These adapters allow the extension to use native VSCode UI components instead of terminal-based prompts.
 *
 * @module vscode-adapters
 */

import * as vscode from 'vscode';
import { getNotificationService } from '../services/NotificationService';

/**
 * Shows a quick pick selection dialog (replaces inquirer select prompts)
 *
 * @template T - The type of the value associated with each option
 * @param items - Array of items to display in the quick pick
 * @param options - Configuration options for the quick pick
 * @returns The selected value or undefined if cancelled
 *
 * @example
 * ```typescript
 * const tool = await showQuickPick(
 *   [
 *     { label: 'Claude Code', value: 'claude_code', description: 'Sessions from Claude Code' },
 *     { label: 'Cursor', value: 'cursor', description: 'Sessions from Cursor IDE' }
 *   ],
 *   { title: 'Select Tool', placeHolder: 'Choose a tool to upload sessions from' }
 * );
 * ```
 */
export async function showQuickPick<T extends string>(
  items: Array<{ label: string; value: T; description?: string }>,
  options: { title?: string; placeHolder?: string }
): Promise<T | undefined> {
  try {
    const quickPickItems: vscode.QuickPickItem[] = items.map(item => ({
      label: item.label,
      description: item.description,
      // Store the value in a custom property that we'll retrieve later
      detail: item.value
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      title: options.title,
      placeHolder: options.placeHolder,
      ignoreFocusOut: true
    });

    if (!selected) {
      return undefined;
    }

    // Find the original item to get the value
    const originalItem = items.find(item => item.label === selected.label);
    return originalItem?.value;
  } catch (error) {
    console.error('[showQuickPick] Error:', error);
    return undefined;
  }
}

/**
 * Shows a multi-select quick pick dialog (replaces inquirer checkbox prompts)
 *
 * @template T - The type of the value associated with each option
 * @param items - Array of items to display in the multi-select
 * @param options - Configuration options for the multi-select
 * @returns Array of selected values or undefined if cancelled
 *
 * @example
 * ```typescript
 * const projects = await showMultiSelect(
 *   [
 *     { label: 'Project A', value: 'project-a', description: '/path/to/project-a' },
 *     { label: 'Project B', value: 'project-b', description: '/path/to/project-b' }
 *   ],
 *   { title: 'Select Projects', placeHolder: 'Choose projects to upload' }
 * );
 * ```
 */
export async function showMultiSelect<T extends string>(
  items: Array<{ label: string; value: T; description?: string }>,
  options: { title?: string; placeHolder?: string }
): Promise<T[] | undefined> {
  try {
    const quickPickItems: vscode.QuickPickItem[] = items.map(item => ({
      label: item.label,
      description: item.description,
      detail: item.value
    }));

    const selected = await vscode.window.showQuickPick(quickPickItems, {
      title: options.title,
      placeHolder: options.placeHolder,
      canPickMany: true,
      ignoreFocusOut: true
    });

    if (!selected || selected.length === 0) {
      return undefined;
    }

    // Map selected items back to their values
    const values: T[] = [];
    for (const selectedItem of selected) {
      const originalItem = items.find(item => item.label === selectedItem.label);
      if (originalItem) {
        values.push(originalItem.value);
      }
    }

    return values.length > 0 ? values : undefined;
  } catch (error) {
    console.error('[showMultiSelect] Error:', error);
    return undefined;
  }
}

/**
 * Shows an input box for text input (replaces inquirer input prompts)
 *
 * @param options - Configuration options for the input box
 * @returns The entered text or undefined if cancelled
 *
 * @example
 * ```typescript
 * const apiKey = await showInputBox({
 *   prompt: 'Enter your API key',
 *   placeHolder: 'sk-...',
 *   password: true,
 *   validateInput: (value) => value.length < 10 ? 'API key too short' : undefined
 * });
 * ```
 */
export async function showInputBox(options: {
  prompt: string;
  placeHolder?: string;
  password?: boolean;
  validateInput?: (value: string) => string | undefined;
}): Promise<string | undefined> {
  try {
    const result = await vscode.window.showInputBox({
      prompt: options.prompt,
      placeHolder: options.placeHolder,
      password: options.password,
      ignoreFocusOut: true,
      validateInput: options.validateInput
    });

    return result;
  } catch (error) {
    console.error('[showInputBox] Error:', error);
    return undefined;
  }
}

/**
 * Shows a progress notification while executing a task (replaces ora spinners)
 *
 * @template T - The type of the result returned by the task
 * @param title - The title of the progress notification
 * @param task - The async task to execute with progress reporting
 * @returns The result of the task
 *
 * @example
 * ```typescript
 * const result = await showProgress('Uploading sessions', async (progress) => {
 *   progress.report({ message: 'Reading files...' });
 *   const files = await readFiles();
 *   progress.report({ message: 'Uploading...', increment: 50 });
 *   const result = await upload(files);
 *   progress.report({ increment: 50 });
 *   return result;
 * });
 * ```
 */
export async function showProgress<T>(
  title: string,
  task: (progress: vscode.Progress<{ message?: string; increment?: number }>) => Promise<T>
): Promise<T> {
  try {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title,
        cancellable: false
      },
      async (progress) => {
        return await task(progress);
      }
    );
  } catch (error) {
    console.error('[showProgress] Error:', error);
    throw error;
  }
}

/**
 * Shows a notification message (info, warning, or error)
 *
 * @param message - The message to display
 * @param type - The type of notification (info, warning, or error)
 *
 * @example
 * ```typescript
 * showNotification('Sessions uploaded successfully', 'info');
 * showNotification('Authentication expired', 'warning');
 * showNotification('Upload failed', 'error');
 * ```
 */
export function showNotification(
  message: string,
  type: 'info' | 'warning' | 'error' = 'info'
): void {
  try {
    const notificationService = getNotificationService();
    switch (type) {
      case 'info':
        notificationService.info(message);
        break;
      case 'warning':
        notificationService.warn(message);
        break;
      case 'error':
        notificationService.error(message);
        break;
    }
  } catch (error) {
    console.error('[showNotification] Error:', error);
  }
}

/**
 * Opens a URL in the external default browser
 *
 * @param url - The URL to open
 * @returns True if the URL was successfully opened, false otherwise
 *
 * @example
 * ```typescript
 * const success = await openExternal('https://app.devark.ai/auth/cli');
 * if (!success) {
 *   showNotification('Failed to open browser', 'error');
 * }
 * ```
 */
export async function openExternal(url: string): Promise<boolean> {
  try {
    const uri = vscode.Uri.parse(url);
    const success = await vscode.env.openExternal(uri);
    return success;
  } catch (error) {
    console.error('[openExternal] Error:', error);
    return false;
  }
}

/**
 * Copies text to the system clipboard
 *
 * @param text - The text to copy
 * @returns True if the text was successfully copied, false otherwise
 *
 * @example
 * ```typescript
 * const success = await copyToClipboard('auth-token-12345');
 * if (success) {
 *   showNotification('Token copied to clipboard', 'info');
 * }
 * ```
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await vscode.env.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('[copyToClipboard] Error:', error);
    return false;
  }
}

/**
 * Shows a confirmation dialog with Yes/No options
 *
 * @param message - The main message to display
 * @param detail - Optional detailed message
 * @returns True if "Yes" was clicked, false if "No" or cancelled
 *
 * @example
 * ```typescript
 * const confirmed = await showConfirmation(
 *   'Upload 15 sessions?',
 *   'This will upload your Claude Code sessions from the last 7 days'
 * );
 * if (confirmed) {
 *   // Proceed with upload
 * }
 * ```
 */
export async function showConfirmation(
  message: string,
  detail?: string
): Promise<boolean> {
  try {
    const result = await vscode.window.showInformationMessage(
      message,
      {
        modal: true,
        detail
      },
      'Yes',
      'No'
    );

    return result === 'Yes';
  } catch (error) {
    console.error('[showConfirmation] Error:', error);
    return false;
  }
}

/**
 * Creates an output channel for logging
 *
 * @param name - The name of the output channel
 * @returns The created output channel
 *
 * @example
 * ```typescript
 * const logger = createOutputChannel('DevArk');
 * logger.appendLine('Extension activated');
 * logger.show(); // Show the output channel
 * ```
 */
export function createOutputChannel(name: string): vscode.OutputChannel {
  try {
    return vscode.window.createOutputChannel(name);
  } catch (error) {
    console.error('[createOutputChannel] Error:', error);
    throw error;
  }
}

/**
 * Shows a date picker dialog for selecting a date or date range
 *
 * @param options - Configuration options for the date picker
 * @returns An object with start and optional end dates, or undefined if cancelled
 *
 * @example
 * ```typescript
 * const dateRange = await showDatePicker({
 *   title: 'Select Date Range',
 *   allowRange: true
 * });
 * if (dateRange) {
 *   console.log('From:', dateRange.start, 'To:', dateRange.end);
 * }
 * ```
 */
export async function showDatePicker(options: {
  title: string;
  allowRange?: boolean;
}): Promise<{ start: Date; end?: Date } | undefined> {
  try {
    // Show input for start date
    const startDateStr = await vscode.window.showInputBox({
      prompt: options.allowRange ? 'Enter start date (YYYY-MM-DD)' : 'Enter date (YYYY-MM-DD)',
      placeHolder: 'YYYY-MM-DD',
      ignoreFocusOut: true,
      validateInput: (value) => {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          return 'Invalid date format. Use YYYY-MM-DD';
        }
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          return 'Invalid date';
        }
        return undefined;
      }
    });

    if (!startDateStr) {
      return undefined;
    }

    const start = new Date(startDateStr);

    // If range is allowed, show input for end date
    if (options.allowRange) {
      const endDateStr = await vscode.window.showInputBox({
        prompt: 'Enter end date (YYYY-MM-DD) or leave empty for single date',
        placeHolder: 'YYYY-MM-DD',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value) {
            return undefined; // Empty is allowed
          }
          const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
          if (!dateRegex.test(value)) {
            return 'Invalid date format. Use YYYY-MM-DD';
          }
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            return 'Invalid date';
          }
          if (date < start) {
            return 'End date must be after start date';
          }
          return undefined;
        }
      });

      if (endDateStr) {
        const end = new Date(endDateStr);
        return { start, end };
      }
    }

    return { start };
  } catch (error) {
    console.error('[showDatePicker] Error:', error);
    return undefined;
  }
}

/**
 * Gets the current workspace folder path
 *
 * @returns The path to the first workspace folder or undefined if no workspace is open
 *
 * @example
 * ```typescript
 * const workspaceFolder = getWorkspaceFolder();
 * if (workspaceFolder) {
 *   console.log('Working in:', workspaceFolder);
 * } else {
 *   showNotification('No workspace open', 'warning');
 * }
 * ```
 */
export function getWorkspaceFolder(): string | undefined {
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }
    return workspaceFolders[0].uri.fsPath;
  } catch (error) {
    console.error('[getWorkspaceFolder] Error:', error);
    return undefined;
  }
}

/**
 * Shows a file or folder picker dialog
 *
 * @param options - Configuration options for the file dialog
 * @returns Array of selected file/folder URIs or undefined if cancelled
 *
 * @example
 * ```typescript
 * const folders = await showFileDialog({
 *   canSelectFolders: true,
 *   canSelectFiles: false,
 *   canSelectMany: true,
 *   title: 'Select project folders'
 * });
 * if (folders) {
 *   console.log('Selected folders:', folders.map(f => f.fsPath));
 * }
 * ```
 */
export async function showFileDialog(options: {
  canSelectFiles?: boolean;
  canSelectFolders?: boolean;
  canSelectMany?: boolean;
  title?: string;
}): Promise<vscode.Uri[] | undefined> {
  try {
    const result = await vscode.window.showOpenDialog({
      canSelectFiles: options.canSelectFiles ?? true,
      canSelectFolders: options.canSelectFolders ?? false,
      canSelectMany: options.canSelectMany ?? false,
      title: options.title,
      openLabel: 'Select'
    });

    return result;
  } catch (error) {
    console.error('[showFileDialog] Error:', error);
    return undefined;
  }
}

/**
 * Helper function to read text from clipboard
 *
 * @returns The text from clipboard or empty string if error
 *
 * @example
 * ```typescript
 * const clipboardText = await readFromClipboard();
 * console.log('Clipboard contains:', clipboardText);
 * ```
 */
export async function readFromClipboard(): Promise<string> {
  try {
    return await vscode.env.clipboard.readText();
  } catch (error) {
    console.error('[readFromClipboard] Error:', error);
    return '';
  }
}

/**
 * Shows a yes/no/cancel dialog
 *
 * @param message - The message to display
 * @param detail - Optional detailed message
 * @returns 'yes', 'no', or 'cancel'
 *
 * @example
 * ```typescript
 * const answer = await showYesNoCancel('Save changes?', 'You have unsaved changes');
 * if (answer === 'yes') {
 *   // Save changes
 * } else if (answer === 'no') {
 *   // Discard changes
 * }
 * ```
 */
export async function showYesNoCancel(
  message: string,
  detail?: string
): Promise<'yes' | 'no' | 'cancel'> {
  try {
    const result = await vscode.window.showInformationMessage(
      message,
      {
        modal: true,
        detail
      },
      'Yes',
      'No',
      'Cancel'
    );

    if (result === 'Yes') {
      return 'yes';
    } else if (result === 'No') {
      return 'no';
    } else {
      return 'cancel';
    }
  } catch (error) {
    console.error('[showYesNoCancel] Error:', error);
    return 'cancel';
  }
}

/**
 * Shows a quick pick with custom buttons
 *
 * @param items - Array of items to display
 * @param options - Configuration options
 * @returns The selected item or undefined if cancelled
 *
 * @example
 * ```typescript
 * const result = await showQuickPickWithButtons(
 *   ['Option 1', 'Option 2', 'Option 3'],
 *   { title: 'Choose an option', placeHolder: 'Select one' }
 * );
 * ```
 */
export async function showQuickPickWithButtons(
  items: string[],
  options: { title?: string; placeHolder?: string }
): Promise<string | undefined> {
  try {
    const quickPickItems = items.map(item => ({ label: item }));
    const selected = await vscode.window.showQuickPick(quickPickItems, {
      title: options.title,
      placeHolder: options.placeHolder,
      ignoreFocusOut: true
    });

    return selected?.label;
  } catch (error) {
    console.error('[showQuickPickWithButtons] Error:', error);
    return undefined;
  }
}
