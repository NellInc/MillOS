/**
 * Components Barrel Export
 *
 * Central export point for all React components in the MillOS application.
 * Includes 3D scene components, UI overlays, and system components.
 */

// === Main Scene Components ===
export { MillScene } from './MillScene';
export { Machines } from './Machines';
export { ConveyorSystem } from './ConveyorSystem';
export { WorkerSystem } from './WorkerSystem';
export { ForkliftSystem } from './ForkliftSystem';

// === 3D Effect Components ===
export { DustParticles, GrainFlow, AtmosphericHaze, MachineSteamVents } from './DustParticles';
export { SpoutingSystem } from './SpoutingSystem';
export { FactoryInfrastructure } from './FactoryInfrastructure';
export { TruckBay } from './TruckBay';

// === 3D Detail Components ===
export {
  FactoryWallClock,
  LoadingDockDoor,
  ControlPanelLED,
  ControlPanel,
  CondensationDrip,
  VibrationIndicator,
  PulsingIndicator,
  AmbientDetailsGroup,
} from './ambient';
export { default as AmbientDetails } from './ambient';

// === UI Overlay Components ===
export { UIOverlay } from './UIOverlay';
export { AICommandCenter } from './AICommandCenter';
export { AlertSystem } from './AlertSystem';
export { WorkerDetailPanel } from './WorkerDetailPanel';
export { ProductionMetrics } from './ProductionMetrics';
export { HolographicDisplays } from './HolographicDisplays';
export { AboutModal } from './AboutModal';
export { SCADAPanel } from './SCADAPanel';
export { SPCCharts } from './SPCCharts';

// === Camera & Controller Components ===
export {
  CameraController,
  CameraPresetIndicator,
  useCameraStore,
  useActivePreset,
  CAMERA_PRESETS,
} from './CameraController';
export type { CameraPreset } from './CameraController';
export { FirstPersonController } from './FirstPersonController';

// === Game & Feature Components ===
export {
  CameraFeedContext,
  useCameraFeedRefs,
  PAAnnouncementSystem,
  ProductionTargetsWidget,
  AchievementsPanel,
  WorkerLeaderboard,
  MiniMap,
  ScreenshotButton,
  IncidentReplayControls,
  GamificationBar,
} from './GameFeatures';

// === Emergency & Safety Components ===
export { SafetyScoreBadge, EmergencyOverlay } from './EmergencyOverlay';

// === Monitoring Components ===
export { FPSTracker, FPSDisplay, useFPSStore } from './FPSMonitor';
export { SpatialAudioTracker } from './SpatialAudioTracker';

// === Post-Processing Components ===
export { PostProcessing } from './PostProcessing';

// === AI Visualization Components ===
export { CascadeVisualization } from './CascadeVisualization';
export { StrategicOverlay3D } from './StrategicOverlay3D';
export { ProductionTargetWidget } from './ProductionTargetWidget';

// === Error Handling Components ===
export { default as ErrorBoundary } from './ErrorBoundary';
