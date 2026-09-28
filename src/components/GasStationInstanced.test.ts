import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import {
  STATION_DETAIL_LAYOUT,
  STATION_CANOPY_LIGHTS,
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
      [createFuelPumpBodyGeometry(), [0.3, 0.8, 0.25]],
      [createPumpIslandGeometry(), [5, 0.1, 1.5]],
    ] as const) {
      geometry.computeBoundingBox();
      expect(geometry.getAttribute('position').count / 3).toBe(108);
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
    expect(STATION_DETAIL_LAYOUT.opaque).toHaveLength(130);
    expect(STATION_DETAIL_LAYOUT.emitters).toHaveLength(158);
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
    for (const [x, y, outsideZ, part] of [
      [0, 5.12, 7, 'canopy-cap'],
      [-13.5, 5.43, 6, 'shop-cap'],
    ] as const) {
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
