import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { RETAIL_GEOMETRY, STATION_APPLIANCE_SHIFT } from './scenery/StationRetailDetails';
import {
  createPosterStationGeometry,
  STATION_POSTER_PALETTE,
  STATION_POSTER_PLANTERS,
} from './scenery/AuthoredPropTrim';
import {
  STATION_DETAIL_LAYOUT,
  STATION_CANOPY_LIGHTS,
  STATION_DOOR_LIGHT,
  STATION_DETAIL_GEOMETRY,
  STATION_RETAIL,
  writeStationDetailInstances,
  type StationDetailBox,
  createFuelPumpBodyGeometry,
  createPumpIslandGeometry,
} from './GasStationInstanced';

describe('Dead Dino authored signage', () => {
  it('seats shared outward-facing print on both cabinet faces', () => {
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(source).toContain('{[1, -1].map((side) => (');
    expect(source).toContain('position={[0, 7.2, side * 0.18]}');
    expect(source).toContain('side === 1 ? 0 : Math.PI');
    expect(source).toContain('<DeadDinoPylonFace />');
    expect(source).not.toContain('asset="dinoMascot"');
    expect(0.18).toBeGreaterThan(0.3 / 2);
  });
});

describe('forecourt detail envelope', () => {
  it('rounds shared pump and island edges without growing their envelopes', () => {
    for (const [geometry, halfSize] of [
      [createFuelPumpBodyGeometry(), [0.35, 0.9, 0.3]],
      [createPumpIslandGeometry(), [5, 0.1, 1.5]],
    ] as const) {
      geometry.computeBoundingBox();
      expect(geometry.getAttribute('position').count / 3).toBeLessThan(1400);
      for (const [index, axis] of (['x', 'y', 'z'] as const).entries()) {
        expect(geometry.boundingBox!.max[axis]).toBeCloseTo(halfSize[index], 5);
        expect(geometry.boundingBox!.min[axis]).toBeCloseTo(-halfSize[index], 5);
      }
      expect(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite)).toBe(true);
      geometry.dispose();
    }
  });

  it('grounds the apron and faces the shop door out through its opening', () => {
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(source).toContain('position={[0, EXTERIOR_LAYERS.ground, 0]}');
    expect(source).toContain('<mesh position={[-12, 1.2, 5]}>');
  });
});

describe('instanced station finish', () => {
  function instances(details: StationDetailBox[]) {
    const mesh = new THREE.InstancedMesh(
      STATION_DETAIL_GEOMETRY,
      new THREE.MeshBasicMaterial(),
      details.length
    );
    writeStationDetailInstances(mesh, details);
    mesh.updateMatrixWorld(true);
    return mesh;
  }

  function instanceBounds(mesh: THREE.InstancedMesh, index: number) {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return new THREE.Box3()
      .setFromBufferAttribute(
        STATION_DETAIL_GEOMETRY.getAttribute('position') as THREE.BufferAttribute
      )
      .applyMatrix4(matrix);
  }

  function dispose(mesh: THREE.InstancedMesh) {
    mesh.dispose();
    (mesh.material as THREE.Material).dispose();
  }

  it('uses two finite shared-cube batches inside the existing station envelope', () => {
    expect(STATION_DETAIL_LAYOUT.opaque).toHaveLength(170);
    expect(STATION_DETAIL_LAYOUT.emitters).toHaveLength(159);
    for (const layout of [STATION_DETAIL_LAYOUT.opaque, STATION_DETAIL_LAYOUT.emitters]) {
      const mesh = instances(layout);
      expect(Array.from(mesh.instanceMatrix.array).every(Number.isFinite)).toBe(true);
      expect(mesh.instanceColor?.count).toBe(layout.length);
      expect(mesh.boundingBox!.min.x).toBeGreaterThanOrEqual(-16.50001);
      expect(mesh.boundingBox!.max.x).toBeLessThan(10);
      expect(mesh.boundingBox!.min.z).toBeGreaterThan(-7);
      expect(mesh.boundingBox!.max.z).toBeLessThan(7);
      expect(mesh.boundingBox!.min.y).toBeGreaterThanOrEqual(0);
      expect(mesh.boundingBox!.max.y).toBeLessThanOrEqual(5.55001);
      expect(Number.isFinite(mesh.boundingSphere!.radius)).toBe(true);
      layout.forEach((detail, index) => {
        const size = instanceBounds(mesh, index).getSize(new THREE.Vector3());
        size.toArray().forEach((value, axis) => expect(value).toBeCloseTo(detail.size[axis], 5));
      });
      dispose(mesh);
    }
  });

  it('keeps open gutters attached to the roof edge and both downpipes clear of entrances', () => {
    const mesh = instances(STATION_DETAIL_LAYOUT.opaque);
    const parts = (part: string) =>
      STATION_DETAIL_LAYOUT.opaque.flatMap((detail, index) =>
        detail.part === part ? [instanceBounds(mesh, index)] : []
      );
    const pipes = parts('roof-downpipe');
    expect(pipes).toHaveLength(2);
    for (const [i, pipe] of pipes.entries()) {
      const side = i === 0 ? -1 : 1;
      const floor = parts('roof-gutter-bottom')[i];
      expect(pipe.intersectsBox(floor)).toBe(true);
      expect(floor.min.y).toBeLessThan(5.31); // Existing cap's lower edge.
      expect(Math.min(Math.abs(floor.min.z), Math.abs(floor.max.z))).toBeLessThan(5.5);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(-12, 6, side * 5.56),
        new THREE.Vector3(0, -1, 0)
      );
      const hit = ray.intersectObject(mesh, false)[0];
      expect(STATION_DETAIL_LAYOUT.opaque[hit.instanceId!].part).toBe('roof-gutter-bottom');
      expect(hit.point.y).toBeCloseTo(5.24, 5);
      expect(pipe.intersectsBox(parts('roof-pipe-shoe')[i])).toBe(true);
      expect(parts('roof-pipe-shoe')[i].intersectsBox(parts('roof-pipe-outlet')[i])).toBe(true);
      expect(pipe.max.x).toBeLessThan(-15.7); // Rear corner, far from the -12m door.
    }
    dispose(mesh);
  });

  it('seats both rain outlets above real open drain bars within the original apron', () => {
    const mesh = instances(STATION_DETAIL_LAYOUT.opaque);
    const drains = STATION_DETAIL_LAYOUT.opaque.flatMap((detail, index) =>
      detail.part.startsWith('ground-drain-') ? [instanceBounds(mesh, index)] : []
    );
    expect(drains).toHaveLength(18);
    for (const drain of drains) {
      expect(drain.min.y).toBeCloseTo(0, 6);
      expect(drain.max.y).toBeCloseTo(0.008, 6);
      expect(drain.max.x).toBeLessThan(-15.6);
      expect(Math.max(Math.abs(drain.min.z), Math.abs(drain.max.z))).toBeLessThanOrEqual(6.001);
    }
    for (const side of [-1, 1]) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(-15.86, 0.02, side * 5.65),
        new THREE.Vector3(0, -1, 0)
      );
      const hit = ray.intersectObject(mesh, false)[0];
      expect(STATION_DETAIL_LAYOUT.opaque[hit.instanceId!].part).toBe('ground-drain-bar');
      ray.set(new THREE.Vector3(-15.86, 0.02, side * 5.6875), new THREE.Vector3(0, -1, 0));
      expect(ray.intersectObject(mesh, false)).toHaveLength(0);
    }
    dispose(mesh);
  });

  it('closes the rendered wall around the existing door frame without filling the leaf', () => {
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    const region = source.match(/Right side wall \(with door opening\)([\s\S]*?)Front wall/)![1];
    const material = new THREE.MeshBasicMaterial();
    // Read the actual mounted dimensions, so the old oversized aperture fails
    // here rather than a hand-copied "correct" wall layout passing in isolation.
    const walls = [...region.matchAll(/<GeneratedBoxSurface[\s\S]*?\/>/g)].map(([jsx]) => {
      const prop = (name: string) =>
        jsx
          .match(new RegExp(`${name}=\\{\\[([^\\]]+)\\]\\}`))![1]
          .split(',')
          .map(Number);
      const size = prop('size');
      const wall = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
      wall.position.fromArray(prop('position'));
      wall.updateMatrixWorld(true);
      return wall;
    });
    expect(walls).toHaveLength(3);
    for (const [x, y] of [
      [-0.9, 1.2],
      [0.9, 1.2],
      [0, 2.7],
      [-0.66, 1.2],
      [0.66, 1.2],
    ]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, y, 6), new THREE.Vector3(0, 0, -1));
      expect(ray.intersectObjects(walls)).toHaveLength(1);
    }
    const leaf = new THREE.Box3(
      new THREE.Vector3(-0.6, 0.125, 4.8),
      new THREE.Vector3(0.6, 2.4, 5)
    );
    walls.forEach((wall) => {
      expect(new THREE.Box3().setFromObject(wall).intersectsBox(leaf)).toBe(false);
      wall.geometry.dispose();
    });
    material.dispose();
  });

  it('seats the pull on the retained door and shelters its head without blocking the leaf', () => {
    const mesh = instances(STATION_DETAIL_LAYOUT.opaque);
    const leaf = new THREE.Box3(
      new THREE.Vector3(-12.6, 0, 4.99),
      new THREE.Vector3(-11.4, 2.4, 5.001)
    );
    STATION_DETAIL_LAYOUT.opaque.forEach((detail, index) => {
      if (detail.part.startsWith('door-hood') || detail.part === 'door-rain-hood') {
        expect(instanceBounds(mesh, index).intersectsBox(leaf)).toBe(false);
      }
      // Seated through the double-sided leaf by 5 mm rather than flush on it,
      // where the mount's back face and the leaf shared a plane.
      if (detail.part === 'door-pull-mount')
        expect(instanceBounds(mesh, index).min.z).toBeCloseTo(4.995, 5);
    });
    const ray = new THREE.Raycaster(
      new THREE.Vector3(-11.58, 1.13, 6),
      new THREE.Vector3(0, 0, -1)
    );
    const hit = ray.intersectObject(mesh, false)[0];
    expect(STATION_DETAIL_LAYOUT.opaque[hit.instanceId!].part).toBe('door-pull');
    // The leaf ends at 2.4m. Seal the old 60mm opening below the header too.
    for (const y of [2.4, 2.43, 2.48]) {
      ray.set(new THREE.Vector3(-12, y, 6), new THREE.Vector3(0, 0, -1));
      const head = ray.intersectObject(mesh, false)[0];
      expect(STATION_DETAIL_LAYOUT.opaque[head.instanceId!].part).toBe('door-head');
    }
    dispose(mesh);
  });

  it('seats the shielded porch lens under its hood and limits the actual downlight reach', () => {
    const trims = instances(STATION_DETAIL_LAYOUT.opaque);
    const lenses = instances(STATION_DETAIL_LAYOUT.emitters);
    const index = STATION_DETAIL_LAYOUT.emitters.findIndex(
      (detail) => detail.part === 'door-lamp-lens'
    );
    const housing = instanceBounds(
      trims,
      STATION_DETAIL_LAYOUT.opaque.findIndex((detail) => detail.part === 'door-lamp-housing')
    );
    const lens = instanceBounds(lenses, index);
    expect(lens.intersectsBox(housing)).toBe(true);
    expect(lens.min.y).toBeGreaterThan(2.52); // Above the fully sealed door head.
    expect(housing.max.y).toBeCloseTo(2.64, 5); // Actual rain-hood underside.
    expect(STATION_DOOR_LIGHT.position[1]).toBeLessThan(lens.min.y);
    expect(STATION_DOOR_LIGHT.distance).toBe(3.5);
    const ray = new THREE.Raycaster(new THREE.Vector3(-12, 2.5, 5.31), new THREE.Vector3(0, 1, 0));
    const hit = ray.intersectObjects([trims, lenses], false)[0];
    expect(hit.object).toBe(lenses);
    expect(hit.instanceId).toBe(index);
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(source).toContain(
      '<ExteriorDownlight name="station-door-light" {...STATION_DOOR_LIGHT} />'
    );
    dispose(trims);
    dispose(lenses);
  });

  it('seats all six lamp lenses in housings and exposes their downward faces', () => {
    const trims = instances(STATION_DETAIL_LAYOUT.opaque);
    const lenses = instances(STATION_DETAIL_LAYOUT.emitters);
    const ray = new THREE.Raycaster();
    const lampIds = STATION_DETAIL_LAYOUT.emitters.flatMap((detail, index) =>
      detail.part === 'soffit-lens' ? [index] : []
    );
    expect(lampIds).toHaveLength(6);
    for (const index of lampIds) {
      const lens = STATION_DETAIL_LAYOUT.emitters[index];
      const housingId = STATION_DETAIL_LAYOUT.opaque.findIndex(
        (detail) =>
          detail.part === 'soffit-housing' &&
          detail.position[0] === lens.position[0] &&
          detail.position[2] === lens.position[2]
      );
      const housing = instanceBounds(trims, housingId);
      const bounds = instanceBounds(lenses, index);
      expect(bounds.intersectsBox(housing)).toBe(true);
      expect(bounds.min.y).toBeLessThan(housing.min.y - 0.015);
      expect(housing.max.y).toBeGreaterThan(4.4);
      ray.set(new THREE.Vector3(lens.position[0], 3, lens.position[2]), new THREE.Vector3(0, 1, 0));
      const hit = ray.intersectObjects([trims, lenses], false)[0];
      expect(hit.object).toBe(lenses);
      expect(hit.instanceId).toBe(index);
    }
    dispose(trims);
    dispose(lenses);
  });

  it('keeps pump face trim above the nozzle holders and readouts inside their bezels', () => {
    const trims = instances(STATION_DETAIL_LAYOUT.opaque);
    const lenses = instances(STATION_DETAIL_LAYOUT.emitters);
    STATION_DETAIL_LAYOUT.opaque.forEach((detail, index) => {
      if (!detail.part.startsWith('pump-')) return;
      const bounds = instanceBounds(trims, index);
      expect(bounds.min.y).toBeGreaterThan(0.85);
      expect(Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z))).toBeLessThan(1.26);
    });
    for (const x of [-3, 3])
      for (const side of [-1, 1]) {
        const direction = new THREE.Vector3(0, 0, -side);
        const readoutRay = new THREE.Raycaster(new THREE.Vector3(x, 1.245, side * 2), direction);
        const first = readoutRay.intersectObjects([trims, lenses], false)[0];
        expect(first.object).toBe(lenses);
        expect(STATION_DETAIL_LAYOUT.emitters[first.instanceId!].part).toBe('pump-readout');
        const bezelRay = new THREE.Raycaster(new THREE.Vector3(x + 0.17, 1.1, side * 2), direction);
        const bezel = bezelRay.intersectObject(trims, false)[0];
        expect(STATION_DETAIL_LAYOUT.opaque[bezel.instanceId!].part).toBe('pump-bezel');
        expect(Math.abs(bezel.point.z)).toBeGreaterThan(Math.abs(first.point.z));
      }
    dispose(trims);
    dispose(lenses);
  });

  it('embeds the inset island edge without changing the vehicle or hose clearance', () => {
    const trims = instances(STATION_DETAIL_LAYOUT.opaque);
    const island = new THREE.Mesh(createPumpIslandGeometry(), new THREE.MeshBasicMaterial());
    island.position.y = 0.1;
    island.updateMatrixWorld(true);
    STATION_DETAIL_LAYOUT.opaque.forEach((detail, index) => {
      if (!detail.part.startsWith('island-')) return;
      const bounds = instanceBounds(trims, index);
      expect(bounds.min.x).toBeGreaterThan(-4.9);
      expect(bounds.max.x).toBeLessThan(4.9);
      expect(bounds.min.z).toBeGreaterThan(-1.4);
      expect(bounds.max.z).toBeLessThan(1.4);
      expect(bounds.min.y).toBeLessThan(0.2);
      expect(bounds.max.y).toBeGreaterThan(0.2);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(detail.position[0], 1, detail.position[2]),
        new THREE.Vector3(0, -1, 0)
      );
      const hits = ray.intersectObjects([trims, island], false);
      expect(hits[0].object).toBe(trims);
      expect(hits.find((hit) => hit.object === island)?.point.y).toBeCloseTo(0.2, 5);
    });
    dispose(trims);
    island.geometry.dispose();
    island.material.dispose();
  });

  it('avoids coplanar trim intersections at the bezels, painted corners and soffit grid', () => {
    const mesh = instances(STATION_DETAIL_LAYOUT.opaque);
    const layout = STATION_DETAIL_LAYOUT.opaque;
    for (let i = 0; i < layout.length; i++)
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i];
        const b = layout[j];
        const aa = instanceBounds(mesh, i);
        const bb = instanceBounds(mesh, j);
        if (
          (a.part === 'pump-bezel' && b.part === 'pump-bezel') ||
          (a.part.startsWith('island-') && b.part.startsWith('island-'))
        ) {
          const overlap = aa.clone().intersect(bb).getSize(new THREE.Vector3());
          expect(overlap.x * overlap.y * overlap.z).toBeLessThan(1e-8);
        }
        if (a.part === 'soffit-rail' && b.part === 'soffit-crossrail' && aa.intersectsBox(bb)) {
          expect(Math.abs(aa.min.y - bb.min.y)).toBeGreaterThan(0.005);
        }
        if (a.part === 'shop-mullion' && b.part === 'shop-transom' && aa.intersectsBox(bb)) {
          expect(Math.abs(aa.max.x - bb.max.x)).toBeGreaterThan(0.001);
        }
      }
    dispose(mesh);
  });

  it('makes recessed cap joints while retaining both roof height and footprint envelopes', () => {
    const mesh = instances(STATION_DETAIL_LAYOUT.opaque);
    STATION_DETAIL_LAYOUT.opaque.forEach((detail, index) => {
      if (!detail.part.includes('-cap')) return;
      const bounds = instanceBounds(mesh, index);
      if (detail.part.startsWith('canopy-cap')) {
        expect(bounds.max.y).toBeLessThanOrEqual(5.20001);
        expect(bounds.min.x).toBeGreaterThan(-8.25);
        expect(bounds.max.x).toBeLessThan(8.25);
        expect(bounds.min.z).toBeGreaterThan(-6.25);
        expect(bounds.max.z).toBeLessThan(6.25);
      } else {
        expect(bounds.max.y).toBeLessThanOrEqual(5.55001);
        expect(bounds.min.x).toBeGreaterThanOrEqual(-16.50001);
        expect(bounds.max.x).toBeLessThanOrEqual(-7.49999);
        expect(bounds.min.z).toBeGreaterThanOrEqual(-5.50001);
        expect(bounds.max.z).toBeLessThanOrEqual(5.50001);
      }
    });
    for (const [x, y, outsideZ, part] of [[-13.5, 5.43, 6, 'shop-cap']] as const) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, y, outsideZ),
        new THREE.Vector3(0, 0, -1)
      );
      const seam = ray.intersectObject(mesh, false)[0];
      expect(STATION_DETAIL_LAYOUT.opaque[seam.instanceId!].part).toBe(`${part}-joint-backing`);
      ray.ray.origin.x += 0.1;
      const panel = ray.intersectObject(mesh, false)[0];
      expect(STATION_DETAIL_LAYOUT.opaque[panel.instanceId!].part).toBe(part);
      expect(panel.point.z - seam.point.z).toBeCloseTo(0.016, 5);
    }
    // The reduced pan stays inside the existing shop cap envelope, with the
    // same old bottom. The rendered call site must use this seated arrangement.
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(source).toContain('size={[8.88, 0.44, 10.88]}');
    expect(source).toContain('position={[-12, 5.27, 0]}');
    dispose(mesh);
  });

  it('renders two readable 0.00 rows on all four faces without adding text draws', () => {
    const mesh = instances(STATION_DETAIL_LAYOUT.emitters);
    expect(
      STATION_DETAIL_LAYOUT.emitters.filter((detail) => detail.part === 'pump-readout')
    ).toHaveLength(152);
    for (const x of [-3, 3])
      for (const side of [-1, 1])
        for (const y of [1.205, 1.08]) {
          const hit = (dx: number, dy: number) => {
            const ray = new THREE.Raycaster(
              new THREE.Vector3(x + side * dx, y + dy, side * 2),
              new THREE.Vector3(0, 0, -side),
              0,
              1 // Isolate this face; the opaque pump body blocks the opposite display in-scene.
            );
            return ray.intersectObject(mesh, false)[0];
          };
          for (const digitX of [-0.085, 0, 0.07]) {
            for (const dy of [-0.04, 0.04]) expect(hit(digitX, dy)).toBeDefined();
            for (const dx of [-0.02, 0.02])
              for (const dy of [-0.02, 0.02]) expect(hit(digitX + dx, dy)).toBeDefined();
            // A real zero has an open centre, unlike the old solid readout bar.
            expect(hit(digitX, 0)).toBeUndefined();
          }
          expect(hit(-0.048, -0.038)).toBeDefined();
          expect(hit(0.048, -0.038)).toBeUndefined();
        }
    dispose(mesh);
  });

  it('grounds the kickplate and seats gaskets in both glazing and mullions, clear of the door', () => {
    const layout = STATION_DETAIL_LAYOUT.opaque;
    const mesh = instances(layout);
    const kickplate = instanceBounds(
      mesh,
      layout.findIndex((detail) => detail.part === 'shop-kickplate')
    );
    expect(kickplate.min.y).toBeCloseTo(0, 6);
    expect(kickplate.max.y).toBeCloseTo(0.32, 6);
    const doorOpening = new THREE.Box3(
      new THREE.Vector3(-12.6, 0.125, 4.9),
      new THREE.Vector3(-11.4, 2.4, 5.1)
    );
    expect(kickplate.intersectsBox(doorOpening)).toBe(false);
    const mullions = layout.flatMap((detail, index) =>
      detail.part === 'shop-mullion' ? [instanceBounds(mesh, index)] : []
    );
    layout.forEach((detail, index) => {
      if (detail.part !== 'shop-glazing-gasket') return;
      const bounds = instanceBounds(mesh, index);
      expect(bounds.min.x).toBeLessThan(-8);
      expect(bounds.max.x).toBeGreaterThan(-8);
      expect(bounds.min.y).toBeCloseTo(kickplate.max.y, 5);
      expect(mullions.some((mullion) => mullion.intersectsBox(bounds))).toBe(true);
      expect(bounds.intersectsBox(doorOpening)).toBe(false);
    });
    dispose(mesh);
  });

  it('attaches shop framing to glazing while preserving the door opening', () => {
    const trims = instances(STATION_DETAIL_LAYOUT.opaque);
    STATION_DETAIL_LAYOUT.opaque.forEach((detail, index) => {
      const bounds = instanceBounds(trims, index);
      if (detail.part.startsWith('shop-') && !detail.part.startsWith('shop-cap')) {
        expect(bounds.min.x).toBeLessThan(-8);
        expect(bounds.max.x).toBeGreaterThan(-8);
        expect(bounds.max.y).toBeLessThan(4.4);
      }
      if (detail.part === 'door-jamb') {
        expect(bounds.max.x < -12.6 || bounds.min.x > -11.4).toBe(true);
        expect(bounds.min.z).toBeLessThan(5);
        expect(bounds.max.z).toBeGreaterThan(5);
      }
    });
    dispose(trims);
  });
});

describe('station retail contents and sightlines', () => {
  async function deliveredBody(slug: string) {
    const doc = await new NodeIO().readBinary(
      new Uint8Array(readFileSync(`public/models/world/${slug}.glb`))
    );
    const group = new THREE.Group();
    for (const node of doc.getRoot().listNodes()) {
      for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          'position',
          new THREE.BufferAttribute(
            new Float32Array(primitive.getAttribute('POSITION')!.getArray()!),
            3
          )
        );
        geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
        geometry.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
        mesh.name = 'body';
        group.add(mesh);
      }
    }
    group.updateMatrixWorld(true);
    return group;
  }
  function dispose(group: THREE.Group) {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        (object.material as THREE.Material).dispose();
      }
    });
  }

  it('reproduces the opaque fridge hiding its bottles, then clears every existing bottle row', async () => {
    const group = await deliveredBody('station-drinks-cabinet');
    const ray = new THREE.Raycaster(new THREE.Vector3(0.4, 0.6, 1), new THREE.Vector3(0, 0, -1));
    expect(ray.intersectObject(group)[0].point.z).toBeGreaterThan(0.3);
    group.position.fromArray(STATION_RETAIL.cabinetLiner.position);
    group.scale.fromArray(STATION_RETAIL.cabinetLiner.scale);
    group.updateMatrixWorld(true);
    for (const x of [-1.2, -0.4, 0.4, 1.2]) {
      for (const y of [0.6, 1.5, 2.4]) {
        ray.ray.origin.set(x, y, 1);
        // Bottles occupy z=0..0.2. The liner must be entirely behind them.
        expect(ray.intersectObject(group)[0].point.z).toBeLessThan(-0.3);
      }
    }
    const shelves = STATION_DETAIL_LAYOUT.opaque.filter(
      (part) => part.part === 'retail-fridge-shelf'
    );
    expect(shelves).toHaveLength(3);
    shelves.forEach((shelf, i) =>
      expect(shelf.position[1] + shelf.size[1] / 2).toBeCloseTo([0.4, 1.3, 2.2][i], 6)
    );
    dispose(group);
  });

  it('reproduces buried slush hoppers and seats their bases above the reduced pedestal', async () => {
    const group = await deliveredBody('station-slushie-machine');
    expect(new THREE.Box3().setFromObject(group).max.y).toBeGreaterThan(1.6);
    group.scale.fromArray(STATION_RETAIL.slushBaseScale);
    group.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(group).max.y).toBeCloseTo(0.9, 5);
    const ledge = STATION_DETAIL_LAYOUT.opaque.find((part) => part.part === 'retail-slush-ledge')!;
    expect(ledge.position[1] - ledge.size[1] / 2).toBeCloseTo(0.9, 6);
    expect(ledge.position[1] + ledge.size[1] / 2).toBeCloseTo(1.3 - 0.6 / 2, 6);
    dispose(group);
  });

  it('faces the actual register screen toward the customer without entering its body', async () => {
    const body = await deliveredBody('station-register');
    body.position.fromArray(STATION_RETAIL.registerBody.position);
    body.scale.fromArray(STATION_RETAIL.registerBody.scale);
    body.updateMatrixWorld(true);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2), new THREE.MeshBasicMaterial());
    screen.name = 'screen';
    screen.position.fromArray(STATION_RETAIL.registerScreen.position);
    screen.rotation.set(0, 0, 0.2);
    screen.updateMatrixWorld(true);
    const ray = new THREE.Raycaster(new THREE.Vector3(2, 1.235, 0), new THREE.Vector3(-1, 0, 0));
    expect(ray.intersectObjects([body, screen])[0].object.name).toBe('body');
    screen.rotation.set(...STATION_RETAIL.registerScreen.rotation);
    screen.updateMatrixWorld(true);
    expect(ray.intersectObjects([body, screen])[0].object).toBe(screen);
    const source = readFileSync(resolve('src/components/GasStationInstanced.tsx'), 'utf8');
    expect(source).toContain('{...STATION_RETAIL.registerScreen}');
    expect(source).toContain('{...STATION_RETAIL.cabinetLiner}');
    expect(source).toContain('scale={STATION_RETAIL.slushBaseScale}');
    screen.geometry.dispose();
    screen.material.dispose();
    dispose(body);
  });

  it('slopes the delivered till deck and keeps the authored keys seated on it', async () => {
    const body = await deliveredBody('station-register');
    body.position.fromArray(STATION_RETAIL.registerBody.position);
    body.scale.fromArray(STATION_RETAIL.registerBody.scale);
    body.updateMatrixWorld(true);
    for (const x of [-0.14, -0.09, -0.04]) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, 2, 0),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(body)[0];
      expect(hit.point.y).toBeCloseTo(1.2825 + x * 0.27, 5);
    }
    dispose(body);
  });

  it('replaces the solid coffee cup with a recessed, folded-top housing', async () => {
    const body = await deliveredBody('station-coffee-machine');
    const hit = (y: number) =>
      new THREE.Raycaster(new THREE.Vector3(1, y, 0), new THREE.Vector3(-1, 0, 0)).intersectObject(
        body
      )[0].point.x;
    expect(hit(0.7)).toBeCloseTo(0.33, 4);
    expect(hit(1.5)).toBeCloseTo(0.4, 4);
    expect(hit(2.19)).toBeLessThan(0.38);
    expect(new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3()).toArray()).toEqual([
      expect.closeTo(0.8, 4),
      expect.closeTo(2.2, 4),
      expect.closeTo(0.8, 4),
    ]);
    dispose(body);
  });

  // Colour-aware coplanar sweep (2026-10-20). Shop-interior groups sit at
  // station x -12; these are their placements in station coordinates.
  const SHOP_X = -12;
  const partBox = (part: StationDetailBox) =>
    new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(...part.position),
      new THREE.Vector3(...part.size)
    );
  const placed = async (slug: string, position: number[], scale = [1, 1, 1]) => {
    const body = await deliveredBody(slug);
    body.scale.fromArray(scale);
    body.position.set(SHOP_X + position[0], position[1], position[2]);
    body.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(body);
    dispose(body);
    return box;
  };
  /** Largest separating gap between two boxes along any axis (negative = overlap). */
  const gap = (a: THREE.Box3, b: THREE.Box3) =>
    Math.max(
      ...[0, 1, 2].map((k) =>
        Math.max(
          b.min.getComponent(k) - a.max.getComponent(k),
          a.min.getComponent(k) - b.max.getComponent(k)
        )
      )
    );

  it('stands the drinks-cabinet frame proud of the delivered liner it encloses', async () => {
    // Liner sides and top lay on the frame's outer faces (x -14/-10, y 3).
    const liner = await placed(
      'station-drinks-cabinet',
      [
        0 + STATION_RETAIL.cabinetLiner.position[0],
        0,
        -4 + STATION_RETAIL.cabinetLiner.position[2],
      ],
      STATION_RETAIL.cabinetLiner.scale
    );
    const frame = STATION_DETAIL_LAYOUT.opaque.filter(
      (part) => part.part === 'retail-fridge-side' || part.part === 'retail-fridge-cap'
    );
    const outer = frame.map(partBox).reduce((all, box) => all.union(box), new THREE.Box3());
    expect(liner.min.x - outer.min.x).toBeGreaterThanOrEqual(0.01);
    expect(outer.max.x - liner.max.x).toBeGreaterThanOrEqual(0.01);
    expect(outer.max.y - liner.max.y).toBeGreaterThanOrEqual(0.01);
  });

  it('keeps the coffee machine out of the drinks cabinet beside it', async () => {
    // The machine's back corner stood 40 x 30 cm inside the cabinet; the top
    // shelf's end met its top at 2.2 m.
    const coffee = await placed('station-coffee-machine', [
      2 + STATION_APPLIANCE_SHIFT.coffee,
      0,
      -3.5,
    ]);
    for (const part of STATION_DETAIL_LAYOUT.opaque.filter((p) =>
      p.part.startsWith('retail-fridge')
    ))
      expect(gap(coffee, partBox(part)), part.part).toBeGreaterThanOrEqual(0.01);
  });

  it('keeps the slush machine out of the counter end beside it', async () => {
    const slush = await placed(
      'station-slushie-machine',
      [2 + STATION_APPLIANCE_SHIFT.slush, 0, -2],
      STATION_RETAIL.slushBaseScale
    );
    const counter = await placed('station-counter', [3, 0, -1]);
    expect(gap(slush, counter)).toBeGreaterThanOrEqual(0.01);
  });

  it('shares no same-facing face between station detail boxes of different colour', () => {
    // The sweep's instance colours exposed 7.5 m2 of roof-cap joint backing
    // flush with the cap panels' inner faces, the rain hood ends on its edge
    // strips, gutter lips on the cap ends and the fridge side tops on the liner.
    const boxes = STATION_DETAIL_LAYOUT.opaque.map((part) => ({ part, box: partBox(part) }));
    const hits: string[] = [];
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.part.color === b.part.color) continue;
        for (const axis of [0, 1, 2]) {
          const [u, v] = [0, 1, 2].filter((k) => k !== axis);
          for (const end of ['min', 'max'] as const) {
            if (Math.abs(a.box[end].getComponent(axis) - b.box[end].getComponent(axis)) > 1e-6)
              continue;
            const overlap = (k: number) =>
              Math.min(a.box.max.getComponent(k), b.box.max.getComponent(k)) -
              Math.max(a.box.min.getComponent(k), b.box.min.getComponent(k));
            if (overlap(u) > 1e-6 && overlap(v) > 1e-6)
              hits.push(`${a.part.part} / ${b.part.part} axis ${axis} ${end}`);
          }
        }
      }
    expect(hits).toEqual([]);
  });

  it('keeps the drinks-cabinet frame sides above the liner top too', async () => {
    const liner = await placed(
      'station-drinks-cabinet',
      [STATION_RETAIL.cabinetLiner.position[0], 0, -4 + STATION_RETAIL.cabinetLiner.position[2]],
      STATION_RETAIL.cabinetLiner.scale
    );
    for (const side of STATION_DETAIL_LAYOUT.opaque.filter((p) => p.part === 'retail-fridge-side'))
      expect(partBox(side).max.y - liner.max.y).toBeGreaterThan(0.0099);
  });

  it('passes the door pull mounts through the door leaf plane', () => {
    // The leaf is a double-sided plane at z 5; the mounts' backs lay on it.
    for (const mount of STATION_DETAIL_LAYOUT.opaque.filter((p) => p.part === 'door-pull-mount'))
      expect(5 - partBox(mount).min.z).toBeGreaterThanOrEqual(0.004);
  });

  it('ends the door threshold and head inside the jambs', () => {
    const jambs = STATION_DETAIL_LAYOUT.opaque.filter((p) => p.part === 'door-jamb').map(partBox);
    const outerMin = Math.min(...jambs.map((box) => box.min.x));
    const outerMax = Math.max(...jambs.map((box) => box.max.x));
    for (const part of STATION_DETAIL_LAYOUT.opaque.filter(
      (p) => p.part === 'door-threshold' || p.part === 'door-head'
    )) {
      const box = partBox(part);
      expect(box.min.x - outerMin, part.part).toBeGreaterThanOrEqual(0.005);
      expect(outerMax - box.max.x, part.part).toBeGreaterThanOrEqual(0.005);
    }
  });

  it('stands the counter working edge proud of the delivered counter top', async () => {
    const counter = await placed('station-counter', [3, 0, -1]);
    const g = RETAIL_GEOMETRY.hardware.index
      ? RETAIL_GEOMETRY.hardware.toNonIndexed()
      : RETAIL_GEOMETRY.hardware;
    const position = g.getAttribute('position');
    const flush: number[][] = [];
    for (let i = 0; i < position.count; i += 3) {
      const ys = [0, 1, 2].map((k) => position.getY(i + k));
      const xs = [0, 1, 2].map((k) => position.getX(i + k));
      const zs = [0, 1, 2].map((k) => position.getZ(i + k));
      if (Math.max(...ys) - Math.min(...ys) > 1e-6) continue;
      if (Math.abs(ys[0] - counter.max.y) > 1e-4) continue;
      if (Math.max(...xs) < counter.min.x || Math.min(...xs) > counter.max.x) continue;
      if (Math.max(...zs) < counter.min.z || Math.min(...zs) > counter.max.z) continue;
      flush.push([xs[0], ys[0], zs[0]]);
    }
    expect(flush).toEqual([]);
  });
});

describe('bounded forecourt lighting', () => {
  it('uses two banks beneath the existing lenses, with no six-light multiplication', () => {
    // SpotLight defaults to y=1. The child must explicitly sit at its group's
    // origin, otherwise the real emitter floats above the authored lens bank.
    const source = readFileSync(resolve('src/components/exterior/ExteriorLighting.tsx'), 'utf8');
    const spotlight = source.match(/<spotLight\b[\s\S]*?\/>/)?.[0];
    expect(spotlight).toContain('position={[0, 0, 0]}');
    expect(STATION_CANOPY_LIGHTS).toHaveLength(2);
    for (const light of STATION_CANOPY_LIGHTS) {
      const matching = STATION_DETAIL_LAYOUT.emitters.filter(
        (lens) => lens.position[1] > 4 && lens.position[2] === light.position[2]
      );
      expect(matching).toHaveLength(3);
      expect(matching.some((lens) => lens.position[0] === light.position[0])).toBe(true);
      expect(Math.abs(light.position[0])).toBeGreaterThan(3);
      expect(light.position[1]).toBeLessThan(matching[0].position[1]);
      // Photometric gain reaches the outer pumps; draw/shadow count is unchanged.
      expect(light.intensity).toBeGreaterThanOrEqual(60);
      expect(light.intensity).toBeLessThanOrEqual(80);
      expect(light.distance).toBeLessThanOrEqual(11.5);
    }
  });
});

describe('poster-matched live station bodies', () => {
  it('rounds the actual loaded canopy corners, retaining envelope, soffit, maps and supports', async () => {
    const document = await new NodeIO().read('public/models/world/station-canopy.glb');
    const node = document.getRoot().listNodes()[0],
      primitive = node.getMesh()!.listPrimitives()[0];
    const source = new THREE.BufferGeometry();
    for (const [attribute, semantic] of [
      ['position', 'POSITION'],
      ['normal', 'NORMAL'],
      ['uv', 'TEXCOORD_0'],
      ['color', 'COLOR_0'],
    ] as const) {
      const accessor = primitive.getAttribute(semantic)!;
      source.setAttribute(
        attribute,
        new THREE.Float32BufferAttribute(accessor.getArray()!, accessor.getElementSize())
      );
    }
    source.setIndex(Array.from(primitive.getIndices()!.getArray()!));
    const sourcePositions = Array.from(source.getAttribute('position').array);
    const result = createPosterStationGeometry(source, 'stationCanopy');
    expect(result).not.toBe(source);
    expect(Array.from(source.getAttribute('position').array)).toEqual(sourcePositions);
    for (const attribute of Object.values(result.attributes))
      expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
    expect(result.getAttribute('position').count).toBeLessThan(5600);
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const oldMesh = new THREE.Mesh(
      source.clone().applyMatrix4(matrix),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
    );
    const newMesh = new THREE.Mesh(result.clone().applyMatrix4(matrix), oldMesh.material);
    const oldBounds = new THREE.Box3().setFromObject(oldMesh),
      newBounds = new THREE.Box3().setFromObject(newMesh);
    expect(oldBounds.min.distanceTo(newBounds.min)).toBeLessThan(1e-5);
    expect(oldBounds.max.distanceTo(newBounds.max)).toBeLessThan(1e-5);
    const corner = new THREE.Raycaster(
      new THREE.Vector3(8.12, 7, 6.12),
      new THREE.Vector3(0, -1, 0)
    );
    expect(corner.intersectObject(oldMesh)).not.toHaveLength(0);
    expect(corner.intersectObject(newMesh)).toHaveLength(0);
    const underside = new THREE.Raycaster(
      new THREE.Vector3(0, 4, 0),
      new THREE.Vector3(0, 1, 0)
    ).intersectObject(newMesh)[0];
    expect(underside.point.y).toBeCloseTo(4.4, 4);
    const c = result.getAttribute('color');
    for (const hex of [
      STATION_POSTER_PALETTE.cream,
      STATION_POSTER_PALETTE.terracotta,
      STATION_POSTER_PALETTE.green,
      STATION_POSTER_PALETTE.column,
    ]) {
      const colour = new THREE.Color(hex);
      let found = false;
      for (let i = 0; i < c.count; i++)
        if (
          Math.abs(c.getX(i) - colour.r) +
            Math.abs(c.getY(i) - colour.g) +
            Math.abs(c.getZ(i) - colour.b) <
          1e-6
        ) {
          found = true;
          break;
        }
      expect(found).toBe(true);
    }
    expect(STATION_DETAIL_LAYOUT.opaque.some((d) => d.part.startsWith('canopy-cap'))).toBe(false);
    const model = readFileSync('src/components/models/GeneratedModel.tsx', 'utf8');
    expect(model).toContain('createPosterStationGeometry(mesh.geometry, asset)');
    expect(model).toContain('geometries.push(geometry)');
    expect(model).toContain('materials.push(material)');
    source.dispose();
    result.dispose();
    oldMesh.geometry.dispose();
    newMesh.geometry.dispose();
    (oldMesh.material as THREE.Material).dispose();
  });

  it('rounds the delivered pump shoulders with seated controls, intact source and projected atlas', async () => {
    const p = (await new NodeIO().read('public/models/world/fuel-pump-shell.glb'))
      .getRoot()
      .listMeshes()[0]
      .listPrimitives()[0];
    const source = new THREE.BufferGeometry();
    for (const [name, semantic] of [
      ['position', 'POSITION'],
      ['normal', 'NORMAL'],
      ['uv', 'TEXCOORD_0'],
      ['color', 'COLOR_0'],
    ] as const) {
      const a = p.getAttribute(semantic)!;
      source.setAttribute(
        name,
        new THREE.Float32BufferAttribute(a.getArray()!, a.getElementSize())
      );
    }
    const result = createPosterStationGeometry(source, 'fuelPumpShell');
    const node = (await new NodeIO().read('public/models/world/fuel-pump-shell.glb'))
      .getRoot()
      .listNodes()[0];
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(result.clone().applyMatrix4(matrix).translate(0, 0.1, 0), material);
    mesh.updateMatrixWorld(true);
    const hit = (x: number, y: number, z: number) =>
      new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(-1, 0, 0)).intersectObject(
        mesh
      )[0];
    expect(hit(1, 1.1, 0).point.x).toBeCloseTo(0.3, 5);
    // Cream stiles' inner faces are .285m, the body must enter them.
    expect(hit(1, 1.1, 0.17).point.x).toBeGreaterThan(0.285);
    // This is the shallow depth roll, with the broad shoulder tested across Z below.
    expect(hit(1, 1.85, 0).point.x).toBeLessThan(0.3);
    expect(hit(1, 1.85, 0.24)).toBeUndefined();
    const bounds = new THREE.Box3().setFromObject(mesh);
    expect(bounds.min.y).toBeCloseTo(0.1, 5);
    expect(bounds.max.y).toBeCloseTo(1.9, 5);
    expect(bounds.max.x).toBeCloseTo(0.35, 5);
    expect(bounds.max.z).toBeCloseTo(0.3, 5);
    // The new red skirt must rise above, rather than z-fight with, the .2m island.
    const skirt = new THREE.Raycaster(
      new THREE.Vector3(0.31, 1, 0),
      new THREE.Vector3(0, -1, 0)
    ).intersectObject(mesh)[0];
    expect(skirt.point.y).toBeCloseTo(0.24, 5);
    for (const name of ['position', 'normal', 'uv', 'color'])
      expect(Array.from(result.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    const uv = result.getAttribute('uv');
    for (const value of uv.array) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    expect(new Set(uv.array).size).toBeGreaterThan(30);
    expect(result.getAttribute('position').count / 3).toBeLessThan(1400);
    expect(source.getAttribute('position').array).toEqual(p.getAttribute('POSITION')!.getArray());
    expect(source.getAttribute('uv').array).toEqual(p.getAttribute('TEXCOORD_0')!.getArray());
    expect(createFuelPumpBodyGeometry().getAttribute('position').count).toBe(
      result.getAttribute('position').count
    );
    mesh.geometry.dispose();
    material.dispose();
    const c = result.getAttribute('color'),
      target = new THREE.Color(STATION_POSTER_PALETTE.terracotta);
    for (let i = 0; i < c.count; i++)
      expect(
        Math.abs(c.getX(i) - target.r) +
          Math.abs(c.getY(i) - target.g) +
          Math.abs(c.getZ(i) - target.b)
      ).toBeLessThan(1e-6);
    source.dispose();
    result.dispose();
  });

  it('grounds the two flowering pots beside the glass, outside columns and the fuel lane', () => {
    STATION_POSTER_PLANTERS.computeBoundingBox();
    const bounds = STATION_POSTER_PLANTERS.boundingBox!;
    expect(bounds.min.y).toBeCloseTo(0.02, 5);
    expect(bounds.max.y).toBeLessThan(1.2);
    expect(bounds.min.x).toBeGreaterThan(-7.9);
    expect(bounds.max.x).toBeLessThan(-6.5);
    expect(bounds.min.z).toBeGreaterThan(-4.6);
    expect(bounds.max.z).toBeLessThan(4.6);
    for (const a of Object.values(STATION_POSTER_PLANTERS.attributes))
      expect(Array.from(a.array).every(Number.isFinite)).toBe(true);
    const source = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
    expect(source).toContain('name="station-poster-flower-pots"');
    expect(source).toContain('geometry={STATION_POSTER_PLANTERS}');
  });
});
