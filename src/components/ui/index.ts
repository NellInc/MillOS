// Barrel export for UI components.
// NOTE: the legacy UIOverlay shell was removed (replaced by ui-new/GameInterface).
// The formerly-stranded widgets are now re-homed: SafetyMetricsDisplay,
// SafetyAnalyticsPanel, IncidentHistoryPanel, SafetyConfigPanel and
// ZoneCustomizationPanel live in ui-new SafetyPanel tabs; PredictiveMaintenancePanel
// in ui-new OverviewPanel; KeyboardShortcutsModal in GameInterface (? key).
// MillClockDisplay and TruckScheduleWidget were deleted as redundant with
// OverviewPanel's GameClock/GameSpeedControls and Dock Status sections.
export { SafetyMetricsDisplay } from './SafetyMetricsDisplay';
export { SafetyConfigPanel } from './SafetyConfigPanel';
export { IncidentHistoryPanel } from './IncidentHistoryPanel';
export { SafetyAnalyticsPanel } from './SafetyAnalyticsPanel';
export { ZoneCustomizationPanel } from './ZoneCustomizationPanel';
export { EmergencyStopButton } from './EmergencyStopButton';
export { KeyboardShortcutsModal } from './KeyboardShortcutsModal';

// Strategic AI UI Components
export { DecisionHistoryPanel } from './DecisionHistoryPanel';
export { VCLDebugPanel } from './VCLDebugPanel';
export { StrategicPriorityCards } from './StrategicPriorityCards';
export { ActionPlanTimeline } from './ActionPlanTimeline';
export { ConfidenceBar } from './ConfidenceBar';
export { EnergyDashboard } from './EnergyDashboard';

// Phase 3 Enhancements
export { VCLDiffPanel } from './VCLDiffPanel';
export { DecisionReplay, DecisionReplayTrigger } from './DecisionReplay';
export { MultiObjectiveDashboard } from './MultiObjectiveDashboard';

// Phase 4 Enhancements
export { ShiftHandoverSummary } from './ShiftHandoverSummary';
export { CostEstimationOverlay } from './CostEstimationOverlay';
export { WeatherEffectsOverlay } from './WeatherEffectsOverlay';

// Historical Playback
export { TimelinePlayback } from './TimelinePlayback';
