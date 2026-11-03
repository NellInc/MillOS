// Game Features - Re-exports for backward compatibility
// This file maintains the same exports as the original GameFeatures.tsx

// Contexts and hooks
export { CameraFeedContext, useCameraFeedRefs, type CameraFeedContextType } from './shared';

// Announcement constants (exported for use by other components)
export {
  SAFETY_INCIDENT_ANNOUNCEMENTS,
  FIRE_DRILL_ANNOUNCEMENTS,
  EMERGENCY_STOP_ANNOUNCEMENTS,
  FORKLIFT_STOP_ANNOUNCEMENTS,
  FORKLIFT_STOP_TOPIC,
  PLANT_STOP_TOPIC,
  SHARED_PA_CATALOG,
  PA_ANNOUNCEMENT_COUNT,
  getRandomMachineOfType,
} from './shared';

// Components
export { PAAnnouncementSystem } from './PAAnnouncementSystem';
export { AchievementsPanel } from './AchievementsPanel';
export { MiniMap } from './MiniMap';
export { IncidentReplayControls } from './IncidentReplayControls';
