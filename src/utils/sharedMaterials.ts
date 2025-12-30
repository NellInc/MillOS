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
import {
  generateClayTiles,
  generateClayTilesNormal,
  generateSlate,
  generateSlateNormal,
  generateThatch,
  generateThatchNormal,
} from '../textures/roofTiles';
import { generateStucco, generateStuccoNormal, generateStuccoRoughness } from '../textures/stucco';

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
const cobblestoneColorTexture = generateCobblestone(512, { stoneSize: 14 }); // Medium cobblestones
const cobblestoneNormalTexture = generateCobblestoneNormal(512, 14); // Match medium size

// Enable wrapping for cobblestone textures (repeat set per-geometry for consistent world-scale)
cobblestoneColorTexture.wrapS = cobblestoneColorTexture.wrapT = THREE.RepeatWrapping;
cobblestoneNormalTexture.wrapS = cobblestoneNormalTexture.wrapT = THREE.RepeatWrapping;
const mudColorTexture = generateMud(512, { wetness: 0.5 });
const mudRoughnessTexture = generateMudRoughness(512, 0.5);

// Village roof textures - using larger tiles for visible detail
const clayTilesColorTexture = generateClayTiles(512, { tileWidth: 40, tileHeight: 56 });
const clayTilesNormalTexture = generateClayTilesNormal(512, 40, 56);
const slateColorTexture = generateSlate(512, { tileWidth: 44, tileHeight: 32 });
const slateNormalTexture = generateSlateNormal(512, 44, 32);
const thatchColorTexture = generateThatch(512, { bundleWidth: 40 });
const thatchNormalTexture = generateThatchNormal(512, 40);

// Village wall textures - neutral gray for proper tinting
const stuccoColorTexture = generateStucco(512, { weathering: 0.12, contrast: 0.1 });
const stuccoNormalTexture = generateStuccoNormal(512, 0.35);
const stuccoRoughnessTexture = generateStuccoRoughness(512, 0.75);

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
  // Tarmac/Asphalt - for roads, parking lots (matte, not wet)
  tarmac: new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.9,
    metalness: 0.0,
    map: tarmacColorTexture,
    roughnessMap: tarmacRoughnessTexture,
  }),
  // Worn tarmac (lighter, more weathered)
  tarmacWorn: new THREE.MeshStandardMaterial({
    color: '#3a3c40',
    roughness: 0.85,
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
  // Village roof textures
  clayTilesColor: clayTilesColorTexture,
  clayTilesNormal: clayTilesNormalTexture,
  slateColor: slateColorTexture,
  slateNormal: slateNormalTexture,
  thatchColor: thatchColorTexture,
  thatchNormal: thatchNormalTexture,
  // Village wall textures
  stuccoColor: stuccoColorTexture,
  stuccoNormal: stuccoNormalTexture,
  stuccoRoughness: stuccoRoughnessTexture,
} as const;

// === PLANT MATERIALS ===
// Materials for factory plants, trees, and vegetation
export const PLANT_MATERIALS = {
  pot: new THREE.MeshStandardMaterial({ color: '#8b4513', roughness: 0.9, metalness: 0.0 }),
  soil: new THREE.MeshStandardMaterial({ color: '#3d2817', roughness: 1.0, metalness: 0.0 }),
  barkDark: new THREE.MeshStandardMaterial({ color: '#4a3728', roughness: 0.9, metalness: 0.0 }),
  woodPale: new THREE.MeshStandardMaterial({ color: '#8b7355', roughness: 0.95, metalness: 0.0 }),
  hay: new THREE.MeshStandardMaterial({ color: '#d4a574', roughness: 0.8, metalness: 0.0 }),
} as const;

// === HEALTH STATUS MATERIALS ===
export const HEALTH_MATERIALS = {
  healthy: new THREE.MeshStandardMaterial({ color: '#22c55e', roughness: 0.7, metalness: 0.0 }),
  moderate: new THREE.MeshStandardMaterial({ color: '#84cc16', roughness: 0.7, metalness: 0.0 }),
  poor: new THREE.MeshStandardMaterial({ color: '#a16207', roughness: 0.7, metalness: 0.0 }),
  healthyEmissive: new THREE.MeshBasicMaterial({ color: '#22c55e' }),
  criticalEmissive: new THREE.MeshBasicMaterial({ color: '#ef4444' }),
  activeEmissive: new THREE.MeshBasicMaterial({ color: '#1e40af' }),
} as const;

export const getHealthMaterial = (health: number): THREE.MeshStandardMaterial => {
  if (health > 60) return HEALTH_MATERIALS.healthy;
  if (health > 30) return HEALTH_MATERIALS.moderate;
  return HEALTH_MATERIALS.poor;
};

// === CACHED VECTOR2 CONSTANTS ===
export const NORMAL_SCALES = {
  low: new THREE.Vector2(0.15, 0.15),
  medium: new THREE.Vector2(0.2, 0.2),
  standard: new THREE.Vector2(0.3, 0.3),
  high: new THREE.Vector2(0.4, 0.4),
} as const;

// === INSTANCED MACHINE MATERIALS ===
export const INSTANCED_MACHINE_MATERIALS = {
  siloBody: new THREE.MeshStandardMaterial({ color: '#cbd5e1', metalness: 0.5, roughness: 0.2 }),
  siloDarkMetal: new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0.6,
    roughness: 0.4,
  }),
  siloFill: new THREE.MeshStandardMaterial({
    color: '#f5d78e',
    transparent: true,
    opacity: 0.7,
    roughness: 0.9,
  }),
  siloFillLow: new THREE.MeshBasicMaterial({ color: '#f5d78e', transparent: true, opacity: 0.7 }),
  millHousingLower: new THREE.MeshStandardMaterial({
    color: '#2563eb',
    metalness: 0.6,
    roughness: 0.2,
  }),
  millHousingUpper: new THREE.MeshStandardMaterial({
    color: '#60a5fa',
    metalness: 0.5,
    roughness: 0.3,
  }),
  millFrame: new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.8, roughness: 0.15 }),
  millMotor: new THREE.MeshStandardMaterial({ color: '#374151', metalness: 0.7, roughness: 0.25 }),
  millWindow: new THREE.MeshPhysicalMaterial({
    color: '#e0f2fe',
    metalness: 0.1,
    roughness: 0.1,
    transmission: 0.8,
    thickness: 0.1,
  }),
  millRoller: new THREE.MeshStandardMaterial({ color: '#94a3b8', metalness: 0.9, roughness: 0.1 }),
  sifterFrame: new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.8, roughness: 0.2 }),
  sifterBody: new THREE.MeshPhysicalMaterial({
    color: '#f5f0e6',
    metalness: 0.1,
    roughness: 0.25,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  }),
  sifterDarkMetal: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.6,
    roughness: 0.3,
  }),
  sifterFlywheel: new THREE.MeshStandardMaterial({
    color: '#1f2937',
    metalness: 0.85,
    roughness: 0.15,
  }),
  sifterCable: new THREE.MeshStandardMaterial({ color: '#1f2937', metalness: 0.3, roughness: 0.6 }),
  packerFrame: new THREE.MeshStandardMaterial({ color: '#f97316', metalness: 0.4, roughness: 0.4 }),
  packerHopper: new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.7,
    roughness: 0.2,
  }),
  packerSpout: new THREE.MeshStandardMaterial({
    color: '#6b7280',
    metalness: 0.75,
    roughness: 0.2,
  }),
  packerConveyor: new THREE.MeshStandardMaterial({
    color: '#374151',
    metalness: 0.6,
    roughness: 0.35,
  }),
  packerPanel: new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.5,
    roughness: 0.35,
  }),
  packerSafety: new THREE.MeshStandardMaterial({
    color: '#fbbf24',
    metalness: 0.3,
    roughness: 0.5,
    transparent: true,
    opacity: 0.4,
  }),
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

// === TUNNEL MATERIALS ===
// Materials for tunnel/culvert structures (drainage passages and scenic tunnels)
export const TUNNEL_MATERIALS = {
  concrete: new THREE.MeshStandardMaterial({
    color: '#808080',
    roughness: 0.9,
    map: concreteColorTexture,
    roughnessMap: concreteRoughnessTexture,
  }),
  brick: new THREE.MeshStandardMaterial({
    color: '#a08070',
    roughness: 0.85,
    map: brickColorTexture,
    normalMap: brickNormalTexture,
    normalScale: new THREE.Vector2(0.3, 0.3),
  }),
  metal: new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.7,
    roughness: 0.4,
    normalMap: brushedMetalTexture,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
  water: new THREE.MeshStandardMaterial({
    color: '#5c8a6a',
    roughness: 0.1,
    metalness: 0.2,
    transparent: true,
    opacity: 0.7,
  }),
} as const;

// === TREE MATERIALS (Textured) ===
// Tree materials with procedural textures for detailed scenery trees
export const TREE_MATERIALS = {
  trunk: new THREE.MeshStandardMaterial({
    color: '#5d4037',
    roughness: 0.9,
    map: barkOakTexture,
    normalMap: barkNormalTexture,
    normalScale: new THREE.Vector2(0.4, 0.4),
  }),
  leaves: new THREE.MeshStandardMaterial({
    color: '#2d5a27',
    roughness: 0.8,
  }),
  pineNeedles: new THREE.MeshStandardMaterial({
    color: '#1a4a1a',
    roughness: 0.85,
  }),
  birchTrunk: new THREE.MeshStandardMaterial({
    color: '#e8e8e0',
    roughness: 0.7,
    map: barkOakTexture, // Will show through as birch-like
    normalMap: barkNormalTexture,
    normalScale: new THREE.Vector2(0.2, 0.2),
  }),
} as const;

// === TREE MATERIALS (Simple/Instanced) ===
// Simpler tree materials for instanced rendering (lower overhead)
export const SIMPLE_TREE_MATERIALS = {
  trunk: new THREE.MeshStandardMaterial({ color: '#5d4037', roughness: 0.9 }),
  foliageLower: new THREE.MeshStandardMaterial({ color: '#2e7d32', roughness: 0.8 }),
  foliageUpper: new THREE.MeshStandardMaterial({ color: '#388e3c', roughness: 0.8 }),
} as const;

// === BENCH MATERIALS ===
// Materials for park benches and outdoor furniture
export const BENCH_MATERIALS = {
  wood: new THREE.MeshStandardMaterial({ color: '#8d6e63', roughness: 0.7 }),
  metal: new THREE.MeshStandardMaterial({ color: '#424242', roughness: 0.6, metalness: 0.3 }),
} as const;

// === WOOD MATERIALS ===
// Wood materials for pallets, crates, wooden objects
export const WOOD_MATERIALS = {
  pallet: new THREE.MeshStandardMaterial({ color: '#8b5a2b', roughness: 0.9 }),
  palletDark: new THREE.MeshStandardMaterial({ color: '#6b4423', roughness: 0.9 }),
  palletMedium: new THREE.MeshStandardMaterial({ color: '#7a4c2a', roughness: 0.9 }),
  crateLight: new THREE.MeshStandardMaterial({ color: '#d4a574', roughness: 0.8 }),
} as const;

// === FABRIC MATERIALS ===
// Fabric materials for sacks, burlap, grain bags
export const FABRIC_MATERIALS = {
  burlap: new THREE.MeshStandardMaterial({ color: '#e8dcc8', roughness: 0.95 }),
  sackGrain: new THREE.MeshStandardMaterial({ color: '#d4c4a8', roughness: 1 }),
  sackLight: new THREE.MeshStandardMaterial({ color: '#f5f0e6', roughness: 0.95 }),
} as const;

// === CERAMIC MATERIALS ===
// Ceramic materials for pots, fixtures
export const CERAMIC_MATERIALS = {
  white: new THREE.MeshStandardMaterial({ color: '#e5e5e5', roughness: 0.5 }),
  terracotta: new THREE.MeshStandardMaterial({ color: '#c45a3b', roughness: 0.7 }),
} as const;

// === SIGNAGE MATERIALS ===
// Signage materials for signs and warnings
export const SIGNAGE_MATERIALS = {
  warningYellow: new THREE.MeshStandardMaterial({ color: '#ffc107', roughness: 0.3 }),
  warningRed: new THREE.MeshStandardMaterial({ color: '#dc3545', roughness: 0.3 }),
  infoBlue: new THREE.MeshStandardMaterial({ color: '#0d6efd', roughness: 0.3 }),
  white: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
  black: new THREE.MeshBasicMaterial({ color: '#000000' }),
} as const;
