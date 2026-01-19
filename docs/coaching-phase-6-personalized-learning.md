# Phase 6: Personalized Coaching & Learning

## Problem
Currently, all users receive the same coaching approach. We're missing:
- User preference learning (preferred suggestion types, timing)
- Skill level adaptation (beginner vs senior prompting)
- Personal patterns (what time of day user is most productive, common issues)
- Historical context (what worked for this user before)

## Goal
Create a personalized coaching system that:
1. Learns user preferences over time
2. Adapts suggestion complexity to skill level
3. Tracks personal patterns and insights
4. Uses historical success data to improve recommendations

---

## Implementation Plan

### 6.1 Add User Profile Types

**File**: `src/services/types/coaching-types.ts`

```typescript
/**
 * User skill level for coaching adaptation
 */
export type PromptingSkillLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * User preference for suggestion timing
 */
export type SuggestionTiming = 'immediate' | 'batch' | 'on_demand';

/**
 * User coaching preferences
 */
export interface CoachingPreferences {
  // Suggestion preferences
  preferredTypes: CoachingSuggestion['type'][];
  avoidTypes: CoachingSuggestion['type'][];
  suggestionTiming: SuggestionTiming;
  maxSuggestionsPerResponse: number;

  // Notification preferences
  showToasts: boolean;
  toastDuration: 'short' | 'long' | 'persistent';

  // Proactive coaching
  enableProactive: boolean;
  breakReminderMinutes: number;
  goalSuggestions: boolean;
}

/**
 * User coaching profile with learned data
 */
export interface UserCoachingProfile {
  // Identity
  userId: string;
  createdAt: Date;
  lastUpdated: Date;

  // Preferences (user-set)
  preferences: CoachingPreferences;

  // Inferred skill level (auto-detected)
  skillLevel: PromptingSkillLevel;
  skillConfidence: number; // 0-1

  // Learned patterns
  patterns: {
    // What times of day they code most
    activeHours: number[]; // 0-23
    // Average prompts per session
    avgPromptsPerSession: number;
    // Average session duration
    avgSessionMinutes: number;
    // Common tech stacks they work with
    commonTechStacks: string[];
    // Topics they frequently work on
    commonTopics: string[];
  };

  // Historical success data
  history: {
    totalSuggestions: number;
    totalUsed: number;
    totalSuccessful: number;
    // Success by type
    typeSuccess: Record<CoachingSuggestion['type'], {
      used: number;
      successful: number;
    }>;
    // Best performing suggestion patterns
    topPatterns: Array<{
      pattern: string;
      successRate: number;
      count: number;
    }>;
  };

  // Recent insights
  insights: Array<{
    type: 'strength' | 'improvement' | 'pattern';
    message: string;
    timestamp: Date;
  }>;
}

export const DEFAULT_COACHING_PREFERENCES: CoachingPreferences = {
  preferredTypes: ['follow_up', 'test', 'error_prevention'],
  avoidTypes: [],
  suggestionTiming: 'immediate',
  maxSuggestionsPerResponse: 3,
  showToasts: true,
  toastDuration: 'short',
  enableProactive: true,
  breakReminderMinutes: 45,
  goalSuggestions: true,
};
```

### 6.2 Create UserCoachingProfileService

**File**: `src/services/UserCoachingProfileService.ts`

```typescript
import * as vscode from 'vscode';
import type {
  UserCoachingProfile,
  CoachingPreferences,
  PromptingSkillLevel,
  CoachingSuggestion,
} from './types/coaching-types';
import { DEFAULT_COACHING_PREFERENCES } from './types/coaching-types';

const PROFILE_STORAGE_KEY = 'copilot.coaching.userProfile';

export class UserCoachingProfileService {
  private static instance: UserCoachingProfileService | null = null;
  private context: vscode.ExtensionContext | null = null;
  private profile: UserCoachingProfile | null = null;

  private constructor() {}

  public static getInstance(): UserCoachingProfileService {
    if (!UserCoachingProfileService.instance) {
      UserCoachingProfileService.instance = new UserCoachingProfileService();
    }
    return UserCoachingProfileService.instance;
  }

  /**
   * Initialize with extension context
   */
  public async initialize(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;
    await this.loadProfile();
  }

  /**
   * Get user profile
   */
  public getProfile(): UserCoachingProfile {
    if (!this.profile) {
      this.profile = this.createDefaultProfile();
    }
    return this.profile;
  }

  /**
   * Update user preferences
   */
  public async updatePreferences(
    preferences: Partial<CoachingPreferences>
  ): Promise<void> {
    const profile = this.getProfile();
    profile.preferences = { ...profile.preferences, ...preferences };
    profile.lastUpdated = new Date();
    await this.saveProfile();
  }

  /**
   * Record suggestion feedback for learning
   */
  public async recordFeedback(
    suggestionType: CoachingSuggestion['type'],
    used: boolean,
    successful?: boolean
  ): Promise<void> {
    const profile = this.getProfile();

    profile.history.totalSuggestions++;
    if (used) {
      profile.history.totalUsed++;
      if (successful) {
        profile.history.totalSuccessful++;
      }
    }

    // Update type-specific stats
    if (!profile.history.typeSuccess[suggestionType]) {
      profile.history.typeSuccess[suggestionType] = { used: 0, successful: 0 };
    }
    if (used) {
      profile.history.typeSuccess[suggestionType].used++;
      if (successful) {
        profile.history.typeSuccess[suggestionType].successful++;
      }
    }

    // Update skill level based on success rate
    await this.updateSkillLevel();

    profile.lastUpdated = new Date();
    await this.saveProfile();
  }

  /**
   * Record session data for pattern learning
   */
  public async recordSessionData(data: {
    duration: number;
    promptCount: number;
    techStack: string[];
    topics: string[];
    hour: number;
  }): Promise<void> {
    const profile = this.getProfile();

    // Update active hours
    if (!profile.patterns.activeHours.includes(data.hour)) {
      profile.patterns.activeHours.push(data.hour);
    }

    // Update averages (exponential moving average)
    const alpha = 0.2;
    profile.patterns.avgSessionMinutes =
      alpha * data.duration + (1 - alpha) * profile.patterns.avgSessionMinutes;
    profile.patterns.avgPromptsPerSession =
      alpha * data.promptCount + (1 - alpha) * profile.patterns.avgPromptsPerSession;

    // Update common tech stacks and topics
    for (const tech of data.techStack) {
      if (!profile.patterns.commonTechStacks.includes(tech)) {
        profile.patterns.commonTechStacks.push(tech);
      }
    }
    for (const topic of data.topics) {
      if (!profile.patterns.commonTopics.includes(topic)) {
        profile.patterns.commonTopics.push(topic);
      }
    }

    // Keep lists bounded
    profile.patterns.commonTechStacks = profile.patterns.commonTechStacks.slice(-20);
    profile.patterns.commonTopics = profile.patterns.commonTopics.slice(-30);

    profile.lastUpdated = new Date();
    await this.saveProfile();
  }

  /**
   * Get personalized suggestion types (ordered by effectiveness for this user)
   */
  public getPersonalizedSuggestionOrder(): CoachingSuggestion['type'][] {
    const profile = this.getProfile();
    const allTypes: CoachingSuggestion['type'][] = [
      'follow_up', 'test', 'error_prevention', 'documentation',
      'refactor', 'goal_alignment', 'celebration'
    ];

    // Sort by success rate for this user
    return allTypes
      .filter(type => !profile.preferences.avoidTypes.includes(type))
      .sort((a, b) => {
        const aStats = profile.history.typeSuccess[a];
        const bStats = profile.history.typeSuccess[b];

        const aRate = aStats && aStats.used > 0
          ? aStats.successful / aStats.used
          : 0.5; // Default for unknown
        const bRate = bStats && bStats.used > 0
          ? bStats.successful / bStats.used
          : 0.5;

        return bRate - aRate;
      });
  }

  /**
   * Generate insights based on user data
   */
  public async generateInsights(): Promise<void> {
    const profile = this.getProfile();
    const insights = [];

    // Strength insight
    const bestType = this.getPersonalizedSuggestionOrder()[0];
    const bestStats = profile.history.typeSuccess[bestType];
    if (bestStats && bestStats.used >= 5) {
      const rate = Math.round((bestStats.successful / bestStats.used) * 100);
      insights.push({
        type: 'strength' as const,
        message: `You excel at "${bestType}" suggestions (${rate}% success rate)`,
        timestamp: new Date(),
      });
    }

    // Improvement insight
    const worstType = this.getPersonalizedSuggestionOrder().slice(-1)[0];
    const worstStats = profile.history.typeSuccess[worstType];
    if (worstStats && worstStats.used >= 3 && worstStats.successful / worstStats.used < 0.3) {
      insights.push({
        type: 'improvement' as const,
        message: `Consider exploring more "${worstType}" suggestions`,
        timestamp: new Date(),
      });
    }

    // Pattern insight
    if (profile.patterns.activeHours.length >= 5) {
      const peakHour = this.findPeakHour(profile.patterns.activeHours);
      insights.push({
        type: 'pattern' as const,
        message: `Your most productive coding time is around ${peakHour}:00`,
        timestamp: new Date(),
      });
    }

    profile.insights = insights.slice(0, 5);
    profile.lastUpdated = new Date();
    await this.saveProfile();
  }

  /**
   * Update skill level based on historical data
   */
  private async updateSkillLevel(): Promise<void> {
    const profile = this.getProfile();

    // Calculate overall success rate
    const successRate = profile.history.totalUsed > 0
      ? profile.history.totalSuccessful / profile.history.totalUsed
      : 0;

    // Determine skill level
    let skillLevel: PromptingSkillLevel;
    if (profile.history.totalUsed < 10) {
      skillLevel = 'beginner';
    } else if (successRate < 0.5) {
      skillLevel = 'beginner';
    } else if (successRate < 0.75) {
      skillLevel = 'intermediate';
    } else {
      skillLevel = 'advanced';
    }

    // Update with confidence based on sample size
    profile.skillLevel = skillLevel;
    profile.skillConfidence = Math.min(1, profile.history.totalUsed / 50);
  }

  /**
   * Find the most common hour in active hours
   */
  private findPeakHour(hours: number[]): number {
    const counts: Record<number, number> = {};
    for (const h of hours) {
      counts[h] = (counts[h] || 0) + 1;
    }
    return parseInt(
      Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '12'
    );
  }

  /**
   * Create default profile
   */
  private createDefaultProfile(): UserCoachingProfile {
    return {
      userId: `user-${Date.now()}`,
      createdAt: new Date(),
      lastUpdated: new Date(),
      preferences: DEFAULT_COACHING_PREFERENCES,
      skillLevel: 'beginner',
      skillConfidence: 0,
      patterns: {
        activeHours: [],
        avgPromptsPerSession: 0,
        avgSessionMinutes: 0,
        commonTechStacks: [],
        commonTopics: [],
      },
      history: {
        totalSuggestions: 0,
        totalUsed: 0,
        totalSuccessful: 0,
        typeSuccess: {} as any,
        topPatterns: [],
      },
      insights: [],
    };
  }

  /**
   * Load profile from storage
   */
  private async loadProfile(): Promise<void> {
    if (!this.context) return;

    const stored = this.context.globalState.get<UserCoachingProfile>(
      PROFILE_STORAGE_KEY
    );

    if (stored) {
      this.profile = {
        ...stored,
        createdAt: new Date(stored.createdAt),
        lastUpdated: new Date(stored.lastUpdated),
        insights: stored.insights.map(i => ({
          ...i,
          timestamp: new Date(i.timestamp),
        })),
      };
    }
  }

  /**
   * Save profile to storage
   */
  private async saveProfile(): Promise<void> {
    if (!this.context || !this.profile) return;
    await this.context.globalState.update(PROFILE_STORAGE_KEY, this.profile);
  }
}

export function getUserCoachingProfile(): UserCoachingProfileService {
  return UserCoachingProfileService.getInstance();
}
```

### 6.3 Integrate Personalization into CoachingService

**File**: `src/services/CoachingService.ts`

```typescript
// In buildCoachingPrompt(), add personalization context:

const profileService = getUserCoachingProfile();
const profile = profileService.getProfile();
const orderedTypes = profileService.getPersonalizedSuggestionOrder();

const personalizationXml = `
<user_profile>
<skill_level>${profile.skillLevel}</skill_level>
<preferred_types>${orderedTypes.slice(0, 3).join(', ')}</preferred_types>
<avoid_types>${profile.preferences.avoidTypes.join(', ') || 'none'}</avoid_types>
<historical_success_rate>${Math.round((profile.history.totalSuccessful / Math.max(1, profile.history.totalUsed)) * 100)}%</historical_success_rate>
<common_tech>${profile.patterns.commonTechStacks.slice(0, 5).join(', ') || 'not yet learned'}</common_tech>
</user_profile>

<personalization_instructions>
- Prioritize suggestion types: ${orderedTypes.slice(0, 3).join(', ')}
- User skill level: ${profile.skillLevel} - adjust complexity accordingly
${profile.skillLevel === 'beginner' ? '- Include more explanation and context in suggestions' : ''}
${profile.skillLevel === 'advanced' ? '- Be concise, assume technical knowledge' : ''}
- Avoid: ${profile.preferences.avoidTypes.join(', ') || 'no restrictions'}
</personalization_instructions>`;
```

### 6.4 Add Insights UI Component

**File**: `webview/menu/components/v2/CoachingInsights.tsx`

```tsx
import { useState, useEffect } from 'react';
import { TrendingUp, Target, Clock, Award } from 'lucide-react';

interface Insight {
  type: 'strength' | 'improvement' | 'pattern';
  message: string;
}

interface CoachingStats {
  skillLevel: string;
  successRate: number;
  totalSuggestions: number;
  insights: Insight[];
}

export function CoachingInsights() {
  const [stats, setStats] = useState<CoachingStats | null>(null);

  useEffect(() => {
    postMessage('getCoachingInsights');

    const handler = (event: MessageEvent) => {
      if (event.data.type === 'coachingInsights') {
        setStats(event.data.data);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  if (!stats) return null;

  const iconMap = {
    strength: <Award className="w-4 h-4 text-green-500" />,
    improvement: <Target className="w-4 h-4 text-yellow-500" />,
    pattern: <Clock className="w-4 h-4 text-blue-500" />,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4" />
        <span className="text-sm font-medium">Your Coaching Insights</span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-muted/50 p-2 rounded">
          <div className="text-muted-foreground">Skill Level</div>
          <div className="font-medium capitalize">{stats.skillLevel}</div>
        </div>
        <div className="bg-muted/50 p-2 rounded">
          <div className="text-muted-foreground">Success Rate</div>
          <div className="font-medium">{stats.successRate}%</div>
        </div>
      </div>

      {stats.insights.length > 0 && (
        <div className="space-y-2">
          {stats.insights.map((insight, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              {iconMap[insight.type]}
              <span className="text-muted-foreground">{insight.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| `src/services/types/coaching-types.ts` | Add UserCoachingProfile, preferences types |
| `src/services/UserCoachingProfileService.ts` | New service (create) |
| `src/services/CoachingService.ts` | Integrate personalization into prompts |
| `src/panels/V2MessageHandler.ts` | Handle profile/insights requests |
| `webview/menu/components/v2/CoachingInsights.tsx` | New component (create) |
| `webview/menu/components/v2/SettingsView.tsx` | Add coaching preferences UI |

---

## Success Metrics

- User engagement increase (suggestions used per session)
- Skill level progression tracking
- Personalized suggestion acceptance rate vs generic
- User retention correlation with personalization
