import * as vscode from 'vscode';
// MenuPanel kept for reference - can be removed when V2 is stable
// import { MenuPanel } from './panels/MenuPanel';
import { MenuPanelV2 } from './panels/MenuPanelV2';
// CoPilotPanel removed - legacy code replaced by V2 sidebar with CoPilotView tab
// TreeViewProvider removed - using sidebar webview instead
// import { TreeViewProvider } from './sidebar/TreeViewProvider';
import { MenuSidebarView } from './sidebar/MenuSidebarView';
import { defaultProviderRegistry, configureSecureStorage } from './llm/decorators';
import { LLMManager } from './llm/llm-manager';
import { SettingsManager } from './llm/settings-manager';
import { ExtensionState } from './extension-state';
import { createStatusBarManager } from './status-bar/StatusBarManager';
import { createExtensionServices } from './di/container';
import { UnifiedSettingsService } from './services/UnifiedSettingsService';
import { WorkspaceContextService } from './services/WorkspaceContextService';
import { AnalyticsEvents } from './services/analytics-events';
import { getNotificationService } from './services/NotificationService';

// Import provider modules to trigger registration
import './llm/providers/ollama-provider';
import './llm/providers/openrouter-provider';
// import './llm/providers/anthropic-provider'; // Removed - use OpenRouter instead
import './llm/providers/cursor-cli-provider';
// Future providers can be added here with just an import

/**
 * Extension activation entry point
 * Called when the extension is activated (on startup)
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('Activating DevArk extension...');

  // Global error handlers to catch unhandled errors (helps debug crashes)
  process.on('unhandledRejection', (reason, promise) => {
    console.error('[DevArk] Unhandled Promise Rejection:', reason);
    console.error('[DevArk] Promise:', promise);
  });

  process.on('uncaughtException', (error) => {
    console.error('[DevArk] Uncaught Exception:', error);
  });

  // Initialize debug mode from workspace state (persists across sessions)
  let debugMode = context.workspaceState.get<boolean>('devark.debugMode', false);
  process.env.DEVARK_DEBUG = debugMode ? 'true' : 'false';

  // Initialize UnifiedSettingsService first - sole gateway to vscode settings
  const unifiedSettingsService = new UnifiedSettingsService();
  ExtensionState.setUnifiedSettingsService(unifiedSettingsService);

  // === Initialize CLI-free services (new architecture) ===
  // Must be created BEFORE LLMManager so SecureConfigStore is available
  const services = createExtensionServices(context);
  ExtensionState.setServices(services);

  // Set up auth status checker for analytics (checks if user is registered to cloud)
  services.analyticsService.setAuthStatusChecker(async () => {
    try {
      return await services.authService.isAuthenticated();
    } catch {
      return false;
    }
  });

  // Track extension activation
  const isFirstActivation = !context.globalState.get<boolean>('devark.hasActivatedBefore');
  services.analyticsService.track(AnalyticsEvents.ACTIVATED, {
    first_time: isFirstActivation,
    version: context.extension?.packageJSON?.version || 'unknown',
  });
  if (isFirstActivation) {
    context.globalState.update('devark.hasActivatedBefore', true);
  }

  // Configure secure storage for API keys on the global registry
  configureSecureStorage(services.secureConfigStore);

  // Initialize SettingsManager with UnifiedSettingsService
  const settingsManager = new SettingsManager(unifiedSettingsService);

  // Initialize LLM Manager with registry pattern
  const llmManager = new LLMManager(
    defaultProviderRegistry,
    settingsManager
  );

  // Register with ExtensionState for global access
  ExtensionState.setLLMManager(llmManager);

  // Ensure devark-sync symlink is ready for hooks
  try {
    await services.symlinkManager.ensureSymlink();
    console.log('✓ devark-sync symlink ready at:', services.symlinkManager.getSymlinkPath());
  } catch (err) {
    console.warn('⚠ Failed to create devark-sync symlink:', err);
  }

  // NOTE: Coaching service wiring removed - CoPilotCoordinator handles this
  // to avoid duplicate listeners causing race conditions (VIB-35)

  // === Install hooks if auto-analyze is enabled ===
  // This ensures hooks are installed on activation when the setting is already true
  try {
    const autoAnalyzeEnabled = unifiedSettingsService.getWithDefault('autoAnalyze.enabled', false);

    if (autoAnalyzeEnabled) {
      console.log('[Extension] Auto-analyze is enabled, installing hooks...');
      await services.claudeHookInstaller.install({
        hooks: ['UserPromptSubmit', 'Stop'],
        mode: 'all',
      });
      await services.cursorHookInstaller.install({
        hooks: ['UserPromptSubmit', 'Stop'],
        mode: 'all',
      });
      console.log('✓ Hooks installed (UserPromptSubmit + Stop) for Claude Code and Cursor');
    }
  } catch (err) {
    console.warn('⚠ Failed to install hooks on activation:', err);
  }

  // Register cleanup on deactivation
  context.subscriptions.push({ dispose: () => ExtensionState.reset() });

  try {
    await llmManager.initialize();
    console.log('✓ LLM Manager initialized successfully');

    const providers = llmManager.getAvailableProviders();
    console.log(`✓ Registered providers: ${providers.map(p => p.displayName).join(', ')}`);

    const activeProvider = llmManager.getActiveProvider();
    if (activeProvider) {
      console.log(`✓ Active provider: ${activeProvider.type}`);
    }
  } catch (error) {
    console.warn('⚠ LLM Manager initialization failed:', error);

    // Show notification to user (VIB-74: badge + toast)
    getNotificationService().warn(
      'No LLM provider configured. Copilot features will be unavailable.',
      { action: { label: 'Open Settings', command: 'workbench.action.openSettings?devark.llm' } }
    );
  }

  // Store in context for access by panels
  context.workspaceState.update('llmManager', llmManager);

  // Create and register status bar manager
  const statusBarManager = createStatusBarManager(context, llmManager);
  ExtensionState.setStatusBarManager(statusBarManager);
  MenuPanelV2.setStatusBarManager(statusBarManager);
  MenuSidebarView.setStatusBarManager(statusBarManager);

  // Set extension context for persistent storage
  MenuPanelV2.setExtensionContext(context);
  MenuSidebarView.setExtensionContext(context);

  // Listen for configuration changes and reinitialize LLM manager
  const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
    // Only reinitialize if LLM settings changed
    if (e.affectsConfiguration('devark.llm')) {
      console.log('[Extension] LLM configuration changed, reinitializing...');
      try {
        await llmManager.reinitialize();
        const providerInfo = llmManager.getActiveProviderInfo();
        console.log(`[Extension] Reinitialized with provider: ${providerInfo?.type}`);
        getNotificationService().info(`LLM provider updated to: ${providerInfo?.type}`);
        // Update status bar with new provider
        statusBarManager.refreshProviderStatus();
      } catch (error) {
        console.error('[Extension] Failed to reinitialize LLM manager:', error);
        getNotificationService().warn(
          'Failed to apply LLM configuration changes. Check your settings.',
          { action: { label: 'Open Settings', command: 'workbench.action.openSettings?devark.llm' } }
        );
      }
    }
  });
  context.subscriptions.push(configChangeListener);

  // Register command: devark.showMenu (opens panel version)
  const showMenuCommand = vscode.commands.registerCommand('devark.showMenu', () => {
    MenuPanelV2.render(context.extensionUri);
  });
  context.subscriptions.push(showMenuCommand);

  // Register sidebar webview provider
  const sidebarProvider = new MenuSidebarView(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      MenuSidebarView.viewType,
      sidebarProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
  );

  // Note: Sidebar shows automatically when user clicks the activity bar icon
  // No need to manually open it on startup

  // devark.showCoPilot command removed - legacy CoPilotPanel replaced by V2 sidebar

  // TreeViewProvider removed - using sidebar webview only
  // const treeViewProvider = new TreeViewProvider();
  // const treeView = vscode.window.registerTreeDataProvider(
  //   'vibelog-sidebar-view',
  //   treeViewProvider
  // );
  // context.subscriptions.push(treeView);

  // Register command: devark.toggleDebugMode
  const toggleDebugCommand = vscode.commands.registerCommand(
    'devark.toggleDebugMode',
    async () => {
      debugMode = !debugMode;
      process.env.DEVARK_DEBUG = debugMode ? 'true' : 'false';

      // Persist debug mode across sessions
      await context.workspaceState.update('devark.debugMode', debugMode);

      const status = debugMode ? 'ON' : 'OFF';

      getNotificationService().info(`Debug Mode: ${status}`);

      console.log(`[Extension] Debug mode ${status}`);
      console.log(`[Extension] DEVARK_DEBUG environment variable: ${process.env.DEVARK_DEBUG}`);
    }
  );
  context.subscriptions.push(toggleDebugCommand);

  // Register command: devark.copilot.summarizeSession
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.copilot.summarizeSession', async () => {
      try {
        if (!llmManager.getActiveProvider()) {
          getNotificationService().error('No LLM provider configured. Please configure Ollama or OpenRouter in settings.');
          return;
        }

        // Show progress
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Generating session summary...',
          cancellable: false
        }, async () => {
          const { SessionSummarizer } = await import('./copilot/session-summarizer');
          const summarizer = new SessionSummarizer(llmManager);

          // TODO: Get real session data from session tracker
          const sessionData = {
            duration: 3600,
            filesChanged: [],
            commands: [],
            projectName: vscode.workspace.name || 'Unknown',
            tool: 'vscode',
            timestamp: new Date().toISOString()
          };

          const summary = await summarizer.summarizeSession(sessionData);

          getNotificationService().info(`Summary: ${summary.substring(0, 100)}...`);
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        getNotificationService().error(`Failed to generate summary: ${errorMessage}`);
      }
    })
  );

  // Register command: devark.testProviders
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.testProviders', async () => {
      try {
        const configuredProviders = llmManager.getConfiguredProviders();

        if (configuredProviders.length === 0) {
          getNotificationService().warn(
            'No LLM providers configured. Please configure at least one provider in settings.',
            { action: { label: 'Open Settings', command: 'workbench.action.openSettings?devark.llm' } }
          );
          return;
        }

        // Show progress with increment
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Testing LLM Providers',
          cancellable: false
        }, async (progress) => {
          const { ProviderE2ETester } = await import('./test/provider-e2e-test');
          const tester = new ProviderE2ETester(llmManager);

          // Run tests with progress updates
          const summary = await tester.testAllProviders({
            connectionOnly: false,
            onProgress: (message, percentage) => {
              progress.report({
                message,
                increment: percentage ? 10 : 0
              });
            }
          });

          // Format and display results
          const summaryText = ProviderE2ETester.formatSummary(summary);
          console.log('[Provider Test Results]\n' + summaryText);

          // Show summary notification
          const resultIcon = summary.passedProviders === summary.testedProviders ? '✓' : '⚠';
          const summaryMessage = `${resultIcon} Tested ${summary.testedProviders} provider(s): ${summary.passedProviders} passed, ${summary.failedProviders} failed`;

          if (summary.failedProviders > 0) {
            getNotificationService().warn(summaryMessage);
          } else {
            getNotificationService().info(summaryMessage);
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[Extension] Provider test failed:', error);
        getNotificationService().error(`Provider tests failed: ${errorMessage}`);
      }
    })
  );

  // Register command: devark.copilot.scorePrompt
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.copilot.scorePrompt', async () => {
      try {
        if (!llmManager.getActiveProvider()) {
          getNotificationService().error('No LLM provider configured. Please configure Ollama or OpenRouter in settings.');
          return;
        }

        const prompt = await vscode.window.showInputBox({
          prompt: 'Enter a prompt to score',
          placeHolder: 'Fix the authentication bug in the login component',
          ignoreFocusOut: true
        });

        if (!prompt) {
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Scoring prompt...',
          cancellable: false
        }, async () => {
          const { PromptScorer } = await import('./copilot/prompt-scorer');
          const scorer = new PromptScorer(llmManager);

          // Use V2 scoring for full 5-dimension breakdown
          const score = await scorer.scorePromptV2(prompt);

          getNotificationService().info(`Prompt Score: ${score.overall}/100`);
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        getNotificationService().error(`Failed to score prompt: ${errorMessage}`);
      }
    })
  );

  // Register command: devark.copilot.enhancePrompt
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.copilot.enhancePrompt', async () => {
      try {
        if (!llmManager.getActiveProvider()) {
          getNotificationService().error('No LLM provider configured. Please configure Ollama or OpenRouter in settings.');
          return;
        }

        const prompt = await vscode.window.showInputBox({
          prompt: 'Enter a prompt to enhance',
          placeHolder: 'Fix the bug',
          ignoreFocusOut: true
        });

        if (!prompt) {
          return;
        }

        const level = await vscode.window.showQuickPick(
          ['light', 'medium', 'aggressive'],
          {
            placeHolder: 'Select enhancement level',
            ignoreFocusOut: true
          }
        );

        if (!level) {
          return;
        }

        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Enhancing prompt...',
          cancellable: false
        }, async () => {
          const { PromptEnhancer } = await import('./copilot/prompt-enhancer');
          const enhancer = new PromptEnhancer(llmManager);

          const result = await enhancer.enhancePrompt(
            prompt,
            level as 'light' | 'medium' | 'aggressive'
          );

          getNotificationService().info(`Enhanced prompt (${result.improvements.length} improvements)`);
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        getNotificationService().error(`Failed to enhance prompt: ${errorMessage}`);
      }
    })
  );

  // Register command: devark.copilot.testConnection
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.copilot.testConnection', async () => {
      try {
        await vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Testing LLM connection...',
          cancellable: false
        }, async () => {
          const results = await llmManager.testAllProviders();

          const succeeded = Object.values(results).filter(r => r.success).length;
          const total = Object.keys(results).length;

          if (succeeded === total) {
            getNotificationService().info(`Connection test: ${succeeded}/${total} providers connected`);
          } else {
            getNotificationService().warn(`Connection test: ${succeeded}/${total} providers connected`);
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        getNotificationService().error(`Connection test failed: ${errorMessage}`);
      }
    })
  );

  // Register command: devark.copilot.selectModel
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.copilot.selectModel', async () => {
      try {
        const provider = llmManager.getActiveProvider();
        if (!provider) {
          getNotificationService().error('No LLM provider is active. Please configure a provider first.');
          return;
        }

        const providerInfo = llmManager.getActiveProviderInfo();
        if (providerInfo?.type !== 'ollama') {
          getNotificationService().info('Model selection is currently only supported for Ollama provider.');
          return;
        }

        // List available models from Ollama
        vscode.window.withProgress({
          location: vscode.ProgressLocation.Notification,
          title: 'Fetching available models from Ollama...',
          cancellable: false
        }, async () => {
          try {
            const models = await provider.listModels();

            if (models.length === 0) {
              getNotificationService().warn('No models found on Ollama server. Pull a model with: ollama pull <model-name>');
              return;
            }

            // Create quick pick items
            const items = models.map(model => ({
              label: model.name || model.id,
              description: model.description,
              detail: `Context: ${model.contextLength || 'Unknown'}`,
              value: model.id
            }));

            const selected = await vscode.window.showQuickPick(items, {
              placeHolder: `Select Ollama model (currently: ${providerInfo.model})`,
              ignoreFocusOut: true
            });

            if (!selected) {
              return;
            }

            // Update configuration via UnifiedSettingsService
            const settingsService = ExtensionState.getUnifiedSettingsService();
            const providers = settingsService.getWithDefault('llm.providers', {});
            const updatedProviders = {
              ...providers,
              ollama: { ...providers.ollama, model: selected.value }
            };
            await settingsService.set('llm.providers', updatedProviders);

            getNotificationService().info(`Ollama model changed to: ${selected.label}`);
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            getNotificationService().error(`Failed to fetch models: ${errorMsg}`);
          }
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        getNotificationService().error(`Failed to select model: ${errorMessage}`);
      }
    })
  );

  // Register command: devark.copilot.selectProvider
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.copilot.selectProvider', async () => {
      try {
        // Get all available providers from registry
        const availableProviders = llmManager.getAvailableProviders();

        // Create quick pick items from all registered providers
        const items = availableProviders.map(provider => ({
          label: provider.displayName,
          description: provider.description,
          detail: provider.requiresAuth ? 'Requires API key' : 'No authentication required',
          value: provider.id
        }));

        const choice = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select LLM provider',
          ignoreFocusOut: true
        });

        if (!choice) {
          return;
        }

        await ExtensionState.getUnifiedSettingsService().set('llm.activeProvider', choice.value);

        // Reinitialize to apply changes
        await llmManager.reinitialize();

        getNotificationService().info(`Switched to ${choice.label} provider`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        getNotificationService().error(
          `Failed to switch provider: ${errorMessage}`,
          { action: { label: 'Open Settings', command: 'workbench.action.openSettings?devark.llm' } }
        );
      }
    })
  );

  // Register command: devark.installCursorHooks
  context.subscriptions.push(
    vscode.commands.registerCommand('devark.installCursorHooks', async () => {
      try {
        const cursorHookInstaller = ExtensionState.getCursorHookInstaller();

        // Ask user for scope
        const choice = await vscode.window.showQuickPick(
          [
            {
              label: 'Global (recommended)',
              description: 'Works for all projects',
              value: 'global' as const
            },
            {
              label: 'Workspace only',
              description: 'Only for current project',
              value: 'workspace' as const
            }
          ],
          {
            placeHolder: 'Where should Cursor hooks be installed?',
            ignoreFocusOut: true
          }
        );

        if (!choice) {
          return;
        }

        const result = await cursorHookInstaller.install({
          hooks: ['UserPromptSubmit', 'Stop'],
          mode: choice.value === 'global' ? 'all' : 'selected',
        });

        if (result.success) {
          getNotificationService().info('Hooks installed successfully! Auto-capture is now enabled.');
        } else {
          const errors = result.errors.map(e => e.error).join(', ');
          getNotificationService().error(`Failed to install hooks: ${errors}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        getNotificationService().error(`Failed to install Cursor hooks: ${errorMessage}`);
      }
    })
  );

  // Log successful activation
  console.log('DevArk extension activated successfully');
  console.log('- Sidebar webview registered: devark-sidebar-webview');
  console.log('- Menu panel command registered: devark.showMenu');
  console.log('- Debug mode toggle registered: devark.toggleDebugMode');
  console.log('- Copilot commands registered:');
  console.log('  - devark.copilot.summarizeSession');
  console.log('  - devark.copilot.scorePrompt');
  console.log('  - devark.copilot.enhancePrompt');
  console.log('  - devark.copilot.testConnection');
  console.log('  - devark.copilot.selectProvider');
  console.log('  - devark.copilot.selectModel');
  console.log('  - devark.installCursorHooks');
  console.log(`- Debug mode: ${debugMode ? 'ON' : 'OFF'}`);
}

/**
 * Extension deactivation
 * Called when the extension is deactivated
 */
export function deactivate() {
  console.log('DevArk extension is now deactivated');

  // Reset WorkspaceContextService to dispose FileSystemWatcher
  WorkspaceContextService.reset();

  // Cleanup is handled automatically by VSCode disposing subscriptions
  // Panels will be disposed when their dispose() method is called
}
