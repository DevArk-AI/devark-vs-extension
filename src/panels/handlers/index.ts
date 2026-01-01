/**
 * Barrel exports for message handlers
 */

export { BaseMessageHandler, type MessageSender, type HandlerContext } from './base-handler';
export { SharedContext, type SyncStatusCache } from './shared-context';

// Domain handlers
export { SummaryHandler } from './summary-handler';
export { ProviderHandler } from './provider-handler';
export { SessionHandler } from './session-handler';
export { GoalsHandler } from './goals-handler';
export { CoachingHandler } from './coaching-handler';

export { PromptAnalysisHandler } from './prompt-analysis-handler';
export { PromptLabHandler } from './prompt-lab-handler';

// Cloud, Hooks, Reports, Stats, Suggestions, Config, and Misc handlers
export { CloudAuthHandler } from './cloud-auth-handler';
export { HooksHandler } from './hooks-handler';
export { ReportHandler } from './report-handler';
export { StatsHandler } from './stats-handler';
export { SuggestionHandler } from './suggestion-handler';
export { ConfigHandler } from './config-handler';
export { MiscHandler } from './misc-handler';
