import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  AUTHORED_PROP_TRIM,
  AUTHORED_MARKET_GOODS,
  MARKET_TRAY_FLOOR,
  MARKET_GOODS_MATERIAL,
  MARKET_FRUIT_TEXTURES,
  AUTHORED_PROP_TRIM_MATERIALS,
  FOUNTAIN_SETT_TOP,
  FOUNTAIN_SETT_DEPTH_LAYER,
} from './scenery/AuthoredPropTrim';
import { EXTERIOR_LAYERS } from '../constants/renderLayers';
import {
  DUCK_SWIM_DRAFT,
  VILLAGE_GROUND_MATERIAL,
  VILLAGE_GROUND_GEOMETRY,
  VILLAGE_COBBLE_TILE_METRES,
  VILLAGE_BUILDING_FOOTPRINTS,
  VILLAGE_BENCH_POSITIONS,
  VILLAGE_STREET_CORRIDORS,
  VILLAGE_PAVED_AREAS,
  GENERATED_FOUNTAIN_STREAM_PATHS,
  GENERATED_FOUNTAIN_STREAM_GEOMETRY,
  GENERATED_FOUNTAIN_STREAM_MATERIAL,
  TOWN_HALL_LANTERN_GEOMETRY,
  TOWN_HALL_LENS_GEOMETRY,
} from './VillageArea';
import { SITE_LAYOUT, landmarkLocalToWorld } from '../constants/siteLayout';
import { CIVIC_LAMPS, CIVIC_LIGHT_COLOR } from '../constants/civicSquareLighting';

vi.mock('../utils/critterAudio', () => ({ playCritterSound: vi.fn() }));

describe('bounded civic doorway lanterns', () => {
  it('keeps both fittings in two finite shared geometries outside the door and below the cornice', () => {
    for (const geometry of [TOWN_HALL_LANTERN_GEOMETRY, TOWN_HALL_LENS_GEOMETRY]) {
      expect(geometry.groups).toHaveLength(0);
      expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(geometry.getIndex()!.count / 3).toBeLessThan(240);
      geometry.computeBoundingBox();
      const bounds = geometry.boundingBox!;
      expect(bounds.min.y).toBeGreaterThan(3.2);
      expect(bounds.max.y).toBeLessThan(4.1);
      expect(bounds.min.z).toBeGreaterThan(5.04);
      expect(bounds.max.z).toBeLessThan(5.9);
      const positions = geometry.getAttribute('position');
      for (let i = 0; i < positions.count; i++) {
        expect(Math.abs(positions.getX(i))).toBeGreaterThan(1.5);
        expect(Math.abs(positions.getX(i))).toBeLessThan(2.2);
      }
    }
    expect(CIVIC_LAMPS.filter((l) => l.kind === 'wall' && l.id.startsWith('hall-'))).toHaveLength(
      2
    );
  });

  it('seats two bounded amber sources inside the clear aperture, away from opaque metal', () => {
    TOWN_HALL_LENS_GEOMETRY.computeBoundingBox();
    for (const lamp of CIVIC_LAMPS.filter((l) => l.kind === 'wall' && l.id.startsWith('hall-'))) {
      const localZ = 20 - lamp.position[2];
      expect(localZ).toBeGreaterThan(TOWN_HALL_LENS_GEOMETRY.boundingBox!.min.z);
      expect(localZ).toBeLessThan(TOWN_HALL_LENS_GEOMETRY.boundingBox!.max.z);
      const fitting = new THREE.Mesh(TOWN_HALL_LANTERN_GEOMETRY, new THREE.MeshStandardMaterial());
      fitting.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(
        new THREE.Vector3(-lamp.position[0], lamp.position[1], localZ),
        new THREE.Vector3(0, 0, 1),
        0.015,
        0.4
      );
      expect(ray.intersectObject(fitting)).toHaveLength(0);
      expect(lamp.intensity).toBeLessThanOrEqual(20);
      expect(lamp.distance).toBe(9);
    }
    const color = new THREE.Color(CIVIC_LIGHT_COLOR);
    expect(color.r).toBeGreaterThan(color.g);
    expect(color.g).toBeGreaterThan(color.b);
  });
});

describe('authored fountain gravity streams', () => {
  it('uses four finite gravity arcs that land within the existing water annulus', () => {
    expect(GENERATED_FOUNTAIN_STREAM_PATHS).toHaveLength(4);
    for (const curve of GENERATED_FOUNTAIN_STREAM_PATHS) {
      expect(curve.getPoint(0).y).toBeCloseTo(2.531, 5);
      const end = curve.getPoint(1);
      expect(end.y).toBeCloseTo(1.262, 5);
      expect(Math.hypot(end.x, end.z) + 0.08).toBeLessThan(1.28);
      let previous = curve.getPoint(0).y;
      for (let i = 1; i <= 24; i++) {
        const point = curve.getPoint(i / 24);
        expect(point.toArray().every(Number.isFinite)).toBe(true);
        expect(point.y).toBeLessThan(previous);
        previous = point.y;
      }
    }
    const geometry = GENERATED_FOUNTAIN_STREAM_GEOMETRY;
    expect(geometry.getIndex()!.count).toBeLessThan(4000);
    expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
    expect(GENERATED_FOUNTAIN_STREAM_MATERIAL.isMeshStandardMaterial).toBe(true);
    expect(GENERATED_FOUNTAIN_STREAM_MATERIAL.emissive.getHex()).toBe(0);
    expect(GENERATED_FOUNTAIN_STREAM_MATERIAL.depthWrite).toBe(false);
    expect(GENERATED_FOUNTAIN_STREAM_MATERIAL.blending).toBe(THREE.NormalBlending);
  });

  it('seats every runtime arc within a delivered stone mouth', async () => {
    const doc = await new NodeIO().readBinary(
      new Uint8Array(readFileSync('public/models/village/fountain.glb'))
    );
    const meshes: THREE.Mesh[] = [];
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
        meshes.push(
          new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
        );
      }
    }
    try {
      for (const curve of GENERATED_FOUNTAIN_STREAM_PATHS) {
        const start = curve.getPoint(0);
        const above = new THREE.Raycaster(start, new THREE.Vector3(0, 1, 0)).intersectObjects(
          meshes
        )[0];
        const below = new THREE.Raycaster(start, new THREE.Vector3(0, -1, 0)).intersectObjects(
          meshes
        )[0];
        expect(above.distance).toBeGreaterThan(0.019);
        expect(above.distance).toBeLessThan(0.025);
        expect(below.distance).toBeGreaterThan(0.019);
        expect(below.distance).toBeLessThan(0.025);
      }
    } finally {
      meshes.forEach((mesh) => {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
    }
  });
});

describe('village square edge feather', () => {
  it('injects the real material with the inverse authored landmark transform', () => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as THREE.WebGLProgramParametersWithUniforms;
    VILLAGE_GROUND_MATERIAL.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    const inverse = shader.uniforms.uVillageWorldToLocal.value as THREE.Matrix4;
    for (const local of [
      [0, 0, 0],
      [-35, 0, -65],
      [35, 0, 65],
    ] as const) {
      const world = landmarkLocalToWorld(SITE_LAYOUT.landmarks.village, local);
      expect(
        new THREE.Vector3(...world).applyMatrix4(inverse).distanceTo(new THREE.Vector3(...local))
      ).toBeLessThan(1e-9);
    }
    expect(shader.vertexShader).toContain('uniform mat4 uVillageWorldToLocal;');
    expect(shader.vertexShader).toContain('(uVillageWorldToLocal * millosVillageWorldPosition).xz');
    expect(shader.vertexShader).not.toContain('vec2(190.0, 0.0)');
    expect(shader.fragmentShader).toContain('vec2 q = abs(vLocalPos) - vec2(23.0, 53.0)');
    expect(
      shader.uniforms.uVillagePavingRegions.value.map((v: THREE.Vector4) => v.toArray())
    ).toEqual(VILLAGE_PAVED_AREAS.map(({ x, z, halfX, halfZ }) => [x, z, halfX, halfZ]));
    expect(shader.fragmentShader).toContain(
      `uniform vec4 uVillagePavingRegions[${VILLAGE_PAVED_AREAS.length}]`
    );
    expect(shader.fragmentShader).toContain('abs(vLocalPos - region.xy) - region.zw');
    expect(VILLAGE_GROUND_MATERIAL.customProgramCacheKey()).toBe('villageCobble_feather_v4');
  });

  it('uses metre-scaled cobbles on the actual ground geometry', () => {
    const position = VILLAGE_GROUND_GEOMETRY.getAttribute('position');
    const uv = VILLAGE_GROUND_GEOMETRY.getAttribute('uv');
    expect(VILLAGE_COBBLE_TILE_METRES).toBe(6);
    for (let i = 0; i < position.count; i++) {
      expect(uv.getX(i) * VILLAGE_COBBLE_TILE_METRES - 35).toBeCloseTo(position.getX(i), 4);
      expect(uv.getY(i) * VILLAGE_COBBLE_TILE_METRES - 65).toBeCloseTo(position.getY(i), 4);
    }
  });

  it('keeps through streets outside the buildings, well and pond', () => {
    const obstacles = [
      ...VILLAGE_BUILDING_FOOTPRINTS,
      { x: -10, z: -5, halfX: 2.2, halfZ: 2.2 },
      { x: 20, z: 25, halfX: 6, halfZ: 6 },
    ];
    for (const road of VILLAGE_STREET_CORRIDORS) {
      for (const obstacle of obstacles) {
        expect(
          Math.max(
            Math.abs(road.x - obstacle.x) - road.halfX - obstacle.halfX,
            Math.abs(road.z - obstacle.z) - road.halfZ - obstacle.halfZ
          )
        ).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('connects every paved area and leaves at least half the village in grass', () => {
    const areas = VILLAGE_PAVED_AREAS;
    const reached = new Set([0]);
    for (let pass = 0; pass < areas.length; pass++) {
      areas.forEach((a, i) => {
        if (
          [...reached].some((j) => {
            const b = areas[j];
            return (
              Math.abs(a.x - b.x) <= a.halfX + b.halfX && Math.abs(a.z - b.z) <= a.halfZ + b.halfZ
            );
          })
        )
          reached.add(i);
      });
    }
    expect(reached.size).toBe(areas.length);
    let paved = 0;
    for (let x = -34.5; x < 35; x++) {
      for (let z = -64.5; z < 65; z++) {
        if (areas.some((a) => Math.abs(x - a.x) <= a.halfX && Math.abs(z - a.z) <= a.halfZ))
          paved++;
      }
    }
    expect(paved / (70 * 130)).toBeLessThan(0.5);
    expect(paved / (70 * 130)).toBeGreaterThan(0.2);
    for (const b of VILLAGE_BUILDING_FOOTPRINTS.filter((b) => Math.abs(b.x) > 10)) {
      const entranceX = b.x - Math.sign(b.x) * b.halfX;
      expect(
        areas.some((a) => Math.abs(entranceX - a.x) <= a.halfX && Math.abs(b.z - a.z) <= a.halfZ)
      ).toBe(true);
    }
  });
});

describe('measured village and farm construction trim', () => {
  const material = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
  const mesh = (geometry: THREE.BufferGeometry) => new THREE.Mesh(geometry, material);
  const hit = (objects: THREE.Object3D[], origin: number[], direction: number[], far = 5) =>
    new THREE.Raycaster(
      new THREE.Vector3(...origin),
      new THREE.Vector3(...direction),
      0,
      far
    ).intersectObjects(objects)[0];

  it('uses four finite, closed, single-draw geometries within the detail budget', () => {
    const limits = { market: 1000, fountain: 900, fence: 600, trough: 300 };
    for (const [kind, geometry] of Object.entries(AUTHORED_PROP_TRIM)) {
      expect(geometry.groups).toHaveLength(0);
      const p = geometry.getAttribute('position');
      expect(p.count / 3).toBeLessThanOrEqual(limits[kind as keyof typeof limits]);
      expect([...p.array].every(Number.isFinite)).toBe(true);
      expect(geometry.getAttribute('color').count).toBe(p.count);
      const normals = geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i++) {
        expect(Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i))).toBeCloseTo(1, 5);
      }
    }
    for (const [kind, lo, hi] of [
      ['market', [-0.78, 0, -1.4], [0.78, 2.249, 1.4]],
      ['fence', [-0.818, 0, -0.098], [0.818, 1.05, 0.098]],
      ['trough', [-0.75, 0, -0.274], [0.75, 0.542, 0.274]],
    ] as const) {
      const bounds = AUTHORED_PROP_TRIM[kind].boundingBox!;
      for (let axis = 0; axis < 3; axis++) {
        expect(bounds.min.getComponent(axis)).toBeGreaterThanOrEqual(lo[axis] - 1e-7);
        expect(bounds.max.getComponent(axis)).toBeLessThanOrEqual(hi[axis] + 1e-7);
      }
    }
  });

  it('retains ten correctly coloured shallow scallops on both canopy edges', () => {
    const stall = mesh(AUTHORED_PROP_TRIM.market);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 10; i++) {
        const z = 1.4 - (i + 0.5) * 0.28;
        const center = hit([stall], [side, 1.81, z], [-side, 0, 0]);
        expect(center).toBeDefined();
        expect(Math.abs(center.point.x)).toBeCloseTo(0.778, 5);
        const color = new THREE.Color().fromBufferAttribute(
          stall.geometry.getAttribute('color'),
          center.face!.a
        );
        expect(color.getHexString()).toBe(i % 2 ? 'dac99d' : '912d26');
        expect(hit([stall], [side, 1.81, z + 0.135], [-side, 0, 0])).toBeUndefined();
        // The reverse face is real geometry, with back-face culling enabled.
        expect(hit([stall], [0, 1.81, z], [side, 0, 0])).toBeDefined();
      }
    }
  });

  it('keeps one flush sett course around the elliptical foot, with open stone joints', () => {
    const stones = mesh(AUTHORED_PROP_TRIM.fountain);
    expect(FOUNTAIN_SETT_TOP * SITE_LAYOUT.landmarks.village.scale).toBeCloseTo(
      EXTERIOR_LAYERS.ground + 0.002,
      8
    );
    for (let i = 0; i < 36; i++) {
      const middle = ((i + 0.5) / 36) * Math.PI * 2;
      const joint = (i / 36) * Math.PI * 2;
      const position = (a: number) => [1.55 * Math.cos(a), 1, 1.55 * Math.sin(a) * (3.18 / 3.145)];
      expect(hit([stones], position(middle), [0, -1, 0]).point.y).toBeCloseTo(FOUNTAIN_SETT_TOP, 6);
      expect(hit([stones], position(joint), [0, -1, 0])).toBeUndefined();
    }
    expect(hit([stones], [0, 1, 0], [0, -1, 0])).toBeUndefined();
  });

  it('keeps flush setts ahead of the actual biased cobbles at near and far camera depths', () => {
    const original = AUTHORED_PROP_TRIM_MATERIALS.fountain;
    // StaticMeshBatch may clone an opaque material. The far-side material must
    // retain this depth contract, rather than relying on component draw order.
    const setts = original.clone();
    const ground = VILLAGE_GROUND_MATERIAL;
    expect(ground.transparent).toBe(true);
    expect(ground.polygonOffset).toBe(true);
    expect(setts.polygonOffset).toBe(true);
    expect(setts.polygonOffsetFactor).toBe(FOUNTAIN_SETT_DEPTH_LAYER.factor);
    expect(setts.polygonOffsetUnits).toBe(FOUNTAIN_SETT_DEPTH_LAYER.units);
    expect(setts.polygonOffsetFactor).toBeLessThan(ground.polygonOffsetFactor);
    expect(setts.polygonOffsetUnits).toBeLessThan(ground.polygonOffsetUnits);
    expect(setts.transparent).toBe(false);
    expect(setts.depthTest && setts.depthWrite).toBe(true);
    expect(setts.side).toBe(THREE.FrontSide);
    for (const kind of ['market', 'fence', 'trough'] as const) {
      expect(AUTHORED_PROP_TRIM_MATERIALS[kind]).not.toBe(original);
      expect(AUTHORED_PROP_TRIM_MATERIALS[kind].polygonOffset).toBe(false);
    }
    // Analytic 24-bit depth-buffer check, not a substitute for the GPU render.
    // Compare the same screen sample on the sett top and underlying ground.
    for (const distance of [20, 80, 180]) {
      const camera = new THREE.PerspectiveCamera(50, 1.6, 0.5, 300);
      camera.position.set(0, distance * 0.3, distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const project = (p: THREE.Vector3) => {
        const clip = p.clone().project(camera);
        return new THREE.Vector3(clip.x * 800, clip.y * 500, (clip.z + 1) / 2);
      };
      const slope = (y: number) => {
        const a = project(new THREE.Vector3(0, y, 0));
        const b = project(new THREE.Vector3(1, y, 0)).sub(a);
        const c = project(new THREE.Vector3(0, y, 1)).sub(a);
        const determinant = b.x * c.y - c.x * b.y;
        return Math.max(
          Math.abs((b.z * c.y - c.z * b.y) / determinant),
          Math.abs((b.x * c.z - c.x * b.z) / determinant)
        );
      };
      const top = new THREE.Vector3(1.6, FOUNTAIN_SETT_TOP, 1.6);
      const direction = top.clone().sub(camera.position).normalize();
      const under = new THREE.Ray(camera.position, direction).intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -EXTERIOR_LAYERS.ground),
        new THREE.Vector3()
      )!;
      const bias = (m: THREE.Material, y: number) =>
        m.polygonOffsetFactor * slope(y) + m.polygonOffsetUnits / (2 ** 24 - 1);
      const cobbleDepth = project(under).z + bias(ground, EXTERIOR_LAYERS.ground);
      const oldSettDepth = project(top).z;
      // Reproduces the previous material's depth inversion, then its repair.
      expect(cobbleDepth).toBeLessThan(oldSettDepth);
      expect(oldSettDepth + bias(setts, FOUNTAIN_SETT_TOP)).toBeLessThan(cobbleDepth);
    }
    const source = readFileSync('src/components/scenery/AuthoredPropTrim.tsx', 'utf8');
    expect(source).toContain('material={AUTHORED_PROP_TRIM_MATERIALS[kind]}');
    setts.dispose();
  });

  it('seats trims on the actual delivered GLBs, preserving clear trough water and canopy stripes', async () => {
    const require = createRequire(import.meta.url);
    const decoder = await require('draco3dgltf').createDecoderModule({
      wasmBinary: readFileSync(require.resolve('draco3dgltf/draco_decoder_gltf.wasm')),
    });
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': decoder,
      'meshopt.decoder': MeshoptDecoder,
    });
    const assets: Record<string, THREE.Mesh[]> = {};
    for (const id of [
      'village/marketstall',
      'village/fountain',
      'farm/fence',
      'farm/watertrough',
    ]) {
      const doc = await io.readBinary(new Uint8Array(readFileSync(`public/models/${id}.glb`)));
      assets[id] = [];
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
          const object = mesh(geometry);
          object.applyMatrix4(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
          object.updateMatrixWorld();
          assets[id].push(object);
        }
      }
    }
    try {
      const stall = assets['village/marketstall'];
      for (const side of [-1, 1]) {
        expect(hit(stall, [side, 1.855, 1.26], [-side, 0, 0])).toBeDefined();
        expect(hit(stall, [side, 1.81, 1.26], [-side, 0, 0])).toBeUndefined();
        for (const x of [-0.533, 0.533]) {
          // Actual post reaches the knee's lower endpoint, and the upper end
          // meets the underside of the actual counter, not the fallback table.
          expect(hit(stall, [x, 0.57, side * 1.3], [0, 0, -side], 0.2)).toBeDefined();
          const table = hit(stall, [x, 0.81, side * 0.91], [0, 1, 0], 0.05);
          expect(table.point.y).toBeCloseTo(0.82146, 4);
        }
      }
      const fence = assets['farm/fence'];
      const straps = mesh(AUTHORED_PROP_TRIM.fence);
      for (const x of [-0.72, 0.72]) {
        for (const y of [0.28, 0.59, 0.87]) {
          for (const side of [-1, 1]) {
            // Compare off-peg samples on the band face to the source's timber.
            const body = hit(fence, [x, y + 0.026, side], [0, 0, -side]);
            const trim = hit([straps], [x, y + 0.026, side], [0, 0, -side]);
            expect(Math.abs(trim.point.z) - Math.abs(body.point.z)).toBeCloseTo(0.001, 4);
          }
        }
      }
      const trough = assets['farm/watertrough'];
      const roll = mesh(AUTHORED_PROP_TRIM.trough);
      for (const z of [-0.258, 0.258]) {
        const timberTop = hit(trough, [0, 1, z], [0, -1, 0]).point.y;
        // The outer arris is bevelled. The roll must embed below that sloping
        // surface while its crown stays at the original flat rail's height.
        expect(timberTop).toBeCloseTo(0.53887, 4);
        expect(timberTop - 0.518).toBeGreaterThan(0.015);
        expect(hit([roll], [0, 1, z], [0, -1, 0]).point.y).toBeCloseTo(0.542, 5);
      }
      for (const x of [-0.738, 0.738]) {
        expect(hit(trough, [x, 1, 0], [0, -1, 0]).point.y).toBeCloseTo(0.4735, 5);
        expect(hit([roll], [x, 1, 0], [0, -1, 0]).point.y).toBeCloseTo(0.4735, 5);
      }
      expect(hit([roll], [0, 1, 0], [0, -1, 0])).toBeUndefined();
      expect(hit(trough, [0, 1, 0], [0, -1, 0]).point.y).toBeCloseTo(0.427, 5);
      // Ring inner edge overlaps the actual foot, rather than the wider coping.
      expect(hit(assets['village/fountain'], [2, 0.001, 0], [-1, 0, 0]).point.x).toBeCloseTo(
        1.430875,
        4
      );
    } finally {
      Object.values(assets)
        .flat()
        .forEach((object) => object.geometry.dispose());
    }
  }, 60000);

  it('wires the real trims inside the generated bodies and existing placement transforms', () => {
    const village = readFileSync('src/components/VillageArea.tsx', 'utf8');
    const farm = readFileSync('src/components/FarmArea.tsx', 'utf8');
    expect(village).toMatch(
      /<GeneratedModel asset="marketstall" \/>\s*<AuthoredPropTrim kind="market" \/>/
    );
    expect(village).toMatch(
      /<GeneratedModel asset="fountain" \/>\s*<AuthoredPropTrim kind="fountain" \/>/
    );
    expect(farm).toMatch(/<GeneratedModel asset="fence" \/>\s*<AuthoredPropTrim kind="fence" \/>/);
    expect(farm).toMatch(
      /<GeneratedModel asset="watertrough" \/>\s*<AuthoredPropTrim kind="trough" \/>/
    );
    expect(farm).toContain('scale={[step / FENCE_PANEL_LENGTH, 1, 1]}');
    expect(village).toContain('rotation={[0, rotation + instanceYaw(position), 0]}');
  });
});

describe('market trades replace the baked identical produce', () => {
  it('has four finite, distinct stock assemblies inside the delivered trays', () => {
    expect(AUTHORED_MARKET_GOODS).toHaveLength(4);
    const counts = new Set<number>();
    for (const geometry of AUTHORED_MARKET_GOODS) {
      for (const attribute of Object.values(geometry.attributes))
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      const bounds = geometry.boundingBox!;
      expect(bounds.min.y).toBeCloseTo(MARKET_TRAY_FLOOR, 4);
      expect(bounds.max.y).toBeLessThan(1.45);
      expect(bounds.min.x).toBeGreaterThan(-0.48);
      expect(bounds.max.x).toBeLessThan(0.48);
      expect(bounds.min.z).toBeGreaterThan(-1.14);
      expect(bounds.max.z).toBeLessThan(1.14);
      expect(geometry.getAttribute('position').count / 3).toBeLessThan(20000);
      counts.add(geometry.getAttribute('position').count);
    }
    expect(counts.size).toBe(4);
  });
  it('reads empty tray floors and no protruding posts from the real delivered model', async () => {
    const doc = await new NodeIO().readBinary(
      new Uint8Array(readFileSync('public/models/village/marketstall.glb'))
    );
    const objects: THREE.Mesh[] = [];
    for (const node of doc.getRoot().listNodes())
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
        objects.push(
          new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
        );
      }
    const height = (x: number, z: number, y: number) =>
      new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0)).intersectObjects(
        objects
      )[0].point.y;
    try {
      for (const z of [-0.83, 0, 0.83])
        for (const x of [-0.3, 0, 0.3]) expect(height(x, z, 1.5)).toBeCloseTo(MARKET_TRAY_FLOOR, 4);
      for (const x of [-0.54, 0.54])
        for (const z of [-1.17, 1.17]) expect(height(x, z, 3)).toBeLessThan(2.08);
      const source = readFileSync('src/components/VillageArea.tsx', 'utf8');
      expect(source).toContain('<MarketGoods dressing={dressing} />');
      expect(source).not.toContain('const STALL_DRESSINGS');
    } finally {
      for (const mesh of objects) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  });
});

it('submerges the delivered duck feet while retaining its upper body above water', async () => {
  const doc = await new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .readBinary(new Uint8Array(readFileSync('public/models/farm/duck.glb')));
  const heights: number[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const matrix = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    for (const primitive of node.getMesh()?.listPrimitives() ?? []) {
      const p = primitive.getAttribute('POSITION')!;
      for (let i = 0; i < p.getCount(); i++) {
        const v = new THREE.Vector3().fromArray(p.getElement(i, []));
        heights.push(v.applyMatrix4(matrix).y - DUCK_SWIM_DRAFT);
      }
    }
  }
  expect(Math.min(...heights)).toBeCloseTo(-0.15, 3);
  expect(Math.max(...heights)).toBeGreaterThan(0.28);
  const submerged = heights.filter((y) => y < 0).length / heights.length;
  expect(submerged).toBeGreaterThan(0.05);
  expect(submerged).toBeLessThan(0.4);
  const source = readFileSync('src/components/VillageArea.tsx', 'utf8');
  expect(source).toContain('position={[0, -DUCK_SWIM_DRAFT, 0]}');
  expect(source).toContain('position={[0, DUCK_SWIM_DRAFT, 0]}');
});

it('keeps the civic benches clear of the restored broad town hall and all village bodies', () => {
  for (const [i, [x, z]] of VILLAGE_BENCH_POSITIONS.entries()) {
    const halfX = i > 1 ? 0.32 : 0.75;
    const halfZ = i > 1 ? 0.75 : 0.32;
    for (const building of VILLAGE_BUILDING_FOOTPRINTS) {
      expect(
        Math.abs(x - building.x) >= halfX + building.halfX ||
          Math.abs(z - building.z) >= halfZ + building.halfZ
      ).toBe(true);
    }
  }
});

it('maps actual fruit rind in sRGB while preserving non-fruit goods and linear roughness', () => {
  expect(MARKET_GOODS_MATERIAL.map).toBe(MARKET_FRUIT_TEXTURES.colour);
  expect(MARKET_GOODS_MATERIAL.bumpMap).toBe(MARKET_FRUIT_TEXTURES.finish);
  expect(MARKET_FRUIT_TEXTURES.colour.colorSpace).toBe(THREE.SRGBColorSpace);
  expect(MARKET_FRUIT_TEXTURES.finish.colorSpace).toBe(THREE.NoColorSpace);
  expect(MARKET_GOODS_MATERIAL.bumpScale).toBeLessThan(0.003);
  const data = MARKET_FRUIT_TEXTURES.colour.image.data;
  expect(Array.from(data.slice(0, 4))).toEqual([255, 255, 255, 255]);
  expect(new Set(Array.from(data)).size).toBeGreaterThan(20);
  const apples = AUTHORED_MARKET_GOODS[0].getAttribute('uv');
  let rind = 0,
    plain = 0;
  for (let i = 0; i < apples.count; i++) {
    if (apples.getX(i) >= 0.125) rind++;
    if (apples.getX(i) === 0.03125 && apples.getY(i) === 0.03125) plain++;
  }
  expect(rind).toBeGreaterThan(100);
  expect(plain).toBeGreaterThan(100);
});
