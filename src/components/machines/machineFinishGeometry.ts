import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

import { SIFTER_LAYOUT, PACKER_HOPPER_LAYOUT } from '../../constants/siteLayout';

/**
 * Open motor-end cage, in the existing torus mount's unit coordinates.
 * Three rings and rear cross-braces share one instanced draw and hardware finish.
 * Working if apertures remain open and the retained 1.1 / 1.1 / 0.1 bounds hold.
 */
export function createMotorFanGuardGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(1, 0.1, 4, 24)];
  for (const radius of [0.33, 0.66]) {
    parts.push(new THREE.TorusGeometry(radius, 0.035, 4, 16));
  }
  parts.push(new THREE.BoxGeometry(2, 0.045, 0.045).translate(0, 0, -0.045));
  parts.push(new THREE.BoxGeometry(0.045, 2, 0.045).translate(0, 0, -0.045));
  return finish(parts, 'mill-motor-open-fan-guard');
}

type Vec3 = readonly [number, number, number];
/** Shared drive position keeps the motor, fan, cooling fins and support together. */
export const MILL_DRIVE_Z = 1.8;

/** The control face follows the cast shoulder, clear of the feeder and intake. */
export const MILL_CONTROL_FACE = {
  rotationX: -Math.atan2(0.9, 0.8),
  position: [
    0,
    4.25 + (0.9 / Math.hypot(0.9, 0.8)) * 0.09,
    2.2 + (0.8 / Math.hypot(0.9, 0.8)) * 0.09,
  ] as const,
} as const;

/** Round service covers on the aisle side, clear of the serial plate and vents. */
export const MILL_INSPECTION_COVERS: readonly Vec3[] = [
  [-2.43, 1.2, 0.8],
  [-2.43, 3.95, 0.8],
];

/** The upper fitting carries the actual motor-load instrument inside its rim. */
export const MILL_LOAD_DIAL = {
  position: [-2.505, 3.95, 0.8] as const,
  diameter: 0.515,
} as const;

export const MILL_FEEDER_FASTENERS: readonly Vec3[] = [-1, 1].flatMap((x) =>
  [-1, 1].map((z) => [x * 1.22, 5.13, z * 1.08] as const)
);

/**
 * Authored in metres about the machine origin, before its operating motion.
 * The existing shared batches carry guards, cooling fins, sieve-frame clamps
 * and service panels. Replacing the two old sifter plates adds no draw calls.
 * No extra lights, transparent surfaces or per-bolt meshes. The upper dial's
 * reading is supplied separately by the current production telemetry.
 * Working if the fittings remain attached during operation and the chill rolls
 * remain visible through the inspection openings and the HMI stays on its shoulder.
 */
function finish(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) throw new Error(`Cannot assemble ${name}`);
  geometry.name = name;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function box(parts: THREE.BufferGeometry[], centre: Vec3, size: Vec3): void {
  parts.push(new THREE.BoxGeometry(...size).translate(...centre));
}

function castCover(parts: THREE.BufferGeometry[], centre: Vec3, size: Vec3): void {
  // A 35 mm edge break catches daylight without rounding off the casing.
  const rounded = new RoundedBoxGeometry(...size, 1, 0.035);
  // RoundedBoxGeometry is non-indexed; the shared batch uses indexed parts.
  const indexed = mergeVertices(rounded);
  rounded.dispose();
  parts.push(indexed.translate(...centre));
}

function cylinder(
  parts: THREE.BufferGeometry[],
  centre: Vec3,
  radius: number,
  depth: number,
  axis: 'x' | 'y' | 'z',
  sides = 16
): void {
  const part = new THREE.CylinderGeometry(radius, radius, depth, sides);
  if (axis === 'x') part.rotateZ(Math.PI / 2);
  else if (axis === 'z') part.rotateX(Math.PI / 2);
  parts.push(part.translate(...centre));
}

function frontFrame(
  parts: THREE.BufferGeometry[],
  centre: Vec3,
  width: number,
  height: number,
  rail: number,
  depth: number
): void {
  const [x, y, z] = centre;
  for (const side of [-1, 1]) {
    box(parts, [x + (side * (width - rail)) / 2, y, z], [rail, height, depth]);
    box(parts, [x, y + (side * (height - rail)) / 2, z], [width - rail * 2, rail, depth]);
  }
}

/**
 * The Blender study's four-slot casting, kept in the existing procedural batch.
 * Its 10 mm bevel surrounds real openings; the upper and lower slots retain
 * the two moving-roll sight lines. No painted stripe substitutes for a hole.
 * Working if oblique views show slot depth and the active rolls remain visible.
 */
function millServicePanel(): THREE.BufferGeometry {
  const clippedRectangle = (
    left: number,
    right: number,
    bottom: number,
    top: number,
    corner: number
  ): THREE.Vector2[] =>
    [
      [left + corner, bottom],
      [right - corner, bottom],
      [right, bottom + corner],
      [right, top - corner],
      [right - corner, top],
      [left + corner, top],
      [left, top - corner],
      [left, bottom + corner],
    ].map(([x, y]) => new THREE.Vector2(x, y));

  // ExtrudeGeometry expands the outline and contracts its holes at the
  // straight wall. Inset the outline, enlarge the holes, and reserve the bevel
  // depth so the old 2.7 x 2.365 x 0.085 metre envelope is unchanged.
  const panel = new THREE.Shape(clippedRectangle(-1.34, 1.34, 1.455, 3.8, 0.03));
  for (const y of [2.25, 2.615, 2.985, 3.35]) {
    panel.holes.push(new THREE.Path(clippedRectangle(-1.26, 1.26, y - 0.0475, y + 0.0475, 0.025)));
  }
  const extruded = new THREE.ExtrudeGeometry(panel, {
    depth: 0.065,
    steps: 1,
    bevelEnabled: true,
    bevelThickness: 0.01,
    bevelSize: 0.01,
    bevelSegments: 1,
  });
  extruded.clearGroups();
  const geometry = mergeVertices(extruded);
  extruded.dispose();
  return geometry.translate(0, 0, 2.5625);
}

/** Folded leaves overlap the casing, while separated barrels expose a hinge pin. */
function hinge(parts: THREE.BufferGeometry[], x: number, y: number, z: number, sides = 8): void {
  for (const side of [-1, 1]) {
    box(parts, [x + side * 0.065, y, z - 0.025], [0.1, 0.24, 0.035]);
    cylinder(parts, [x, y + side * 0.067, z], 0.045, 0.125, 'y', sides);
  }
}

function millRecess(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  box(parts, [0, 2.82, 1.93], [3.65, 2.7, 0.1]);
  frontFrame(parts, [0, 2.64, 2.66], 4.13, 2.5, 0.045, 0.09);
  return finish(parts, 'mill-panel-gasket-and-recess');
}

function millGuard(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Deep painted cheeks join the service door to the casting. The moving rolls
  // remain behind the slotted inspection grille, enclosed by the casting.
  frontFrame(parts, [0, 2.64, 2.295], 4.25, 2.6, 0.13, 0.75);
  for (const side of [-1, 1]) {
    box(parts, [side * 1.675, 2.62, 2.595], [0.65, 2.35, 0.085]);
  }
  parts.push(millServicePanel());
  // A narrow folded painted land inside the dark gasket; the slots stay open.
  frontFrame(parts, [0, 2.64, 2.67], 4.03, 2.4, 0.03, 0.09);
  // Closed cast wedge: the shoulder must meet the cheek at oblique views.
  const shoulderProfile = new THREE.Shape();
  shoulderProfile.moveTo(-1.65, 3.82);
  shoulderProfile.lineTo(-2.683, 3.82);
  shoulderProfile.lineTo(-2.683, 3.887);
  shoulderProfile.lineTo(-1.783, 4.687);
  shoulderProfile.lineTo(-1.65, 4.687);
  shoulderProfile.closePath();
  const shoulder = new THREE.ExtrudeGeometry(shoulderProfile, {
    depth: 4.19,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
    steps: 1,
  });
  shoulder.translate(0, 0, -2.095).rotateY(Math.PI / 2);
  parts.push(mergeVertices(shoulder));
  shoulder.dispose();

  // The west access cover has real recesses instead of bright applied stripes.
  // The unchanged serial plate occupies its forward half, beyond z=0.175.
  for (const [z, width] of [
    [-1.3475, 0.345],
    [0.8475, 1.345],
  ]) {
    box(parts, [-2.425, 2.65, z], [0.08, 1.92, width]);
  }
  for (const [bottom, top] of [
    [1.69, 2.16],
    [2.34, 2.54],
    [2.72, 2.92],
    [3.1, 3.3],
    [3.48, 3.61],
  ]) {
    box(parts, [-2.425, (bottom + top) / 2, -0.5], [0.08, top - bottom, 1.35]);
  }
  for (const y of [2.25, 2.63, 3.01, 3.39]) {
    box(parts, [-2.45, y + 0.0675, -0.5], [0.07, 0.045, 1.35]);
  }
  castCover(parts, [2.425, 2.65, 0], [0.08, 1.92, 3.04]);
  castCover(parts, [2.4, 1.66, MILL_DRIVE_Z], [0.21, 1.63, 1.58]);
  box(parts, [3.02, 0.08, MILL_DRIVE_Z], [1.5, 0.16, 1.55]);
  for (const x of [2.65, 3.35]) box(parts, [x, 0.58, MILL_DRIVE_Z], [0.22, 0.84, 1.12]);
  for (const centre of MILL_INSPECTION_COVERS) cylinder(parts, centre, 0.31, 0.12, 'x', 16);
  return finish(parts, 'mill-cast-inspection-guard');
}

function millHardware(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Hinges and captive fasteners belong to the removable guard, clear of HMI.
  for (const x of [-2.04, 2.04]) {
    for (const y of [1.53, 2.8, 3.84]) {
      cylinder(parts, [x, y, 2.7], 0.085, 0.07, 'z', 6);
    }
    for (const y of [2.05, 3.45]) {
      hinge(parts, x, y, 2.71);
    }
  }
  // A folding handle and narrow screen bezel give the service face a scale.
  box(parts, [1.47, 2.8, 2.79], [0.42, 0.07, 0.07]);
  const bezel: THREE.BufferGeometry[] = [];
  frontFrame(bezel, [0, 0, 0.064], 0.94, 0.68, 0.065, 0.045);
  parts.push(
    finish(bezel, 'mill-sloped-hmi-bezel')
      .rotateX(MILL_CONTROL_FACE.rotationX)
      .translate(...MILL_CONTROL_FACE.position)
  );
  for (const centre of MILL_FEEDER_FASTENERS) {
    cylinder(parts, centre, 0.05, 0.075, 'y', 6);
  }
  // Ribbed aluminium motor casing. The seven fins share this one draw call.
  for (let fin = 0; fin < 7; fin += 1) {
    cylinder(parts, [2.53 + fin * 0.16, 1.65, MILL_DRIVE_Z], 0.73, 0.045, 'x', 20);
  }
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    cylinder(
      parts,
      [3.745, 1.65 + Math.sin(angle) * 0.45, MILL_DRIVE_Z + Math.cos(angle) * 0.45],
      0.055,
      0.045,
      'x',
      6
    );
  }
  // Fasteners on the actual side covers. Broad bright outline strips would
  // read as white paint from the normal milling camera.
  for (const side of [-1, 1]) {
    for (const z of [-1.35, 1.35]) {
      for (const y of [1.83, 3.45]) {
        cylinder(parts, [side * 2.49, y, z], 0.065, 0.05, 'x', 6);
      }
    }
  }
  // Thin machined rims and captive hex bolts give the covers their scale.
  // The lower fitting remains a bolted access cover. The upper one has an open
  // centre for the load dial, whose ink shares the existing placard draw.
  // Working if both fittings remain seated, with no bolt over the dial face.
  for (const [index, [x, y, z]] of MILL_INSPECTION_COVERS.entries()) {
    parts.push(
      new THREE.RingGeometry(0.24, 0.31, 16).rotateY(-Math.PI / 2).translate(x - 0.068, y, z)
    );
    if (index === 0) cylinder(parts, [x - 0.072, y, z], 0.07, 0.018, 'x', 6);
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      cylinder(
        parts,
        [x - 0.076, y + Math.sin(angle) * 0.273, z + Math.cos(angle) * 0.273],
        0.027,
        0.016,
        'x',
        6
      );
    }
  }
  return finish(parts, 'mill-machined-fittings');
}

function sifterHardware(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  // Front clamps sit beside the fascia; the seven real trays stay accessible
  // at the sides and rear. Square captive heads reuse the old fitting budget.
  // Working if all seven courses remain visible in the side and rear views.
  for (const side of [-1, 1]) {
    for (const sign of [-1, 1]) {
      const x = sign * (side === 1 ? 2.86 : 2.35);
      box(parts, [x, 3.12, side * 3.025], [0.11, 5.32, 0.1]);
      for (let tray = 0; tray < SIFTER_LAYOUT.trayCount; tray += 1) {
        const y = 0.67 + tray * SIFTER_LAYOUT.trayPitch;
        const shoe = new THREE.BoxGeometry(0.34, 0.16, 0.18);
        const positions = shoe.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
          if (positions.getZ(vertex) * side > 0)
            positions.setX(vertex, positions.getX(vertex) * 0.55);
        }
        shoe.computeVertexNormals();
        parts.push(shoe.translate(x, y, side * 3.055));
        box(parts, [x, y, side * 3.17], [0.12, 0.12, 0.07]);
      }
    }
    for (const z of [-1.9, 1.9]) {
      box(parts, [side * 3.445, 3.1, z], [0.11, 5.36, 0.11]);
      for (let tray = 0; tray < SIFTER_LAYOUT.trayCount; tray += 1) {
        const shoe = new THREE.BoxGeometry(0.16, 0.18, 0.26);
        const positions = shoe.getAttribute('position');
        for (let vertex = 0; vertex < positions.count; vertex++) {
          if (positions.getX(vertex) * side > 0) {
            positions.setY(vertex, (positions.getY(vertex) * 2) / 3);
            positions.setZ(vertex, positions.getZ(vertex) * 0.46);
          }
        }
        shoe.computeVertexNormals();
        parts.push(shoe.translate(side * 3.48, 0.67 + tray * SIFTER_LAYOUT.trayPitch, z));
      }
    }
  }
  frontFrame(parts, [0.45, 2.06, 3.177], 3.58, 2.3, 0.06, 0.045);
  box(parts, [0.45, 1.85, 3.19], [0.055, 1.8, 0.03]);
  frontFrame(parts, [0, 2.2, 3.205], 0.96, 0.64, 0.055, 0.045);
  for (const y of [3.74, 4.49, 5.28]) {
    box(parts, [0.45, y, 3.23], [0.36, 0.065, 0.04]);
    for (const x of [-1.18, 2.08]) box(parts, [x, y, 3.23], [0.075, 0.075, 0.035]);
  }
  for (const y of [1.5, 3.0, 4.65]) {
    cylinder(parts, [-2.05, y, 3.217], 0.12, 0.05, 'z', 8);
  }
  for (const x of [-2.1, 2.1]) {
    frontFrame(parts, [x, SIFTER_LAYOUT.capCentreY + 0.315, 0], 0.44, 0.32, 0.07, 0.12);
  }
  return finish(parts, 'plansifter-frame-clamps');
}

/** Folded front casing, seated over the tray lips with a lower access aperture.
 * Working if the service bay is recessed and upper covers remain separated at close range.
 */
function sifterServiceFace(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  frontFrame(parts, [0, 3.28, 3.0], 5.55, 4.88, 0.16, 0.32);
  box(parts, [-2.04, 3.28, 3.02], [1.13, 4.55, 0.28]);
  box(parts, [-1.4, 3.28, 3.02], [0.1, 4.55, 0.28]);
  box(parts, [2.44, 3.28, 3.02], [0.35, 4.55, 0.28]);
  for (const [y, height] of [
    [3.74, 0.66],
    [4.49, 0.72],
    [5.28, 0.75],
  ]) {
    box(parts, [0.45, y, 3.08], [3.55, height, 0.23]);
  }
  return finish(parts, 'plansifter-service-fascia');
}

function sifterServiceRecess(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  box(parts, [0.45, 2.06, 3.055], [3.53, 2.25, 0.1]);
  for (const y of [1.5, 3.0, 4.65]) cylinder(parts, [-2.05, y, 3.182], 0.23, 0.03, 'z', 12);
  return finish(parts, 'plansifter-access-recesses');
}

/** Side service covers occupy the flat cabinet course, clear of the working bay.
 * Working if the gasket lands on the body and front telemetry stays unobscured.
 */
function packerRecess(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  box(parts, [0, 3.05, 1.76], [2.65, 1.65, 0.1]);
  for (const side of [-1, 1]) {
    const frame: THREE.BufferGeometry[] = [];
    frontFrame(frame, [0, 3.1, 1.859], 2.55, 1.65, 0.055, 0.024);
    parts.push(finish(frame, 'packer-side-gasket').rotateY((side * Math.PI) / 2));
  }
  return finish(parts, 'packer-service-gaskets');
}
function packerCovers(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) box(parts, [side * 1.861, 3.1, 0], [0.034, 1.55, 2.45]);
  frontFrame(parts, [0, 3.05, 1.817], 2.67, 1.67, 0.035, 0.03);
  return finish(parts, 'packer-folded-service-covers');
}
function packerHardware(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const fittings: THREE.BufferGeometry[] = [];
    for (const y of [2.6, 3.6]) hinge(fittings, -1.2, y, 1.904, 6);
    box(fittings, [1.09, 3.1, 1.905], [0.16, 0.065, 0.05]);
    parts.push(finish(fittings, 'packer-side-hinges').rotateY((side * Math.PI) / 2));
  }
  // Front cover hardware stays outside the nameplate and lockout roundel.
  for (const y of [2.52, 3.56]) {
    box(parts, [-1.29, y, 1.83], [0.18, 0.2, 0.035]);
    cylinder(parts, [-1.3, y, 1.86], 0.035, 0.2, 'y', 6);
  }
  box(parts, [1.22, 3.12, 1.845], [0.09, 0.22, 0.055]);
  const bottom = PACKER_HOPPER_LAYOUT.centreY - PACKER_HOPPER_LAYOUT.scale[1] / 2;
  const radiusAt = (y: number) =>
    PACKER_HOPPER_LAYOUT.scale[0] * (1 - (0.55 * (y - bottom)) / PACKER_HOPPER_LAYOUT.scale[1]);
  const low = bottom + 0.025,
    high = bottom + 0.13;
  const band = new THREE.LatheGeometry(
    [
      new THREE.Vector2(radiusAt(low) - 0.003, low),
      new THREE.Vector2(radiusAt(low) + 0.026, low),
      new THREE.Vector2(radiusAt(high) + 0.026, high),
      new THREE.Vector2(radiusAt(high) - 0.003, high),
    ],
    24
  );
  band.normalizeNormals();
  parts.push(band);
  for (let index = 0; index < 4; index++) {
    const angle = Math.PI / 4 + (index * Math.PI) / 2;
    const lug: THREE.BufferGeometry[] = [];
    const y = (low + high) / 2;
    const radius = radiusAt(y);
    box(lug, [0, y, radius + 0.025], [0.12, 0.15, 0.08]);
    cylinder(lug, [0, y, radius + 0.078], 0.031, 0.026, 'z', 6);
    parts.push(finish(lug, 'hopper-clamp-lug').rotateY(angle));
  }
  return finish(parts, 'packer-service-and-hopper-hardware');
}

/** Paired sheet-joint fasteners follow the actual corrugated shell's triangles.
 * The existing base gets four small anchor shoes, clear of ladder and hatch.
 * Working if every fastener back contacts the shell and feet remain on the slab.
 */
export function createSiloHardwareGeometry(shell: THREE.BufferGeometry): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const material = new THREE.MeshBasicMaterial();
  const drum = new THREE.Mesh(shell, material);
  drum.position.y = 8.75;
  drum.scale.set(2.25, 12.5, 2.25);
  drum.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  for (const seam of [Math.PI / 4, -Math.PI / 4]) {
    for (let row = 0; row < 12; row++) {
      const y = 2.8 + row * 1.08;
      for (const side of [-1, 1]) {
        const angle = seam + side * 0.018;
        const outward = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
        ray.set(outward.clone().multiplyScalar(3).setY(y), outward.clone().negate());
        const hit = ray.intersectObject(drum)[0];
        if (!hit) throw new Error('Silo sheet fastener has no supporting shell');
        // Small domed captive head, eight triangles, with its back buried 2 mm.
        const head = new THREE.OctahedronGeometry(0.024, 0);
        head.scale(1, 1, 0.45).rotateY(angle);
        const point = hit.point.clone().addScaledVector(outward, 0.008);
        parts.push(mergeVertices(head).translate(point.x, point.y, point.z));
        head.dispose();
      }
    }
  }
  material.dispose();
  for (let index = 0; index < 4; index++) {
    const angle = Math.PI / 4 + (index * Math.PI) / 2;
    const foot: THREE.BufferGeometry[] = [];
    box(foot, [0, 0.035, 2.24], [0.2, 0.07, 0.24]);
    box(foot, [0, 0.18, 2.245], [0.05, 0.29, 0.15]);
    cylinder(foot, [0.055, 0.085, 2.31], 0.025, 0.035, 'y', 6);
    parts.push(finish(foot, 'silo-base-anchor-shoe').rotateY(angle));
  }
  return finish(parts, 'silo-sheet-joints-and-anchor-shoes');
}

export const MACHINE_FINISH_GEOMETRY = {
  millGuard: millGuard(),
  millHardware: millHardware(),
  millRecess: millRecess(),
  sifterHardware: sifterHardware(),
  sifterServiceFace: sifterServiceFace(),
  sifterServiceRecess: sifterServiceRecess(),
  packerRecess: packerRecess(),
  packerCovers: packerCovers(),
  packerHardware: packerHardware(),
} as const;
