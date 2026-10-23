import * as THREE from 'three';
import { applyWorldSurface } from '../../utils/worldSurface';
import { createColorDataTexture } from '../../utils/textureGenerator';

/**
 * The dock door leaf (`RollUpDoor` in TruckBay.tsx), as a sectional door.
 *
 * final3 med-12 milling, far right: "a flat, untextured pale-blue panel". It
 * was a 9 x 4 x 0.15 box - the authored `dockDoorPanel` GLB is a box too, its
 * only detail a normal map at 0.2 scale - in a 0.6-metalness slate that
 * mirrored the sky. A sectional door is horizontal panels, each joined to the
 * next by a recessed hinge line, with pressed bands across each.
 *
 * PAINTED, NOT MODELLED. The first build modelled the joints and bands as
 * geometry. From the milling camera (34 m) their sunlit up-facing ledges -
 * 6 to 30 mm deep - were sub-pixel, and broke into rows of dots across the
 * leaf, whatever their height. The leaf is the box it always was, and the
 * panels are a mipmapped map down its face, which filters instead of
 * aliasing. Same envelope, so the roll-up animation is unchanged.
 */
export const SECTIONAL_DOOR = {
  width: 9,
  height: 4,
  depth: 0.15,
  /** Seven panels of 0.57 m: a 4 m dock door's usual stack. */
  sections: 7,
  /** Joint line height. 2 px or more from the milling camera. */
  jointHeight: 0.06,
  /** Pressed bands: two per panel. */
  ribHeight: 0.11,
} as const;

/** Map rows: 64 px a metre down the leaf, so a joint is ~4 px at full size. */
const MAP_ROWS = 256;
/** Map byte values (sRGB, multiplying the material colour). */
const TONE = { panel: 228, band: 250, joint: 96, lip: 240 } as const;

/** The map's tone (0-1) at height `v` (0 bottom, 1 top) up the leaf. */
export function sectionalDoorTone(v: number): number {
  const { height, sections, jointHeight, ribHeight } = SECTIONAL_DOOR;
  const y = THREE.MathUtils.clamp(v, 0, 1) * height;
  const pitch = height / sections;
  const local = y - Math.floor(y / pitch) * pitch;
  const toJoint = Math.min(local, pitch - local);
  const index = Math.floor(y / pitch);
  // No joint line at the leaf's own bottom and top edges.
  const atEdge =
    (index === 0 && local < pitch / 2) || (index >= sections - 1 && local >= pitch / 2);
  if (!atEdge && toJoint < jointHeight / 2) return TONE.joint / 255;
  // The panel's top edge just under a joint catches the light (the hinge lip).
  if (!atEdge && pitch - local < jointHeight) return TONE.lip / 255;
  for (const centre of [pitch / 4, (3 * pitch) / 4]) {
    if (Math.abs(local - centre) < ribHeight / 2) return TONE.band / 255;
  }
  return TONE.panel / 255;
}

function buildPanelMap(): THREE.DataTexture {
  const data = new Uint8Array(4 * MAP_ROWS * 4);
  for (let row = 0; row < MAP_ROWS; row++) {
    const byte = Math.round(sectionalDoorTone((row + 0.5) / MAP_ROWS) * 255);
    for (let column = 0; column < 4; column++) {
      const i = (row * 4 + column) * 4;
      data[i] = byte;
      data[i + 1] = byte;
      data[i + 2] = byte;
      data[i + 3] = 255;
    }
  }
  const texture = createColorDataTexture(data, 4, MAP_ROWS);
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export function buildSectionalDoorGeometry(): THREE.BufferGeometry {
  const { width, height, depth } = SECTIONAL_DOOR;
  return new THREE.BoxGeometry(width, height, depth);
}

/**
 * Painted steel, dielectric, panels in its map. The leaf rolls up, so its
 * surface field is in object rest space and rides with it instead of swimming.
 */
export const SECTIONAL_DOOR_MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({
    name: 'dock-door-sectional-leaf',
    color: '#788a96',
    map: buildPanelMap(),
    roughness: 0.55,
    metalness: 0,
  }),
  'painted',
  { objectSpace: 1 }
);
