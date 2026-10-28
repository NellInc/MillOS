import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MachineType, type MachineData } from '../../types';
import { getMachineAssemblyScale, type Vec3Tuple } from '../../constants/siteLayout';
import type { ProcessInspectionKind } from '../../stores/processInspectionStore';

export function machineInspectionKind(
  type: MachineType
): Exclude<ProcessInspectionKind, 'henhouse'> | null {
  switch (type) {
    case MachineType.ROLLER_MILL:
      return 'mill';
    case MachineType.PLANSIFTER:
      return 'sifter';
    case MachineType.PACKER:
      return 'packer';
    case MachineType.SILO:
      return 'silo';
    default:
      return null;
  }
}

type Parts = THREE.BufferGeometry[];
/** Authored metres, installed exactly once using the same component scale as the
 * live instance writer. These are explanatory internals, not OEM reconstructions.
 * Working if the section fits the retained body and the empty silo has no column.
 */
export function createMachineInspectionGeometry(machine: MachineData) {
  const shell: Parts = [],
    lining: Parts = [],
    metal: Parts = [],
    brass: Parts = [],
    screens: Parts = [],
    roller: Parts = [],
    gate: Parts = [],
    grain: Parts = [];
  const box = (parts: Parts, p: Vec3Tuple, s: Vec3Tuple) =>
    parts.push(new THREE.BoxGeometry(...s).translate(...p));
  const cyl = (parts: Parts, p: Vec3Tuple, radius: number, height: number, axisX = false) => {
    const g = new THREE.CylinderGeometry(radius, radius, height, 24);
    if (axisX) g.rotateZ(Math.PI / 2);
    parts.push(g.translate(...p));
  };
  const funnel = (parts: Parts, bottom: number, top: number, low: number, high: number, z = 0) => {
    const points = [
      [bottom, low],
      [top, high],
      [top + 0.07, high],
      [bottom + 0.07, low],
      [bottom, low],
    ];
    parts.push(
      new THREE.LatheGeometry(
        points.map(([r, y]) => new THREE.Vector2(r, y)),
        24,
        Math.PI / 2,
        Math.PI
      ).translate(0, 0, z)
    );
    for (const sign of [-1, 1]) {
      const edge = new THREE.BoxGeometry(0.07, Math.hypot(top - bottom, high - low), 0.07);
      edge.rotateZ(-sign * Math.atan2(top - bottom, high - low));
      parts.push(edge.translate((sign * (top + bottom)) / 2, (low + high) / 2, z));
    }
  };
  const section = (width: number, height: number, depth: number, cy: number) => {
    box(shell, [0, cy, -depth / 2], [width, height, 0.11]);
    box(lining, [0, cy, -depth / 2 + 0.085], [width - 0.14, height - 0.14, 0.035]);
    for (const sign of [-1, 1]) {
      box(shell, [sign * (width / 2 - 0.055), cy, -depth / 4], [0.11, height, depth / 2]);
      box(brass, [sign * (width / 2 - 0.055), cy, 0], [0.13, height, 0.09]);
    }
    box(shell, [0, cy - height / 2, -depth / 4], [width, 0.13, depth / 2]);
  };
  const kind = machineInspectionKind(machine.type);
  if (kind === 'mill') {
    section(4.8, 4.7, 3.8, 2.7);
    funnel(shell, 0.22, 1.25, 4.4, 6.55);
    funnel(lining, 0.17, 0.95, 3.05, 4.35);
    // Two X shafts, a narrow nip, flutes and end bearing journals.
    cyl(roller, [0, 0, 0], 0.45, 3.25, true);
    cyl(brass, [0, 2.28, -0.49], 0.14, 4.15, true);
    cyl(brass, [0, 2.28, 0.49], 0.14, 4.15, true);
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      const g = new THREE.BoxGeometry(3.16, 0.025, 0.025);
      g.rotateX(-a);
      roller.push(g.translate(0, Math.cos(a) * 0.451, Math.sin(a) * 0.451));
    }
    for (const x of [-1.84, 1.84])
      for (const z of [-0.49, 0.49]) {
        box(metal, [x, 2.28, z], [0.28, 0.7, 0.65]);
        cyl(brass, [x, 2.28, z], 0.22, 0.3, true);
      }
    funnel(lining, 0.25, 1.15, 0.65, 1.76);
    cyl(metal, [0, 0.48, 0], 0.26, 0.38);
    for (const x of [-1.95, 1.95]) box(metal, [x, 1.8, 0], [0.16, 2.8, 0.22]);
  } else if (kind === 'sifter') {
    section(6.5, 5.81, 5.65, 3.05);
    for (let k = 0; k < 7; k++) {
      const y = 0.62 + k * 0.82;
      for (const x of [-3.05, 3.05]) box(brass, [x, y, 0], [0.16, 0.16, 5.45]);
      for (const z of [-2.65, 2.65]) box(brass, [0, y, z], [6.26, 0.16, 0.15]);
      // Thin screen wires are an illustration of mesh, never metre-wide holes.
      for (let j = 0; j < 65; j++) box(screens, [-2.94 + j * 0.092, y, 0], [0.012, 0.018, 5.16]);
      for (let j = 0; j < 57; j++) box(screens, [0, y, -2.55 + j * 0.091], [5.9, 0.018, 0.012]);
      box(lining, [k % 2 === 0 ? 2.77 : -2.77, y - 0.17, -1.7], [0.18, 0.38, 1.3]);
    }
    for (const x of [-1.1, 1.1]) {
      funnel(metal, 0.23, 0.58, -0.15, 0.4, x);
    }
    box(metal, [0, 5.75, 0], [1.5, 0.2, 1.3]);
  } else if (kind === 'packer') {
    section(3.7, 4.75, 3.45, 2.65);
    funnel(shell, 0.24, 0.82, 4.85, 6.4);
    funnel(lining, 0.22, 1.12, 3.05, 4.55);
    for (const x of [-1.36, 1.36]) {
      box(metal, [x, 3.45, 0], [0.12, 1.85, 0.18]);
      box(brass, [x, 3.9, 0], [0.32, 0.18, 0.36]);
    }
    box(gate, [0, 3, 0], [0.75, 0.09, 0.62]);
    // The real-size head/sack are outside the .6 cabinet frame. Outlet routes
    // forward to that existing station; no duplicate sacks or filling authority.
    cyl(metal, [0, 2.98, 0], 0.25, 0.18);
    const bend = new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 2.94, 0),
        new THREE.Vector3(0, 2.9, 0.9),
        new THREE.Vector3(0, 1.72 / 0.6, (1.49 - 0.422625) / 0.6),
      ]),
      12,
      0.2,
      12,
      false
    );
    metal.push(bend);
  } else if (kind === 'silo') {
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 80; i++)
      profile.push(
        new THREE.Vector2(2.25 - 0.012 * (1 - Math.cos(i * Math.PI)), 2.5 + (i * 12.5) / 80)
      );
    profile.push(new THREE.Vector2(2.17, 15));
    for (let i = 80; i >= 0; i--) profile.push(new THREE.Vector2(2.17, 2.5 + (i * 12.5) / 80));
    profile.push(profile[0].clone());
    shell.push(new THREE.LatheGeometry(profile, 32, Math.PI / 2, Math.PI));
    for (const x of [-2.21, 2.21]) box(brass, [x, 8.75, 0], [0.085, 12.5, 0.085]);
    funnel(shell, 0.25, 2.25, 0.08, 2.5);
    funnel(shell, 2.25, 0.16, 15, 16.45);
    // Unit-height column later scaled by actual buffer fraction, never 2% min.
    grain.push(
      new THREE.CylinderGeometry(2.02, 2.02, 1, 32, 1, false, Math.PI / 2, Math.PI).translate(
        0,
        0.5,
        0
      )
    );
    grain.push(new THREE.PlaneGeometry(4.04, 1).translate(0, 0.5, 0.001));
  }
  const scale = getMachineAssemblyScale(machine);
  const merge = (parts: Parts) => {
    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    parts.forEach((g) => g.dispose());
    if (!merged) throw new Error('Machine inspection geometry cannot merge');
    merged.scale(...scale);
    merged.computeBoundingSphere();
    return merged;
  };
  return {
    shell: merge(shell),
    lining: merge(lining),
    metal: merge(metal),
    brass: merge(brass),
    screens: merge(screens),
    roller: merge(roller),
    gate: merge(gate),
    grain: merge(grain),
  };
}

/** Selected manual stage's illustrative route. No material is created/transferred. */
export function sampleMachineInspectionGrain(
  kind: string,
  stage: number,
  t: number,
  out: THREE.Vector3
) {
  const u = THREE.MathUtils.clamp(t, 0, 1);
  if (kind === 'mill') {
    if (stage === 0) return out.set(0, 6.1 - u * 2.7, 0);
    if (stage === 1 || stage === 2) return out.set((u - 0.5) * 2.6, 3.1 - u * 1.55, 0);
    return out.set(0, 1.7 - u * 1.35, 0);
  }
  if (kind === 'sifter') {
    if (stage === 0) return out.set(0, 6.3 - u * 0.72, 0);
    if (stage === 3) return out.set(0, 0.62 - u * 0.68, t < 0.5 ? -1.1 : 1.1);
    return out.set(-2.7 + u * 5.4, 5.54 - (stage === 2 ? 3.28 : 0), 0.8);
  }
  if (stage === 0) return out.set(0, 6.3 - u * 1.75, 0);
  if (stage === 1) return out.set(0, 4.5 - u * 1.45, 0);
  if (stage === 2) return out.set(0, 3.05 - u * 0.11, 0);
  return out.set(0, 2.94 - u * (2.94 - 1.72 / 0.6), u * ((1.49 - 0.422625) / 0.6));
}

/** The lamp's reach is world metres, even for an anisotropically installed silo.
 * Working if the source stays close to the actual grain surface at any fill.
 */
export function machineInspectionLampPosition(
  kind: string,
  stage: number,
  scale: Vec3Tuple,
  fill: number,
  out: THREE.Vector3
) {
  if (kind === 'silo') {
    const height =
      stage <= 1
        ? (2.55 + THREE.MathUtils.clamp(fill, 0, 1) * 11.9) * scale[1] + 0.65
        : 1.4 * scale[1];
    return out.set(0.5, height, 1.5);
  }
  return out.set(0.6 * scale[0], (kind === 'sifter' ? 3.8 : 3) * scale[1], 1.4 * scale[2]);
}
