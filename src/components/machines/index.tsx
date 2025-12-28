// Re-export all machine-related components for backward compatibility
// This allows existing imports like `import { SiloFillIndicator } from './machines'` to continue working

export * from './shared';
export * from './SiloComponents';
export * from './TexturesAndMaterials';
export * from './VisualEffects';
export * from './UIComponents';
export * from './UtilityComponents';
export * from './MachineAnimationManager';

// Also export the existing instanced machine components
export { InstancedSilos } from './InstancedSilos';
export { InstancedRollerMills } from './InstancedRollerMills';
export { InstancedPlansifters } from './InstancedPlansifters';
export { InstancedPackers } from './InstancedPackers';
