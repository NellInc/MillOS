// Barrel export for UI components.
// NOTE: the legacy UIOverlay shell was removed (replaced by ui-new/GameInterface).
// The widgets below that are no longer rendered anywhere (the "stranded" set:
// MillClockDisplay, SafetyMetricsDisplay, SafetyConfigPanel, IncidentHistoryPanel,
// SafetyAnalyticsPanel, ZoneCustomizationPanel, KeyboardShortcutsModal,
// PredictiveMaintenancePanel, TruckScheduleWidget) are deliberately kept for a
// later re-home into ui-new panels. The fully-orphaned ones (CollapsibleLegend,
// EmergencyControlPanel, WeatherControlPanel, GraphicsSettingsPanel,
// AlertAcknowledgmentFlow) were deleted with the shell.
export { MillClockDisplay } from './MillClockDisplay';
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
