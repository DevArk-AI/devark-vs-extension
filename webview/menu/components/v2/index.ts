/**
 * V2 Components Index
 *
 * Exports all redesigned components
 */

export { CoPilotView } from './CoPilotView';
export { SummariesView } from './SummariesView';
export { OnboardingView } from './OnboardingView';
export { SettingsView } from './SettingsView';
export { ProviderSelectView } from './ProviderSelectView';
export { HookSetupView } from './HookSetupView';
export { LLMDropup } from './LLMDropup';
export { LoadingOverlay } from './LoadingOverlay';

// Sidebar components (A1)
export { Sidebar } from './Sidebar';
export { SidebarResizeHandle } from './SidebarResizeHandle';
export { useSidebarResize } from './hooks/useSidebarResize';

// Projects & Sessions List components (A2)
export { ProjectsList } from './ProjectsList';
export { SessionCard } from './SessionCard';
export { PromptHistoryList } from './PromptHistoryList';

// Score Display components (A3)
export { ScoreBar } from './ScoreBar';
export { ScoreBreakdown } from './ScoreBreakdown';
export { PromptScore } from './PromptScore';
export { HowScoresWorkModal } from './HowScoresWorkModal';

// Daily Stats components (A4)
export { DailyStatsBanner } from './DailyStatsBanner';
export { PersonalProgress } from './PersonalProgress';

// Goals & Suggestions components (A5)
export { SessionGoal } from './SessionGoal';
export { CoPilotSuggestion } from './CoPilotSuggestion';

// Activity Rings components (Phase 1 - UI Redesign)
export { ActivityRings, type RingData, type ActivityRingsProps } from './ActivityRings';
export { SessionRingCard, type SessionRingCardProps } from './SessionRingCard';

// Rings Header (Phase 2 - Cockpit Header)
export { RingsHeader, type RingsHeaderProps } from './RingsHeader';
