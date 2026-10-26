import { describe, expect, it } from 'vitest';
import React from 'react';
import * as THREE from 'three';
import { END_OF_LINE_CRAFT, END_OF_LINE_MATERIALS } from './endOfLineCraft';
import { EndOfLineCell } from './EndOfLineCell';
import {
  getFlourSackGeometry,
  getFlourPalletGeometry,
  PALLET_SACK_LAYOUT,
} from '../../utils/flourSacks';
import { LOAD_SCALE, STRETCH_FILM_GEOMETRY } from '../props/LoadingProps';
import {
  CONVEYOR_LAYOUT,
  FACTORY_BOUNDS,
  SITE_LAYOUT,
  conveyorBounds,
  routeIntersectsBoundsXZ,
} from '../../constants/siteLayout';
import { createConveyorObstacles, createMachineObstacles } from '../../constants/factoryObstacles';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import {
  END_OF_LINE_FOOTPRINTS,
  EOL_INFEED,
  EOL_PALLETISER,
  EOL_WRAPPER,
  EOL_OUTFEED_LOADS,
  ROLLER_WEST_END_X,
  type CellRect,
} from './endOfLineLayout';

const meets = (a: Omit<CellRect, 'id'>, b: Omit<CellRect, 'id'>, margin = 0) =>
  a.minX - margin < b.maxX &&
  b.minX < a.maxX + margin &&
  a.minZ - margin < b.maxZ &&
  b.minZ < a.maxZ + margin;

describe('packing end-of-line cell', () => {
  it('starts where the roller line ends', () => {
    const roller = conveyorBounds(CONVEYOR_LAYOUT.roller);
    expect(ROLLER_WEST_END_X).toBe(roller.minX);
    expect(EOL_INFEED.maxX).toBeLessThan(roller.minX);
    expect(roller.minX - EOL_INFEED.maxX).toBeLessThanOrEqual(0.1);
    expect(EOL_INFEED.minZ).toBeGreaterThanOrEqual(roller.minZ);
    expect(EOL_INFEED.maxZ).toBeLessThanOrEqual(roller.maxZ);
  });

  it('stands inside the hall, clear of every belt and machine and of itself', () => {
    const conveyors = createConveyorObstacles();
    const machines = createMachineObstacles(0.35);
    for (const cell of END_OF_LINE_FOOTPRINTS) {
      expect(cell.minX).toBeGreaterThan(FACTORY_BOUNDS.minX);
      expect(cell.maxX).toBeLessThan(FACTORY_BOUNDS.maxX);
      expect(cell.minZ).toBeGreaterThan(FACTORY_BOUNDS.minZ);
      expect(cell.maxZ).toBeLessThan(FACTORY_BOUNDS.maxZ);
      // The infeed may butt the roller line; nothing may enter any belt.
      for (const belt of conveyors)
        expect(meets(cell, belt), `${cell.id} / ${belt.id}`).toBe(false);
      for (const machine of machines)
        expect(meets(cell, machine), `${cell.id} / ${machine.id}`).toBe(false);
    }
    for (let i = 0; i < END_OF_LINE_FOOTPRINTS.length; i += 1)
      for (let j = i + 1; j < END_OF_LINE_FOOTPRINTS.length; j += 1)
        expect(meets(END_OF_LINE_FOOTPRINTS[i], END_OF_LINE_FOOTPRINTS[j])).toBe(false);
  });

  it('keeps out of both forklift corridors, with half a metre to spare', () => {
    for (const route of Object.values(SITE_LAYOUT.routes.forklifts))
      for (const cell of END_OF_LINE_FOOTPRINTS)
        expect(routeIntersectsBoundsXZ(route, cell, 0.5), `${route.id} / ${cell.id}`).toBe(false);
  });

  it('keeps off every walking circuit in the mill', () => {
    for (const person of COMMUNITY_ROSTER.filter(({ district }) => district === 'mill')) {
      const points = person.stops.map((stop) => stop.position);
      for (let i = 0; i < points.length; i += 1) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.25));
        for (let s = 0; s <= steps; s += 1) {
          const x = a[0] + ((b[0] - a[0]) * s) / steps;
          const z = a[2] + ((b[2] - a[2]) * s) / steps;
          for (const cell of END_OF_LINE_FOOTPRINTS)
            expect(
              meets(cell, { minX: x, maxX: x, minZ: z, maxZ: z }, 0.6),
              `${person.id} at (${x.toFixed(1)}, ${z.toFixed(1)}) / ${cell.id}`
            ).toBe(false);
        }
      }
    }
  });
});

const fabricationRoles = Object.keys(END_OF_LINE_CRAFT) as (keyof typeof END_OF_LINE_CRAFT)[];
const inside = (point: THREE.Vector3, rect: CellRect) =>
  point.x >= rect.minX - 3e-6 &&
  point.x <= rect.maxX + 3e-6 &&
  point.z >= rect.minZ - 3e-6 &&
  point.z <= rect.maxZ + 3e-6;

const hits = (role: keyof typeof END_OF_LINE_CRAFT, at: number[], direction: number[]) => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  try {
    const mesh = new THREE.Mesh(END_OF_LINE_CRAFT[role], material);
    mesh.updateMatrixWorld(true);
    return new THREE.Raycaster(new THREE.Vector3(...at), new THREE.Vector3(...direction))
      .intersectObject(mesh)
      .map((hit) => hit.point);
  } finally {
    material.dispose();
  }
};

describe('delivered end-of-line fabrication', () => {
  it('premerges five lit material roles within the finite triangle allowance', () => {
    expect(fabricationRoles).toHaveLength(5);
    const count = fabricationRoles.reduce(
      (total, role) => total + END_OF_LINE_CRAFT[role].index!.count / 3,
      0
    );
    expect(count).toBeLessThanOrEqual(3200);
    for (const role of fabricationRoles) {
      const material = END_OF_LINE_MATERIALS[role];
      expect(material.isMeshStandardMaterial).toBe(true);
      expect(material.emissive.getHex()).toBe(0);
      expect(material.metalness).toBe(role === 'steel' ? 1 : 0);
    }
  });

  it('keeps actual fabrication vertices inside the original three equipment footprints', () => {
    const allowed = [EOL_INFEED, EOL_PALLETISER, EOL_WRAPPER];
    for (const [role, geometry] of Object.entries(END_OF_LINE_CRAFT)) {
      const position = geometry.getAttribute('position');
      const point = new THREE.Vector3();
      for (let i = 0; i < position.count; i++) {
        point.fromBufferAttribute(position, i);
        expect(
          allowed.some((rect) => inside(point, rect)),
          `${role}: ${point.toArray()}`
        ).toBe(true);
        expect(point.y).toBeGreaterThanOrEqual(-1e-6);
        expect(point.y).toBeLessThanOrEqual(EOL_PALLETISER.height + 0.09 + 1e-6);
      }
    }
    // Positive control: the old 0.5m mast foot overran this real minZ by 0.10m.
    expect(
      inside(new THREE.Vector3(EOL_WRAPPER.mast.x, 0, EOL_WRAPPER.mast.z - 0.25), EOL_WRAPPER)
    ).toBe(false);
  });

  it('has finite outward normals and closed non-degenerate construction shells', () => {
    const a = new THREE.Vector3(),
      b = new THREE.Vector3(),
      c = new THREE.Vector3();
    const face = new THREE.Vector3(),
      normal = new THREE.Vector3();
    for (const [role, geometry] of Object.entries(END_OF_LINE_CRAFT)) {
      const position = geometry.getAttribute('position'),
        normals = geometry.getAttribute('normal'),
        index = geometry.index!;
      const edges = new Map<string, { count: number; balance: number }>();
      const key = (v: THREE.Vector3) =>
        v
          .toArray()
          .map((n) => Math.round(n * 1e5))
          .join(',');
      for (let i = 0; i < position.count; i++) {
        expect([position.getX(i), position.getY(i), position.getZ(i)].every(Number.isFinite)).toBe(
          true
        );
        normal.fromBufferAttribute(normals, i);
        expect(normal.length(), `${role} normal`).toBeCloseTo(1, 5);
      }
      for (let i = 0; i < index.count; i += 3) {
        a.fromBufferAttribute(position, index.getX(i));
        b.fromBufferAttribute(position, index.getX(i + 1));
        c.fromBufferAttribute(position, index.getX(i + 2));
        face.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
        expect(face.lengthSq(), `${role} collapsed face`).toBeGreaterThan(1e-14);
        normal.set(0, 0, 0);
        for (let j = 0; j < 3; j++)
          normal.add(new THREE.Vector3().fromBufferAttribute(normals, index.getX(i + j)));
        expect(face.dot(normal), `${role} inward winding`).toBeGreaterThan(0);
        const points = [key(a), key(b), key(c)];
        for (let j = 0; j < 3; j++) {
          const u = points[j],
            v = points[(j + 1) % 3],
            sorted = [u, v].sort();
          const id = sorted.join('|'),
            edge = edges.get(id) ?? { count: 0, balance: 0 };
          edge.count++;
          edge.balance += u < v ? 1 : -1;
          edges.set(id, edge);
        }
      }
      for (const edge of edges.values()) {
        expect(edge.count % 2, `${role} open shell`).toBe(0);
        expect(edge.balance, `${role} unmatched winding`).toBe(0);
      }
    }
  });

  it('seats every gantry foot and the wrapper base on the floor and keeps the table datum', () => {
    const p = EOL_PALLETISER;
    for (const x of [p.minX + 0.07, p.maxX - 0.07])
      for (const z of [p.minZ + 0.07, p.maxZ - 0.07])
        expect(hits('dark', [x, -0.2, z], [0, 1, 0])[0].y).toBeCloseTo(0, 6);
    const { mast, table } = EOL_WRAPPER;
    expect(hits('frame', [mast.x + 0.2, -0.2, mast.z], [0, 1, 0])[0].y).toBeCloseTo(0, 6);
    expect(hits('dark', [table.x, 0.3, table.z], [0, -1, 0])[0].y).toBeCloseTo(table.height, 6);
  });

  it('connects the real gripper head, collar, steel slide, guide housing and bridge', () => {
    const p = EOL_PALLETISER,
      x = (p.minX + p.maxX) / 2 + 0.15,
      z = (p.minZ + p.maxZ) / 2;
    const dark = hits('dark', [x, 0, z], [0, 1, 0]).map((p) => p.y);
    const steel = hits('steel', [x, 0, z], [0, 1, 0]).map((p) => p.y);
    const guard = hits('guard', [x, 0, z], [0, 1, 0]).map((p) => p.y);
    expect(dark[0]).toBeCloseTo(1.78, 6);
    expect(steel[0]).toBeLessThan(1.94);
    expect(Math.max(...steel)).toBeGreaterThan(2.27);
    expect(Math.max(...dark)).toBeGreaterThan(Math.min(...guard));
    for (const edge of [p.minZ + 0.1, p.maxZ - 0.1]) {
      const shoe = hits('dark', [x, 4, edge], [0, -1, 0]).map((p) => p.y);
      const rail = hits('frame', [x, 4, edge], [0, -1, 0]).map((p) => p.y);
      expect(shoe[0]).toBeGreaterThan(Math.min(...rail));
      expect(Math.min(...shoe)).toBeLessThan(Math.max(...rail));
    }
  });

  it('roots the wrapper drive support and spindle in their actual mating parts', () => {
    const { mast } = EOL_WRAPPER;
    const origin = [mast.x - 0.5, 0.65, mast.z];
    const frame = hits('frame', origin, [1, 0, 0]).map((p) => p.x),
      steel = hits('steel', origin, [1, 0, 0]).map((p) => p.x);
    const motor = hits('dark', origin, [1, 0, 0]).map((p) => p.x);
    expect(Math.min(...steel)).toBeLessThan(Math.max(...frame));
    expect(Math.max(...steel)).toBeGreaterThan(Math.min(...motor));
    expect(hits('film', [mast.x, 2, mast.z + 0.44], [0, -1, 0])).toHaveLength(0);
    expect(hits('steel', [mast.x, 2, mast.z + 0.44], [0, -1, 0])[0].y).toBeCloseTo(1.66, 5);
    const film = END_OF_LINE_CRAFT.film.boundingBox!;
    expect(film.min.y).toBeCloseTo(1.1, 6);
    expect(film.max.y).toBeCloseTo(1.6, 6);
    expect(film.getSize(new THREE.Vector3()).x).toBeCloseTo(0.14, 5);
  });

  it('keeps the film carriage clear of the retained rotated full load', () => {
    const { table } = EOL_WRAPPER;
    for (const [source, scale] of [
      [getFlourPalletGeometry().sacks, LOAD_SCALE],
      [STRETCH_FILM_GEOMETRY, 1],
    ] as const) {
      const load = source
        .clone()
        .scale(scale, scale, scale)
        .rotateY(0.35)
        .translate(table.x, 0, table.z);
      try {
        load.computeBoundingBox();
        expect(load.boundingBox!.min.z - END_OF_LINE_CRAFT.film.boundingBox!.max.z).toBeGreaterThan(
          0.02
        );
      } finally {
        load.dispose();
      }
    }
  });

  it('preserves the actual original sack, load and pallet-magazine mounts', () => {
    const elements: React.ReactElement<Record<string, unknown>>[] = [];
    const local = new Set(['Infeed', 'Palletiser', 'Wrapper']);
    const visit = (node: React.ReactNode) =>
      React.Children.forEach(node, (child) => {
        if (!React.isValidElement<Record<string, unknown>>(child)) return;
        elements.push(child);
        if (typeof child.type === 'function' && local.has(child.type.name))
          visit((child.type as (p: unknown) => React.ReactNode)(child.props));
        else visit(child.props.children as React.ReactNode);
      });
    visit(EndOfLineCell({}));
    const sacks = elements.filter((e) => e.props.geometry === getFlourSackGeometry());
    const p = EOL_PALLETISER,
      cx = (p.minX + p.maxX) / 2,
      cz = (p.minZ + p.maxZ) / 2;
    expect(sacks.map((e) => e.props.position)).toEqual([
      [-16.32, 1.03, -19.05],
      [-15.48, 1.03, -18.92],
      [cx + 0.15, 1.66, cz],
    ]);
    expect(sacks.map((e) => e.props.scale)).toEqual([
      [1, 0.85, 0.92],
      [1, 0.85, 0.92],
      [0.92, 0.8, 0.95],
    ]);
    expect(sacks.map((e) => e.props.rotation)).toEqual([
      [0, Math.PI / 2 - 0.03, 0],
      [0, Math.PI / 2 + 0.05, 0],
      [0, Math.PI / 2, 0],
    ]);
    expect(
      elements
        .filter((e) => typeof e.type === 'function' && e.type.name === 'Sack')
        .map((e) => e.props.bag)
    ).toEqual(PALLET_SACK_LAYOUT.slice(0, 6));
    const loads = elements.filter(
      (e) => typeof e.type === 'function' && e.type.name === 'FlourLoad'
    );
    expect(loads.map((e) => e.props.position)).toEqual([
      [EOL_WRAPPER.table.x, EOL_WRAPPER.table.height, EOL_WRAPPER.table.z],
      ...EOL_OUTFEED_LOADS.map((l) => [l.x, 0, l.z]),
    ]);
    expect(
      elements.find((e) => typeof e.type === 'function' && e.type.name === 'EmptyPalletStack')
        ?.props.count
    ).toBe(9);
  });
});
