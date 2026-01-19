# Phase 5: Proactive Coaching

## Problem
Currently, coaching only happens AFTER an agent response. We miss opportunities to:
- Suggest a goal when a session starts
- Warn about potential issues before they happen
- Suggest breaks during long sessions
- Proactively recommend best practices based on what user is working on

## Goal
Add proactive coaching that triggers:
1. **Session Start**: Suggest a goal based on first prompt
2. **Long Sessions**: Suggest breaks and progress reviews
3. **Pattern Detection**: Warn about anti-patterns or suggest improvements
4. **Stuck Detection**: Help when user seems to be struggling

---

## Implementation Plan

### 5.1 Add Proactive Coaching Types

**File**: `src/services/types/coaching-types.ts`

```typescript
/**
 * Types of proactive coaching triggers
 */
export type ProactiveTrigger =
  | 'session_start'       // First prompt in session
  | 'long_session'        // Session > 30 minutes
  | 'stuck_detected'      // Multiple failed attempts
  | 'pattern_detected'    // Anti-pattern or improvement opportunity
  | 'milestone_reached'   // Completed significant work
  | 'context_switch';     // User switched to different area of code

/**
 * Proactive coaching suggestion
 */
export interface ProactiveCoaching {
  id: string;
  trigger: ProactiveTrigger;
  title: string;
  message: string;
  action?: {
    label: string;
    command: string;
    args?: Record<string, unknown>;
  };
  priority: 'low' | 'medium' | 'high';
  dismissable: boolean;
  timestamp: Date;
}

/**
 * Configuration for proactive coaching
 */
export interface ProactiveCoachingConfig {
  enabled: boolean;
  suggestGoalOnStart: boolean;
  suggestBreaksAfterMinutes: number;
  detectStuckAfterFailures: number;
  showMilestoneNotifications: boolean;
}

export const DEFAULT_PROACTIVE_CONFIG: ProactiveCoachingConfig = {
  enabled: true,
  suggestGoalOnStart: true,
  suggestBreaksAfterMinutes: 45,
  detectStuckAfterFailures: 3,
  showMilestoneNotifications: true,
};
```

### 5.2 Create ProactiveCoachingService

**File**: `src/services/ProactiveCoachingService.ts`

```typescript
import * as vscode from 'vscode';
import { getSessionManager } from './SessionManagerService';
import { getGoalService } from './GoalService';
import { ExtensionState } from '../extension-state';
import type {
  ProactiveCoaching,
  ProactiveTrigger,
  ProactiveCoachingConfig,
} from './types/coaching-types';
import { DEFAULT_PROACTIVE_CONFIG } from './types/coaching-types';

export class ProactiveCoachingService {
  private static instance: ProactiveCoachingService | null = null;
  private config: ProactiveCoachingConfig;
  private consecutiveFailures: number = 0;
  private lastBreakSuggestion: number = 0;
  private pendingProactive: ProactiveCoaching | null = null;
  private listeners: Set<(coaching: ProactiveCoaching) => void> = new Set();

  private constructor() {
    this.config = DEFAULT_PROACTIVE_CONFIG;
  }

  public static getInstance(): ProactiveCoachingService {
    if (!ProactiveCoachingService.instance) {
      ProactiveCoachingService.instance = new ProactiveCoachingService();
    }
    return ProactiveCoachingService.instance;
  }

  /**
   * Check for session start coaching opportunity
   */
  public async checkSessionStart(promptText: string): Promise<void> {
    if (!this.config.enabled || !this.config.suggestGoalOnStart) return;

    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();

    // Only trigger on first prompt of session
    if (!session || session.promptCount > 1) return;

    // Check if goal already set
    const goalService = getGoalService();
    const goalStatus = goalService.getGoalStatus();
    if (goalStatus.hasGoal) return;

    // Generate goal suggestion using LLM
    const suggestedGoal = await this.inferGoalFromPrompt(promptText);

    if (suggestedGoal) {
      this.emitProactive({
        id: `proactive-goal-${Date.now()}`,
        trigger: 'session_start',
        title: 'Set a Session Goal?',
        message: `Based on your prompt, you might be working on: "${suggestedGoal}". Setting a goal helps track progress.`,
        action: {
          label: 'Set This Goal',
          command: 'vibelog.setGoal',
          args: { goal: suggestedGoal },
        },
        priority: 'medium',
        dismissable: true,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Check for long session (suggest break)
   */
  public checkLongSession(): void {
    if (!this.config.enabled) return;

    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();
    if (!session) return;

    const sessionMinutes = Math.round(
      (Date.now() - session.startTime.getTime()) / 60000
    );

    // Check if enough time has passed since last break suggestion
    const timeSinceLastSuggestion = Date.now() - this.lastBreakSuggestion;
    const minTimeBetweenSuggestions = 30 * 60 * 1000; // 30 minutes

    if (
      sessionMinutes >= this.config.suggestBreaksAfterMinutes &&
      timeSinceLastSuggestion > minTimeBetweenSuggestions
    ) {
      this.lastBreakSuggestion = Date.now();

      this.emitProactive({
        id: `proactive-break-${Date.now()}`,
        trigger: 'long_session',
        title: 'Time for a Break?',
        message: `You've been coding for ${sessionMinutes} minutes. A short break can boost productivity and prevent burnout.`,
        action: {
          label: 'Review Progress',
          command: 'vibelog.showSessionSummary',
        },
        priority: 'low',
        dismissable: true,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Check for stuck pattern (multiple failures)
   */
  public checkStuckPattern(responseOutcome: 'success' | 'partial' | 'error'): void {
    if (!this.config.enabled) return;

    if (responseOutcome === 'error') {
      this.consecutiveFailures++;

      if (this.consecutiveFailures >= this.config.detectStuckAfterFailures) {
        this.emitProactive({
          id: `proactive-stuck-${Date.now()}`,
          trigger: 'stuck_detected',
          title: 'Need a Different Approach?',
          message: `I noticed ${this.consecutiveFailures} unsuccessful attempts. Sometimes stepping back and rephrasing the problem helps.`,
          action: {
            label: 'Get Suggestions',
            command: 'vibelog.showCoPilot',
          },
          priority: 'high',
          dismissable: true,
          timestamp: new Date(),
        });

        // Reset counter after showing
        this.consecutiveFailures = 0;
      }
    } else {
      // Reset on success
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Check for milestone (significant progress)
   */
  public async checkMilestone(filesModified: string[]): Promise<void> {
    if (!this.config.enabled || !this.config.showMilestoneNotifications) return;

    const sessionManager = getSessionManager();
    const session = sessionManager.getActiveSession();
    if (!session) return;

    // Milestone: 5+ files modified in session
    const totalFilesModified = new Set(
      session.responses?.flatMap(r => r.filesModified) || []
    );

    const milestones = [5, 10, 20, 50];
    const currentCount = totalFilesModified.size;

    for (const milestone of milestones) {
      const previousCount = currentCount - filesModified.length;
      if (previousCount < milestone && currentCount >= milestone) {
        this.emitProactive({
          id: `proactive-milestone-${Date.now()}`,
          trigger: 'milestone_reached',
          title: `Milestone: ${milestone} Files Modified!`,
          message: `Great progress! You've touched ${milestone} files this session. Consider committing your changes.`,
          action: {
            label: 'View Summary',
            command: 'vibelog.showSessionSummary',
          },
          priority: 'low',
          dismissable: true,
          timestamp: new Date(),
        });
        break; // Only one milestone notification at a time
      }
    }
  }

  /**
   * Infer a goal from the first prompt
   */
  private async inferGoalFromPrompt(promptText: string): Promise<string | null> {
    try {
      const llmManager = ExtensionState.getLLMManager();
      if (!llmManager) return null;

      const result = await llmManager.generateCompletion({
        prompt: `Based on this developer prompt, suggest a concise session goal (max 50 chars):

Prompt: "${promptText.slice(0, 500)}"

Return ONLY the goal text, nothing else. Example: "Fix authentication bug in login flow"`,
        systemPrompt: 'You extract goals from developer prompts. Be concise.',
        temperature: 0.3,
        maxTokens: 100,
      });

      return result?.text?.trim().slice(0, 100) || null;
    } catch {
      return null;
    }
  }

  /**
   * Emit proactive coaching to listeners
   */
  private emitProactive(coaching: ProactiveCoaching): void {
    this.pendingProactive = coaching;
    for (const listener of this.listeners) {
      try {
        listener(coaching);
      } catch (error) {
        console.error('[ProactiveCoachingService] Listener error:', error);
      }
    }
  }

  /**
   * Subscribe to proactive coaching
   */
  public subscribe(listener: (coaching: ProactiveCoaching) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Dismiss current proactive coaching
   */
  public dismiss(): void {
    this.pendingProactive = null;
  }

  /**
   * Get current proactive coaching
   */
  public getPending(): ProactiveCoaching | null {
    return this.pendingProactive;
  }

  /**
   * Update configuration
   */
  public updateConfig(config: Partial<ProactiveCoachingConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export function getProactiveCoachingService(): ProactiveCoachingService {
  return ProactiveCoachingService.getInstance();
}
```

### 5.3 Wire Up Proactive Triggers

**File**: `src/services/HookBasedPromptService.ts`

```typescript
// In handleNewPromptFile()
import { getProactiveCoachingService } from './ProactiveCoachingService';

// After saving prompt to session manager
const proactiveService = getProactiveCoachingService();
await proactiveService.checkSessionStart(prompt.prompt);

// In handleNewResponseFile()
// After processing response
proactiveService.checkStuckPattern(response.success ? 'success' : 'error');
proactiveService.checkLongSession();
await proactiveService.checkMilestone(response.filesModified || []);
```

### 5.4 Add UI for Proactive Coaching

**File**: `webview/menu/components/v2/ProactiveCoachingBanner.tsx`

```tsx
import { useState, useEffect } from 'react';

interface ProactiveCoaching {
  id: string;
  trigger: string;
  title: string;
  message: string;
  action?: { label: string; command: string };
  priority: 'low' | 'medium' | 'high';
  dismissable: boolean;
}

export function ProactiveCoachingBanner() {
  const [coaching, setCoaching] = useState<ProactiveCoaching | null>(null);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'proactiveCoaching') {
        setCoaching(message.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!coaching) return null;

  const priorityColors = {
    low: 'bg-blue-500/10 border-blue-500/30',
    medium: 'bg-yellow-500/10 border-yellow-500/30',
    high: 'bg-red-500/10 border-red-500/30',
  };

  return (
    <div className={`p-3 rounded-lg border ${priorityColors[coaching.priority]} mb-4`}>
      <div className="flex items-start justify-between">
        <div>
          <h4 className="font-medium text-sm">{coaching.title}</h4>
          <p className="text-xs text-muted-foreground mt-1">{coaching.message}</p>
        </div>
        {coaching.dismissable && (
          <button
            onClick={() => {
              postMessage('dismissProactive', { id: coaching.id });
              setCoaching(null);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            ×
          </button>
        )}
      </div>
      {coaching.action && (
        <button
          onClick={() => postMessage('proactiveAction', coaching.action)}
          className="mt-2 text-xs text-primary hover:underline"
        >
          {coaching.action.label}
        </button>
      )}
    </div>
  );
}
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/services/types/coaching-types.ts` | Add ProactiveCoaching types |
| `src/services/ProactiveCoachingService.ts` | New service (create) |
| `src/services/HookBasedPromptService.ts` | Wire up proactive triggers |
| `src/panels/V2MessageHandler.ts` | Handle proactive events |
| `webview/menu/components/v2/ProactiveCoachingBanner.tsx` | New component (create) |
| `webview/menu/AppV2.tsx` | Include ProactiveCoachingBanner |

---

## Success Metrics

- Goal suggestion acceptance rate (target: >40%)
- Break suggestion engagement
- Stuck detection accuracy (users who get unstuck after intervention)
- Milestone notification sentiment (track dismissal rate)
