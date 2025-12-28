/**
 * Digital Twin Color Palette
 *
 * Unified color system for the MillOS digital twin simulation.
 * All colors are semantic - surfaces, status, zones, data overlays, and glow effects.
 *
 * Design Philosophy: "Agent-built aesthetic" - clean geometric forms with sophisticated rendering.
 */
import * as THREE from 'three';

// === PRIMARY PALETTE ===

export const PALETTE = {
  // Base surfaces - blue-gray industrial
  surface: {
    dark: '#1a1f2e', // Deep blue-gray (floors, shadows)
    mid: '#2d3548', // Mid gray-blue (walls, neutral machines)
    light: '#4a5568', // Light gray (highlights, trim)
    accent: '#64748b', // Bright accent for edges
  },

  // Machine status (semantic colors)
  status: {
    running: '#10b981', // Emerald green - healthy/active
    idle: '#6b7280', // Gray - inactive
    warning: '#f59e0b', // Amber - attention needed
    critical: '#ef4444', // Red - alert/error
    maintenance: '#8b5cf6', // Purple - scheduled downtime
  },

  // Accent colors (zone identity)
  zones: {
    silos: '#3b82f6', // Blue - storage/input
    milling: '#8b5cf6', // Purple - processing
    sifting: '#06b6d4', // Cyan - quality/sorting
    packing: '#22c55e', // Green - output/complete
  },

  // UI/Data overlay colors
  data: {
    primary: '#60a5fa', // Bright blue - data lines
    secondary: '#a78bfa', // Lavender - secondary data
    highlight: '#fbbf24', // Gold - important callouts
    grid: '#334155', // Subtle grid lines
    text: '#e2e8f0', // Light text on dark
  },

  // Emissive/glow colors
  glow: {
    cool: '#38bdf8', // Cyan glow
    warm: '#fb923c', // Orange glow
    status: '#4ade80', // Green glow (active)
    alert: '#f87171', // Red glow (alert)
  },

  // Lighting colors
  lighting: {
    key: '#fff8f0', // Warm overhead industrial
    fill: '#e0f0ff', // Cool fill contrast
    ambient: '#b8c5d6', // Neutral ambient
    skyColor: '#87ceeb', // Hemisphere sky
    groundColor: '#4a4a4a', // Hemisphere ground
  },
} as const;

// === THREE.JS COLOR HELPERS ===

/**
 * Get a Three.js Color object from palette
 */
export const getColor = (hex: string): THREE.Color => new THREE.Color(hex);

/**
 * Pre-computed Three.js Colors for hot paths
 */
export const COLORS = {
  surface: {
    dark: new THREE.Color(PALETTE.surface.dark),
    mid: new THREE.Color(PALETTE.surface.mid),
    light: new THREE.Color(PALETTE.surface.light),
  },
  status: {
    running: new THREE.Color(PALETTE.status.running),
    idle: new THREE.Color(PALETTE.status.idle),
    warning: new THREE.Color(PALETTE.status.warning),
    critical: new THREE.Color(PALETTE.status.critical),
  },
  zones: {
    silos: new THREE.Color(PALETTE.zones.silos),
    milling: new THREE.Color(PALETTE.zones.milling),
    sifting: new THREE.Color(PALETTE.zones.sifting),
    packing: new THREE.Color(PALETTE.zones.packing),
  },
  glow: {
    cool: new THREE.Color(PALETTE.glow.cool),
    warm: new THREE.Color(PALETTE.glow.warm),
    status: new THREE.Color(PALETTE.glow.status),
  },
} as const;

// === STATUS HELPERS ===

export type MachineStatus = 'running' | 'idle' | 'warning' | 'critical' | 'maintenance';
export type ZoneId = 'silos' | 'milling' | 'sifting' | 'packing';

/**
 * Get status color by status type
 */
export const getStatusColor = (status: MachineStatus): string => {
  return PALETTE.status[status] ?? PALETTE.status.idle;
};

/**
 * Get zone accent color
 */
export const getZoneColor = (zone: ZoneId): string => {
  return PALETTE.zones[zone];
};

/**
 * Get glow intensity by status
 * Critical/warning status = higher glow for visibility
 */
export const getGlowIntensity = (status: MachineStatus): number => {
  switch (status) {
    case 'running':
      return 1.0;
    case 'warning':
      return 1.5;
    case 'critical':
      return 2.0;
    case 'maintenance':
      return 0.8;
    case 'idle':
    default:
      return 0.3;
  }
};

/**
 * Get pulse speed by status
 * Critical = faster pulse, idle = no pulse
 */
export const getPulseSpeed = (status: MachineStatus): number => {
  switch (status) {
    case 'critical':
      return 4.0;
    case 'warning':
      return 2.5;
    case 'running':
      return 1.5;
    case 'maintenance':
      return 1.0;
    case 'idle':
    default:
      return 0;
  }
};

// === SSAO COLOR (for PostProcessing) ===

export const SSAO_PALETTE_COLOR = new THREE.Color(PALETTE.surface.dark);
