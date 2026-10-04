import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createDerivedMaterial } from 'troika-three-utils';
import {
  CIVIC_LAMPS,
  CIVIC_WORLD_LIGHTS,
  CIVIC_SHADOW_ATLAS_SIZE,
  CIVIC_SHADOW_FACE_SIZE,
  CIVIC_POST_POSITIONS,
  CIVIC_POST_HEIGHT_SCALES,
  CIVIC_SHADOW_BAKE_READY,
  CIVIC_SHADOW_ASSET_VERSION,
  CIVIC_CUBE_FACE_BASES,
  CIVIC_SHADOW_CONVENTION,
  CIVIC_SOURCE_LOOKUP,
  civicSourceSlot,
} from '../../constants/civicSquareLighting';
import {
  applyCivicLampShadows,
  civicUnderlyingHooks,
  injectCivicLampShadows,
  validateCivicShadowBake,
  CIVIC_SHADOW_ATLAS,
  CIVIC_SHADOW_STRENGTH,
} from '../civicLampShadows';
import {
  CIVIC_FITTING_GEOMETRY,
  CIVIC_LENS_GEOMETRY,
  exportCivicOccluders,
  civicRuntimeSources,
} from '../../components/scenery/CivicSquareLighting';
import {
  collectStaticBatchCandidates,
  createStaticMeshBatches,
} from '../../components/performance/StaticMeshBatch';
import { applyBatchWorldSurface, hasWorldSurface } from '../../utils/worldSurface';
import { applyVillageWindows } from '../../components/models/GeneratedOfficeModel';
import { applyWindShader } from '../../components/scenery/WindDriver';
import { LANDSCAPE_GROVE_TREES } from '../../components/exterior/ExteriorVegetation';

function shader() {
  return {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  } as THREE.WebGLProgramParametersWithUniforms;
}
function metadata() {
  return {
    convention: CIVIC_SHADOW_CONVENTION,
    faceBases: CIVIC_CUBE_FACE_BASES,
    sourceLookup: CIVIC_SOURCE_LOOKUP,
    faceSize: CIVIC_SHADOW_FACE_SIZE,
    atlasSize: [...CIVIC_SHADOW_ATLAS_SIZE],
    sources: structuredClone(CIVIC_WORLD_LIGHTS),
  };
}

describe('located concept lighting', () => {
  it('seats the three uplighters at actual large grove trees and keeps their shadow lookup active', () => {
    for (const lamp of CIVIC_WORLD_LIGHTS.filter((l) => /^tree-/.test(l.id))) {
      const distance = Math.min(
        ...LANDSCAPE_GROVE_TREES.map((tree) =>
          Math.hypot(tree.position[0] - lamp.position[0], tree.position[2] - lamp.position[2])
        )
      );
      expect(distance).toBeGreaterThan(0.8);
      expect(distance).toBeLessThan(2);
    }
    const s = shader();
    injectCivicLampShadows(s);
    const match = s.fragmentShader.match(
      /source\.x < (-?[\d.]+) \|\| source\.x > (-?[\d.]+) \|\| source\.z < (-?[\d.]+) \|\| source\.z > (-?[\d.]+)/
    );
    expect(match).not.toBeNull();
    const [, minX, maxX, minZ, maxZ] = match!.map(Number);
    for (const lamp of CIVIC_WORLD_LIGHTS) {
      expect(lamp.position[0]).toBeGreaterThan(minX);
      expect(lamp.position[0]).toBeLessThan(maxX);
      expect(lamp.position[2]).toBeGreaterThan(minZ);
      expect(lamp.position[2]).toBeLessThan(maxZ);
    }
  });
  it('binds both cache requests to the actual retained depth and metadata bytes', () => {
    if (!CIVIC_SHADOW_BAKE_READY) return;
    const png = readFileSync('public/textures/civic-square-lamp-depth.png');
    const json = readFileSync('public/textures/civic-square-lamp-depth.json');
    expect(createHash('sha256').update(png).update(json).digest('hex')).toBe(
      CIVIC_SHADOW_ASSET_VERSION
    );
    const meta = JSON.parse(json.toString());
    expect(meta.atlasSha256).toBe(createHash('sha256').update(png).digest('hex'));
    expect(
      meta.sourceReceipts.every(
        (s: { blockedRays: number; rays: number }) => s.blockedRays > 0 && s.blockedRays < s.rays
      )
    ).toBe(true);
    validateCivicShadowBake(meta);
  });
  it('uses a unique bounded lookup without a nested source scan, including float camera reconstruction', () => {
    const slots = CIVIC_WORLD_LIGHTS.map((source) => civicSourceSlot(source.position));
    expect(new Set(slots).size).toBe(CIVIC_WORLD_LIGHTS.length);
    expect(slots.every((slot) => slot >= 0 && slot < CIVIC_SOURCE_LOOKUP.slots)).toBe(true);
    expect(CIVIC_SOURCE_LOOKUP.origin[0]).toBe(6 * CIVIC_SHADOW_FACE_SIZE);
    expect(CIVIC_SOURCE_LOOKUP.origin[0] + CIVIC_SOURCE_LOOKUP.width).toBeLessThanOrEqual(
      CIVIC_SHADOW_ATLAS_SIZE[0]
    );
    for (const light of CIVIC_WORLD_LIGHTS) {
      for (const error of [-0.002, 0, 0.002]) {
        expect(civicSourceSlot(light.position.map((v) => Math.fround(v + error)))).toBe(
          civicSourceSlot(light.position)
        );
      }
      for (const pose of [
        [-190, 12, -22],
        [-218, 9, 39],
        [-190, 1.7, 0],
      ]) {
        const camera = new THREE.PerspectiveCamera();
        camera.position.set(...(pose as [number, number, number]));
        camera.lookAt(-202, 2, 14);
        camera.updateMatrixWorld(true);
        const view = new THREE.Matrix4().fromArray(
          Array.from(new Float32Array(camera.matrixWorldInverse.elements))
        );
        const inView = new THREE.Vector3(...light.position).applyMatrix4(view);
        const elements = view.elements;
        const local = inView.toArray().map(Math.fround);
        const reconstructed = [0, 1, 2].map((axis) =>
          Math.fround(
            local[0] * elements[axis * 4] +
              local[1] * elements[axis * 4 + 1] +
              local[2] * elements[axis * 4 + 2] +
              Math.fround(pose[axis])
          )
        );
        expect(civicSourceSlot(reconstructed)).toBe(civicSourceSlot(light.position));
      }
    }
    expect(() => validateCivicShadowBake({ ...metadata(), sourceLookup: {} })).toThrow('Stale');
    const s = shader();
    injectCivicLampShadows(s);
    expect(s.fragmentShader).not.toContain('for (int i = 0;');
    expect(s.fragmentShader.indexOf('encoded < 1.0')).toBeLessThan(
      s.fragmentShader.indexOf('civicSources[i].xyz')
    );
    expect(exportCivicOccluders(new THREE.Scene()).sourceLookup).toBe(CIVIC_SOURCE_LOOKUP);
  });
  it('matches actual mounted origins, and rejects an absent or moved runtime source', () => {
    const scene = new THREE.Scene();
    expect(() => civicRuntimeSources(scene)).toThrow('Missing');
    for (const lamp of CIVIC_WORLD_LIGHTS) {
      const light = new THREE.PointLight();
      light.name = `civic-lamp:${lamp.id}`;
      light.position.set(...lamp.position);
      scene.add(light);
    }
    expect(civicRuntimeSources(scene).map((l) => l.position)).toEqual(
      CIVIC_WORLD_LIGHTS.map((l) => l.position)
    );
    scene.children[0].position.x += 0.002;
    expect(() => civicRuntimeSources(scene)).toThrow('Moved');
    CIVIC_POST_HEIGHT_SCALES.forEach((scale, i) => {
      expect(scale * 4.3).toBeCloseTo(CIVIC_LAMPS.filter((l) => l.kind === 'post')[i].position[1]);
    });
  });
  it('retains unique finite bounded sources for mapped apertures and window spill', () => {
    expect(new Set(CIVIC_LAMPS.map((l) => l.id)).size).toBe(CIVIC_LAMPS.length);
    expect(CIVIC_LAMPS.filter((l) => l.kind === 'post')).toHaveLength(4);
    expect(CIVIC_LAMPS.filter((l) => l.kind === 'garden')).toHaveLength(14);
    for (const lamp of CIVIC_LAMPS) {
      expect(lamp.position.every(Number.isFinite)).toBe(true);
      expect(lamp.reference.every((v) => v > 0 && v < 1)).toBe(true);
      expect(lamp.intensity).toBeGreaterThan(0);
      expect(lamp.intensity).toBeLessThanOrEqual(210);
      expect(lamp.distance).toBeGreaterThan(0);
      expect(lamp.distance).toBeLessThanOrEqual(24);
    }
    expect(CIVIC_LAMPS.length * CIVIC_SHADOW_FACE_SIZE).toBeLessThanOrEqual(
      CIVIC_SHADOW_ATLAS_SIZE[1]
    );
    expect(6 * CIVIC_SHADOW_FACE_SIZE).toBeLessThanOrEqual(CIVIC_SHADOW_ATLAS_SIZE[0]);
    for (const g of [CIVIC_FITTING_GEOMETRY, CIVIC_LENS_GEOMETRY]) {
      expect(Array.from(g.getAttribute('position').array).every(Number.isFinite)).toBe(true);
      expect(g.groups).toHaveLength(0);
    }
  });
  it('rejects missing, reordered or moved bakes', () => {
    expect(() => validateCivicShadowBake(metadata())).not.toThrow();
    expect(() => validateCivicShadowBake({})).toThrow('Stale');
    const moved = metadata();
    moved.sources[0].position[0] += 0.1;
    expect(() => validateCivicShadowBake(moved)).toThrow('moved');
    const reordered = metadata();
    reordered.sources.reverse();
    expect(() => validateCivicShadowBake(reordered)).toThrow('moved');
    expect(() => validateCivicShadowBake({ ...metadata(), faceBases: [] })).toThrow('Stale');
  });
  it('shares six orthogonal cube bases with the actual baker/export and reprojects seam taps', () => {
    for (const [normal, u, v] of CIVIC_CUBE_FACE_BASES) {
      const n = new THREE.Vector3(...normal),
        horizontal = new THREE.Vector3(...u),
        vertical = new THREE.Vector3(...v);
      expect(n.length()).toBe(1);
      expect(horizontal.length()).toBe(1);
      expect(vertical.length()).toBe(1);
      expect(n.dot(horizontal)).toBe(0);
      expect(n.dot(vertical)).toBe(0);
      expect(horizontal.dot(vertical)).toBe(0);
    }
    const s = shader();
    injectCivicLampShadows(s);
    expect(s.fragmentShader).toContain('civicProject(civicFaceDirection(face, p + offset');
    expect(s.fragmentShader).toContain('vec2(tapFace, float(i))');
    const data = exportCivicOccluders(new THREE.Scene());
    expect(data.faceBases).toBe(CIVIC_CUBE_FACE_BASES);
  });
  it('keeps uplighter emitters above opaque metal and post emitters clear of the burner', () => {
    const mesh = new THREE.Mesh(CIVIC_FITTING_GEOMETRY, new THREE.MeshStandardMaterial());
    mesh.updateMatrixWorld(true);
    for (const lamp of CIVIC_LAMPS.filter((l) => l.kind === 'garden')) {
      const ray = new THREE.Raycaster(
        new THREE.Vector3(...lamp.position),
        new THREE.Vector3(0, 1, 0),
        0.015,
        0.5
      );
      expect(ray.intersectObject(mesh)).toHaveLength(0);
    }
    CIVIC_LAMPS.filter((l) => l.kind === 'post').forEach((lamp, i) => {
      expect(lamp.position[2] - CIVIC_POST_POSITIONS[i][2]).toBeCloseTo(0.08);
    });
    // Until actual assembly PNG/JSON exist, the normal scene must not request
    // missing files. The pending state is explicitly not a shadow-fidelity pass.
    expect(CIVIC_SHADOW_BAKE_READY).toBe(
      existsSync('public/textures/civic-square-lamp-depth.png') &&
        existsSync('public/textures/civic-square-lamp-depth.json')
    );
  });
});

describe('source-correct static occlusion composition', () => {
  it('finishes the real Troika base without wrapping its accessor and re-entering derivation', () => {
    const base = new THREE.MeshStandardMaterial();
    let calls = 0;
    base.onBeforeCompile = () => {
      if (++calls > 2) throw new Error('Derived material re-entry sentinel');
    };
    const derived = createDerivedMaterial(base, {
      fragmentColorTransform: 'gl_FragColor.rgb *= 1.0;',
    });
    const originalHook = derived.onBeforeCompile;
    expect(applyCivicLampShadows(derived)).toBe(true);
    const s = shader();
    derived.onBeforeCompile(s, {} as THREE.WebGLRenderer);
    expect(calls).toBe(1);
    expect(derived.onBeforeCompile).toBe(originalHook);
    expect(civicUnderlyingHooks(derived)).toBeUndefined();
    expect(civicUnderlyingHooks(base)).toBeDefined();
    expect(s.uniforms.civicDepthAtlas).toBe(CIVIC_SHADOW_ATLAS);
    const key = derived.customProgramCacheKey(),
      version = base.version;
    expect(applyCivicLampShadows(derived)).toBe(false);
    expect(base.version).toBe(version);
    expect(derived.customProgramCacheKey()).toBe(key);
  });

  it('injects once when the existing geometry-surface clone retains its source hook', () => {
    const source = new THREE.MeshStandardMaterial();
    applyCivicLampShadows(source);
    // GeneratedGeometrySurface intentionally carries original hooks to its live
    // clone. That copy has a distinct identity and retained host/cache key.
    const live = source.clone();
    live.onBeforeCompile = source.onBeforeCompile;
    live.customProgramCacheKey = () => 'retained-live-geometry-host';
    applyCivicLampShadows(live);
    const s = shader();
    live.onBeforeCompile(s, {} as THREE.WebGLRenderer);
    expect(s.fragmentShader.split('float civicVisibility(')).toHaveLength(2);
    expect(s.uniforms.civicDepthAtlas).toBe(CIVIC_SHADOW_ATLAS);
  });
  it('retains automatic finishing of wrapped unbatchable primitives without repeated recompiles', () => {
    const material = new THREE.MeshStandardMaterial({
      color: '#778899',
      roughness: 1,
    });
    applyCivicLampShadows(material);
    const scene = new THREE.Group();
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 1);
    scene.add(mesh);
    expect(collectStaticBatchCandidates(scene, true)).toHaveLength(0);
    expect(hasWorldSurface(material)).toBe(true);
    expect(civicUnderlyingHooks(material)).toBeDefined();
    const compiled = shader();
    material.onBeforeCompile(compiled, {} as THREE.WebGLRenderer);
    expect(compiled.uniforms).toHaveProperty('uSurfStrength');
    expect(compiled.uniforms).toHaveProperty('civicDepthAtlas');
    const version = material.version,
      key = material.customProgramCacheKey();
    collectStaticBatchCandidates(scene, true);
    expect(material.version).toBe(version);
    expect(material.customProgramCacheKey()).toBe(key);
  });
  it('retains the actual window-room and wind hosts without making them batch eligible', () => {
    const hosts: ((m: THREE.MeshStandardMaterial) => void)[] = [
      (m) => applyVillageWindows(m, { value: 0.8 }),
      (m) =>
        applyWindShader(m, {
          heightRef: 4,
          strengthScale: 1,
          cacheKey: 'civic-wind-test',
        }),
    ];
    for (const apply of hosts) {
      const m = new THREE.MeshStandardMaterial();
      apply(m);
      const retained = shader();
      m.onBeforeCompile(retained, {} as THREE.WebGLRenderer);
      applyCivicLampShadows(m);
      const composed = shader();
      m.onBeforeCompile(composed, {} as THREE.WebGLRenderer);
      expect(composed.vertexShader).toBe(retained.vertexShader);
      for (const name of Object.keys(retained.uniforms))
        expect(composed.uniforms).toHaveProperty(name);
      expect(composed.fragmentShader).toContain('civicVisibility(pointLight.position');
      const scene = new THREE.Group();
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(), m));
      expect(collectStaticBatchCandidates(scene)).toHaveLength(0);
    }
  });
  it('composes once preserving host, normals, albedo and UVs', () => {
    const m = new THREE.MeshStandardMaterial({
      map: new THREE.Texture(),
      normalMap: new THREE.Texture(),
    });
    let calls = 0;
    m.onBeforeCompile = (s) => {
      calls++;
      s.uniforms.retainedHost = { value: 7 };
    };
    m.customProgramCacheKey = () => 'retained-host';
    const map = m.map,
      normal = m.normalMap;
    expect(applyCivicLampShadows(m)).toBe(true);
    expect(applyCivicLampShadows(m)).toBe(false);
    const s = shader();
    m.onBeforeCompile(s, {} as THREE.WebGLRenderer);
    expect(calls).toBe(1);
    expect(s.uniforms.retainedHost.value).toBe(7);
    expect(s.uniforms.civicDepthAtlas).toBe(CIVIC_SHADOW_ATLAS);
    expect(s.uniforms.civicShadowStrength).toBe(CIVIC_SHADOW_STRENGTH);
    expect(s.fragmentShader).toContain(
      'if (directLight.visible) directLight.color *= civicVisibility(pointLight.position, geometryPosition);'
    );
    expect(s.fragmentShader).toContain('civicVisibility(spotLight.position, geometryPosition)');
    expect(s.fragmentShader).toContain('getDirectionalLightInfo(');
    expect(s.vertexShader).toBe(THREE.ShaderLib.standard.vertexShader);
    expect(m.map).toBe(map);
    expect(m.normalMap).toBe(normal);
    expect(m.customProgramCacheKey()).toBe('retained-host|millos-civic-lamp-visibility-v4');
    m.onBeforeCompile = () => {};
    expect(civicUnderlyingHooks(m)).toBeUndefined();
    expect(applyCivicLampShadows(new THREE.MeshBasicMaterial())).toBe(false);
  });
  it('keeps ordinary sources batch eligible and rewires clones, excluding arbitrary hosts', () => {
    const scene = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const m = new THREE.MeshStandardMaterial({ color: '#64786a' });
      applyCivicLampShadows(m);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m);
      mesh.position.x = i * 2;
      scene.add(mesh);
    }
    const original = CIVIC_SHADOW_ATLAS.value;
    CIVIC_SHADOW_ATLAS.value = new THREE.Texture();
    try {
      const candidates = collectStaticBatchCandidates(scene);
      expect(candidates).toHaveLength(4);
      const batches = createStaticMeshBatches(
        scene,
        candidates,
        'civic-test',
        2,
        applyBatchWorldSurface
      );
      expect(batches.length).toBeGreaterThan(0);
      for (const batch of batches)
        expect(civicUnderlyingHooks(batch.mesh.material as THREE.Material)).toBeDefined();
      const injected = new THREE.MeshStandardMaterial();
      injected.onBeforeCompile = () => {};
      applyCivicLampShadows(injected);
      const separate = new THREE.Group();
      separate.add(new THREE.Mesh(new THREE.BoxGeometry(), injected));
      expect(collectStaticBatchCandidates(separate)).toHaveLength(0);
    } finally {
      CIVIC_SHADOW_ATLAS.value = original;
    }
  });
  it('exports actual rigid world triangles, excluding hidden, alpha and moving casters', () => {
    const scene = new THREE.Scene();
    const rigid = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial());
    rigid.position.set(-190, 1, 8);
    rigid.castShadow = true;
    scene.add(rigid);
    const invisible = rigid.clone();
    invisible.visible = false;
    scene.add(invisible);
    const moving = rigid.clone();
    moving.userData.dynamic = true;
    scene.add(moving);
    const leaves = rigid.clone();
    leaves.material = new THREE.MeshStandardMaterial({ alphaTest: 0.5 });
    scene.add(leaves);
    const windy = rigid.clone();
    const windyMaterial = new THREE.MeshStandardMaterial();
    applyWindShader(windyMaterial, {
      heightRef: 4,
      strengthScale: 1,
      cacheKey: 'opaque-wind-caster',
    });
    applyCivicLampShadows(windyMaterial);
    windy.material = windyMaterial;
    scene.add(windy);
    const exportData = exportCivicOccluders(scene);
    expect(exportData.objects).toHaveLength(1);
    expect(exportData.vertices).toHaveLength(24 * 3);
    expect(exportData.triangles).toHaveLength(12 * 3);
    expect(exportData.exclusions.alphaOrMoving).toBe(2);
    expect(exportData.vertices[0]).toBeLessThan(-180);
    expect(exportData.dynamicLocalShadows).toBe(false);
  });
  it('fails when the retained Standard lighting assembly is missing', () => {
    const s = shader();
    s.fragmentShader = 'void main() {}';
    expect(() => injectCivicLampShadows(s)).toThrow('retained Standard');
  });
});
