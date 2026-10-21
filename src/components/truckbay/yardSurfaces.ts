import * as THREE from 'three';
import { POLYGON_OFFSET } from '../../constants/renderLayers';
import { PROCEDURAL_TEXTURES } from '../../utils/sharedMaterials';
import { markSurfaceSubstrate } from '../../utils/worldSurface';
import { YARD_PAVING_TINT } from '../terrain/terrainTypes';

/**
 * THE TRUCK-YARD GROUND STACK. Yard, dock apron and approach road all sit on
 * `EXTERIOR_LAYERS.ground` with the terrain, so polygonOffset alone decides
 * which is drawn where they overlap:
 *
 *   terrain `exteriorBase` +6  >  shuttle turnaround `exteriorMid` +3
 *     >  yard 0  >  apron = road `exteriorTop` -1  >  paint `exteriorOverlay` -4
 *
 * All three were at 0 once their offsets were lost in a refactor, so the apron
 * and the road tied with the yard they lie on and z-fought across the whole
 * dock front. The yard is left UNBIASED on purpose rather than restored to
 * `exteriorMid`: the village shuttle turnaround in `CommunityLife.tsx` was
 * added afterwards at `exteriorMid` and overlaps the shipping yard, so a +3
 * yard would tie with it. Apron and road share -1 because they never overlap.
 *
 * Anything painted ON the apron or the road must be biased in front of -1:
 * a label 1 cm up with no bias of its own loses to a -1 surface beyond about
 * 5.5 m. `SceneText surface="painted-ground"` is that material.
 *
 * `yardGroundStack.test.ts` pins this ordering against the real terrain and
 * turnaround sources.
 */
export const YARD_GROUND_DEPTH = {
  yard: { polygonOffset: false },
  apron: {
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.exteriorTop.factor,
    polygonOffsetUnits: POLYGON_OFFSET.exteriorTop.units,
  },
  road: {
    polygonOffset: true,
    polygonOffsetFactor: POLYGON_OFFSET.exteriorTop.factor,
    polygonOffsetUnits: POLYGON_OFFSET.exteriorTop.units,
  },
} as const;

/**
 * Tyre tracks and oil stains (`YardWearMarks.tsx`) are paint-class: they cross
 * yard, apron and the paint already there, so they take the paint's bias and
 * never write depth, which lets them blend over a guide line rather than tie
 * with it.
 */
export const YARD_WEAR_DEPTH = {
  polygonOffset: true,
  polygonOffsetFactor: POLYGON_OFFSET.exteriorOverlay.factor,
  polygonOffsetUnits: POLYGON_OFFSET.exteriorOverlay.units,
  depthWrite: false,
  transparent: true,
} as const;

const cloneYardTexture = (
  source: THREE.Texture,
  repeatX: number,
  repeatY: number
): THREE.Texture => {
  const texture = source.clone();
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
};

// The yard and the dock apron are poured slabs: their TILINGS opt into the
// `slab` world-surface profile (joints and per-pour tone, `concreteSlab.ts`).
// The shared sources stay `paving`, because they also tile the roads.
const YARD_TARMAC_MAP = markSurfaceSubstrate(
  cloneYardTexture(PROCEDURAL_TEXTURES.tarmacColor, 18, 18),
  'slab'
);
const YARD_TARMAC_ROUGHNESS = cloneYardTexture(PROCEDURAL_TEXTURES.tarmacRoughness, 18, 18);
const ROAD_TARMAC_MAP = cloneYardTexture(PROCEDURAL_TEXTURES.tarmacColor, 4, 28);
const ROAD_TARMAC_ROUGHNESS = cloneYardTexture(PROCEDURAL_TEXTURES.tarmacRoughness, 4, 28);
const APRON_CONCRETE_MAP = markSurfaceSubstrate(
  cloneYardTexture(PROCEDURAL_TEXTURES.concreteColor, 6, 5),
  'slab'
);
const APRON_CONCRETE_ROUGHNESS = cloneYardTexture(PROCEDURAL_TEXTURES.concreteRoughness, 6, 5);

// The shared linear gain keeps the authored yard and its terrain perimeter
// on the same weathered aggregate finish. Lighting alone governs the night.
export const YARD_TARMAC_SURFACE = {
  color: YARD_PAVING_TINT,
  map: YARD_TARMAC_MAP,
  roughnessMap: YARD_TARMAC_ROUGHNESS,
  roughness: 1,
  metalness: 0,
  ...YARD_GROUND_DEPTH.yard,
} as const;
export const ROAD_TARMAC_SURFACE = {
  color: '#ffffff',
  map: ROAD_TARMAC_MAP,
  roughnessMap: ROAD_TARMAC_ROUGHNESS,
  roughness: 1,
  metalness: 0,
  ...YARD_GROUND_DEPTH.road,
} as const;
export const APRON_CONCRETE_SURFACE = {
  color: '#ffffff',
  map: APRON_CONCRETE_MAP,
  roughnessMap: APRON_CONCRETE_ROUGHNESS,
  roughness: 0.92,
  metalness: 0,
  ...YARD_GROUND_DEPTH.apron,
} as const;
