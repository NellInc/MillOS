import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  WORLD_SURFACE_CACHE_KEY,
  WORLD_SURFACE_PROFILES,
  WORLD_SURFACE_STRENGTH,
  applyBatchWorldSurface,
  applyDeclinedWorldSurface,
  applyWorldSurface,
  canApplyWorldSurface,
  composeWorldSurface,
  hasWorldSurface,
  ownsOnlyWorldSurface,
  resolveBatchSurfaceProfile,
  resolveSurfaceProfile,
  type WorldSurfaceProfileName,
} from '../worldSurface';

const profileNames = Object.keys(WORLD_SURFACE_PROFILES) as WorldSurfaceProfileName[];

/**
 * Capture the injected GLSL the way three would, without a GL context: build the
 * shader object three passes to `onBeforeCompile` out of the real ShaderLib
 * source for the material's shader id, and let the material rewrite it.
 */
function compileInjection(material: THREE.Material) {
  const lib = THREE.ShaderLib.physical;
  const shader = {
    uniforms: THREE.UniformsUtils.clone(lib.uniforms) as Record<string, THREE.IUniform>,
    vertexShader: lib.vertexShader,
    fragmentShader: lib.fragmentShader,
  };
  (material.onBeforeCompile as (s: typeof shader) => void)(shader);
  return shader;
}

describe('worldSurface profiles', () => {
  /**
   * THE UNITS INVARIANT, and the reason this file exists.
   *
   * `reliefMetres` is consumed by `surfPerturbNormal` - three's
   * `perturbNormalArb` - whose `dHdxy` argument must be in the same length units
   * as its `surf_pos`, and `surf_pos` here is view-space METRES. The first
   * version of this module authored the field as a 0-1 "strength" and shipped
   * `painted` at 0.35 m of bump over a 0.55 m period: a slope of 1.27, a 52
   * degree tilt, which rendered a lamp post as a stack of hard light and dark
   * blocks, one per noise cell.
   *
   * Nothing else can catch that. The shader compiles, the term is demonstrably
   * NOT inert (it moves plenty of pixels), and `audit-scene-models.mjs` marks
   * the surface finished either way. Only the arithmetic between two authored
   * numbers says it is wrong.
   */
  it.each(profileNames)('%s keeps its relief slope physically plausible', (name) => {
    const profile = WORLD_SURFACE_PROFILES[name];
    const slope = profile.reliefMetres / profile.mesoPeriod;
    expect(slope).toBeLessThanOrEqual(0.12);
    expect(profile.reliefMetres).toBeGreaterThan(0);
  });

  /**
   * CLAUDE.md's procedural-texture rule 5: a feature period that lands under
   * ~4-6 px at the viewing distance aliases and then averages to a flat constant
   * one mip level down. `mesoFadeMetres` is what stops each profile's period
   * from being carried past the distance where it can still be resolved.
   *
   * Screen pixels per period, at the fade distance, on the 1280 px capture
   * viewport with the app's 50 degree vertical field of view. Anything at or
   * below 4 px is detail that is being drawn and cannot be seen.
   */
  it.each(profileNames)('%s fades its meso detail before it aliases', (name) => {
    const profile = WORLD_SURFACE_PROFILES[name];
    const metresPerPixel = (2 * profile.mesoFadeMetres * Math.tan((50 * Math.PI) / 360)) / 1280;
    expect(profile.mesoPeriod / metresPerPixel).toBeGreaterThan(4);
  });

  it('gives every profile a datum-free term, so none is inert away from the ground', () => {
    for (const name of profileNames) {
      const profile = WORLD_SURFACE_PROFILES[name];
      // `grime` saturates to nothing above `grimeHeight`, which is by design.
      // Dust, edge wear, macro and meso must not, or a roof, a gantry or a
      // walkway deck would receive a treatment that evaluates to zero while
      // every gate reported the surface finished.
      expect(profile.dust + profile.edge + profile.macro + profile.meso).toBeGreaterThan(0.1);
    }
  });
});

describe('applyWorldSurface', () => {
  it('injects at anchors three actually ships, in both shader stages', () => {
    const material = applyWorldSurface(new THREE.MeshStandardMaterial(), 'painted');
    const shader = compileInjection(material);
    // A replace() against a missing anchor returns the subject unchanged, so the
    // only proof the injection landed is that the injected identifiers are there.
    expect(shader.vertexShader).toContain('vSurfWorld =');
    expect(shader.vertexShader).toContain('vSurfObject =');
    expect(shader.fragmentShader).toContain('surfPerturbNormal');
    expect(shader.fragmentShader).toContain('surfGrime');
    expect(shader.fragmentShader).toContain('roughnessFactor = mix( roughnessFactor, 0.95');
  });

  it('shares one strength uniform object across every material, by reference', () => {
    const a = applyWorldSurface(new THREE.MeshStandardMaterial(), 'painted');
    const b = applyWorldSurface(new THREE.MeshPhysicalMaterial(), 'masonry');
    const shaderA = compileInjection(a);
    const shaderB = compileInjection(b);
    // The A/B instrument depends on this identity: `SurfaceTreatmentIsolation`
    // writes one `.value` and every treated surface has to see it.
    expect(shaderA.uniforms.uSurfStrength).toBe(WORLD_SURFACE_STRENGTH);
    expect(shaderB.uniforms.uSurfStrength).toBe(WORLD_SURFACE_STRENGTH);
  });

  it('gives every profile the exact shared program cache key', () => {
    const keys = profileNames.map((name) => {
      const material = applyWorldSurface(new THREE.MeshStandardMaterial(), name);
      return material.customProgramCacheKey?.();
    });
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe(WORLD_SURFACE_CACHE_KEY);
  });

  it('is idempotent, because the batcher can be re-run over a treated tree', () => {
    const material = new THREE.MeshStandardMaterial();
    applyWorldSurface(material, 'painted');
    const first = material.onBeforeCompile;
    applyWorldSurface(material, 'masonry');
    expect(material.onBeforeCompile).toBe(first);
    expect(
      (material as unknown as { userData: { millosWorldSurfaceProfile?: string } }).userData
        .millosWorldSurfaceProfile
    ).toBe('painted');
  });

  /**
   * `THREE.Material.copy()` runs userData through
   * `JSON.parse( JSON.stringify( ... ) )` and does NOT copy `onBeforeCompile`.
   * So a clone of a treated material arrives with a JSON ghost of the uniforms
   * and no shader: Colors flattened to `{r,g,b}`, and a detached `{value:1}`
   * where the shared strength object was. A presence check would read that ghost
   * as "already treated" and leave the clone unfinished AND deaf to the A/B
   * toggle - which is exactly the shape of bug the toggle exists to catch, hiding
   * inside the toggle's own plumbing. `StaticMeshBatch` clones a representative
   * material on every merge, so this is the common path, not an edge case.
   */
  it('re-treats a clone, whose userData is a JSON ghost of the uniforms', () => {
    const source = applyWorldSurface(new THREE.MeshStandardMaterial(), 'masonry');
    const clone = source.clone();
    expect(Object.hasOwn(clone, 'onBeforeCompile')).toBe(false);
    // The ghost is present and is NOT the shared object.
    const ghost = (clone as unknown as { userData: { millosWorldSurface?: unknown } }).userData
      .millosWorldSurface as { uSurfStrength?: unknown } | undefined;
    expect(ghost).toBeDefined();
    expect(ghost?.uSurfStrength).not.toBe(WORLD_SURFACE_STRENGTH);

    applyWorldSurface(clone, 'masonry');
    expect(Object.hasOwn(clone, 'onBeforeCompile')).toBe(true);
    expect(compileInjection(clone).uniforms.uSurfStrength).toBe(WORLD_SURFACE_STRENGTH);
  });

  it('never overwrites another family injection', () => {
    const material = new THREE.MeshStandardMaterial();
    const foreign = () => {};
    material.onBeforeCompile = foreign;
    applyWorldSurface(material, 'painted');
    expect(material.onBeforeCompile).toBe(foreign);
    expect(
      (material as unknown as { userData: { millosWorldSurfaceSkipped?: string } }).userData
        .millosWorldSurfaceSkipped
    ).toBe('already-injected');
  });

  it('declines unlit materials rather than injecting a half-shader', () => {
    // `meshbasic_frag` has no `<normal_fragment_maps>`, no `roughnessFactor` and
    // no `metalnessFactor`. The fragment replace would match nothing while the
    // vertex half compiled - inert, with a confident comment attached.
    const basic = new THREE.MeshBasicMaterial();
    expect(canApplyWorldSurface(basic)).toBe(false);
    applyWorldSurface(basic, 'painted');
    expect(basic.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
  });
});

describe('composeWorldSurface', () => {
  /** A stand-in for `applyWindShader`: owns the slot, edits the vertex shader. */
  function hostInjection(material: THREE.Material, cacheKey: string): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uHostMarker = { value: 1 };
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n  transformed += vec3( 0.0, 0.001, 0.0 ); // HOST_MARKER'
      );
    };
    material.customProgramCacheKey = () => cacheKey;
  }

  it('keeps the host injection and adds its own', () => {
    const material = new THREE.MeshStandardMaterial();
    hostInjection(material, 'host_v1');
    composeWorldSurface(material, 'vegetation', { cacheKey: 'host_v1' });
    const shader = compileInjection(material);
    expect(shader.vertexShader).toContain('HOST_MARKER');
    expect(shader.uniforms.uHostMarker).toBeDefined();
    expect(shader.fragmentShader).toContain('surfPerturbNormal');
  });

  /**
   * THE TRAP THIS TEST EXISTS FOR. three keys its program cache on
   * `customProgramCacheKey` plus the parameter defines. Leaving the host's key
   * in place after adding GLSL to the same shader hands back the program
   * compiled WITHOUT the new terms: a treatment that is inert while every gate
   * in the repo reports it present.
   */
  it('derives a new cache key from the host key, and returns it stably', () => {
    const material = new THREE.MeshStandardMaterial();
    hostInjection(material, 'host_v1');
    composeWorldSurface(material, 'vegetation', { cacheKey: 'host_v1' });
    const key = material.customProgramCacheKey?.();
    expect(key).not.toBe('host_v1');
    expect(key).toContain(WORLD_SURFACE_CACHE_KEY);
    expect(material.customProgramCacheKey?.()).toBe(key);
  });

  /**
   * `SurfaceTreatmentIsolation` writes ONE object, and `measure:surfaces` is
   * that write. A composed material with its own strength uniform reports an
   * exactly-zero changed fraction - which this repo reads, correctly in every
   * other case, as "the term is inert". The instrument would be blind to the
   * work and the reading would be indistinguishable from a real failure.
   */
  it('shares the A/B strength uniform by reference', () => {
    const material = new THREE.MeshStandardMaterial();
    hostInjection(material, 'host_v1');
    composeWorldSurface(material, 'vegetation', { cacheKey: 'host_v1' });
    expect(compileInjection(material).uniforms.uSurfStrength).toBe(WORLD_SURFACE_STRENGTH);
    expect(hasWorldSurface(material)).toBe(true);
  });

  /**
   * `StaticMeshBatch` merges into a CLONE and re-applies the treatment to it.
   * `Material.copy()` does not carry `onBeforeCompile`, so a composed material
   * that were batched would arrive on the far side with the treatment restored
   * and the HOST injection - the wind - silently gone.
   */
  it('stays out of the batcher, which a plain treatment does not', () => {
    const composed = new THREE.MeshStandardMaterial();
    hostInjection(composed, 'host_v1');
    composeWorldSurface(composed, 'vegetation', { cacheKey: 'host_v1' });
    expect(hasWorldSurface(composed)).toBe(true);
    expect(ownsOnlyWorldSurface(composed)).toBe(false);

    const plain = applyWorldSurface(new THREE.MeshStandardMaterial(), 'painted');
    expect(ownsOnlyWorldSurface(plain)).toBe(true);
  });

  /**
   * The anchor sits after `<begin_vertex>`, so a swaying vertex shader has
   * already moved `transformed`. Sampling the world field there nails the field
   * to the world and lets the plant travel through it: 0.16 m of tip sway
   * against a 0.3 m meso period is most of a noise cell, so the break-up crawls
   * over the leaves on every gust.
   */
  it('samples the world field at the rest vertex when asked', () => {
    const swaying = new THREE.MeshStandardMaterial();
    hostInjection(swaying, 'host_v1');
    composeWorldSurface(swaying, 'vegetation', { cacheKey: 'host_v1', worldRest: true });
    expect(compileInjection(swaying).vertexShader).toContain(
      'vSurfWorld = ( surfObjectMatrix * vec4( position, 1.0 ) ).xyz'
    );

    const rigid = new THREE.MeshStandardMaterial();
    hostInjection(rigid, 'host_v2');
    composeWorldSurface(rigid, 'vegetation', { cacheKey: 'host_v2' });
    expect(compileInjection(rigid).vertexShader).toContain(
      'vSurfWorld = ( surfObjectMatrix * vec4( transformed, 1.0 ) ).xyz'
    );
  });

  it('is idempotent and declines unlit materials, like the direct path', () => {
    const material = new THREE.MeshStandardMaterial();
    hostInjection(material, 'host_v1');
    composeWorldSurface(material, 'vegetation', { cacheKey: 'host_v1' });
    const first = material.onBeforeCompile;
    composeWorldSurface(material, 'masonry', { cacheKey: 'host_v1' });
    expect(material.onBeforeCompile).toBe(first);

    const basic = new THREE.MeshBasicMaterial();
    composeWorldSurface(basic, 'vegetation', { cacheKey: 'host_v1' });
    expect(basic.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
  });
});

describe('applyDeclinedWorldSurface', () => {
  /**
   * The whole reason this exists rather than reusing the batch resolver: a
   * declined mesh is a SINGLE-MATERIAL site, so its colour is the colour of its
   * surface. `resolveBatchSurfaceProfile` is blind to colour on purpose and can
   * never choose `vegetation` or `signage`; those two are most of what the
   * declined set actually is.
   */
  it('uses the colour-aware resolver, so it can choose vegetation and signage', () => {
    const hedge = new THREE.MeshStandardMaterial({ color: '#4caf2f', roughness: 0.9 });
    const chevron = new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.6 });
    expect(applyDeclinedWorldSurface(hedge)).toBe('vegetation');
    expect(applyDeclinedWorldSurface(chevron)).toBe('signage');
    expect(
      applyBatchWorldSurface(
        new THREE.MeshStandardMaterial({ color: '#4caf2f', roughness: 0.9 }),
        new THREE.MeshStandardMaterial({ color: '#4caf2f', roughness: 0.9 })
      )
    ).toBe('masonry');
  });

  it('declines what every other path declines, and says so', () => {
    expect(applyDeclinedWorldSurface(new THREE.MeshBasicMaterial())).toBeNull();
    expect(
      applyDeclinedWorldSurface(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }))
    ).toBeNull();
    expect(
      applyDeclinedWorldSurface(
        new THREE.MeshStandardMaterial({ emissive: '#ffdd88', emissiveIntensity: 2 })
      )
    ).toBeNull();
  });

  /**
   * `applyWorldSurface` silently returns a material that already owns someone
   * else's `onBeforeCompile`. A tally that counted that as a success would
   * report a sweep reaching surfaces it never touched.
   */
  it('reports null rather than a false success on a foreign injection', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#8d8d88', roughness: 0.95 });
    material.onBeforeCompile = () => {};
    expect(applyDeclinedWorldSurface(material)).toBeNull();
  });

  it('is idempotent, because the batcher re-runs over trees it has seen', () => {
    const material = new THREE.MeshStandardMaterial({ color: '#8d8d88', roughness: 0.95 });
    expect(applyDeclinedWorldSurface(material)).toBe('masonry');
    expect(applyDeclinedWorldSurface(material)).toBeNull();
  });
});

describe('profile resolution', () => {
  it.each([
    'map',
    'normalMap',
    'bumpMap',
    'roughnessMap',
    'metalnessMap',
    'aoMap',
    'displacementMap',
  ] as const)('preserves existing %s substrates in both automatic paths', (channel) => {
    const texture = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ [channel]: texture, roughness: 1 });
    const target = material.clone();
    expect(resolveSurfaceProfile(material)).toBeNull();
    expect(resolveBatchSurfaceProfile(material)).toBeNull();
    expect(resolveSurfaceProfile(material, true)).toBe('masonry');
    expect(applyDeclinedWorldSurface(material)).toBeNull();
    expect(applyBatchWorldSurface(target, material)).toBeNull();
    expect(material[channel]).toBe(texture);
    expect(target[channel]).toBe(texture);
    expect(hasWorldSurface(material)).toBe(false);
    expect(hasWorldSurface(target)).toBe(false);
    expect(material.onBeforeCompile).toBe(THREE.Material.prototype.onBeforeCompile);
  });

  it('retains an explicit textured opt-in through a batch clone', () => {
    const map = new THREE.Texture();
    const material = new THREE.MeshStandardMaterial({ map, roughness: 1 });
    applyWorldSurface(material, 'masonry');
    const clone = material.clone();
    expect(hasWorldSurface(clone)).toBe(false); // JSON metadata is not an injection.
    expect(applyBatchWorldSurface(clone, material)).toBe('masonry');
    expect(hasWorldSurface(clone)).toBe(true);
    expect(clone.map).toBe(map);
    expect(clone.userData.millosWorldSurface.uSurfStrength).toBe(WORLD_SURFACE_STRENGTH);
  });

  it('declines transparent, sub-unit-opacity and emissive surfaces', () => {
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.3 });
    const marking = new THREE.MeshStandardMaterial({ opacity: 0.6 });
    const lens = new THREE.MeshStandardMaterial({ emissive: '#ffdd88', emissiveIntensity: 2 });
    expect(resolveSurfaceProfile(glass)).toBeNull();
    expect(resolveSurfaceProfile(marking)).toBeNull();
    expect(resolveSurfaceProfile(lens)).toBeNull();
    expect(resolveBatchSurfaceProfile(glass)).toBeNull();
    expect(resolveBatchSurfaceProfile(lens)).toBeNull();
  });

  it('reads conductors, masonry and paint apart', () => {
    expect(
      resolveSurfaceProfile(new THREE.MeshStandardMaterial({ color: '#c2c9c7', metalness: 1 }))
    ).toBe('metal');
    expect(
      resolveSurfaceProfile(new THREE.MeshStandardMaterial({ color: '#8d8d88', roughness: 0.95 }))
    ).toBe('masonry');
    expect(
      resolveSurfaceProfile(new THREE.MeshStandardMaterial({ color: '#2f6f9f', roughness: 0.5 }))
    ).toBe('painted');
  });

  it('sends saturated greens to vegetation and saturated brights to signage', () => {
    expect(
      resolveSurfaceProfile(new THREE.MeshStandardMaterial({ color: '#4caf2f', roughness: 0.9 }))
    ).toBe('vegetation');
    expect(
      resolveSurfaceProfile(new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.6 }))
    ).toBe('signage');
  });

  /**
   * The batch resolver must be BLIND to colour. `mergeMaterialSignature` is
   * built with `includeColor: false` because a merge group's members carry
   * different colours on a per-vertex attribute, so the representative's colour
   * describes one arbitrary member. Classifying by it would hand a whole batch
   * the profile of whichever mesh the traversal reached first.
   */
  it('gives the same batch profile regardless of the representative colour', () => {
    const shared = { roughness: 0.9, metalness: 0 };
    const hedge = new THREE.MeshStandardMaterial({ color: '#4caf2f', ...shared });
    const postbox = new THREE.MeshStandardMaterial({ color: '#c62828', ...shared });
    const wall = new THREE.MeshStandardMaterial({ color: '#9a938a', ...shared });
    const profiles = [hedge, postbox, wall].map(resolveBatchSurfaceProfile);
    expect(new Set(profiles).size).toBe(1);
    expect(profiles[0]).toBe('masonry');
  });

  it('applyBatchWorldSurface reports what it applied, and null when it declines', () => {
    const painted = new THREE.MeshStandardMaterial({ roughness: 0.4 });
    expect(applyBatchWorldSurface(painted.clone(), painted)).toBe('painted');
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.2 });
    expect(applyBatchWorldSurface(glass.clone(), glass)).toBeNull();
  });
});
