import * as THREE from 'three';
import { GrainQuality, MachineType } from '../../types';

// =============================================================================
// SHARED TYPES
// =============================================================================

export interface RollerAnimationState {
  mesh: THREE.Mesh;
  rpm: number;
}

export interface PanelAnimationState {
  status: 'running' | 'idle' | 'warning' | 'critical';
  ledMaterials: THREE.MeshStandardMaterial[];
  screenMaterial: THREE.MeshStandardMaterial;
}

export type ShaderUniformValue =
  | number
  | THREE.Vector2
  | THREE.Vector3
  | THREE.Vector4
  | THREE.Color
  | THREE.Texture
  | null;

export interface ShaderAnimationState {
  uniforms: { [key: string]: { value: ShaderUniformValue } };
}

export interface MachineAnimationState {
  groupRef: THREE.Group | null;
  position: [number, number, number];
  rotation: number;
  type: MachineType;
  status: 'running' | 'idle' | 'warning' | 'critical';
  scadaRpmMultiplier: number;
  scadaVibrationIntensity: number;
  scadaFillLevel: number | undefined;
  metricsLoad: number;
  enableVibration: boolean;
}

// =============================================================================
// CENTRALIZED ANIMATION REGISTRIES
// =============================================================================

// Registries to track animated objects without React re-renders or prop drilling
export const rollerRegistry = new Map<string, RollerAnimationState>();
export const panelRegistry = new Map<string, PanelAnimationState>();
export const shaderRegistry = new Map<string, ShaderAnimationState>();

export const registerRoller = (id: string, state: RollerAnimationState) => {
  rollerRegistry.set(id, state);
};

export const unregisterRoller = (id: string) => {
  rollerRegistry.delete(id);
};

export const registerPanel = (id: string, state: PanelAnimationState) => {
  panelRegistry.set(id, state);
};

export const unregisterPanel = (id: string) => {
  panelRegistry.delete(id);
};

export const registerShader = (id: string, state: ShaderAnimationState) => {
  shaderRegistry.set(id, state);
};

export const unregisterShader = (id: string) => {
  shaderRegistry.delete(id);
};

// =============================================================================
// SHARED CONSTANTS
// =============================================================================

// Grain quality color mapping
export const QUALITY_COLORS: Record<GrainQuality, string> = {
  premium: '#22c55e', // Green
  standard: '#3b82f6', // Blue
  economy: '#f59e0b', // Amber
  mixed: '#8b5cf6', // Purple
};

export const QUALITY_LABELS: Record<GrainQuality, string> = {
  premium: 'Premium',
  standard: 'Standard',
  economy: 'Economy',
  mixed: 'Mixed',
};

// Grain types for silos
export const GRAIN_TYPES = ['Wheat', 'Corn', 'Barley', 'Oats', 'Rye'];

// LED colors for machine status panels (module level to avoid 60 allocations/sec in useFrame)
export const LED_COLORS = {
  running: ['#22c55e', '#22c55e', '#3b82f6', '#3b82f6'],
  idle: ['#64748b', '#64748b', '#64748b', '#64748b'],
  warning: ['#f59e0b', '#1e293b', '#f59e0b', '#1e293b'],
  critical: ['#ef4444', '#ef4444', '#1e293b', '#1e293b'],
} as const;

// Pre-computed index arrays for static-length iterations (avoid Array.from in render)
export const INDICES_5 = [0, 1, 2, 3, 4] as const;
export const INDICES_6 = [0, 1, 2, 3, 4, 5] as const;
export const INDICES_8 = [0, 1, 2, 3, 4, 5, 6, 7] as const;

// Shared geometries
export const UNIT_CYLINDER = new THREE.CylinderGeometry(1, 1, 1, 32);
export const UNIT_CYLINDER_LOW = new THREE.CylinderGeometry(1, 1, 1, 16);

// =============================================================================
// TEXTURE CACHE
// =============================================================================

// Module-level cache for procedural textures to avoid regenerating identical textures
export const textureCache = new Map<
  string,
  { roughnessMap: THREE.CanvasTexture; normalMap: THREE.CanvasTexture }
>();
