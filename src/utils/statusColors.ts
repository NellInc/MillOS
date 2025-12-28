/**
 * Unified Status Color Utilities
 *
 * Centralized color management for all status indicators across the application.
 * This ensures consistent visual language for machine, worker, dock, diagnostic,
 * and cooperation statuses.
 */

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/** Machine operational status */
export type MachineStatus = 'running' | 'idle' | 'maintenance' | 'warning' | 'error' | 'critical';

/** Worker activity status */
export type WorkerStatus = 'working' | 'responding' | 'break' | 'idle';

/** Dock/truck bay status */
export type DockStatus = 'arriving' | 'loading' | 'departing' | 'clear';

/** Worker engagement diagnostic status */
export type DiagnosticStatus = 'healthy' | 'forcing' | 'burnoutRisk' | 'disengaged';

/** Cooperation formation status */
export type CooperationStatus = 'proposed' | 'forming' | 'active' | 'completed';

// =============================================================================
// FORKLIFT STATUS
// =============================================================================

/**
 * Get the warning color for forklift status indicators
 * @param isStopped - Whether the forklift is emergency stopped
 * @param isInCrossing - Whether the forklift is in a pedestrian crossing
 * @returns Hex color string
 */
export const getForkliftWarningColor = (isStopped: boolean, isInCrossing: boolean): string =>
  isStopped ? '#ef4444' : isInCrossing ? '#3b82f6' : '#f59e0b';

// =============================================================================
// MACHINE STATUS COLORS
// =============================================================================

/**
 * Get the hex color for machine status indicators (3D rendering)
 * @param status - Machine status string
 * @returns Hex color string
 */
export const getMachineStatusColor = (status: MachineStatus | string): string => {
  switch (status) {
    case 'running':
      return '#22c55e';
    case 'idle':
      return '#eab308';
    case 'maintenance':
      return '#f59e0b';
    case 'warning':
      return '#f59e0b';
    case 'error':
    case 'critical':
      return '#ef4444';
    default:
      return '#6b7280';
  }
};

/** @deprecated Use getMachineStatusColor instead */
export const getStatusColor = getMachineStatusColor;

// =============================================================================
// WORKER STATUS COLORS
// =============================================================================

/**
 * Get hex color for worker status (3D rendering)
 * @param status - Worker status
 * @returns Hex color string
 */
export const getWorkerStatusColor = (status: WorkerStatus | string): string => {
  switch (status) {
    case 'working':
      return '#22c55e'; // green-500
    case 'responding':
      return '#f59e0b'; // amber-500
    case 'break':
      return '#6b7280'; // gray-500
    default:
      return '#3b82f6'; // blue-500
  }
};

/**
 * Get Tailwind background class for worker status (UI overlays)
 * @param status - Worker status
 * @returns Tailwind CSS class string
 */
export const getWorkerStatusBgClass = (status: WorkerStatus | string): string => {
  switch (status) {
    case 'working':
      return 'bg-green-500';
    case 'responding':
      return 'bg-yellow-500';
    case 'break':
      return 'bg-gray-500';
    default:
      return 'bg-blue-500';
  }
};

// =============================================================================
// DOCK STATUS COLORS
// =============================================================================

/**
 * Get hex color for dock/truck bay status (3D holographic displays)
 * @param status - Dock status
 * @returns Hex color string
 */
export const getDockStatusColor = (status: DockStatus | string): string => {
  switch (status) {
    case 'arriving':
      return '#3b82f6'; // blue
    case 'loading':
      return '#f97316'; // orange
    case 'departing':
      return '#22c55e'; // green
    case 'clear':
      return '#64748b'; // gray
    default:
      return '#64748b';
  }
};

// =============================================================================
// DIAGNOSTIC STATUS COLORS (Engagement Store)
// =============================================================================

/**
 * Get Tailwind text color class for diagnostic status
 * @param status - Diagnostic status
 * @returns Tailwind CSS text class
 */
export const getDiagnosticStatusColor = (status: DiagnosticStatus | string): string => {
  switch (status) {
    case 'healthy':
      return 'text-green-400';
    case 'forcing':
      return 'text-amber-400';
    case 'burnoutRisk':
      return 'text-orange-400';
    case 'disengaged':
      return 'text-red-400';
    default:
      return 'text-slate-400';
  }
};

/**
 * Get Tailwind background color class for diagnostic status (with /20 opacity)
 * @param status - Diagnostic status
 * @returns Tailwind CSS background class
 */
export const getDiagnosticStatusBgColor = (status: DiagnosticStatus | string): string => {
  switch (status) {
    case 'healthy':
      return 'bg-green-500/20';
    case 'forcing':
      return 'bg-amber-500/20';
    case 'burnoutRisk':
      return 'bg-orange-500/20';
    case 'disengaged':
      return 'bg-red-500/20';
    default:
      return 'bg-slate-500/20';
  }
};

// =============================================================================
// COOPERATION STATUS COLORS
// =============================================================================

/**
 * Get Tailwind text color class for cooperation status
 * @param status - Cooperation status
 * @returns Tailwind CSS text class
 */
export const getCooperationStatusColor = (status: CooperationStatus | string): string => {
  switch (status) {
    case 'proposed':
      return 'text-amber-400';
    case 'forming':
      return 'text-cyan-400';
    case 'active':
      return 'text-green-400';
    case 'completed':
      return 'text-slate-400';
    default:
      return 'text-slate-500';
  }
};
