import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyWorldSurface } from '../../utils/worldSurface';

/**
 * The dock door leaf (`RollUpDoor` in TruckBay.tsx), as a sectional door.
 *
 * final3 med-12 milling, far right: "a flat, untextured pale-blue panel". It
 * was a 9 x 4 x 0.15 box - the authored `dockDoorPanel` GLB is a box too, its
 * only detail a normal map at 0.2 scale - in a 0.6-metalness slate that
 * mirrored the sky. A sectional door is horizontal insulated panels, each
 * joined to the next by a recessed hinge line, with pressed ribs across each.
 *
 * Same envelope as the box it replaces, centred on the origin, so the leaf's
 * roll-up animation (position and scale on Y) is unchanged.
 */
export const SECTIONAL_DOOR = {
  width: 9,
  height: 4,
  depth: 0.15,
  /** Seven panels of 0.57 m: a 4 m dock door's usual stack. */
  sections: 7,
  /** Joint groove: height across the joint and depth into each face. */
  jointHeight: 0.04,
  jointDepth: 0.03,
  /** Pressed ribs: two per panel, proud of each face. */
  ribHeight: 0.035,
  ribProud: 0.012,
  /** The ribs stop short of the stiles at each side. */
  ribInset: 0.15,
} as const;

export function buildSectionalDoorGeometry(): THREE.BufferGeometry {
  const { width, height, depth, sections, jointHeight, jointDepth, ribHeight, ribProud, ribInset } =
    SECTIONAL_DOOR;
  const pitch = height / sections;
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, y: number) =>
    new THREE.BoxGeometry(w, h, d).translate(0, y, 0);
  for (let i = 0; i < sections; i++) {
    const bottom = -height / 2 + i * pitch;
    // Each panel stops half a joint short of the joint line (the outermost
    // edges run to the leaf's own top and bottom).
    const lo = i === 0 ? bottom : bottom + jointHeight / 2;
    const hi = i === sections - 1 ? bottom + pitch : bottom + pitch - jointHeight / 2;
    parts.push(box(width, hi - lo, depth, (lo + hi) / 2));
    const centre = bottom + pitch / 2;
    for (const y of [centre - pitch / 4, centre + pitch / 4]) {
      parts.push(box(width - 2 * ribInset, ribHeight, depth + 2 * ribProud, y));
    }
  }
  // The joints: a recessed core that closes each groove, slightly narrower than
  // the leaf and slightly taller than the gap so no face lies on a panel's.
  for (let i = 1; i < sections; i++) {
    parts.push(
      box(width - 0.02, jointHeight + 0.01, depth - 2 * jointDepth, -height / 2 + i * pitch)
    );
  }
  const merged = mergeGeometries(
    parts.map((part) => part.toNonIndexed()),
    false
  );
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('sectional door: geometry merge failed');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Painted steel, dielectric. The leaf rolls up, so its surface field is in
 * object rest space and rides with it instead of swimming.
 */
export const SECTIONAL_DOOR_MATERIAL = applyWorldSurface(
  new THREE.MeshStandardMaterial({
    name: 'dock-door-sectional-leaf',
    color: '#6b7c88',
    roughness: 0.55,
    metalness: 0,
  }),
  'painted',
  { objectSpace: 1 }
);
