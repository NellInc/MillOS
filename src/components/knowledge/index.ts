/**
 * Knowledge System Components - The Mill Datalinks
 *
 * Inspired by Sid Meier's Alpha Centauri Datalinks.
 * In-game educational system surfacing philosophy behind MillOS.
 */

export { Datalinks } from './Datalinks';
// Backwards compatibility alias
export { Datalinks as KnowledgeLibrary } from './Datalinks';
export { KnowledgeEntryCard } from './KnowledgeEntryCard';
export {
  KnowledgeTooltip,
  KnowledgeHint,
  ContextualInsight,
} from './KnowledgeTooltip';
export { LoadingQuote, StaticQuote } from './LoadingQuote';
export {
  UnlockNotification,
  UnlockNotificationContainer,
  useUnlockNotifications,
} from './UnlockNotification';
export {
  AINarration,
  AINarrationModal,
  AINarrationInline,
} from './AINarration';
