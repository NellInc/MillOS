import {
  PondLilies,
  POND_LILY_GEOMETRIES,
  POND_LILY_MATERIAL,
  POND_LILY_SITES,
} from './scenery/PondLilies';
import { duckSwimPose } from '../simulation/creatureMotion';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import {
  AUTHORED_PROP_TRIM,
  AUTHORED_MARKET_GOODS,
  AUTHORED_MARKET_TRIM_VARIANTS,
  MARKET_CANVAS_COLOURS,
  MARKET_TRADE_NAMES,
  MARKET_TRADE_BRANDS,
  MARKET_TRADE_PAINT,
  createMarketCanopyGeometry,
  MARKET_TRAY_FLOOR,
  MARKET_GOODS_MATERIAL,
  MARKET_FRUIT_TEXTURES,
  MARKET_FOOD_TILES,
  AUTHORED_PROP_TRIM_MATERIALS,
  FOUNTAIN_SETT_TOP,
  FOUNTAIN_SETT_DEPTH_LAYER,
} from './scenery/AuthoredPropTrim';
import { EXTERIOR_LAYERS } from '../constants/renderLayers';
import {
  DUCK_SWIM_DRAFT,
  createFountainWaterTextures,
  FOUNTAIN_WATER_TEXTURES,
  FOUNTAIN_BIRD_GEOMETRIES,
  FOUNTAIN_BIRD_MATERIAL,
  FOUNTAIN_BIRD_TOE_CONTACTS,
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
  GENERATED_FOUNTAIN_LANDING_GEOMETRY,
  GENERATED_FOUNTAIN_LANDING_MATERIAL,
  TOWN_HALL_LANTERN_GEOMETRY,
  TOWN_HALL_LENS_GEOMETRY,
} from './VillageArea';
import { SITE_LAYOUT, landmarkLocalToWorld } from '../constants/siteLayout';
import { BUSINESS_BRANDS } from './scenery/HeritageSignage';
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
  it('keeps aerated froth within the basin and lit by the scene', () => {
    const position = GENERATED_FOUNTAIN_LANDING_GEOMETRY.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      expect(Math.hypot(position.getX(i), position.getZ(i))).toBeLessThan(1.28);
      expect(position.getY(i)).toBeCloseTo(1.269, 5);
    }
    expect(GENERATED_FOUNTAIN_LANDING_MATERIAL.emissive.getHex()).toBe(0);
    expect(GENERATED_FOUNTAIN_LANDING_MATERIAL.depthWrite).toBe(false);
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
    } as THREE.WebGLProgramParametersWithUniforms;
    GENERATED_FOUNTAIN_LANDING_MATERIAL.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('bubbleRim');
    expect(shader.fragmentShader).toContain('foamEdge');
    expect(shader.fragmentShader).toContain('#include <lights_fragment_begin>');
  });

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

  it('fits four literal trade names on the delivered central tray face', async () => {
    expect(new Set(MARKET_TRADE_NAMES).size).toBe(4);
    expect(MARKET_TRADE_NAMES).toEqual([
      'Greengrocer',
      'Cheesemonger',
      'Bread & Rolls',
      'Farm Harvest',
    ]);
    const doc = await new NodeIO().read('public/models/village/marketstall.glb');
    const primitive = doc.getRoot().listMeshes()[0].listPrimitives()[0];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(primitive.getAttribute('POSITION')!.getArray()!, 3)
    );
    geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices()!.getArray()!, 1));
    for (const z of [-MARKET_TRADE_PAINT.maxWidth / 2, 0, MARKET_TRADE_PAINT.maxWidth / 2]) {
      const point = hit(
        [mesh(geometry)],
        [1.2, MARKET_TRADE_PAINT.position[1], z],
        [-1, 0, 0]
      ).point;
      expect(point.x).toBeCloseTo(0.5134, 4);
      expect(MARKET_TRADE_PAINT.position[0] - point.x).toBeGreaterThan(0.0008);
      expect(MARKET_TRADE_PAINT.position[0] - point.x).toBeLessThan(0.0012);
    }
    expect(MARKET_TRADE_PAINT.rotation).toEqual([0, Math.PI / 2, 0]);
    expect(MARKET_TRADE_PAINT.fontSize).toBeLessThan(0.08);
    const source = readFileSync('src/components/VillageArea.tsx', 'utf8');
    const stall = source.slice(
      source.indexOf('const MarketStall ='),
      source.indexOf('MarketStall.displayName =')
    );
    expect(MARKET_TRADE_BRANDS.map((id) => BUSINESS_BRANDS[id].name)).toEqual(MARKET_TRADE_NAMES);
    expect(MARKET_TRADE_PAINT.height).toBeLessThan(1.104 - 0.9297);
    expect(stall).toContain('brand={MARKET_TRADE_BRANDS[dressing]}');
    expect(stall).toContain('position={MARKET_TRADE_PAINT.position}');
    expect(stall).toContain('rotation={MARKET_TRADE_PAINT.rotation}');
    expect(stall).toContain('backlit={false}');
    expect(stall).not.toContain('<Text');
    geometry.dispose();
  });

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
      /<GeneratedModel asset="marketstall" marketDressing=\{dressing\} \/>\s*<AuthoredPropTrim kind="market" dressing=\{dressing\} \/>/
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

it('maps actual fruit and food finishes in sRGB with neutral furnishings and linear roughness', () => {
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
    if (apples.getX(i) >= 0.125 && apples.getY(i) >= 0.125) rind++;
    if (apples.getX(i) === 0.03125 && apples.getY(i) === 0.03125) plain++;
  }
  expect(rind).toBeGreaterThan(100);
  expect(plain).toBeGreaterThan(100);
  const colours = AUTHORED_MARKET_GOODS[0].getAttribute('color');
  const peelColours = new Set<string>();
  for (let i = 0; i < apples.count; i++) {
    if (apples.getX(i) >= 0.125 && apples.getY(i) >= 0.125) {
      peelColours.add(
        [colours.getX(i), colours.getY(i), colours.getZ(i)].map((v) => v.toFixed(4)).join(',')
      );
    }
  }
  expect(peelColours.size).toBeGreaterThan(30);
  const patch = [];
  for (let y = 32; y < 256; y++) for (let x = 32; x < 256; x++) patch.push(data[(y * 256 + x) * 4]);
  expect(Math.min(...patch)).toBeLessThan(200);
  expect(MARKET_FRUIT_TEXTURES.colour.image.width).toBe(256);
  expect(MARKET_FRUIT_TEXTURES.finish.image.width).toBe(256);
  for (const trade of [1, 2]) {
    const goods = AUTHORED_MARKET_GOODS[trade],
      uv = goods.getAttribute('uv'),
      colour = goods.getAttribute('color');
    const finishes = new Set<string>();
    const [left, right] = trade === 1 ? MARKET_FOOD_TILES.rind : MARKET_FOOD_TILES.crust;
    let food = 0,
      neutral = 0;
    for (let i = 0; i < uv.count; i++) {
      if (uv.getX(i) === 0.03125 && uv.getY(i) === 0.03125) neutral++;
      else {
        food++;
        expect(uv.getX(i)).toBeGreaterThanOrEqual((left + 0.5) / 256);
        expect(uv.getX(i)).toBeLessThanOrEqual((right - 0.5) / 256);
        expect(uv.getY(i)).toBeGreaterThanOrEqual(4.5 / 256);
        expect(uv.getY(i)).toBeLessThanOrEqual(27.5 / 256);
      }
      finishes.add(
        [colour.getX(i), colour.getY(i), colour.getZ(i)].map((v) => v.toFixed(4)).join(',')
      );
    }
    expect(finishes.size).toBeGreaterThan(30);
    expect(food).toBeGreaterThan(100);
    expect(neutral).toBeGreaterThan(100);
  }
});

it('retains exact old fruit texels while food islands have broad finish and safe neutral gutters', () => {
  for (const [kind, expected] of [
    ['colour', 'bffdc1531363cddd7e95a95c7b0510591b7012bca13925a9b753e40ec96c4248'],
    ['finish', '4fc8ab5fa20014d2b92b642fbb1ee29cf0f458ec7f96a95d9f9de554aa09da93'],
  ] as const) {
    const data = MARKET_FRUIT_TEXTURES[kind].image.data;
    const fruit = [];
    for (let y = 32; y < 256; y++)
      for (let x = 32; x < 256; x++) {
        const i = (y * 256 + x) * 4;
        fruit.push(...data.slice(i, i + 4));
      }
    expect(createHash('sha256').update(new Uint8Array(fruit)).digest('hex')).toBe(expected);
    for (const [left, right] of Object.values(MARKET_FOOD_TILES)) {
      const values = new Set<number>();
      for (let y = 4; y < 28; y++)
        for (let x = left; x < right; x++) {
          const i = (y * 256 + x) * 4;
          expect(data[i + 3]).toBe(255);
          values.add(data[i]);
          if (kind === 'finish') {
            expect(data[i + 1]).toBe(data[i + 2]);
            expect(data[i + 1]).toBeGreaterThan(170);
          }
        }
      expect(values.size).toBeGreaterThan(4);
    }
  }
});

it('varies only the real market red-cloth tile and its matching scallops, retaining atlas and geometry', async () => {
  const primitive = (await new NodeIO().read('public/models/village/marketstall.glb'))
    .getRoot()
    .listMeshes()[0]
    .listPrimitives()[0];
  const source = new THREE.BufferGeometry();
  for (const [name, semantic, size] of [
    ['position', 'POSITION', 3],
    ['normal', 'NORMAL', 3],
    ['uv', 'TEXCOORD_0', 2],
  ] as const)
    source.setAttribute(
      name,
      new THREE.BufferAttribute(primitive.getAttribute(semantic)!.getArray() as Float32Array, size)
    );
  source.setIndex(new THREE.BufferAttribute(primitive.getIndices()!.getArray() as Uint16Array, 1));
  const base = new THREE.Color('#912d26'),
    uv = source.getAttribute('uv'),
    baseChannels = base.toArray();
  expect(new Set(MARKET_CANVAS_COLOURS).size).toBe(4);
  for (let trade = 0; trade < 4; trade++) {
    const variant = createMarketCanopyGeometry(source, trade);
    for (const name of ['position', 'normal', 'uv'])
      expect(variant.getAttribute(name).array).toEqual(source.getAttribute(name).array);
    expect(variant.index!.array).toEqual(source.index!.array);
    const colour = variant.getAttribute('color'),
      target = new THREE.Color(MARKET_CANVAS_COLOURS[trade]),
      targetChannels = target.toArray();
    let cloth = 0;
    for (let i = 0; i < uv.count; i++) {
      const selected = Math.floor(uv.getX(i) * 6) === 4 && Math.floor(uv.getY(i) * 6) === 2;
      if (selected) cloth++;
      for (let channel = 0; channel < 3; channel++)
        expect(colour.getComponent(i, channel)).toBeCloseTo(
          selected ? targetChannels[channel] / baseChannels[channel] : 1,
          5
        );
    }
    expect(cloth).toBe(900);
    const trim = AUTHORED_MARKET_TRIM_VARIANTS[trade],
      original = AUTHORED_PROP_TRIM.market;
    expect(trim.getAttribute('position').array).toEqual(original.getAttribute('position').array);
    expect(trim.getAttribute('normal').array).toEqual(original.getAttribute('normal').array);
    // Both scallop assemblies are deliberately non-indexed premerged draws.
    expect(trim.index).toBeNull();
    expect(original.index).toBeNull();
    const trimColour = trim.getAttribute('color'),
      originalColour = original.getAttribute('color');
    for (let i = 0; i < trimColour.count; i++) {
      const selected = Math.abs(originalColour.getX(i) - base.r) < 1e-6;
      for (let channel = 0; channel < 3; channel++)
        expect(trimColour.getComponent(i, channel)).toBeCloseTo(
          selected ? targetChannels[channel] : originalColour.getComponent(i, channel),
          6
        );
    }
    variant.dispose();
  }
  expect(source.hasAttribute('color')).toBe(false);
  source.dispose();
});

it('flours only bread crowns while retaining exact market geometry and other trades', () => {
  const baseline = [
    {
      attributes: {
        position: '14add3f02a718481282ce09c15b175887df5f5d1e0f0a293a0a912f72405ab83',
        normal: 'd5d65e399bc2ebb244d5a624d913a3094e1d20d3646c0384a2c87060f832bf64',
        uv: '60b0aa3a28657c984145afddf6865af4fb8ad573ad69e0ab89c48c41066c0dc5',
        color: '490b52dcb33393533fbbb8e2b7e32dd99ecc93a2ce8d5539a0c3abf358c5f52a',
      },
      index: null,
    },
    {
      attributes: {
        position: '4b428a0dc87e59bc48f351e21229ae21f2ff20e4aaf7d4e13597cf54cd9058a8',
        uv: '776f6beb2d95be9fad77b11c420a982c67bae39553edd97a324fc5ad965943d3',
        normal: '3d0089ae72d4cc0604b752b9ff53b24a6687d08361bc2be5eeb723395dfe9f69',
        color: '531fbb49908abeb9064420a59908a1b42f4090d2cf685a5eb67a94890002ef54',
      },
      index: null,
    },
    {
      attributes: {
        position: '9024b0f67c1dbb52ed4bd4154d33a274ce0d8735f122b192112e786194718a96',
        normal: '55efd269a4e3cea334876ee1805bea616b46b785b37f9b679d0836b0979c3ceb',
        uv: '1d6f3b484fa0d890ddb577610d044fc002fa829b35afbd7c11a24a5e7b8cf22a',
        color: '0c3818254d9d6b636fcb3d054499f6d653163ae64c42dc66ed201a33854f1f52',
      },
      index: null,
    },
    {
      attributes: {
        position: 'fa3863a8dad70ac619609ff8e2cdf0c6ba022a09c734d844621f9baa881be859',
        normal: '462381ea8775fde9b73731b1a16689567b31a582707033439069de9217372916',
        uv: '916f1a2b130e9a62f47885dbd6b46b6d50196e56822bb04685893b7092e67d30',
        color: '1c3fb983563a02b95a287641e3737a7ae5ff457f45ecfcd749abc38b2e3fc647',
      },
      index: null,
    },
  ];
  const hash = (a: THREE.BufferAttribute) =>
    createHash('sha256')
      .update(Buffer.from(a.array.buffer, a.array.byteOffset, a.array.byteLength))
      .digest('hex');
  AUTHORED_MARKET_GOODS.forEach((g, trade) => {
    for (const [name, expected] of Object.entries(baseline[trade].attributes)) {
      if (name === 'color' && trade === 2) continue;
      expect(hash(g.getAttribute(name) as THREE.BufferAttribute), `trade${trade}:${name}`).toBe(
        expected
      );
    }
    expect(g.index ? hash(g.index) : null).toBe(baseline[trade].index);
  });
  const bread = AUTHORED_MARKET_GOODS[2],
    uv = bread.getAttribute('uv'),
    colour = bread.getAttribute('color');
  let pale = 0,
    toasted = 0;
  for (let i = 0; i < uv.count; i++) {
    const x = uv.getX(i) * 256;
    if (x < MARKET_FOOD_TILES.crust[0] || x > MARKET_FOOD_TILES.crust[1] || uv.getY(i) > 0.125)
      continue;
    if (colour.getZ(i) > 0.32) pale++;
    if (colour.getZ(i) < 0.1) toasted++;
  }
  expect(pale).toBeGreaterThan(50);
  expect(toasted).toBeGreaterThan(50);
});

describe('authored miniature fountain bird', () => {
  it('keeps folded plumage and face in two finite, bounded shared lit surfaces', () => {
    let triangles = 0;
    for (const geometry of Object.values(FOUNTAIN_BIRD_GEOMETRIES)) {
      const p = geometry.getAttribute('position'),
        n = geometry.getAttribute('normal');
      expect(geometry.getAttribute('color').count).toBe(p.count);
      expect(geometry.groups).toHaveLength(0);
      expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
      for (let i = 0; i < n.count; i++)
        expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 5);
      triangles += (geometry.index?.count ?? p.count) / 3;
    }
    const b = FOUNTAIN_BIRD_GEOMETRIES.body.boundingBox!;
    expect(b.min.y).toBeGreaterThanOrEqual(-0.000001);
    expect(b.min.y).toBeLessThan(0.004);
    expect(b.min.z).toBeGreaterThan(-0.27);
    expect(b.max.z).toBeLessThan(0.15);
    expect(Math.max(-b.min.x, b.max.x)).toBeLessThan(0.11);
    expect(triangles).toBeLessThan(3000);
    expect(FOUNTAIN_BIRD_MATERIAL.vertexColors).toBe(true);
    expect(FOUNTAIN_BIRD_MATERIAL.emissive.getHex()).toBe(0);
    expect(FOUNTAIN_BIRD_MATERIAL.map).toBeNull();
  });
  it('seats eyes and both beak sections against the head, with eight supported toes', () => {
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const body = new THREE.Mesh(FOUNTAIN_BIRD_GEOMETRIES.body, material),
      head = new THREE.Mesh(FOUNTAIN_BIRD_GEOMETRIES.head, material);
    body.updateMatrixWorld();
    head.updateMatrixWorld();
    expect(FOUNTAIN_BIRD_TOE_CONTACTS).toHaveLength(8);
    for (const [x, , z] of FOUNTAIN_BIRD_TOE_CONTACTS) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, 0.015, z),
        new THREE.Vector3(0, -1, 0)
      ).intersectObject(body)[0];
      expect(hit).toBeDefined();
      expect(hit.point.y).toBeLessThan(0.012);
    }
    for (const side of [-1, 1]) {
      const hits = new THREE.Raycaster(
        new THREE.Vector3(side * 0.15, 0.015, 0.035),
        new THREE.Vector3(-side, 0, 0)
      ).intersectObject(head);
      expect(hits[0].point.x * side).toBeGreaterThan(0.069);
      // Eye sphere starts inside the .075m head; no detached highlight bead.
      expect(hits.some((h) => Math.abs(h.point.x) < 0.065)).toBe(true);
    }
    for (const y of [-0.016, -0.004]) {
      const hits = new THREE.Raycaster(
        new THREE.Vector3(0, y, 0.2),
        new THREE.Vector3(0, 0, -1)
      ).intersectObject(head);
      expect(hits[0].point.z).toBeGreaterThan(0.09);
      expect(hits.some((h) => h.point.z < 0.08)).toBe(true);
    }
    material.dispose();
  });
});

describe('seamless lit fountain water detail', () => {
  it('makes deterministic128px colour/normal/flow/ripple maps with exact wrapped borders', () => {
    const other = createFountainWaterTextures();
    for (const key of ['water', 'normal', 'fall', 'ripple'] as const) {
      const a = FOUNTAIN_WATER_TEXTURES[key],
        b = other[key],
        data = a.image.data;
      expect(a.image.width).toBe(128);
      expect(a.image.height).toBe(128);
      expect(data).toEqual(b.image.data);
      expect(a.colorSpace).toBe(key === 'normal' ? THREE.NoColorSpace : THREE.SRGBColorSpace);
      expect(a.wrapS).toBe(THREE.RepeatWrapping);
      expect(a.wrapT).toBe(THREE.RepeatWrapping);
      for (let y = 0; y < 128; y++)
        for (let c = 0; c < 4; c++)
          expect(data[(y * 128 + 127) * 4 + c]).toBe(data[y * 128 * 4 + c]);
      for (let x = 0; x < 128; x++)
        for (let c = 0; c < 4; c++) expect(data[(127 * 128 + x) * 4 + c]).toBe(data[x * 4 + c]);
      b.dispose();
    }
  });
  it('uses small signed slopes and feathered broken crests instead of bright painted rings', () => {
    const n = FOUNTAIN_WATER_TEXTURES.normal.image.data,
      r = FOUNTAIN_WATER_TEXTURES.ripple.image.data;
    let low = 255,
      high = 0,
      alpha = 0;
    for (let i = 0; i < n.length; i += 4) {
      const x = (n[i] / 255) * 2 - 1,
        y = (n[i + 1] / 255) * 2 - 1,
        z = (n[i + 2] / 255) * 2 - 1;
      expect(Math.hypot(x, y)).toBeLessThan(0.15);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 2);
      low = Math.min(low, n[i], n[i + 1]);
      high = Math.max(high, n[i], n[i + 1]);
      expect(n[i + 3]).toBe(255);
      alpha = Math.max(alpha, r[i + 3]);
    }
    expect(low).toBeLessThan(125);
    expect(high).toBeGreaterThan(130);
    expect(alpha).toBeGreaterThan(190);
    expect(alpha).toBeLessThanOrEqual(210);
    expect(r[(64 * 128 + 64) * 4 + 3]).toBe(0);
    expect(r[(64 * 128 + 127) * 4 + 3]).toBe(0);
    expect(GENERATED_FOUNTAIN_STREAM_MATERIAL.map).toBe(FOUNTAIN_WATER_TEXTURES.fall);
    expect(GENERATED_FOUNTAIN_STREAM_MATERIAL.emissive.getHex()).toBe(0);
  });
});

describe('sculpted floating pond planting', () => {
  it('keeps closed leaves and attached blossoms finite, inside their original three planting envelopes', () => {
    let triangles = 0;
    POND_LILY_GEOMETRIES.forEach((g, i) => {
      const site = POND_LILY_SITES[i];
      g.computeBoundingBox();
      const b = g.boundingBox!;
      expect(b.min.x).toBeGreaterThan(-site.radius);
      expect(b.max.x).toBeLessThan(site.radius);
      expect(b.min.z).toBeGreaterThan(-site.radius * site.depth);
      expect(b.max.z).toBeLessThan(site.radius * site.depth);
      expect(b.min.y).toBeGreaterThan(-0.004);
      expect(b.max.y).toBeLessThan(0.19);
      expect(b.max.y).toBeGreaterThan(i === 1 ? 0.008 : 0.1);
      for (const attribute of Object.values(g.attributes))
        expect(Array.from(attribute.array).every(Number.isFinite)).toBe(true);
      expect(g.groups).toHaveLength(0);
      triangles += g.attributes.position.count / 3;
      const mesh = new THREE.Mesh(g, POND_LILY_MATERIAL);
      mesh.updateMatrixWorld();
      // The basal slit remains open, while the reverse leaf retains a solid underside.
      const slit = new THREE.Raycaster(
        new THREE.Vector3(site.radius * 0.8, 0.5, 0),
        new THREE.Vector3(0, -1, 0)
      );
      expect(slit.intersectObject(mesh)).toHaveLength(0);
      const underside = new THREE.Raycaster(
        new THREE.Vector3(-site.radius * 0.7, -0.1, 0),
        new THREE.Vector3(0, 1, 0)
      );
      expect(underside.intersectObject(mesh).length).toBeGreaterThan(0);
    });
    expect(triangles).toBeLessThan(10000);
    expect(POND_LILY_MATERIAL).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(POND_LILY_MATERIAL.vertexColors).toBe(true);
    expect(POND_LILY_MATERIAL.transparent).toBe(false);
    expect(POND_LILY_MATERIAL.map).toBeNull();
    expect(POND_LILY_MATERIAL.emissive.getHex()).toBe(0);
    expect(POND_LILY_MATERIAL.side).toBe(THREE.FrontSide);
  });

  it('preserves original leaf sites and leaves raised flowers clear of the actual duck routes', () => {
    expect(POND_LILY_SITES.map((s) => s.position)).toEqual([
      [-2, 0.395, 0],
      [1, 0.395, -1.5],
      [-0.5, 0.395, 2.5],
    ]);
    expect(POND_LILY_SITES.map((s) => s.bloom)).toEqual(['open', 'none', 'bud']);
    const anchors = [
      [2, 1],
      [-1, -2],
      [0, 2],
      [1.5, -1.5],
    ];
    for (const [i, site] of POND_LILY_SITES.entries()) {
      const p = POND_LILY_GEOMETRIES[i].attributes.position;
      let flowerRadius = 0;
      for (let j = 0; j < p.count; j++)
        if (p.getY(j) > 0.025)
          flowerRadius = Math.max(flowerRadius, Math.hypot(p.getX(j), p.getZ(j)));
      if (site.bloom === 'none') {
        expect(flowerRadius).toBe(0);
        continue;
      }
      let clearance = Infinity;
      for (let f = 0; f <= 10800; f++)
        anchors.forEach(([x, z], duck) => {
          const pose = duckSwimPose(f / 60, 800 + duck);
          clearance = Math.min(
            clearance,
            Math.hypot(x + pose.x - site.position[0], z + pose.z - site.position[2]) -
              0.4 -
              flowerRadius
          );
        });
      expect(clearance, `site ${i} body/bloom clearance`).toBeGreaterThan(0.1);
    }
  });
});

it('seats the floating leaves on the actual delivered pond water instead of 45mm above it', async () => {
  const draco = createRequire(import.meta.url)('draco3dgltf');
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'draco3d.decoder': await draco.createDecoderModule(),
    'meshopt.decoder': MeshoptDecoder,
  });
  const doc = await io.read('public/models/village/duckpond.glb');
  const meshes = doc
    .getRoot()
    .listMeshes()
    .flatMap((m) =>
      m.listPrimitives().map((p) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(p.getAttribute('POSITION')!.getArray()!, 3)
        );
        if (p.getIndices()) g.setIndex(Array.from(p.getIndices()!.getArray()!));
        return new THREE.Mesh(g, new THREE.MeshBasicMaterial());
      })
    );
  meshes.forEach((m) => m.updateMatrixWorld());
  const water =
    new THREE.Raycaster(new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, -1, 0)).intersectObjects(
      meshes
    )[0].point.y - 0.45;
  expect(water).toBeCloseTo(0.35, 5);
  const group = PondLilies();
  expect(POND_LILY_SITES[0].position[1] + (group.props.position?.[1] ?? 0)).toBeCloseTo(water, 5);
  const fallback = PondLilies({ waterLevel: 0.19 });
  expect(POND_LILY_SITES[0].position[1] + fallback.props.position[1]).toBeCloseTo(0.19, 8);
  meshes.forEach((m) => {
    m.geometry.dispose();
    m.material.dispose();
  });
});
