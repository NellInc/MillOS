import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineData, MachineType } from '../../types';
import { buildSpoutRoutes, SPOUT_PIPE_RADIUS } from '../flow/spoutRoutes';
import { PIPE_SUPPORT_SEGMENTS } from '../SpoutingSystem';
import {
  buildCeilingFixtures,
  buildFactoryRoofEnvelope,
  buildFactoryRoofBatten,
  buildFactoryRoofGlazing,
  buildFactoryRoofStructure,
  buildFactoryGlazing,
  buildFactoryShellColumns,
  buildSafetyStations,
  buildProcessGallery,
  FACTORY_COLUMN_TOP_DROP,
  FACTORY_ENVELOPE_SPEC,
  FLOOR_JOINT_PITCH,
  sampleFloorMacro,
} from './OptimizedFactoryInfrastructure';

describe('optimized factory envelope', () => {
  it('keeps a complete structural envelope around large glazed bays', () => {
    expect(FACTORY_ENVELOPE_SPEC.baseHeight).toBeGreaterThan(0);
    expect(FACTORY_ENVELOPE_SPEC.sideWindowSill).toBeGreaterThan(FACTORY_ENVELOPE_SPEC.baseHeight);
    expect(FACTORY_ENVELOPE_SPEC.windowHead).toBeGreaterThan(
      FACTORY_ENVELOPE_SPEC.sideWindowSill + 12
    );
    expect(FACTORY_ENVELOPE_SPEC.topBandBottom).toBeGreaterThanOrEqual(
      FACTORY_ENVELOPE_SPEC.windowHead
    );
    expect(FACTORY_ENVELOPE_SPEC.topBandTop).toBe(SITE_LAYOUT.factory.bounds.maxY);
  });

  it('keeps the dock openings clear below their glazed upper bays', () => {
    expect(FACTORY_ENVELOPE_SPEC.dockWindowSill).toBeGreaterThanOrEqual(
      SITE_LAYOUT.portals.shipping.height
    );
    expect(FACTORY_ENVELOPE_SPEC.dockWindowSill).toBeGreaterThanOrEqual(
      SITE_LAYOUT.portals.receiving.height
    );
  });

  it('reveals the working floor without glazing over any operational entrance', () => {
    const panes = buildFactoryGlazing();
    expect(panes.some((pane) => pane.position[1] - pane.scale[1] / 2 < 3)).toBe(true);
    for (const pane of panes) {
      expect(pane.scale.every((size) => Number.isFinite(size) && size > 0)).toBe(true);
      for (const portal of Object.values(SITE_LAYOUT.portals)) {
        const front = portal.normal[2] !== 0;
        const axis = front ? 0 : 2;
        const normalAxis = front ? 2 : 0;
        if (Math.abs(pane.position[normalAxis] - portal.centre[normalAxis]) > 1) continue;
        const left = pane.position[axis] - pane.scale[axis] / 2;
        const right = pane.position[axis] + pane.scale[axis] / 2;
        const overlapsDoor =
          right > portal.centre[axis] - portal.halfWidth &&
          left < portal.centre[axis] + portal.halfWidth;
        if (overlapsDoor) {
          expect(pane.position[1] - pane.scale[1] / 2, portal.id).toBeGreaterThanOrEqual(
            portal.height
          );
        }
      }
    }
  });

  it('stands no gable column inside a dock opening', () => {
    // The 20 m column grid put a full-height column at x = 0 in the middle of
    // the 30 m shipping opening (and the 18 m receiving one), on the forklift
    // channel's line and in front of both SHIPPING signs - the art review's
    // "SH PPING". The dock header beam spans the opening instead.
    const columns = buildFactoryShellColumns();
    for (const portal of [SITE_LAYOUT.portals.shipping, SITE_LAYOUT.portals.receiving]) {
      const wallZ = portal.centre[2];
      const inWall = columns.filter((c) => Math.abs(c.position[2] - wallZ) < 1);
      for (const column of inWall) {
        const halfSpan = column.scale[0] / 2;
        expect(Math.abs(column.position[0] - portal.centre[0]) - halfSpan).toBeGreaterThanOrEqual(
          portal.halfWidth
        );
      }
      // The rest of the gable grid is still there: x = -40, -20, 20, 40.
      const shafts = inWall.filter(
        (c) =>
          c.scale[0] === 0.42 &&
          c.scale[1] === SITE_LAYOUT.factory.bounds.maxY - FACTORY_COLUMN_TOP_DROP
      );
      expect(shafts.map((c) => c.position[0]).sort((a, b) => a - b)).toEqual([-40, -20, 20, 40]);
    }
  });

  it('closes the glazing over a dock where the gable column used to stand', () => {
    // Window frames are 0.14 m wide and sit outside each pane edge, so two
    // panes whose edges are 0.28 m apart meet in one mullion with no open slot.
    const panes = buildFactoryGlazing();
    for (const portal of [SITE_LAYOUT.portals.shipping, SITE_LAYOUT.portals.receiving]) {
      const overDoor = panes.filter(
        (pane) =>
          Math.abs(pane.position[2] - portal.centre[2]) < 1 &&
          pane.position[1] - pane.scale[1] / 2 >= FACTORY_ENVELOPE_SPEC.dockWindowSill - 0.01
      );
      const edges = overDoor.flatMap((pane) => [
        pane.position[0] - pane.scale[0] / 2,
        pane.position[0] + pane.scale[0] / 2,
      ]);
      const leftOfCentre = Math.max(...edges.filter((x) => x <= 0));
      const rightOfCentre = Math.min(...edges.filter((x) => x >= 0));
      expect(rightOfCentre - leftOfCentre).toBeLessThanOrEqual(0.28 + 1e-9);
    }
  });

  it('mounts every safety station on a wall column, clear of the pedestrian lane', () => {
    // The stations stood free 3.2 m off the side walls - in the middle of the
    // 3 m pedestrian lane at x = +/-37 - and read as a red slab hanging in
    // front of the glazing (art review, forklift x 1650-1740, y 435-635).
    const halfWidth = SITE_LAYOUT.factory.floor.width / 2;
    const shafts = buildFactoryShellColumns().filter(
      (c) => c.scale[0] === 0.42 && Math.abs(Math.abs(c.position[0]) - (halfWidth - 0.45)) < 1e-6
    );
    for (const station of buildSafetyStations()) {
      const [x, , z] = station.position;
      const [sx, sy, sz] = station.scale;
      // Not in the lane centred 3 m in from the wall, 1.5 m either side.
      const laneInner = halfWidth - 3 - 1.5;
      const laneOuter = halfWidth - 3 + 1.5;
      const nearFace = Math.abs(x) - sx / 2;
      expect(nearFace >= laneOuter || Math.abs(x) + sx / 2 <= laneInner).toBe(true);
      // Its wall-side face sits on a column's inner face, and it spans that column.
      const column = shafts.find(
        (c) => Math.sign(c.position[0]) === Math.sign(x) && Math.abs(c.position[2] - z) < sz / 2
      );
      expect(column).toBeDefined();
      const columnInner = Math.abs(column!.position[0]) - column!.scale[0] / 2;
      expect(Math.abs(Math.abs(x) + sx / 2 - columnInner)).toBeLessThanOrEqual(0.02);
      // Standing on the floor.
      expect(station.position[1] - sy / 2).toBeCloseTo(0, 6);
    }
  });

  it('uses broad, evenly spaced window bays on every facade', () => {
    expect(FACTORY_ENVELOPE_SPEC.frontBayCentres).toEqual([-30, -10, 10, 30]);
    expect(FACTORY_ENVELOPE_SPEC.sideBayCentres).toEqual([-40, -20, 0, 20, 40]);
  });
});

/**
 * The slab layout is asserted through its pure sampler rather than by reading
 * a megapixel back: the point of the macro layer is that the surface differs
 * from place to place, and every claim below is a place-to-place comparison.
 */
describe('interior slab macro surface', () => {
  /**
   * Open floor: clear of every lane, dock apron, machine, joint and wall.
   * (-4, -34.4) looks open and is not - it sits inside the receiving apron.
   */
  const OPEN_FLOOR = sampleFloorMacro(-22.5, -14.5);

  it('polishes the forklift routes while the open slab retains a broad satin response', () => {
    const route = sampleFloorMacro(31, 12.3);
    expect(route.roughness).toBeLessThan(0.5);
    expect(OPEN_FLOOR.roughness).toBeGreaterThan(0.7);
    expect(OPEN_FLOOR.roughness).toBeLessThan(0.85);
    expect(route.roughness).toBeLessThan(OPEN_FLOOR.roughness - 0.3);
  });

  it('keeps the maintained concrete light enough to separate from local process stains', () => {
    expect(OPEN_FLOOR.tone).toBeGreaterThan(0.58);
    expect(OPEN_FLOOR.tone).toBeLessThan(0.65);
    const [x, , z] = SITE_LAYOUT.machines.rollerMills[0].position;
    const stained = sampleFloorMacro(x, z);
    expect(OPEN_FLOOR.tone - stained.tone).toBeGreaterThan(0.06);
    expect(OPEN_FLOOR.tone - stained.tone).toBeLessThan(0.17);
  });

  it('polishes the pedestrian walkways less than the forklift routes', () => {
    // On the painted west walkway quad, x = -(FLOOR_WIDTH / 2 - 3).
    const walkway = sampleFloorMacro(-(SITE_LAYOUT.factory.floor.width / 2 - 3), 12.3);
    const route = sampleFloorMacro(-31, 12.3);
    expect(walkway.roughness).toBeLessThan(OPEN_FLOOR.roughness);
    expect(walkway.roughness).toBeGreaterThan(route.roughness);
  });

  it('keeps the saw cut legible without a dark tile-grid contrast', () => {
    const joint = sampleFloorMacro(FLOOR_JOINT_PITCH * 2, -34.4);
    const beside = sampleFloorMacro(FLOOR_JOINT_PITCH * 2 + 2.5, -34.4);
    expect(beside.tone - joint.tone).toBeGreaterThan(0.04);
    expect(beside.tone - joint.tone).toBeLessThan(0.085);
    expect(joint.roughness).toBeGreaterThan(beside.roughness);
    expect(joint.ao).toBeLessThan(beside.ao - 0.1);
    expect(joint.ao).toBeGreaterThanOrEqual(0.8);
  });

  it('darkens and occludes the wall line', () => {
    const wallLine = sampleFloorMacro(-58.6, -34.4);
    expect(wallLine.ao).toBeLessThan(OPEN_FLOOR.ao - 0.2);
    expect(wallLine.tone).toBeLessThan(OPEN_FLOOR.tone);
  });

  it('stains the mill line with oil and the packing line with flour dust', () => {
    const millCentre = SITE_LAYOUT.machines.rollerMills[0].position;
    // Stay off the saw cuts, whose independently tested finish overrides oil.
    const oil = sampleFloorMacro(millCentre[0] + 0.5, millCentre[2] + 0.5);
    expect(oil.tone).toBeLessThan(OPEN_FLOOR.tone);
    expect(oil.roughness).toBeLessThan(0.55);

    const packerCentre = SITE_LAYOUT.machines.packers[1].position;
    const dust = sampleFloorMacro(packerCentre[0], packerCentre[2]);
    expect(dust.roughness).toBeGreaterThan(0.9);
  });

  it('never leaves a channel outside the byte range the texture writer needs', () => {
    for (let x = -60; x <= 60; x += 3.7) {
      for (let z = -50; z <= 50; z += 4.3) {
        const sample = sampleFloorMacro(x, z, 0.02, 0.98, 0.5);
        expect(sample.tone).toBeGreaterThanOrEqual(0);
        expect(sample.tone).toBeLessThanOrEqual(1);
        expect(sample.roughness).toBeGreaterThanOrEqual(0);
        expect(sample.roughness).toBeLessThanOrEqual(1);
        expect(sample.ao).toBeGreaterThanOrEqual(0);
        expect(sample.ao).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('factory roof light paths', () => {
  it.each([-1, 1] as const)('seats a slender standing seam on roof half %i', (side) => {
    const seam = buildFactoryRoofBatten(side, -10, 10, 17);
    expect(seam.scale[0]).toBe(20);
    expect(seam.scale[1]).toBeGreaterThan(0.05);
    expect(seam.scale[1]).toBeLessThanOrEqual(0.15);
    expect(seam.scale[2]).toBeGreaterThan(0.05);
    expect(seam.scale[2]).toBeLessThanOrEqual(0.2);
    expect(seam.position[0]).toBe(side * 20);
    expect(seam.position[2]).toBe(17);
    expect(seam.rotation).toEqual([0, 0, -0.05 * side]);
    const deckTop = SITE_LAYOUT.factory.bounds.maxY + 0.63;
    const top = seam.position[1] + (Math.cos(0.05) * seam.scale[1]) / 2;
    const bottom = seam.position[1] - (Math.cos(0.05) * seam.scale[1]) / 2;
    expect(top - deckTop).toBeGreaterThan(0.05);
    expect(top - deckTop).toBeLessThan(0.1);
    expect(bottom).toBeLessThan(deckTop);
  });

  it('stands every skylight kerb proud of the deck panel end it rises from', () => {
    // Kerbs and panels share each half's pitch, so faces compare in the deck
    // frame: z is world z, x is distance along the slope from the half centre.
    // A kerb's aperture-facing face flush with the panel end below it (the
    // aperture edge) is a coplanar pair the size of the panel's 0.36 m end:
    // 38.9 m^2 over the twelve z edges alone.
    const { panels, kerbs } = buildFactoryRoofEnvelope();
    const centre = SITE_LAYOUT.factory.floor.width / 4;
    const frame = (box: (typeof panels)[number]) => {
      const side = box.position[0] > 0 ? 1 : -1;
      return { side, x: (box.position[0] - centre * side) / Math.cos(0.05), z: box.position[2] };
    };
    const panelEnds = { x: [] as number[], z: [] as number[] };
    for (const panel of panels) {
      const { x, z } = frame(panel);
      panelEnds.x.push(x - panel.scale[0] / 2, x + panel.scale[0] / 2);
      panelEnds.z.push(z - panel.scale[2] / 2, z + panel.scale[2] / 2);
    }
    expect(kerbs).toHaveLength(24);
    for (const kerb of kerbs) {
      const { side, x, z } = frame(kerb);
      const axis = kerb.scale[0] < kerb.scale[2] ? 'x' : 'z';
      // Skylight centre in this frame: deck-local x = -5 * side, z nearest.
      const skylightZ = [-26, 0, 26].reduce((a, b) => (Math.abs(b - z) < Math.abs(a - z) ? b : a));
      const at = axis === 'x' ? x : z;
      const toward = axis === 'x' ? -5 * side : skylightZ;
      const half = (axis === 'x' ? kerb.scale[0] : kerb.scale[2]) / 2;
      const inner = at + Math.sign(toward - at) * half;
      const nearest = Math.min(...panelEnds[axis].map((end) => Math.abs(end - inner)));
      expect(nearest, `${axis} kerb at ${at.toFixed(3)}`).toBeGreaterThan(0.005);
    }
  });

  it('leaves all six skylight centres open through the actual deck and kerbs', () => {
    const { panels, kerbs } = buildFactoryRoofEnvelope();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = [...panels, ...kerbs].map((box) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...box.position);
      mesh.scale.set(...box.scale);
      mesh.rotation.set(...(box.rotation ?? [0, 0, 0]));
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    try {
      const panes = buildFactoryRoofGlazing();
      expect(panes).toHaveLength(6);
      for (const {
        position: [x, , z],
      } of panes) {
        const ray = new THREE.Raycaster(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));
        expect(ray.intersectObjects(meshes), `skylight at ${x}, ${z}`).toHaveLength(0);
      }
      const solidDeck = new THREE.Raycaster(
        new THREE.Vector3(SITE_LAYOUT.factory.floor.width / 2 - 5, 60, 10),
        new THREE.Vector3(0, -1, 0)
      );
      expect(solidDeck.intersectObjects(meshes).length).toBeGreaterThan(0);
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });
});

describe('process gallery steelwork', () => {
  const gallery = buildProcessGallery();
  const deckTop = gallery.deck[0].position[1] + gallery.deck[0].scale[1] / 2;
  const bounds = (box: (typeof gallery.supports)[number]) =>
    new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(...box.position),
      new THREE.Vector3(...box.scale)
    );

  it('keeps the existing deck datum and footprint with a bounded instanced part count', () => {
    expect(gallery.deck).toHaveLength(6);
    expect(deckTop).toBeCloseTo(8.85, 6);
    const combinedDeck = gallery.deck.reduce(
      (combined, part) => combined.union(bounds(part)),
      new THREE.Box3()
    );
    expect(combinedDeck.getCenter(new THREE.Vector3()).z).toBe(SITE_LAYOUT.factory.zones.sifting);
    const deckSize = combinedDeck.getSize(new THREE.Vector3());
    expect(deckSize.x).toBe(43);
    expect(deckSize.y).toBeCloseTo(0.16, 8);
    expect(deckSize.z).toBeCloseTo(11, 8);
    const parts = [...gallery.deck, ...gallery.supports, ...gallery.rails];
    expect(parts.length).toBeLessThan(140);
    for (const part of parts) {
      expect(part.position.every(Number.isFinite)).toBe(true);
      expect(part.scale.every((value) => Number.isFinite(value) && value > 0)).toBe(true);
      const box = bounds(part);
      expect(box.min.x).toBeGreaterThanOrEqual(-21.5);
      expect(box.max.x).toBeLessThanOrEqual(21.5);
      expect(box.min.z).toBeGreaterThanOrEqual(SITE_LAYOUT.factory.zones.sifting - 5.5);
      expect(box.max.z).toBeLessThanOrEqual(SITE_LAYOUT.factory.zones.sifting + 5.5);
    }
  });

  it('seats all thirty rail posts on the deck and connects the handrail at both ends', () => {
    const posts = gallery.rails.filter((part) => part.scale[1] > 1);
    expect(posts).toHaveLength(30);
    for (const post of posts) {
      expect(bounds(post).min.y).toBeCloseTo(deckTop, 6);
      expect(bounds(post).max.y).toBeCloseTo(deckTop + 1.2, 6);
    }
    for (const side of [-1, 1]) {
      const endRails = gallery.rails.filter(
        (part) => part.position[0] === side * 21.35 && part.scale[2] === 10.7
      );
      expect(endRails).toHaveLength(3);
    }
  });

  it('gives the actual column and girder flanges a recessed web rather than a solid-box face', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const meshes = gallery.supports.map((part) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...part.position);
      mesh.scale.set(...part.scale);
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    const distance = (x: number, y: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, y, SITE_LAYOUT.factory.zones.sifting + 7),
        new THREE.Vector3(0, 0, -1)
      ).intersectObjects(meshes)[0]?.distance ?? Infinity;
    try {
      expect(distance(20, 4)).toBeGreaterThan(distance(20.15, 4) + 0.1);
      expect(distance(20, 4)).toBeLessThan(3);
      expect(distance(20.3, 4)).toBe(Infinity);
      expect(distance(0, 8.34)).toBeGreaterThan(distance(0, 8.02) + 0.15);
      expect(distance(0, 8.34)).toBeLessThan(3);
      const plates = gallery.supports.filter((part) => part.scale[1] === 0.08);
      expect(plates).toHaveLength(10);
      for (const plate of plates) expect(bounds(plate).max.y).toBeCloseTo(7.99, 6);
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });

  it('leaves the finished-product pipe risers clear through the new steelwork', () => {
    // These are the live route builder and canonical anchors. Finished routes
    // use the sifter outlet datum and the packer size, not sifter body height.
    const machines = [
      ...SITE_LAYOUT.machines.sifters.map((anchor) => ({
        ...anchor,
        type: MachineType.PLANSIFTER,
        size: [...SITE_LAYOUT.machineDimensions.sifter],
      })),
      ...SITE_LAYOUT.machines.packers.map((anchor) => ({
        ...anchor,
        type: MachineType.PACKER,
        size: [...SITE_LAYOUT.machineDimensions.packer],
      })),
    ] as unknown as MachineData[];
    const routes = buildSpoutRoutes(machines);
    expect(routes).toHaveLength(3);
    const envelopes = gallery.supports.map((part) =>
      bounds(part).expandByScalar(SPOUT_PIPE_RADIUS)
    );
    const collisions: string[] = [];
    routes.forEach(({ curve }, route) => {
      for (let step = 0; step <= 400; step++) {
        const point = curve.getPointAt(step / 400);
        if (envelopes.some((box) => box.containsPoint(point))) {
          collisions.push(
            `route ${route}: ${point
              .toArray()
              .map((v) => v.toFixed(2))
              .join(', ')}`
          );
          break;
        }
      }
    });
    expect(collisions).toEqual([]);
  });

  it('clears the gallery deck and beams with every live spouting family', () => {
    const groups = [
      [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
      [
        SITE_LAYOUT.machines.rollerMills,
        MachineType.ROLLER_MILL,
        SITE_LAYOUT.machineDimensions.rollerMill,
      ],
      [SITE_LAYOUT.machines.sifters, MachineType.PLANSIFTER, SITE_LAYOUT.machineDimensions.sifter],
      [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
    ] as const;
    const machines = groups.flatMap(([anchors, type, size]) =>
      anchors.map((anchor) => ({ ...anchor, type, size: [...size] }))
    ) as unknown as MachineData[];
    const routes = buildSpoutRoutes(machines);
    expect(routes).toHaveLength(11);
    const envelopes = [...gallery.deck, ...gallery.supports].map((part) =>
      bounds(part).expandByScalar(SPOUT_PIPE_RADIUS)
    );
    const collisions: string[] = [];
    for (const { family, curve } of routes) {
      for (let sample = 0; sample <= 800; sample++) {
        const point = curve.getPointAt(sample / 800);
        expect(point.y + SPOUT_PIPE_RADIUS).toBeLessThan(SITE_LAYOUT.factory.bounds.maxY - 3.4);
        if (envelopes.some((box) => box.containsPoint(point))) {
          collisions.push(
            `${family}: ${point
              .toArray()
              .map((n) => n.toFixed(2))
              .join(', ')}`
          );
          break;
        }
      }
    }
    expect(collisions).toEqual([]);
  });

  it('anchors the replacement pipe rack to real gallery steel above the service aisles', () => {
    expect(PIPE_SUPPORT_SEGMENTS.beams).toHaveLength(8);
    expect(PIPE_SUPPORT_SEGMENTS.braces).toHaveLength(8);
    const steel = gallery.supports.map((part) => bounds(part).expandByScalar(0.08));
    for (const segment of [...PIPE_SUPPORT_SEGMENTS.beams, ...PIPE_SUPPORT_SEGMENTS.braces]) {
      const start = new THREE.Vector3(...segment.start),
        end = new THREE.Vector3(...segment.end);
      expect(steel.some((box) => box.containsPoint(start))).toBe(true);
      expect(Math.min(start.y, end.y)).toBeGreaterThan(6);
      expect(start.distanceTo(end)).toBeGreaterThan(0.3);
      expect(start.distanceTo(end)).toBeLessThan(4.5);
    }
  });

  it('keeps every support clear of the real forklift routes including vehicle width', () => {
    for (const route of Object.values(SITE_LAYOUT.routes.forklifts)) {
      for (let i = 0; i < route.points.length; i++) {
        const a = route.points[i];
        const b = route.points[(i + 1) % route.points.length];
        const corridor = new THREE.Box3()
          .setFromPoints([new THREE.Vector3(a[0], 0, a[2]), new THREE.Vector3(b[0], 4, b[2])])
          .expandByScalar(route.halfWidth);
        for (const part of gallery.supports) {
          expect(corridor.intersectsBox(bounds(part)), route.id).toBe(false);
        }
      }
    }
  });
});

describe('exposed factory roof steelwork', () => {
  const structure = buildFactoryRoofStructure();
  const parts = [...structure.frames, ...structure.purlins, ...structure.glazingBars];
  const transform = (part: (typeof parts)[number]) =>
    new THREE.Matrix4().compose(
      new THREE.Vector3(...part.position),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...(part.rotation ?? [0, 0, 0]))),
      new THREE.Vector3(...part.scale)
    );

  it('seats four connected frames on the existing wall columns within a bounded part budget', () => {
    expect(parts.length).toBeLessThan(190);
    expect(structure.purlins).toHaveLength(6);
    expect(structure.glazingBars).toHaveLength(24);
    const seats = structure.frames.filter((part) => part.scale[1] === 0.1);
    expect(seats).toHaveLength(8);
    for (const x of [
      -SITE_LAYOUT.factory.floor.width / 2 + 0.45,
      SITE_LAYOUT.factory.floor.width / 2 - 0.45,
    ]) {
      expect(
        seats.filter((part) => part.position[0] === x).map((part) => part.position[2])
      ).toEqual([-30, -10, 10, 30]);
    }
    for (const part of parts) {
      expect(part.position.every(Number.isFinite)).toBe(true);
      expect(part.scale.every((size) => Number.isFinite(size) && size > 0)).toBe(true);
      const bounds = new THREE.Box3(
        new THREE.Vector3(-0.5, -0.5, -0.5),
        new THREE.Vector3(0.5, 0.5, 0.5)
      ).applyMatrix4(transform(part));
      expect(bounds.min.x).toBeGreaterThan(SITE_LAYOUT.factory.bounds.minX);
      expect(bounds.max.x).toBeLessThan(SITE_LAYOUT.factory.bounds.maxX);
      expect(bounds.min.z).toBeGreaterThanOrEqual(-49.55);
      expect(bounds.max.z).toBeLessThanOrEqual(49.55);
      // Shared datum keeps the real lamps below the structural lower chord.
      expect(bounds.min.y).toBeGreaterThan(SITE_LAYOUT.factory.bounds.maxY - 3.4);
      expect(bounds.max.y).toBeLessThan(SITE_LAYOUT.factory.bounds.maxY + 2.2);
    }
  });

  it('connects the open web to both chords and gives the chords recessed webs', () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = structure.frames.map((part) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.applyMatrix4(transform(part));
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    const chordMeshes = meshes.filter((_, index) =>
      [0.12, 0.46].includes(structure.frames[index].scale[2])
    );
    const hits = (x: number, y: number, z: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, y, z + 2),
        new THREE.Vector3(0, 0, -1),
        0,
        4
      ).intersectObjects(meshes);
    try {
      const uprights = structure.frames.filter(
        (part) => Math.abs((part.rotation?.[2] ?? 0) - Math.PI / 2) < 1e-6
      );
      expect(uprights).toHaveLength(52);
      for (const part of uprights) {
        for (const sign of [-1, 1]) {
          // Probe inside the lap, not exactly on the cap's triangle boundary.
          // A one-ULP transform difference can exclude an edge-only ray hit.
          const end = new THREE.Vector3(sign * (0.5 - 0.01 / part.scale[0]), 0, 0).applyMatrix4(
            transform(part)
          );
          // At an end post the pitched chord's cut is oblique. Move inward
          // across the post face too, keeping this probe inside both solids.
          end.x += end.x < 0 ? 0.01 : -0.01;
          const intersections = hits(end.x, end.y, end.z);
          expect(
            intersections.some((hit) => (chordMeshes as THREE.Object3D[]).includes(hit.object)),
            `joint at ${end.toArray().join(', ')}`
          ).toBe(true);
          expect(
            intersections.some((hit) => hit.object === meshes[structure.frames.indexOf(part)])
          ).toBe(true);
        }
      }
      const lowerY = SITE_LAYOUT.factory.bounds.maxY - 2.9;
      expect(hits(5, lowerY, 10)[0].distance).toBeGreaterThan(
        hits(5, lowerY + 0.27, 10)[0].distance + 0.15
      );
      expect(hits(5, 30.2, 10)).toHaveLength(0);
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });

  it('keeps all nine pane centres in each roof light open through the actual opaque assembly', () => {
    const envelope = buildFactoryRoofEnvelope();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const meshes = [...parts, ...envelope.panels, ...envelope.kerbs].map((part) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.applyMatrix4(transform(part));
      mesh.updateMatrixWorld(true);
      return mesh;
    });
    const hits = (x: number, z: number) =>
      new THREE.Raycaster(
        new THREE.Vector3(x, 60, z),
        new THREE.Vector3(0, -1, 0),
        0,
        40
      ).intersectObjects(meshes);
    try {
      for (const {
        position: [x, , z],
        scale: [width, , depth],
      } of buildFactoryRoofGlazing()) {
        for (const dx of [-width / 3, 0, width / 3]) {
          for (const dz of [-depth / 3, 0, depth / 3]) {
            expect(hits(x + dx, z + dz), `pane at ${x + dx}, ${z + dz}`).toHaveLength(0);
          }
        }
        // Positive controls prove these rays can see the real glazing bars.
        expect(hits(x + width / 6, z).length).toBeGreaterThan(0);
        expect(hits(x, z + depth / 6).length).toBeGreaterThan(0);
      }
    } finally {
      geometry.dispose();
      material.dispose();
    }
  });
});

it('keeps ceiling fixtures clear of every actual pneumatic and finished-product route', () => {
  const groups = [
    [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
    [
      SITE_LAYOUT.machines.rollerMills,
      MachineType.ROLLER_MILL,
      SITE_LAYOUT.machineDimensions.rollerMill,
    ],
    [SITE_LAYOUT.machines.sifters, MachineType.PLANSIFTER, SITE_LAYOUT.machineDimensions.sifter],
    [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
  ] as const;
  const machines = groups.flatMap(([anchors, type, size]) =>
    anchors.map((anchor) => ({ ...anchor, type, size: [...size] }))
  ) as unknown as MachineData[];
  const fixtures = buildCeilingFixtures();
  expect(fixtures.housings).toHaveLength(15);
  expect(fixtures.emitters).toHaveLength(15);
  const envelopes = [...fixtures.housings, ...fixtures.emitters].map((part) =>
    new THREE.Box3()
      .setFromCenterAndSize(new THREE.Vector3(...part.position), new THREE.Vector3(...part.scale))
      .expandByScalar(SPOUT_PIPE_RADIUS)
  );
  const routes = buildSpoutRoutes(machines);
  expect(routes).toHaveLength(11);
  // CurvePath.getPoints samples only LineCurve3 endpoints, regardless of the
  // division count. Spaced samples exercise the actual straight pipe spans.
  const samples = routes.flatMap((route) => route.curve.getSpacedPoints(3200));
  const rejectedRow = fixtures.housings
    .filter((part) => part.position[2] === 22)
    .map((part) =>
      new THREE.Box3()
        .setFromCenterAndSize(
          new THREE.Vector3(part.position[0], part.position[1], 18),
          new THREE.Vector3(...part.scale)
        )
        .expandByScalar(SPOUT_PIPE_RADIUS)
    );
  expect(samples.some((point) => rejectedRow.some((box) => box.containsPoint(point)))).toBe(true);
  for (const route of routes) {
    for (const point of route.curve.getSpacedPoints(3200))
      expect(
        envelopes.some((box) => box.containsPoint(point)),
        `${route.family}: ${point.toArray()}`
      ).toBe(false);
  }
});

describe('process pads', () => {
  /**
   * The silo pad is a 16 x 66 m instance of the shared unit box. A UV map on it
   * stretches 12:1, so the concrete tile's joint lines became 0.33 m planks and
   * its noise became grain: the judge read it as timber decking. The pads now
   * take no UV map and no unit-box normal atlas; their concrete is the slab
   * term in OBJECT space, so the joints are laid from each pad's own centre.
   */
  it('finishes the pads in object-space slabs, with no UV-stretched map or atlas', async () => {
    const module = await import('./OptimizedFactoryInfrastructure');
    const pad = module.PROCESS_PAD_MATERIAL as THREE.MeshStandardMaterial;
    expect(pad.map).toBeNull();
    expect(pad.roughnessMap).toBeNull();
    const uniforms = pad.userData.millosWorldSurface as {
      uSurfSlab: { value: THREE.Vector4 };
      uSurfSpan: { value: THREE.Vector4 };
    };
    expect(uniforms.uSurfSpan.value.w).toBe(1);
    const pitch = uniforms.uSurfSlab.value.x;
    expect(pitch).toBeGreaterThanOrEqual(3);
    expect(pitch).toBeLessThanOrEqual(6);
    // Joints from the centre land on the silo pad's long edges.
    const [width] = SITE_LAYOUT.bulkStorage.siloPad.size;
    expect(((width / 2) % pitch) / pitch).toBeCloseTo(0, 6);
    const source = readFileSync(
      'src/components/infrastructure/OptimizedFactoryInfrastructure.tsx',
      'utf8'
    );
    expect(source).toMatch(
      /<InstancedBoxes\s+instances=\{plinths\}\s+material=\{MATERIALS\.plinth\}[^>]*generatedSurface=\{false\}/
    );
  });
});

describe('aisle safety barriers', () => {
  /**
   * The 1.1 m upstands either side of the milling and packing aisles shared the
   * bollards' hi-viz paint and its `signage` finish, the lightest in the set,
   * so the one nearest the milling camera filled its foreground with flat,
   * saturated, constant yellow. They are painted concrete: worn paint, chipped
   * arrises showing the concrete, scuffed at the foot.
   */
  it('are worn painted concrete, not the bollards hi-viz', async () => {
    const module = await import('./OptimizedFactoryInfrastructure');
    const barrier = module.SAFETY_BARRIER_MATERIAL as THREE.MeshStandardMaterial;
    expect(barrier.name).not.toBe('factory-safety-yellow');
    const hsl = barrier.color.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);
    expect(hsl.s).toBeLessThan(0.6);
    expect(barrier.userData.millosWorldSurfaceProfile).toBe('masonry');
    const mask = (barrier.userData.millosWorldSurface as { uSurfMask: { value: THREE.Vector4 } })
      .uSurfMask.value;
    expect(mask.x).toBeGreaterThanOrEqual(0.3); // grime at the foot
    expect(mask.z).toBeGreaterThanOrEqual(0.2); // chipped arrises
    // Indoors its shaded face sees the slab, not the grass outside.
    const deck = (barrier.userData.millosWorldSurface as { uSurfDeck: { value: THREE.Vector4 } })
      .uSurfDeck.value;
    expect(deck.w).toBeGreaterThanOrEqual(0.8);
    const source = readFileSync(
      'src/components/infrastructure/OptimizedFactoryInfrastructure.tsx',
      'utf8'
    );
    expect(source).toMatch(/instances=\{rails\}\s+material=\{MATERIALS\.safetyBarrier\}/);
  });
});

describe('roof deck liner', () => {
  it('lines the deck underside in a light liner and keeps the exterior coat on top', async () => {
    // At 22:00 the dock end of the hall read black (luma 2.8): the underside
    // carried the exterior coat (#505452, ~0.08 albedo), so the uplight and
    // the slab's bounce had almost nothing to reflect. A steel deck's interior
    // face is a light liner sheet; the exterior keeps its dark coat.
    const { ROOF_PANEL_MATERIALS } = await import('./OptimizedFactoryInfrastructure');
    const box = new THREE.BoxGeometry(1, 1, 1);
    const normals = box.getAttribute('normal');
    const index = box.getIndex()!;
    box.groups.forEach((group) => {
      const normalY = normals.getY(index.getX(group.start));
      const material = ROOF_PANEL_MATERIALS[group.materialIndex ?? 0] as THREE.MeshStandardMaterial;
      if (normalY < -0.5) expect(material.name).toBe('factory-roof-liner');
      else expect(material.name).toBe('factory-roof-deck');
    });
    const luminance = (material: THREE.Material) => {
      const { r, g, b } = (material as THREE.MeshStandardMaterial).color;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    expect(luminance(ROOF_PANEL_MATERIALS[3])).toBeGreaterThan(
      luminance(ROOF_PANEL_MATERIALS[2]) * 2.5
    );
  });

  /**
   * At noon the judge read the ceiling as flat olive: measured sRGB (30, 45, 38)
   * on open deck in `interior`. The liner was a green-biased grey, and a
   * downward face indoors is lit by the sky rig's LOWER band - the grass and
   * masonry outside - which it cannot see from under a roof. It also had no
   * deck profile: the panel normal on a unit box stretched with every panel.
   */
  it('is a neutral grey profiled deck lit by the hall, not the grass', async () => {
    const { ROOF_PANEL_MATERIALS } = await import('./OptimizedFactoryInfrastructure');
    const liner = ROOF_PANEL_MATERIALS[3] as THREE.MeshStandardMaterial;
    const { r, g, b } = liner.color;
    const mean = (r + g + b) / 3;
    expect((Math.max(r, g, b) - Math.min(r, g, b)) / mean).toBeLessThan(0.03);
    expect(g).toBeLessThanOrEqual(r);
    const uniforms = liner.userData.millosWorldSurface as { uSurfDeck: { value: THREE.Vector4 } };
    const deck = uniforms.uSurfDeck.value;
    // Trapezoidal deck ribs at a real pitch, running down the slope: the roof
    // halves pitch about Z, so the profile varies along world Z.
    expect(deck.x).toBeGreaterThanOrEqual(0.15);
    expect(deck.x).toBeLessThanOrEqual(0.35);
    expect(deck.y).toBeGreaterThan(0.02);
    expect(deck.z).toBe(1);
    expect(deck.w).toBeGreaterThanOrEqual(0.8);
    // Only the liner: the exterior coat keeps the outside light.
    const roof = ROOF_PANEL_MATERIALS[2] as THREE.MeshStandardMaterial;
    expect(
      (roof.userData.millosWorldSurface as { uSurfDeck: { value: THREE.Vector4 } }).uSurfDeck.value
        .w
    ).toBe(0);
  });
});
