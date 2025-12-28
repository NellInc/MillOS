// Game Features - Re-exports for backward compatibility
// This file maintains the same exports as the original GameFeatures.tsx

// Contexts and hooks
export { CameraFeedContext, useCameraFeedRefs, type CameraFeedContextType } from './shared';

// Announcement constants (exported for use by other components)
export {
  SAFETY_INCIDENT_ANNOUNCEMENTS,
  FIRE_DRILL_ANNOUNCEMENTS,
  EMERGENCY_STOP_ANNOUNCEMENTS,
  PA_ANNOUNCEMENT_COUNT,
  getRandomMachineOfType,
} from './shared';

// Components
export { PAAnnouncementSystem } from './PAAnnouncementSystem';
export { ProductionTargetsWidget } from './ProductionTargetsWidget';
export { AchievementsPanel } from './AchievementsPanel';
export { WorkerLeaderboard } from './WorkerLeaderboard';
export { MiniMap } from './MiniMap';
export { ScreenshotButton } from './ScreenshotButton';
export { IncidentReplayControls } from './IncidentReplayControls';
export { GamificationBar } from './GamificationBar';
