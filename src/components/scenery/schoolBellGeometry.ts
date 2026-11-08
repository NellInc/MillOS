/**
 * The school's swinging bell, in the school's own metres.
 *
 * Until 2026-11-07 the bell was cast into `school.glb` with everything else, so
 * nothing could swing it and nothing could be clicked: the only clickable bell
 * was the one in `SchoolPrimitiveBody`, the fallback a viewer sees only while
 * the GLB streams in. The authoring script
 * (`scripts/blender/rebuild_village_architecture.py`, `school()`) now leaves the
 * iron hangers and the two yoke bearings in the GLB and stops there; this
 * module builds the parts that turn on the yoke line between those bearings.
 *
 * Every number is the authored one from that script. The profile is the same
 * hollow casting (outer wall up to the crown, inner wall back down to the
 * sound bow), so the inside of the mouth is real bronze from below.
 *
 * Coordinates are relative to the pivot: the yoke axis, which runs along x at
 * `SCHOOL_BELL_PIVOT`. The delivered GLB is fitted 0.99922 in height, so the
 * authored 10.38 m yoke line sits at 10.372 m; the bearing boxes in the GLB
 * are centred 1 cm above it, as authored.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** School-local position of the yoke axis (x along the axis). */
export const SCHOOL_BELL_PIVOT: readonly [number, number, number] = [0, 10.372, 0];

/** Authored y of the yoke line, which every profile below is measured from. */
const AUTHORED_YOKE_Y = 10.38;

/** (radius, authored y) - the casting, outer wall up then inner wall down. */
export const SCHOOL_BELL_PROFILE: readonly (readonly [number, number])[] = [
  [0.515, 9.46],
  [0.6, 9.48],
  [0.62, 9.53],
  [0.61, 9.59],
  [0.55, 9.625],
  [0.48, 9.69],
  [0.38, 9.84],
  [0.295, 10.1],
  [0.24, 10.24],
  [0.16, 10.32],
  [0.08, 10.34],
  [0, 10.34],
  [0, 10.255],
  [0.14, 10.255],
  [0.19, 10.205],
  [0.245, 10.08],
  [0.335, 9.82],
  [0.425, 9.66],
  [0.515, 9.54],
  [0.515, 9.46],
];

const CLAPPER_BALL_PROFILE: readonly (readonly [number, number])[] = [
  [0, 9.34],
  [0.047, 9.35],
  [0.081, 9.385],
  [0.096, 9.43],
  [0.081, 9.475],
  [0.047, 9.51],
  [0, 9.52],
];

/** Pivot-relative y of the inner crown, where the clapper hangs. */
export const SCHOOL_BELL_CLAPPER_HANG_Y = 10.255 - AUTHORED_YOKE_Y;
/** Largest mouth radius of the casting (the sound bow). */
export const SCHOOL_BELL_MOUTH_RADIUS = 0.62;
/** Pivot-relative y of the lip, the lowest point of the casting at rest. */
export const SCHOOL_BELL_LIP_Y = 9.46 - AUTHORED_YOKE_Y;
/** Pivot-relative centre of the casting, used as the aim and sound point. */
export const SCHOOL_BELL_CENTRE_Y = 9.9 - AUTHORED_YOKE_Y;

const lathe = (
  profile: readonly (readonly [number, number])[],
  segments: number
): THREE.LatheGeometry =>
  new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y - AUTHORED_YOKE_Y)),
    segments
  );

/** The hollow bronze casting. */
export function createSchoolBellCastingGeometry(): THREE.BufferGeometry {
  return lathe(SCHOOL_BELL_PROFILE, 28);
}

/**
 * Oak headstock, its two iron gudgeons and two straps, and the crown bolt.
 *
 * The headstock stops 2 cm short of each bearing's inner face (x 0.57) so its
 * square section can turn without its corners leaving the bearing; only the
 * round gudgeons (r 45 mm) pass through, and a cylinder turning on its own axis
 * never changes silhouette.
 */
export function createSchoolBellHeadstockGeometry(): {
  oak: THREE.BufferGeometry;
  iron: THREE.BufferGeometry;
} {
  const oak = new THREE.BoxGeometry(1.1, 0.16, 0.16);
  const ironParts = [
    ...[-1, 1].map((side) =>
      new THREE.CylinderGeometry(0.045, 0.045, 0.22, 12)
        .rotateZ(Math.PI / 2)
        .translate(side * 0.61, 0, 0)
    ),
    ...[-1, 1].map((side) =>
      new THREE.BoxGeometry(0.065, 0.19, 0.195).translate(side * 0.18, 0, 0)
    ),
    new THREE.BoxGeometry(0.08, 0.11, 0.08).translate(0, 10.375 - AUTHORED_YOKE_Y, 0),
  ];
  const iron = mergeGeometries(ironParts)!;
  ironParts.forEach((part) => part.dispose());
  return { oak, iron };
}

/** Clapper rod and ball, relative to the clapper's own hang point. */
export function createSchoolBellClapperGeometry(): THREE.BufferGeometry {
  const hang = 10.255;
  const rodLength = hang - 9.43;
  const rod = new THREE.CylinderGeometry(0.0275, 0.0275, rodLength, 8).translate(
    0,
    -rodLength / 2,
    0
  );
  const ball = new THREE.LatheGeometry(
    CLAPPER_BALL_PROFILE.map(([r, y]) => new THREE.Vector2(r, y - hang)),
    12
  );
  const merged = mergeGeometries([rod.toNonIndexed(), ball.toNonIndexed()])!;
  rod.dispose();
  ball.dispose();
  merged.computeVertexNormals();
  return merged;
}
