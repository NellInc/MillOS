/**
 * Shared Materials Module
 *
 * Centralized material definitions to reduce GPU memory usage and GC pressure.
 * Materials are created once and reused across all components.
 *
 * IMPORTANT: These materials should NOT be disposed - they are module-level singletons.
 */
import * as THREE from 'three';
import { generateBrushedMetal } from '../textures/brushedMetal';
import { generatePanelNormal, generateProceduralNormal } from '../textures/normalGenerator';
import { generateRustPattern } from '../textures/rust';
import { generateSafetyStripe } from '../textures/safetyStripe';
import { generateBrick, generateBrickNormal } from '../textures/brick';
import { generateBark, generateBarkNormal } from '../textures/bark';
import { generateCobblestone, generateCobblestoneNormal } from '../textures/cobblestone';
import { generateMud, generateMudRoughness } from '../textures/mud';

// Generate procedural textures for metal materials (cached on first call)
const brushedMetalTexture = generateBrushedMetal(256, 0.4, 'horizontal');
const panelNormalTexture = generatePanelNormal(256, 8, 0.02);
const rustTexture = generateRustPattern(256, 0.3, 'down');
const safetyStripeTexture = generateSafetyStripe(256, 32, {
  primary: '#fbbf24',
  secondary: '#1f2937',
});
const brickColorTexture = generateBrick(512, {
  baseColor: '#8b4513',
  brickWidth: 32,
  brickHeight: 16,
});
const brickNormalTexture = generateBrickNormal(512, 32, 16, 2);
const barkOakTexture = generateBark(256, 'oak');
const barkNormalTexture = generateBarkNormal(256);
const cobblestoneColorTexture = generateCobblestone(512, { stoneSize: 8 }); // Tiny cobblestones
const cobblestoneNormalTexture = generateCobblestoneNormal(512, 8); // Match tiny size
const mudColorTexture = generateMud(512, { wetness: 0.5 });
const mudRoughnessTexture = generateMudRoughness(512, 0.5);

// === METAL MATERIALS ===
export const METAL_MATERIALS = {
  // Standard industrial steel with procedural brushed texture
  steel: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.85,
    roughness: 0.25,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.15, 0.15),
    envMapIntensity: 1.0,
  }),
  steelDark: new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0.75,
    roughness: 0.3,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.12, 0.12),
  }),
  steelLight: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.85,
    roughness: 0.2,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  // Polished chrome/aluminum (no roughness map - meant to be smooth)
  chrome: new THREE.MeshStandardMaterial({
    color: '#c0c0c0',
    metalness: 0.95,
    roughness: 0.05,
    envMapIntensity: 1.2,
  }),
  // Painted metals - with wear texture
  paintedDarkGray: new THREE.MeshStandardMaterial({
    color: '#1f2937',
    metalness: 0.6,
    roughness: 0.4,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  paintedSlate: new THREE.MeshStandardMaterial({
    color: '#334155',
    metalness: 0.7,
    roughness: 0.4,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  paintedMediumGray: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.6,
    roughness: 0.4,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  paintedBlack: new THREE.MeshStandardMaterial({
    color: '#0f172a',
    metalness: 0.4,
    roughness: 0.6,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.08, 0.08),
  }),
  // Accent metals - with brushed texture
  brass: new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.92,
    roughness: 0.08,
    roughnessMap: brushedMetalTexture,
  }),
  copper: new THREE.MeshStandardMaterial({
    color: '#d97706',
    metalness: 0.88,
    roughness: 0.12,
    roughnessMap: brushedMetalTexture,
  }),
  // Industrial blue (motor housings) - with brushed texture
  industrialBlue: new THREE.MeshStandardMaterial({
    color: '#1e3a5f',
    metalness: 0.75,
    roughness: 0.3,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.12, 0.12),
  }),
} as const;

// Generate rubber/belt texture (subtle grain)
const rubberNormalTexture = generateProceduralNormal(256, 0.3, 25);

// === RUBBER/BELT MATERIALS ===
export const RUBBER_MATERIALS = {
  conveyorBelt: new THREE.MeshStandardMaterial({
    color: '#1f2937',
    roughness: 0.85,
    normalMap: rubberNormalTexture,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  tire: new THREE.MeshStandardMaterial({
    color: '#1a1a1a',
    roughness: 0.92,
    normalMap: rubberNormalTexture,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
} as const;

// Generate painted metal texture for safety equipment
const paintedMetalNormal = generateProceduralNormal(256, 0.4, 12);

// === SAFETY/ACCENT MATERIALS ===
export const SAFETY_MATERIALS = {
  warningRed: new THREE.MeshStandardMaterial({
    color: '#ef4444',
    metalness: 0.5,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  warningYellow: new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.5,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  safetyGreen: new THREE.MeshStandardMaterial({
    color: '#22c55e',
    metalness: 0.5,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  safetyOrange: new THREE.MeshStandardMaterial({
    color: '#f97316',
    metalness: 0.5,
    roughness: 0.5,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
} as const;

// === PIPE MATERIALS ===
export const PIPE_MATERIALS = {
  darkPipe: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.88,
    roughness: 0.12,
    roughnessMap: brushedMetalTexture,
  }),
  lightPipe: new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.88,
    roughness: 0.12,
    roughnessMap: brushedMetalTexture,
  }),
  whitePipe: new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    metalness: 0.88,
    roughness: 0.12,
    roughnessMap: brushedMetalTexture,
  }),
  supportGray: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.82,
    roughness: 0.28,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  supportSlate: new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0.82,
    roughness: 0.28,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
} as const;

// === WORKER/HUMAN MATERIALS ===
export const WORKER_MATERIALS = {
  // Skin tones - indexed by character code for deterministic selection
  skin: [
    new THREE.MeshStandardMaterial({ color: '#f5d0c5', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#d4a574', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#8d5524', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#c68642', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#e0ac69', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#ffdbac', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#f1c27d', roughness: 0.6 }),
    new THREE.MeshStandardMaterial({ color: '#cd8c52', roughness: 0.6 }),
  ],
  // Hair colors
  hair: [
    new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#3d2314', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#d4a574', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#2d1810', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#654321', roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: '#8b0000', roughness: 0.9 }),
  ],
  // Uniform colors by role
  supervisorUniform: new THREE.MeshStandardMaterial({ color: '#1e40af', roughness: 0.6 }),
  engineerUniform: new THREE.MeshStandardMaterial({ color: '#374151', roughness: 0.6 }),
  safetyUniform: new THREE.MeshStandardMaterial({ color: '#166534', roughness: 0.6 }),
  qualityUniform: new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.6 }),
  maintenanceUniform: new THREE.MeshStandardMaterial({ color: '#9a3412', roughness: 0.6 }),
  operatorUniform: new THREE.MeshStandardMaterial({ color: '#475569', roughness: 0.6 }),
  // Vest
  safetyVest: new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.7 }),
  // Pants colors
  darkPants: new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 }),
  navyPants: new THREE.MeshStandardMaterial({ color: '#1e3a5f', roughness: 0.7 }),
} as const;

// === MACHINE-SPECIFIC MATERIALS ===
export const MACHINE_MATERIALS = {
  // Silo materials - with brushed metal texture
  siloBody: new THREE.MeshStandardMaterial({
    color: '#cbd5e1',
    metalness: 0.75,
    roughness: 0.2,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
    envMapIntensity: 1.0,
  }),
  siloRing: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.75,
    roughness: 0.2,
    roughnessMap: brushedMetalTexture,
  }),
  // Mill materials - with brushed texture
  millBody: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.85,
    roughness: 0.3,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.15, 0.15),
    envMapIntensity: 0.8,
  }),
  millDrum: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.7,
    roughness: 0.35,
    roughnessMap: brushedMetalTexture,
  }),
  // Control panel materials
  panelBody: new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.85,
    roughness: 0.3,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
  panelScreen: new THREE.MeshStandardMaterial({
    color: '#1e3a5f',
    metalness: 0.5,
    roughness: 0.4,
  }),
  // Motor/mechanical materials - with brushed texture
  motorBody: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.9,
    roughness: 0.2,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.12, 0.12),
  }),
  shaft: new THREE.MeshStandardMaterial({
    color: '#6b7280',
    metalness: 0.95,
    roughness: 0.08,
    roughnessMap: brushedMetalTexture,
  }),
  // Conveyor belt roller (for packer)
  rollerMetal: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.75,
    roughness: 0.2,
    roughnessMap: brushedMetalTexture,
  }),
} as const;

// === LOW QUALITY (MeshBasicMaterial) VERSIONS ===
export const BASIC_MATERIALS = {
  steel: new THREE.MeshBasicMaterial({ color: '#64748b' }),
  gray: new THREE.MeshBasicMaterial({ color: '#475569' }),
  darkGray: new THREE.MeshBasicMaterial({ color: '#1f2937' }),
  white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  black: new THREE.MeshBasicMaterial({ color: '#0f172a' }),
} as const;

// Generate concrete/wall textures
import { generateConcrete, generateConcreteRoughness } from '../textures/concrete';
const concreteColorTexture = generateConcrete(512, 64, true);
const concreteRoughnessTexture = generateConcreteRoughness(512);

// === WALL/SURFACE MATERIALS ===
export const WALL_MATERIALS = {
  // Concrete walls with panel texture
  concreteWall: new THREE.MeshStandardMaterial({
    color: '#64748b',
    roughness: 0.85,
    metalness: 0.05,
    map: concreteColorTexture,
    roughnessMap: concreteRoughnessTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.15, 0.15),
  }),
  // Painted wall surfaces
  paintedWall: new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    roughness: 0.75,
    metalness: 0.02,
    normalMap: paintedMetalNormal,
    normalScale: new THREE.Vector2(0.08, 0.08),
  }),
  // Dark industrial wall
  industrialWall: new THREE.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.8,
    metalness: 0.1,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.12, 0.12),
  }),
  // Metal frames/door frames
  metalFrame: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.7,
    roughness: 0.35,
    roughnessMap: brushedMetalTexture,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
  // Glass material
  glass: new THREE.MeshStandardMaterial({
    color: '#1e3a5f',
    metalness: 0.1,
    roughness: 0.05,
    transparent: true,
    opacity: 0.4,
  }),
  // Dock/concrete floor
  dockConcrete: new THREE.MeshStandardMaterial({
    color: '#475569',
    roughness: 0.9,
    metalness: 0.02,
    map: concreteColorTexture,
    roughnessMap: concreteRoughnessTexture,
  }),
} as const;

// Generate outdoor textures (grass and tarmac)
import { generateGrass, generateGrassRoughness } from '../textures/grass';
import { generateTarmac, generateTarmacRoughness } from '../textures/tarmac';

// Configure texture for optimal quality with anisotropic filtering
const configureTexture = (texture: THREE.DataTexture, anisotropy: number = 16): void => {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
};

// Generate grass textures with proper filtering
// Using 1024 for better mipmap chain at grazing angles (reduces shimmering from high up)
const grassColorTexture = generateGrass(1024);
const grassRoughnessTexture = generateGrassRoughness(1024);

// Apply anisotropic filtering and mipmapping to grass textures
configureTexture(grassColorTexture, 16);
configureTexture(grassRoughnessTexture, 16);

// Generate tarmac textures with proper filtering
const tarmacColorTexture = generateTarmac(512);
const tarmacRoughnessTexture = generateTarmacRoughness(512);
configureTexture(tarmacColorTexture, 16);
configureTexture(tarmacRoughnessTexture, 16);

// Also configure procedural metal textures with filtering
configureTexture(brushedMetalTexture, 8);
configureTexture(panelNormalTexture, 8);

// Export texture configuration utility for use across components
export const applyAnisotropicFiltering = (
  texture: THREE.Texture | null,
  anisotropy: number = 16
): void => {
  if (texture && 'anisotropy' in texture) {
    texture.anisotropy = anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
};

// Set a universal repeat value for grass (covers large surfaces like 600x600)
// Value of 1 means the texture covers the full extent - scaling happens in the UV
// Grass will tile naturally based on geometry UV
const GRASS_REPEAT = 20; // 20 tiles over a 600 unit surface = 30 units per tile (less repeat = less shimmering at distance)
grassColorTexture.repeat.set(GRASS_REPEAT, GRASS_REPEAT);
grassRoughnessTexture.repeat.set(GRASS_REPEAT, GRASS_REPEAT);

// Tarmac repeat
const TARMAC_REPEAT = 25;
tarmacColorTexture.repeat.set(TARMAC_REPEAT, TARMAC_REPEAT);
tarmacRoughnessTexture.repeat.set(TARMAC_REPEAT, TARMAC_REPEAT);

// === OUTDOOR MATERIALS ===
export const OUTDOOR_MATERIALS = {
  // Grass - for lawns, parks, fields
  // Using green base color instead of white so grass shows green even if texture fails
  grass: new THREE.MeshStandardMaterial({
    color: '#4a7c59', // Forest green fallback - texture will modulate this
    roughness: 0.95,
    metalness: 0.0,
    map: grassColorTexture,
    roughnessMap: grassRoughnessTexture,
  }),
  // Grass without texture (for tinting with different colors)
  grassBase: new THREE.MeshStandardMaterial({
    color: '#4a7c59',
    roughness: 0.95,
    metalness: 0.0,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.05, 0.05),
  }),
  // Tarmac/Asphalt - for roads, parking lots
  tarmac: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.75,
    metalness: 0.0,
    map: tarmacColorTexture,
    roughnessMap: tarmacRoughnessTexture,
  }),
  // Worn tarmac (lighter, more weathered)
  tarmacWorn: new THREE.MeshStandardMaterial({
    color: '#3a3c40',
    roughness: 0.7,
    metalness: 0.0,
    map: tarmacColorTexture,
    roughnessMap: tarmacRoughnessTexture,
  }),
  // Dirt/gravel path
  dirt: new THREE.MeshStandardMaterial({
    color: '#5c4d3d',
    roughness: 0.9,
    metalness: 0.0,
    normalMap: panelNormalTexture,
    normalScale: new THREE.Vector2(0.1, 0.1),
  }),
} as const;

// === EXPORTED PROCEDURAL TEXTURES ===
// For inline use in components that can't use shared materials
export const PROCEDURAL_TEXTURES = {
  brushedMetal: brushedMetalTexture,
  panelNormal: panelNormalTexture,
  rubberNormal: rubberNormalTexture,
  paintedMetalNormal: paintedMetalNormal,
  concreteColor: concreteColorTexture,
  concreteRoughness: concreteRoughnessTexture,
  grassColor: grassColorTexture,
  grassRoughness: grassRoughnessTexture,
  tarmacColor: tarmacColorTexture,
  tarmacRoughness: tarmacRoughnessTexture,
  rust: rustTexture,
  safetyStripe: safetyStripeTexture,
  brickColor: brickColorTexture,
  brickNormal: brickNormalTexture,
  barkOak: barkOakTexture,
  barkNormal: barkNormalTexture,
  cobblestoneColor: cobblestoneColorTexture,
  cobblestoneNormal: cobblestoneNormalTexture,
  mudColor: mudColorTexture,
  mudRoughness: mudRoughnessTexture,
} as const;

// === SHARED GEOMETRIES ===
// Common geometries that can be reused with different materials
export const SHARED_GEOMETRIES = {
  // Roller geometries
  rollerMain: new THREE.CylinderGeometry(0.15, 0.15, 2, 16),
  rollerAxle: new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8),
  rollerEndCap: new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12),

  // Bracket geometries
  bracketSmall: new THREE.BoxGeometry(0.08, 0.25, 0.08),
  bracketLarge: new THREE.BoxGeometry(0.15, 0.15, 0.08),

  // Support leg geometries
  legVertical: new THREE.BoxGeometry(0.2, 0.6, 0.2),
  legFoot: new THREE.BoxGeometry(0.4, 0.04, 0.25),

  // Pipe support geometries
  pipeVerticalSupport: (height: number) => new THREE.CylinderGeometry(0.1, 0.1, height * 2),
  pipeCrossBeam: new THREE.CylinderGeometry(0.08, 0.08, 3),
} as const;

// Helper function to get material for quality level
export const getMaterialForQuality = (
  standardMaterial: THREE.MeshStandardMaterial,
  basicMaterial: THREE.MeshBasicMaterial,
  quality: 'low' | 'medium' | 'high' | 'ultra'
): THREE.Material => {
  return quality === 'low' ? basicMaterial : standardMaterial;
};

// Helper to get skin material by worker ID
export const getSkinMaterial = (workerId: string): THREE.MeshStandardMaterial => {
  const index = workerId.charCodeAt(workerId.length - 1) % WORKER_MATERIALS.skin.length;
  return WORKER_MATERIALS.skin[index];
};

// Helper to get hair material by worker ID
export const getHairMaterial = (workerId: string): THREE.MeshStandardMaterial => {
  const index = workerId.charCodeAt(0) % WORKER_MATERIALS.hair.length;
  return WORKER_MATERIALS.hair[index];
};
