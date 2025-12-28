/**
 * Procedural Texture Generators
 *
 * All textures are generated algorithmically at runtime.
 * No external image files - "agent-built, all the way down."
 */

export { generateBrushedMetal, type ScratchDirection } from './brushedMetal';
export { generatePaintedMetal } from './paintedMetal';
export { generateConcrete, generateConcreteRoughness } from './concrete';
export { generateGrainPattern, type GrainColor } from './grain';
export { generateRustPattern, type StreakDirection } from './rust';
export { generateSafetyStripe, type StripeColors } from './safetyStripe';
export { generateProceduralNormal, generatePanelNormal } from './normalGenerator';
export { generateGrass, generateGrassRoughness, type GrassOptions } from './grass';
export {
  generateTarmac,
  generateTarmacRoughness,
  generateRoadMarkings,
  type TarmacOptions,
} from './tarmac';
