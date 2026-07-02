// Game Features - Main export file
// This file has been split into multiple sub-components in src/components/game/
// This file now re-exports everything for backward compatibility

export {
  // Contexts and hooks
  CameraFeedContext,
  useCameraFeedRefs,
  type CameraFeedContextType,

  // Announcement constants
  SAFETY_INCIDENT_ANNOUNCEMENTS,
  FIRE_DRILL_ANNOUNCEMENTS,
  EMERGENCY_STOP_ANNOUNCEMENTS,
  PA_ANNOUNCEMENT_COUNT,
  getRandomMachineOfType,

  // Components
  PAAnnouncementSystem,
  AchievementsPanel,
  WorkerLeaderboard,
  MiniMap,
  ScreenshotButton,
  IncidentReplayControls,
  GamificationBar,
} from './game';
