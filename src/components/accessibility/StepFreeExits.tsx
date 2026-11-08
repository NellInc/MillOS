/**
 * STEP-FREE PERSONNEL DOORS (2026-11-07): a level door in each gable wall
 * beside its dock, at the end of the east walkway, with what makes it a way
 * out for everyone (PERSONNEL_DOORS, accessibilityLayout.ts):
 *
 * - inside: the east walkway runs on to the door (OptimizedFactoryInfrastructure
 *   `buildWalkwayLanes`), a yellow pedestrian barrier along its west edge for
 *   the last five metres, an illuminated exit sign over the door and a
 *   directional one on a post where the protected run begins;
 * - the door: a steel frame through the plinth (the shell leaves the opening,
 *   `buildFactoryGlazing` and `buildFactoryLowerWallSegments`), a flush
 *   threshold plate and a leaf held open outward against its east jamb, with
 *   a push bar and a vision panel;
 * - outside: a level concrete landing, bollards at its corners, a painted walk
 *   and an assembly point with its sign.
 *
 * The exit signs are light sources (unlit material); everything else is paint
 * or solid matter and lit. World coordinates throughout.
 */
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  PERSONNEL_DOOR,
  PERSONNEL_DOORS,
  REAR_CROSS_PATH,
} from '../../constants/accessibilityLayout';

type Door = (typeof PERSONNEL_DOORS)[number];

const lit = (name: string, color: string, roughness = 0.7, metalness = 0) =>
  new THREE.MeshStandardMaterial({ name, color, roughness, metalness });

const M = {
  frame: lit('exit-door-frame', '#4a5056', 0.5, 0.5),
  leaf: lit('exit-door-leaf', '#3d5a4c', 0.55, 0.2),
  steel: lit('exit-door-hardware', '#b7bcc1', 0.3, 0.85),
  concrete: lit('exit-landing-concrete', '#a7a49c', 0.92),
  barrier: lit('exit-walk-barrier', '#e0b21a', 0.55, 0.2),
  housing: lit('exit-sign-housing', '#e9e9e6', 0.5),
  post: lit('exit-sign-post', '#3b4148', 0.45, 0.6),
  signBack: lit('assembly-sign-back', '#1d7a46', 0.6),
  walkFill: lit('exit-walk-green', '#2f7d4a', 0.85),
  walkLine: lit('exit-walk-white', '#f2f2ee', 0.85),
};
/** The bulkhead's diffuser is a light source: unlit. */
const LAMP = new THREE.MeshBasicMaterial({ name: 'exit-bulkhead-diffuser', color: '#fff1d6' });
const GLASS = new THREE.MeshStandardMaterial({
  name: 'exit-door-vision-panel',
  color: '#cfe3e6',
  roughness: 0.08,
  metalness: 0.1,
  transparent: true,
  opacity: 0.35,
  depthWrite: false,
});

const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z).toNonIndexed();
const cylinder = (r: number, h: number, x: number, y: number, z: number) =>
  new THREE.CylinderGeometry(r, r, h, 12).translate(x, y, z).toNonIndexed();
const merge = (parts: THREE.BufferGeometry[]) => {
  const merged = mergeGeometries(parts)!;
  parts.forEach((part) => part.dispose());
  return merged;
};
/**
 * Thermoplastic road paint, laid a few millimetres proud of the yard: a slab
 * from under the yard's -0.02 m datum up to `top`. Proud, not a biased decal,
 * because the back walk crosses a yard strip that a decal at the overlay layer
 * went under; the white lines stand 3 mm proud of the green so no face is shared.
 */
const PAINT_TOP = { fill: 0.004, line: 0.007 } as const;
const PAINT_BOTTOM = -0.03;
const ground = (minX: number, maxX: number, minZ: number, maxZ: number, top: number) =>
  box(
    maxX - minX,
    top - PAINT_BOTTOM,
    maxZ - minZ,
    (minX + maxX) / 2,
    (top + PAINT_BOTTOM) / 2,
    (minZ + maxZ) / 2
  );

// ---------------------------------------------------------------------------
// Sign faces (ISO 7010 safe-condition green, white symbols), drawn once
// ---------------------------------------------------------------------------

const SAFE_GREEN = '#00843d';

function canvasTexture(width: number, height: number, draw: (c: CanvasRenderingContext2D) => void) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** A running figure, its body leaning toward +x; `s` scales it from a 100-unit-tall figure. */
function runningFigure(c: CanvasRenderingContext2D, x: number, y: number, s: number) {
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.strokeStyle = '#ffffff';
  c.fillStyle = '#ffffff';
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.lineWidth = 11;
  c.beginPath();
  c.arc(14, -88, 10, 0, Math.PI * 2);
  c.fill();
  const limb = (points: [number, number][]) => {
    c.beginPath();
    c.moveTo(...points[0]);
    for (const point of points.slice(1)) c.lineTo(...point);
    c.stroke();
  };
  c.lineWidth = 13;
  limb([
    [6, -70],
    [-8, -38],
  ]);
  c.lineWidth = 10;
  limb([
    [4, -66],
    [24, -56],
    [36, -64],
  ]);
  limb([
    [4, -66],
    [-14, -58],
    [-24, -68],
  ]);
  limb([
    [-8, -38],
    [12, -26],
    [16, 0],
  ]);
  limb([
    [-8, -38],
    [-22, -22],
    [-40, -16],
  ]);
  c.restore();
}

/** E001-style exit sign: a figure running to a doorway; with an arrow ahead when `arrow`. */
function drawExitSign(c: CanvasRenderingContext2D, arrow: boolean) {
  const { width: w, height: h } = c.canvas;
  c.fillStyle = SAFE_GREEN;
  c.fillRect(0, 0, w, h);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 8;
  c.strokeRect(6, 6, w - 12, h - 12);
  // The doorway: a white frame with the green opening the figure runs into.
  c.fillStyle = '#ffffff';
  c.fillRect(w * 0.66, h * 0.16, w * 0.2, h * 0.7);
  c.fillStyle = SAFE_GREEN;
  c.fillRect(w * 0.66 + 9, h * 0.16 + 9, w * 0.2 - 18, h * 0.7 - 9);
  runningFigure(c, w * 0.5, h * 0.84, h / 140);
  if (arrow) {
    // Straight on: an arrow pointing up, at the left.
    const x = w * 0.17;
    c.strokeStyle = '#ffffff';
    c.fillStyle = '#ffffff';
    c.lineWidth = 12;
    c.beginPath();
    c.moveTo(x, h * 0.84);
    c.lineTo(x, h * 0.36);
    c.stroke();
    c.beginPath();
    c.moveTo(x - 24, h * 0.42);
    c.lineTo(x, h * 0.14);
    c.lineTo(x + 24, h * 0.42);
    c.closePath();
    c.fill();
  }
}

/** E007-style assembly point: four people drawn together by four arrows, and the words. */
function drawAssemblySign(c: CanvasRenderingContext2D) {
  const { width: w, height: h } = c.canvas;
  c.fillStyle = SAFE_GREEN;
  c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffffff';
  c.strokeStyle = '#ffffff';
  const cx = w / 2,
    cy = w / 2;
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    // A person: head and shoulders.
    const px = cx + dx * 26,
      py = cy + dy * 26;
    c.beginPath();
    c.arc(px, py - 13, 8, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(px - 13, py + 16);
    c.quadraticCurveTo(px - 13, py - 2, px, py - 2);
    c.quadraticCurveTo(px + 13, py - 2, px + 13, py + 16);
    c.closePath();
    c.fill();
    // An arrow from the corner toward them.
    const ax = cx + dx * 100,
      ay = cy + dy * 100,
      bx = cx + dx * 62,
      by = cy + dy * 62;
    c.lineWidth = 10;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(ax, ay);
    c.lineTo(bx, by);
    c.stroke();
    c.beginPath();
    c.moveTo(bx - dx * 4, by - dy * 4);
    c.lineTo(bx + dx * 22, by - dy * 2);
    c.lineTo(bx - dx * 2, by + dy * 22);
    c.closePath();
    c.fill();
  }
  // The words, white on green, under the pictogram.
  c.fillStyle = '#ffffff';
  c.fillRect(0, w, w, 4);
  c.font = `bold ${Math.round(w * 0.12)}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('ASSEMBLY', w / 2, w + (h - w) * 0.33);
  c.fillText('POINT', w / 2, w + (h - w) * 0.72);
}

// ---------------------------------------------------------------------------
// Geometry, one merged set per material for both doors
// ---------------------------------------------------------------------------

/** Distance `d` out from the wall line toward the yard (negative: into the hall). */
const out = (door: Door, d: number) => door.wallZ + door.outward * d;

const D = PERSONNEL_DOOR;
const JAMB_FROM = D.openingHalfWidth + 0.02; // 2 cm into the plinth's end, no shared face
const JAMB_TO = D.clearWidth / 2;
const HEAD_TOP = D.openingTop - 0.12; // 2 cm into the light's bottom rail above
const LANDING_TO = D.landing.depth + 0.28;
const ASSEMBLY_HALF = D.assemblySize / 2;
const BARRIER_X = 35.25;
const BARRIER_FROM = 44.5;
const BARRIER_TO = 49.35;
const SIGN_POST = { x: 39, d: -6 } as const;

function doorGeometry(door: Door) {
  const { x } = door;
  const frame = [
    ...[-1, 1].map((side) =>
      box(
        JAMB_FROM - JAMB_TO,
        HEAD_TOP,
        D.depth,
        x + side * ((JAMB_FROM + JAMB_TO) / 2),
        HEAD_TOP / 2,
        door.wallZ
      )
    ),
    box(
      2 * JAMB_FROM,
      HEAD_TOP - D.clearHeight,
      D.depth,
      x,
      (D.clearHeight + HEAD_TOP) / 2,
      door.wallZ
    ),
  ];
  // The leaf, open 90 degrees outward on its hinge at the east jamb's outer edge.
  const hingeX = x + JAMB_TO,
    leafFrom = D.depth / 2,
    leafTo = leafFrom + D.clearWidth;
  const leafMid = (leafFrom + leafTo) / 2;
  const leafX = hingeX + D.leafThickness / 2 + 0.01;
  const leaf = [
    box(
      D.leafThickness,
      D.clearHeight - 0.02,
      D.clearWidth,
      leafX,
      D.clearHeight / 2,
      out(door, leafMid)
    ),
  ];
  const visionMid = leafFrom + D.clearWidth * 0.62;
  const glass = [box(D.leafThickness + 0.01, 0.7, 0.22, leafX, 1.5, out(door, visionMid))];
  // Threshold plate, flush (6 mm), and the push bar on the leaf's inner face.
  const barX = hingeX - 0.035;
  const hardware = [
    box(D.clearWidth, 0.006, D.depth, x, 0.003, door.wallZ),
    box(0.035, 0.045, 0.78, barX, 1.0, out(door, leafMid)),
    ...[-0.36, 0.36].map((dz) =>
      box(0.03, 0.03, 0.03, hingeX - 0.005, 1.0, out(door, leafMid + dz))
    ),
  ];
  // Outside: the level landing and its corner bollards.
  const landing = [
    box(D.landing.width, 0.08, LANDING_TO - 0.28, x, -0.04, out(door, (0.28 + LANDING_TO) / 2)),
  ];
  const bollards = [-1, 1].map((side) =>
    cylinder(0.1, 1.0, x + side * (D.landing.width / 2 - 0.1), 0.5, out(door, LANDING_TO - 0.1))
  );
  // Inside: the barrier on the walkway's west edge, rails at 0.55 and 1.05 m.
  const barrierZ = [door.outward * BARRIER_FROM, door.outward * BARRIER_TO];
  const posts = 5;
  const barrier = [
    ...Array.from({ length: posts }, (_, i) =>
      cylinder(
        0.04,
        1.1,
        BARRIER_X,
        0.55,
        barrierZ[0] + ((barrierZ[1] - barrierZ[0]) * i) / (posts - 1)
      )
    ),
    ...[0.55, 1.05].map((y) =>
      box(0.05, 0.05, BARRIER_TO - BARRIER_FROM, BARRIER_X, y, (barrierZ[0] + barrierZ[1]) / 2)
    ),
  ];
  // The exit sign over the door (housing, bracket down to the head) and the
  // directional sign's post and arm where the barrier begins.
  const signZ = out(door, -0.26);
  const postZ = out(door, SIGN_POST.d);
  const signs = [
    box(0.64, 0.34, 0.08, x, 2.78, signZ),
    box(0.04, 2.61 - HEAD_TOP, 0.04, x, (HEAD_TOP + 2.61) / 2, signZ),
    box(0.64, 0.34, 0.08, SIGN_POST.x - 0.35, 2.35, postZ),
  ];
  const signPosts = [
    cylinder(0.04, 2.6, SIGN_POST.x, 1.3, postZ),
    box(0.08, 0.04, 0.04, SIGN_POST.x - 0.04, 2.55, postZ),
  ];
  // The assembly point sign on its post at the far side of the square.
  const [ax, az] = door.assembly;
  const signFar = az + door.outward * (ASSEMBLY_HALF + 0.3);
  signPosts.push(cylinder(0.05, 2.5, ax, 1.25, signFar + door.outward * 0.05));
  const assemblyBack = [box(0.62, 0.84, 0.03, ax, 2.0, signFar)];
  // Ground paint: the walk from the landing to the square, its edge lines,
  // and the square with its border.
  const walkFrom = LANDING_TO,
    walkTo = Math.abs(az - door.wallZ) - ASSEMBLY_HALF;
  const zRange = (a: number, b: number) =>
    [Math.min(out(door, a), out(door, b)), Math.max(out(door, a), out(door, b))] as const;
  const [wz0, wz1] = zRange(walkFrom, walkTo);
  // The walk's runs along z: where it meets the cross path behind the hall it
  // stops at the path's edging and starts again past it.
  const p = REAR_CROSS_PATH;
  const crosses = x > p.minX && x < p.maxX && wz0 < p.z - p.halfWidth && wz1 > p.z + p.halfWidth;
  const runs: (readonly [number, number])[] = crosses
    ? [
        [wz0, p.z - p.halfWidth],
        [p.z + p.halfWidth, wz1],
      ]
    : [[wz0, wz1]];
  const half = D.walkWidth / 2;
  const fill = [
    ...runs.map(([a, b]) => ground(x - half, x + half, a, b, PAINT_TOP.fill)),
    ground(
      ax - ASSEMBLY_HALF,
      ax + ASSEMBLY_HALF,
      az - ASSEMBLY_HALF,
      az + ASSEMBLY_HALF,
      PAINT_TOP.fill
    ),
  ];
  // The lines reach 5 mm past the green on their outer side, so no side face
  // of a line lies in the plane of the green's.
  const line = 0.1,
    lip = 0.005,
    border = 0.15,
    [s0, s1] = [ax - ASSEMBLY_HALF, ax + ASSEMBLY_HALF],
    [t0, t1] = [az - ASSEMBLY_HALF, az + ASSEMBLY_HALF];
  const lines = [
    ...[-1, 1].flatMap((side) => {
      const inner = x + side * (half - line),
        outer = x + side * (half + lip);
      return runs.map(([a, b]) =>
        ground(Math.min(inner, outer), Math.max(inner, outer), a, b, PAINT_TOP.line)
      );
    }),
    ground(s0 - lip, s1 + lip, t0 - lip, t0 + border, PAINT_TOP.line),
    ground(s0 - lip, s1 + lip, t1 - border, t1 + lip, PAINT_TOP.line),
    ground(s0 - lip, s0 + border, t0 + border, t1 - border, PAINT_TOP.line),
    ground(s1 - border, s1 + lip, t0 + border, t1 - border, PAINT_TOP.line),
  ];
  // An emergency bulkhead over the door outside, lighting the landing: its
  // body against the glazing's rail (5 mm into it), its diffuser underneath.
  const bulkhead = [box(0.34, 0.12, 0.17, x, 2.53, out(door, 0.385 + 0.085))];
  const lamp = [box(0.3, 0.02, 0.13, x, 2.46, out(door, 0.385 + 0.095))];
  return {
    frame: [...frame, ...bulkhead],
    leaf,
    glass,
    hardware,
    landing,
    barrier: [...bollards, ...barrier],
    housing: signs,
    lamp,
    post: [...signPosts],
    signBack: assemblyBack,
    walkFill: fill,
    walkLine: lines,
  };
}

/** The sign faces: planes just in front of their housings, facing where people come from. */
function signFaces() {
  const exit: THREE.BufferGeometry[] = [];
  const directional: THREE.BufferGeometry[] = [];
  const assembly: THREE.BufferGeometry[] = [];
  for (const door of PERSONNEL_DOORS) {
    // Facing into the hall (toward -outward): a plane faces +z, so turn it
    // half round at the front wall.
    const inward = door.outward > 0 ? Math.PI : 0;
    exit.push(
      new THREE.PlaneGeometry(0.6, 0.3)
        .rotateY(inward)
        .translate(door.x, 2.78, out(door, -0.26 - 0.041))
        .toNonIndexed()
    );
    directional.push(
      new THREE.PlaneGeometry(0.6, 0.3)
        .rotateY(inward)
        .translate(SIGN_POST.x - 0.35, 2.35, out(door, SIGN_POST.d - 0.041))
        .toNonIndexed()
    );
    const [ax, az] = door.assembly;
    assembly.push(
      new THREE.PlaneGeometry(0.6, 0.82)
        .rotateY(inward)
        .translate(ax, 2.0, az + door.outward * (ASSEMBLY_HALF + 0.3 - 0.016))
        .toNonIndexed()
    );
  }
  return { exit: merge(exit), directional: merge(directional), assembly: merge(assembly) };
}

type GeometrySet = ReturnType<typeof doorGeometry>;

export function StepFreeExits() {
  const geometry = useMemo(() => {
    const sets = PERSONNEL_DOORS.map(doorGeometry);
    const keys = Object.keys(sets[0]) as (keyof GeometrySet)[];
    return Object.fromEntries(keys.map((key) => [key, merge(sets.flatMap((set) => set[key]))])) as {
      [K in keyof GeometrySet]: THREE.BufferGeometry;
    };
  }, []);
  const faces = useMemo(signFaces, []);
  const materials = useMemo(() => {
    const exitMap = canvasTexture(256, 128, (c) => drawExitSign(c, false));
    const directionalMap = canvasTexture(256, 128, (c) => drawExitSign(c, true));
    const assemblyMap = canvasTexture(256, 352, drawAssemblySign);
    return {
      // Illuminated exit signs are light sources: unlit.
      exit: new THREE.MeshBasicMaterial({
        name: 'exit-sign-face',
        map: exitMap,
        color: exitMap ? '#ffffff' : SAFE_GREEN,
      }),
      directional: new THREE.MeshBasicMaterial({
        name: 'exit-sign-directional-face',
        map: directionalMap,
        color: directionalMap ? '#ffffff' : SAFE_GREEN,
      }),
      // The assembly sign is a painted panel: lit.
      assembly: new THREE.MeshStandardMaterial({
        name: 'assembly-sign-face',
        map: assemblyMap,
        color: assemblyMap ? '#ffffff' : SAFE_GREEN,
        roughness: 0.6,
      }),
    };
  }, []);
  useEffect(
    () => () => {
      for (const g of [...Object.values(geometry), ...Object.values(faces)]) g.dispose();
      for (const m of Object.values(materials)) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [geometry, faces, materials]
  );
  return (
    <group name="step-free-exits">
      <mesh
        name="exit-door-frames"
        geometry={geometry.frame}
        material={M.frame}
        castShadow
        receiveShadow
      />
      <mesh
        name="exit-door-leaves"
        geometry={geometry.leaf}
        material={M.leaf}
        castShadow
        receiveShadow
      />
      <mesh name="exit-door-vision-panels" geometry={geometry.glass} material={GLASS} />
      <mesh
        name="exit-door-hardware"
        geometry={geometry.hardware}
        material={M.steel}
        receiveShadow
      />
      <mesh name="exit-landings" geometry={geometry.landing} material={M.concrete} receiveShadow />
      <mesh
        name="exit-barriers"
        geometry={geometry.barrier}
        material={M.barrier}
        castShadow
        receiveShadow
      />
      <mesh name="exit-sign-housings" geometry={geometry.housing} material={M.housing} castShadow />
      <mesh name="exit-sign-posts" geometry={geometry.post} material={M.post} castShadow />
      <mesh
        name="assembly-sign-backs"
        geometry={geometry.signBack}
        material={M.signBack}
        castShadow
      />
      <mesh name="exit-walks" geometry={geometry.walkFill} material={M.walkFill} receiveShadow />
      <mesh
        name="exit-walk-lines"
        geometry={geometry.walkLine}
        material={M.walkLine}
        receiveShadow
      />
      <mesh name="exit-bulkhead-diffusers" geometry={geometry.lamp} material={LAMP} />
      <mesh name="exit-signs" geometry={faces.exit} material={materials.exit} />
      <mesh
        name="exit-signs-directional"
        geometry={faces.directional}
        material={materials.directional}
      />
      <mesh
        name="assembly-signs"
        geometry={faces.assembly}
        material={materials.assembly}
        receiveShadow
      />
    </group>
  );
}
