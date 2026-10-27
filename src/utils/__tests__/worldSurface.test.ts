import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SURFACE_WETNESS, WET_GROUND_GLSL, wetGroundResponse } from '../../shaders/surfaceWetness';
import { SHELTER_GLSL, rainReachesPoint } from '../../simulation/rainShelters';
import {
  WORLD_SURFACE_CACHE_KEY,
  WORLD_SURFACE_WEATHER_STRENGTH,
  WORLD_SURFACE_PROFILES,
  WORLD_SURFACE_STRENGTH,
  applyBatchWorldSurface,
  applyDeclinedWorldSurface,
  applyWorldSurface,
  canApplyWorldSurface,
  composeWorldSurface,
  hasWorldSurface,
  indoorBounceDiffuse,
  markSurfaceSubstrate,
  ownsOnlyWorldSurface,
  pinSurfaceProfile,
  pinnedSurfaceProfile,
  resolveBatchSurfaceProfile,
  resolveSurfaceProfile,
  RIB_PROFILE_MEAN,
  ribFilteredSwing,
  ribFilteredValue,
  ribRenderedSwing,
  ribSeamFilteredValue,
  type WorldSurfaceProfileName,
} from '../worldSurface';

/** A 70 mm seam lap on a 1.8 m membrane roll, in pitches. */
const RIB_SEAM_TEST_WIDTH = 0.07 / 1.8;

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

  /**
   * CLAUDE.md procedural-texture rule 7: anything tiled more than ~10x needs a
   * sub-tile-frequency macro term. The truck yard is the shared tarmac map at
   * 18 x 18 over 60 m and measured luma std 7.3 across the lower frame of
   * `shipping`, because the mapped-substrate exclusion kept every such surface
   * out of the batcher's finish. A tiled substrate map may opt its surfaces in
   * by flagging the TEXTURE, which `Texture.clone()` carries to every tiling.
   */
  it('lets a flagged tiled substrate opt its surfaces into the paving macro', () => {
    const tile = markSurfaceSubstrate(new THREE.Texture(), 'paving');
    const tiling = tile.clone();
    tiling.repeat.set(18, 18);
    for (const map of [tile, tiling]) {
      const material = new THREE.MeshStandardMaterial({ map, roughness: 1 });
      expect(resolveBatchSurfaceProfile(material)).toBe('paving');
      expect(resolveSurfaceProfile(material)).toBe('paving');
      const target = material.clone();
      expect(applyBatchWorldSurface(target, material)).toBe('paving');
      expect(hasWorldSurface(target)).toBe(true);
      expect(target.map).toBe(map);
    }
    // An explicit allowMapped request keeps its roughness-based answer.
    expect(
      resolveSurfaceProfile(new THREE.MeshStandardMaterial({ map: tile, roughness: 1 }), true)
    ).toBe('masonry');
    // The opt-in is the map's, not any substrate's: an unflagged atlas stays out.
    const atlas = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), roughness: 1 });
    expect(resolveBatchSurfaceProfile(atlas)).toBeNull();
    // And it never overrides the transparent / emissive exclusions.
    const markingPaint = new THREE.MeshStandardMaterial({ map: tile, transparent: true });
    expect(resolveBatchSurfaceProfile(markingPaint)).toBeNull();
  });

  it('keeps paving to a macro term: no dirt, no dust, no edge wear on a road', () => {
    const paving = WORLD_SURFACE_PROFILES.paving;
    expect(paving.grime).toBe(0);
    expect(paving.dust).toBe(0);
    expect(paving.edge).toBe(0);
    // Sub-tile: the period spans several 3.3 m yard tiles.
    expect(paving.macroPeriod).toBeGreaterThan(3 * (60 / 18));
    expect(paving.macro).toBeGreaterThanOrEqual(0.18);
    // The tile already carries the aggregate; the meso term must not double it.
    expect(paving.meso).toBeLessThanOrEqual(0.05);
  });

  it('keeps a vessel shell near-constant: no dirt, no dust, a whisper of drift', () => {
    const vessel = WORLD_SURFACE_PROFILES.vessel;
    expect(vessel.grime).toBe(0);
    expect(vessel.dust).toBe(0);
    // `painted` (meso 0.13, x2 in the tone term) read as cotton on white tanks.
    expect(vessel.meso).toBeLessThanOrEqual(0.03);
    expect(vessel.macro).toBeLessThanOrEqual(0.05);
  });

  it('lets a pinned profile speak through the colour-blind batch resolver', () => {
    const material = pinSurfaceProfile(
      new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: 0.4 }),
      'vessel'
    );
    expect(resolveBatchSurfaceProfile(material)).toBe('vessel');
    expect(resolveSurfaceProfile(material)).toBe('vessel');
    // The pin rides userData, which Material.copy() deep-copies to every clone.
    expect(pinnedSurfaceProfile(material.clone())).toBe('vessel');
    // It never overrides the scope exclusions.
    material.transparent = true;
    expect(resolveBatchSurfaceProfile(material)).toBeNull();
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

describe('box-filtered ribs', () => {
  it('keep the full trapezoid at a fine footprint and average to its mean, never alias', () => {
    // Fine footprint: crown 1, trough 0, as the unfiltered profile.
    expect(ribFilteredValue(0.4, 1e-3)).toBeCloseTo(1, 3);
    expect(ribFilteredValue(0.85, 1e-3)).toBeCloseTo(0, 3);
    // One pitch or more under a pixel: exactly the mean, whatever the phase.
    for (const u of [0, 0.13, 0.4, 0.77, 31.6]) {
      expect(ribFilteredValue(u, 1)).toBeCloseTo(RIB_PROFILE_MEAN, 6);
      expect(ribFilteredValue(u, 3)).toBeCloseTo(RIB_PROFILE_MEAN, 6);
    }
    // The swing falls monotonically with footprint, from 1 toward 0.
    let previous = ribFilteredSwing(1e-3);
    expect(previous).toBeCloseTo(1, 2);
    for (let w = 0.05; w <= 1.0001; w += 0.05) {
      const swing = ribFilteredSwing(w);
      expect(swing).toBeLessThanOrEqual(previous + 1e-9);
      previous = swing;
    }
    expect(ribFilteredSwing(1)).toBeLessThan(1e-6);
  });

  /**
   * final4 med-12/06/1830, low-12: the roof liner read as a dot grid
   * ("carbon-fibre look"). A box filter is not a low-pass: the 0.25 m deck
   * profile kept 85% of its swing at 2 px a pitch (w 0.5, Nyquist) and 20-28%
   * at w 1.25-1.5, and every bit of that aliases. What reaches the frame must
   * be gone before Nyquist and stay gone.
   */
  /*
   * final5 med-12 interior (upper right) and milling, low-12: still a checker.
   * Faded at 0.1-0.25 the ribs kept up to 74% of their swing at the 6-7 px a
   * pitch the interior camera's upper right resolves them at on Medium, and
   * every 10-12 px a purlin crossed them. A rib that resolves still draws a
   * grid against the purlins, so it is dropped well before Nyquist: gone by
   * 10 px a pitch, full only from 20.
   */
  it('leave no swing from 10 px a pitch on, and keep it where a pitch spans 25 px', () => {
    for (let w = 0.1; w <= 4; w += 0.025) {
      expect(ribRenderedSwing(w), `w ${w.toFixed(3)}`).toBeLessThan(1e-6);
    }
    // A membrane lap is one thin line a pitch, not a grid: it keeps round 5's
    // fade, gone by 4 px a pitch, so the overview still resolves the laps.
    for (let w = 0.25; w <= 4; w += 0.025) {
      expect(ribRenderedSwing(w, RIB_SEAM_TEST_WIDTH), `seam w ${w.toFixed(3)}`).toBeLessThan(1e-6);
    }
    expect(ribRenderedSwing(0.14, RIB_SEAM_TEST_WIDTH)).toBeGreaterThan(0.03);
    expect(ribRenderedSwing(0.04)).toBeGreaterThan(0.95);
    expect(ribRenderedSwing(0.06)).toBeGreaterThan(0.5);
    // The paired control: with the fade off, the old box filter (and its alias).
    expect(ribRenderedSwing(1.5, 0, 0)).toBeCloseTo(ribFilteredSwing(1.5), 9);
  });

  it('filter a thin seam to its exact coverage and keep its mean', () => {
    const width = RIB_SEAM_TEST_WIDTH;
    expect(ribSeamFilteredValue(0.5, 1e-3, width)).toBeCloseTo(1, 3);
    expect(ribSeamFilteredValue(width / 2, 1e-3, width)).toBeCloseTo(0, 3);
    for (let u = 0; u < 1; u += 0.1) {
      expect(ribSeamFilteredValue(u, 1, width)).toBeCloseTo(1 - width, 6);
      expect(ribSeamFilteredValue(u, 2, width)).toBeCloseTo(1 - width, 6);
    }
  });

  it('is opt-in: furrows and every default profile keep the faded trapezoid', () => {
    const plain = applyWorldSurface(new THREE.MeshStandardMaterial(), 'painted', {
      ribPeriod: 0.8,
      ribDepth: 0.07,
    });
    const rib = (plain.userData.millosWorldSurface as { uSurfRib: { value: THREE.Vector4 } })
      .uSurfRib.value;
    expect(rib.y).toBe(0);
    const filtered = applyWorldSurface(new THREE.MeshStandardMaterial(), 'painted', {
      ribPeriod: 0.25,
      ribDepth: 0.035,
      ribFilteredTone: 0.2,
    });
    const value = (filtered.userData.millosWorldSurface as { uSurfRib: { value: THREE.Vector4 } })
      .uSurfRib.value;
    expect(value.x).toBe(0.2);
    expect(value.y).toBe(1);
    const fragment = compileInjection(filtered).fragmentShader;
    expect(fragment).toContain('surfRibIntegral');
    expect(fragment).toContain('uniform vec4 uSurfRib;');
  });
});

describe('indoor bounce', () => {
  /**
   * r4floor2-med-22 milling: the aisle barrier's west face rendered (0.3, 0, 0)
   * while a plain-material band on the same face was lit. The bounce mixed
   * `reflectedLight.indirectDiffuse` toward its own luma, but that term is
   * irradiance TIMES the albedo, so it greyed the yellow paint itself. Lit only
   * by fill at night, the greyed face sat under the display toe (Neutral and the
   * +0.06 contrast) and crushed to black; patched at runtime to neutralise the
   * light instead, the same face read (19.5, 12.2, 0).
   */
  const luma = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

  it('neutralises the fill light and keeps the paint its own colour', () => {
    const paint = [0.6, 0.4, 0.03] as const;
    const neutral = [0.1, 0.1, 0.1] as const;
    const reflected = paint.map((a, i) => a * neutral[i]);
    // Neutral light needs no neutralising: the reflected colour is unchanged.
    const out = indoorBounceDiffuse(reflected, paint, 0.85);
    out.forEach((v, i) => expect(v, `channel ${i}`).toBeCloseTo(reflected[i], 9));
    // A green-tinted fill on the same paint comes out as the paint under a grey
    // light of the fill's luminance.
    const green = [0.06, 0.12, 0.05] as const;
    const tinted = indoorBounceDiffuse(
      paint.map((a, i) => a * green[i]),
      paint,
      1
    );
    tinted.forEach((v, i) => expect(v / paint[i]).toBeCloseTo(luma(green), 9));
  });

  it('injects the light-neutralising form into the shader', () => {
    const material = new THREE.MeshStandardMaterial();
    applyWorldSurface(material, 'masonry', { indoorBounce: 0.85 });
    const fragment = compileInjection(material).fragmentShader;
    const bounce = fragment.slice(fragment.indexOf('uSurfDeck.w > 0.0'));
    expect(bounce).toContain('material.diffuseContribution');
    expect(bounce).toContain('reflectedLight.indirectDiffuse / surfAlbedo');
    expect(bounce).not.toContain('dot( reflectedLight.indirectDiffuse');
  });
});

describe('explicit exterior slab weather', () => {
  it('shares the existing damped wetness only with the opted profile, independently of static strength', () => {
    expect(WORLD_SURFACE_PROFILES.exteriorSlab).toBe(WORLD_SURFACE_PROFILES.slab);
    const wet = applyWorldSurface(new THREE.MeshStandardMaterial(), 'exteriorSlab');
    const compiled = compileInjection(wet),
      key = wet.customProgramCacheKey(),
      version = wet.version;
    expect(compiled.uniforms.uSurfWeatherWetness).toBe(SURFACE_WETNESS);
    expect(compiled.uniforms.uSurfWeatherStrength).toBe(WORLD_SURFACE_WEATHER_STRENGTH);
    for (const profile of profileNames.filter((p) => p !== 'exteriorSlab')) {
      const dry = applyWorldSurface(new THREE.MeshStandardMaterial(), profile),
        shader = compileInjection(dry);
      expect(shader.uniforms.uSurfWeatherWetness.value).toBe(0);
      expect(Object.isFrozen(shader.uniforms.uSurfWeatherWetness)).toBe(true);
      expect(Object.isFrozen(shader.uniforms.uSurfWeatherStrength)).toBe(true);
      expect(shader.fragmentShader).toBe(compiled.fragmentShader);
      dry.dispose();
    }
    const saved = [
      SURFACE_WETNESS.value,
      WORLD_SURFACE_STRENGTH.value,
      WORLD_SURFACE_WEATHER_STRENGTH.value,
    ];
    try {
      WORLD_SURFACE_STRENGTH.value = 0;
      SURFACE_WETNESS.value = 0.82;
      expect(compiled.uniforms.uSurfStrength.value).toBe(0);
      expect(compiled.uniforms.uSurfWeatherWetness.value).toBe(0.82);
      WORLD_SURFACE_WEATHER_STRENGTH.value = 0;
      expect(compiled.uniforms.uSurfWeatherStrength.value).toBe(0);
      expect(SURFACE_WETNESS.value).toBe(0.82);
      expect(wet.customProgramCacheKey()).toBe(key);
      expect(wet.version).toBe(version);
    } finally {
      [SURFACE_WETNESS.value, WORLD_SURFACE_STRENGTH.value, WORLD_SURFACE_WEATHER_STRENGTH.value] =
        saved;
      wet.dispose();
    }
    const fragment = compiled.fragmentShader;
    expect(fragment).toContain(
      WET_GROUND_GLSL.replaceAll('uSurfaceWetness', 'uSurfWeatherWetness').replaceAll(
        'millosWetGround',
        'surfWetGround'
      )
    );
    expect(fragment).toContain(SHELTER_GLSL);
    expect(fragment).toContain(
      'uSurfWeatherStrength > 0.0 && uSurfWeatherWetness > 0.0 && !surfRainSheltered( vSurfWorld )'
    );
    expect(fragment.indexOf('surfWetGround( diffuseColor.rgb')).toBeGreaterThan(
      fragment.indexOf('metalnessFactor = clamp')
    );
    expect(fragment.indexOf('surfWetGround( diffuseColor.rgb')).toBeLessThan(
      fragment.indexOf('#include <lights_physical_fragment>')
    );
    expect(wetGroundResponse(0)).toEqual({ albedo: 1, roughness: 1 });
    expect(wetGroundResponse(0.82)).toEqual({ albedo: 0.754, roughness: 0.5244 });
  });
  it('does not collide with generic wet-ground uniforms/helpers in a composed host', () => {
    const host = new THREE.MeshStandardMaterial();
    host.onBeforeCompile = (shader) => {
      shader.uniforms.uSurfaceWetness = SURFACE_WETNESS;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        '#include <common>\n' + WET_GROUND_GLSL
      );
    };
    composeWorldSurface(host, 'painted', { cacheKey: 'wet_host_test_v1' });
    const shader = compileInjection(host);
    expect(shader.uniforms.uSurfaceWetness).toBe(SURFACE_WETNESS);
    expect(shader.uniforms.uSurfWeatherWetness.value).toBe(0);
    expect(shader.fragmentShader.match(/void millosWetGround/g)).toHaveLength(1);
    expect(shader.fragmentShader.match(/void surfWetGround/g)).toHaveLength(1);
    expect(host.customProgramCacheKey()).toBe('wet_host_test_v1_' + WORLD_SURFACE_CACHE_KEY);
    host.dispose();
  });
  it('uses the shared strict canopy boundary, including mirrored receiving and roof height', () => {
    for (const z of [58, -58]) {
      expect(rainReachesPoint(9, 0, z)).toBe(false);
      expect(rainReachesPoint(10.25, 0, z)).toBe(true);
      expect(rainReachesPoint(10.249, 0, z)).toBe(false);
      expect(rainReachesPoint(9, 6.2, z)).toBe(true);
      expect(rainReachesPoint(11, 0, z)).toBe(true);
    }
  });
});
