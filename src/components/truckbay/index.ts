/**
 * Barrel export for truck bay components
 *
 * This allows importing components like:
 * import { TruckModel, DockBay } from './truckbay';
 *
 * NOTE: TruckSmallParts.tsx and TruckLogos.tsx contain the canonical implementations
 * that use the animation system. TruckParts.tsx and TruckAudio.tsx contain legacy
 * versions without animation system integration.
 */

export * from './useTruckPhysics';
export * from './TruckModel';
// TruckAudio.tsx exports ExhaustSmoke which conflicts with TruckSmallParts
// Skipping TruckAudio.tsx since TruckSmallParts has the canonical ExhaustSmoke with animation system
// TruckParts.tsx exports duplicates - use selective exports for unique components
export { LicensePlate, HeadlightBeam } from './TruckParts';
export * from './DockBay';
export * from './LoadingAnimation';
export * from './animationSystem';
export * from './TruckSmallParts';
export * from './TruckLogos';
