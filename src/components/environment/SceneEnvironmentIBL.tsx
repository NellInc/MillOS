import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useGraphicsStore } from '../../stores/graphicsStore';
import {
  createCelestialState,
  sampleAtmosphere,
  sampleCelestial,
} from '../../simulation/atmosphere';

/**
 * Scene environment (image-based lighting) and hemisphere fill.
 *
 * WHY THIS EXISTS: nothing in the scene set `scene.environment`. Every metal
 * surface in the mill - and almost everything in a mill is metal - was lit by
 * direct light alone. A metallic BRDF puts essentially all of its response in
 * the specular lobe and takes its albedo out of the diffuse term, so with no
 * environment to reflect there is nothing left but a broad ambient wash. That
 * is the whole reason the machinery reads chalky rather than metallic.
 *
 * WHY NOT THE HDRI: `public/hdri/warehouse.hdr` exists and `MillScene` already
 * mounts it behind the Ultra reflections toggle, with a note that its PMREM
 * compile costs multiple seconds. That is fine for an explicit opt-in and
 * unacceptable for the default preset. A 64 x 32 procedural equirect costs
 * microseconds to author and a single small PMREM pass to convolve, and it has
 * a property the HDRI does not: it tracks the simulated sun, so reflections
 * move with the time of day.
 *
 * ONE SET OF COLOURS FOR THREE CONSUMERS. The bands are not authored constants.
 * They are read live from the sky's own state:
 *   - top      <- `scene.background`, which `OptimizedSkySystem` keeps equal to
 *                 the sky shader's `topColor` uniform.
 *   - horizon  <- `celestial-ambient-light.color`, already lerped night to day.
 *   - ground   <- the hemisphere light's own ground colour, set below.
 * So the environment reflection, the hemisphere fill and the visible sky cannot
 * disagree at any hour: they are the same three colours.
 *
 * FLOAT, NOT BYTES. The sun disc is authored well above 1.0 so metals get a
 * specular hit with some punch. A `Uint8` texture clamps that to a flat white
 * blob. It is also why the texture is tagged Linear rather than sRGB:
 * `THREE.Color` stores linear working-space values, so the samples are written
 * through unchanged instead of being decoded a second time.
 */

/**
 * Equirectangular source resolution.
 *
 * PMREM derives its cube size from `source.width / 4`, so a 64 x 32 source
 * produced 16 x 16 cube faces. A mirror-finish metal samples near mip 0, and
 * mip 0 of a 16 x 16 face is a 5.6 degree texel: chrome came back as flat
 * colour, which is why the vehicle materials had to be roughened to 0.26 to
 * hide it. 128 x 64 gives 32 x 32 faces - 2.8 degrees per texel - which is
 * enough to resolve the 12 degree solar disc as a round highlight and the
 * horizon as a gradient rather than a step.
 *
 * NOT HIGHER. The source is three smooth latitude bands plus one soft-edged
 * disc, so it is band-limited; 256 x 128 would resolve nothing that is in the
 * signal. The write loop below is the only real cost and it quadruples with
 * each step (2048 -> 8192 pixels here, still well inside a tenth of a
 * millisecond, and it runs at most every REGENERATE_MIN_INTERVAL_MS).
 */
const ENVIRONMENT_WIDTH = 128;
const ENVIRONMENT_HEIGHT = 64;

const AMBIENT_LIGHT_NAME = 'celestial-ambient-light';
export const HEMISPHERE_LIGHT_NAME = 'environment-hemisphere-fill';

/**
 * Weight of the environment - DIFFUSE **AND** SPECULAR, not diffuse alone.
 *
 * `getIBLIrradiance` returns `PI * radiance * envMapIntensity` and
 * `getIBLRadiance` returns `radiance * envMapIntensity`: one uniform scales the
 * irradiance a dielectric bounces and the reflection a metal mirrors. And
 * `scene.environmentIntensity` is that uniform for almost every material in the
 * project, because `WebGLMaterials` copies `material.envMapIntensity` into the
 * uniform only inside `if ( material.envMap )`, while `WebGLRenderer` then
 * overwrites it with `scene.environmentIntensity` for every standard material
 * whose own `envMap` is null. Set an `envMapIntensity` on a material with no
 * `envMap` and it is dead config.
 *
 * ON THE FILL SIDE, WHICH IS WHY IT IS LOW. At a typical daytime sky radiance
 * around 0.35 linear, 0.3 contributes roughly 0.33 of irradiance. Added to
 * ambient 0.22 and the hemisphere's 0.22, total fill is about 0.77 against a
 * key of 3.10 - a shade over 2 stops. Raising this is the fastest way to
 * flatten the scene straight back out, so it is deliberately lower than a
 * physically-motivated value, and `SceneEnvironmentIBL.test.ts` pins it there:
 * the fill-budget assertion caps this constant at about 0.36.
 *
 * SO METALS OPT OUT INSTEAD. A metal has no diffuse term at all - its entire
 * appearance is the environment specular - and at 0.3 every bare metal surface
 * in the mill reflected the sky at a third of the sky's own brightness. The fix
 * is not to raise this number, which would drag the diffuse fill up with it,
 * but `adoptEnvironmentMap` below: materials above `METALLIC_ENVMAP_THRESHOLD`
 * are given the PMREM as their own `material.envMap`, which makes their own
 * `envMapIntensity` live and takes them off this dampener.
 */
export const ENVIRONMENT_INTENSITY = 0.3;

/**
 * Metalness at or above which a material takes the environment at its own
 * `envMapIntensity` rather than the scene's diffuse-fill value.
 *
 * DERIVED, NOT PICKED. A standard material's diffuse colour is
 * `albedo * (1 - metalness)`, so the extra fill an adopted material takes on is
 * `PI * radiance * envMapIntensity * (1 - metalness)`. Holding the budget the
 * fill test already asserts - a 3.10 key against ambient 0.22 + hemisphere 0.22
 * + IBL, at better than 3.5:1 - the worst case of `envMapIntensity` 1.0 against
 * a 0.35 sky needs `PI * 0.35 * (1 - m) <= 3.10 / 3.5 - 0.44`, which solves to
 * `m > 0.595`. 0.6 is the smallest round number that holds.
 *
 * It also happens to sit in a gap in the repo's own authoring: 0.5 appears 143
 * times as an unauthored default, while every material actually named as metal
 * is above it - painted metal 0.6, mill drums 0.7, silo bodies 0.75, steel and
 * mill bodies 0.85, water and puddles 0.9, chrome 0.95.
 */
export const METALLIC_ENVMAP_THRESHOLD = 0.6;

/** Hemisphere fill intensity, matched to the ambient term. */
export const HEMISPHERE_INTENSITY = 0.22;

/** Angular radius of the sun disc stamped into the environment, in radians. */
export const SUN_DISC_RADIANS = (6 * Math.PI) / 180;

/** Peak radiance of the disc, as a multiple of the zenith band. */
export const SUN_DISC_GAIN = 6;

/** Sun intensity that counts as full daylight when scaling the disc. */
export const SUN_REFERENCE_INTENSITY = 3.1;

/** Terrain albedo the hemisphere bounces, and the warm it takes at golden hour. */
const GROUND_ALBEDO = new THREE.Color('#6f806c');
const GROUND_GOLDEN = new THREE.Color('#8a6a4e');

/**
 * The ground bounce scales with the light actually reaching the ground, read
 * off the live horizon against clear daylight's (`OptimizedSkySystem`'s
 * `dayHorizon`). Clear noon is exactly unchanged; night keeps a small floor.
 */
const DAY_HORIZON = new THREE.Color('#a3cce2');
const DAY_HORIZON_LUMINANCE =
  0.2126 * DAY_HORIZON.r + 0.7152 * DAY_HORIZON.g + 0.0722 * DAY_HORIZON.b;
const GROUND_NIGHT_FLOOR = 0.12;

/** Solar disc tint, matched to the key light's own noon-to-golden ramp. */
const SUN_TINT_DAY = new THREE.Color('#fff1cf');
const SUN_TINT_GOLDEN = new THREE.Color('#ffb15d');

/**
 * Minimum change before the environment is convolved again.
 *
 * PMREM is cheap here but not free, and the sun moves a fraction of a degree
 * per real second at default game speed. Regenerating on a fixed timer would be
 * pure waste at night and too coarse at sunrise; keying on actual movement is
 * both.
 */
const REGENERATE_SUN_DOT = 0.9993;
const REGENERATE_COLOR_DELTA = 0.012;
const REGENERATE_MIN_INTERVAL_MS = 400;

// Scratch. No allocation inside useFrame.
const _top = new THREE.Color();
const _horizon = new THREE.Color();
const _ground = new THREE.Color();
const _sunTint = new THREE.Color();
const _band = new THREE.Color();
const _disc = new THREE.Color();
const _sunDirection = new THREE.Vector3();
const _sampleDirection = new THREE.Vector3();
const _celestial = createCelestialState();

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

/** Squared RGB distance, used as the "has this drifted enough to matter" test. */
export function colorDistanceSquared(a: THREE.Color, b: THREE.Color): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

/** Empty linear-float equirectangular source for the environment. */
export function createEnvironmentSource(
  width: number = ENVIRONMENT_WIDTH,
  height: number = ENVIRONMENT_HEIGHT
): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Float32Array(width * height * 4),
    width,
    height,
    THREE.RGBAFormat,
    THREE.FloatType
  );
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // Linear, not sRGB: the samples written below are `THREE.Color` channels,
  // which are already in the linear working space. Tagging this sRGB would
  // decode them a second time and wash the whole environment out.
  texture.colorSpace = THREE.LinearSRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Paint the three latitude bands plus the solar disc into an equirect source.
 *
 * `EquirectangularReflectionMapping` samples with
 * `v = asin(dir.y) / PI + 0.5`, and a `DataTexture` row 0 is v = 0, so rows run
 * from straight down to straight up.
 */
export function writeEnvironmentBands(
  texture: THREE.DataTexture,
  top: THREE.Color,
  horizon: THREE.Color,
  ground: THREE.Color,
  sunDirection: THREE.Vector3,
  discColor: THREE.Color
): void {
  const width = texture.image.width;
  const height = texture.image.height;
  const data = texture.image.data as Float32Array;
  const discCos = Math.cos(SUN_DISC_RADIANS);

  for (let y = 0; y < height; y += 1) {
    const v = (y + 0.5) / height;
    const elevation = (v - 0.5) * Math.PI;
    const dirY = Math.sin(elevation);
    const radial = Math.cos(elevation);

    _band.copy(horizon);
    if (dirY >= 0) {
      _band.lerp(top, smoothstep(0, 0.55, dirY));
    } else {
      _band.lerp(ground, smoothstep(0, -0.35, dirY));
    }

    for (let x = 0; x < width; x += 1) {
      const u = (x + 0.5) / width;
      const longitude = (u - 0.5) * Math.PI * 2;
      _sampleDirection.set(radial * Math.cos(longitude), dirY, radial * Math.sin(longitude));

      let r = _band.r;
      let g = _band.g;
      let b = _band.b;

      const alignment = _sampleDirection.dot(sunDirection);
      if (alignment > discCos) {
        // Soft-edged so a 64 x 32 source does not alias the disc into a square.
        const falloff = smoothstep(discCos, 1, alignment);
        r += discColor.r * falloff;
        g += discColor.g * falloff;
        b += discColor.b * falloff;
      }

      const offset = (y * width + x) * 4;
      data[offset] = r;
      data[offset + 1] = g;
      data[offset + 2] = b;
      data[offset + 3] = 1;
    }
  }

  texture.needsUpdate = true;
}

/**
 * The slice of a material this rig touches, described structurally so the
 * traversal never has to narrow to a class it may not have.
 */
interface EnvironmentAwareMaterial {
  isMeshStandardMaterial?: boolean;
  metalness?: number;
  envMap?: THREE.Texture | null;
}

/** Is this material metallic enough to be taken off the diffuse-fill dampener? */
export function shouldAdoptEnvironmentMap(material: THREE.Material): boolean {
  const candidate = material as EnvironmentAwareMaterial;
  return (
    candidate.isMeshStandardMaterial === true &&
    (candidate.metalness ?? 0) >= METALLIC_ENVMAP_THRESHOLD
  );
}

// Traversal state. Module-level so the visitor is allocated once and a pass
// costs nothing beyond the walk itself - these run inside `useFrame`.
let _envMapTexture: THREE.Texture | null = null;
let _envMapReleasing = false;
let _envMapTouched = 0;

function applyEnvironmentMap(material: THREE.Material): void {
  const candidate = material as EnvironmentAwareMaterial;

  if (_envMapReleasing) {
    // Keyed on identity, not on the metalness predicate: a material whose
    // metalness was changed after adoption must still let go of the texture.
    if (candidate.envMap !== _envMapTexture) return;
    candidate.envMap = null;
    _envMapTouched += 1;
    return;
  }

  if (!shouldAdoptEnvironmentMap(material)) return;
  if (candidate.envMap === _envMapTexture) return;
  candidate.envMap = _envMapTexture;
  _envMapTouched += 1;
}

const environmentMapVisitor = (object: THREE.Object3D): void => {
  const material = (object as Partial<THREE.Mesh>).material;
  if (!material) return;
  if (Array.isArray(material)) {
    for (let index = 0; index < material.length; index += 1) {
      applyEnvironmentMap(material[index]);
    }
    return;
  }
  applyEnvironmentMap(material);
};

/**
 * Point every metallic material in the graph at `texture` as its own `envMap`.
 *
 * WHAT THIS BUYS. Until a standard material owns an `envMap`, `WebGLRenderer`
 * overwrites its `envMapIntensity` uniform with `scene.environmentIntensity` on
 * every draw, so the per-material value is inert (see the note on
 * `ENVIRONMENT_INTENSITY`). Assigning the environment the material is already
 * being lit by flips that one branch: the material now supplies its own weight.
 * Metals are the only materials given this, and it is self-limiting - a metal's
 * diffuse colour is `albedo * (1 - metalness)`, so the extra irradiance a
 * 0.6-and-up material can add to the scene's fill is bounded by construction.
 *
 * NO `needsUpdate`, DELIBERATELY. The texture assigned is the same object as
 * `scene.environment`, and the renderer resolves the program from
 * `material.envMap || scene.environment`, so the program parameters, the cache
 * key and `materialProperties.envMap` are all unchanged - there is nothing to
 * recompile. `refreshMaterialUniforms` runs on every material switch and picks
 * the new value up from there. (`envMapRotation` likewise resolves to an
 * identity Euler on both branches; if this scene ever rotates its environment
 * that stops being true.)
 *
 * @returns how many materials changed, for tests and diagnostics.
 */
export function adoptEnvironmentMap(root: THREE.Object3D, texture: THREE.Texture): number {
  _envMapTexture = texture;
  _envMapReleasing = false;
  _envMapTouched = 0;
  root.traverse(environmentMapVisitor);
  _envMapTexture = null;
  return _envMapTouched;
}

/**
 * Undo `adoptEnvironmentMap` for one texture, so nothing is left holding a
 * render target that is about to be disposed or handed to another rig.
 *
 * @returns how many materials changed, for tests and diagnostics.
 */
export function releaseEnvironmentMap(root: THREE.Object3D, texture: THREE.Texture): number {
  _envMapTexture = texture;
  _envMapReleasing = true;
  _envMapTouched = 0;
  root.traverse(environmentMapVisitor);
  _envMapTexture = null;
  _envMapReleasing = false;
  return _envMapTouched;
}

/**
 * How often the graph is re-walked for materials that were not there last time.
 *
 * Adoption cannot be a one-shot. Workers, vehicles and lazily loaded machine
 * models mount long after the first convolution and each arrives with its own
 * materials; the render target, by contrast, is now reused rather than
 * reallocated, so nothing forces a re-walk on its own.
 */
export const ADOPT_INTERVAL_MS = 500;

/**
 * Ceiling the walk interval backs off to once the scene stops producing metals.
 *
 * A walk is a full `scene.traverse` of a graph with thousands of nodes, and it
 * lands entirely inside one frame. While the world is still streaming in, every
 * walk finds something and the interval stays at its floor. Once a walk touches
 * nothing - which is the steady state for the whole of a benchmark run and for
 * most of a session - there is no reason to keep paying it twice a second.
 *
 * The cap is deliberately low rather than unbounded: it is also the worst-case
 * delay before a metal that mounts during a quiet stretch takes the environment
 * as its own `envMap`, and until it does it renders at
 * `scene.environmentIntensity` instead of its authored `envMapIntensity`.
 */
export const ADOPT_INTERVAL_MAX_MS = 2000;

export function SceneEnvironmentIBL(): React.JSX.Element {
  const scene = useThree((state) => state.scene);
  const gl = useThree((state) => state.gl);
  // Ultra can mount drei's `<Environment>` with the warehouse HDRI, which writes
  // the same two scene properties. Regenerating over it would make the two
  // fight over the course of a simulated day, so the explicit cinematic option
  // wins and this rig stands down.
  const hdriEnvironmentActive = useGraphicsStore(
    (state) => state.graphics.quality === 'ultra' && state.graphics.enableAnisotropicReflections
  );

  const hemisphereRef = useRef<THREE.HemisphereLight>(null);
  const source = useMemo(() => createEnvironmentSource(), []);
  const pmremRef = useRef<THREE.PMREMGenerator | null>(null);
  const targetRef = useRef<THREE.WebGLRenderTarget | null>(null);
  const lastSunRef = useRef(new THREE.Vector3(0, 1, 0));
  const lastTopRef = useRef(new THREE.Color(0, 0, 0));
  const lastGeneratedRef = useRef(0);
  const lastAdoptedRef = useRef(0);
  const adoptIntervalRef = useRef(ADOPT_INTERVAL_MS);
  const adoptedTextureRef = useRef<THREE.Texture | null>(null);
  const ambientRef = useRef<THREE.AmbientLight | null>(null);

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    generator.compileEquirectangularShader();
    pmremRef.current = generator;
    return () => {
      generator.dispose();
      pmremRef.current = null;
    };
  }, [gl]);

  useEffect(() => {
    return () => {
      const target = targetRef.current;
      if (target) {
        // Release BEFORE dispose. Every adopted metal holds this texture as its
        // own `envMap`; disposing first would leave the whole scene pointing at
        // a dead render target.
        releaseEnvironmentMap(scene, target.texture);
        if (scene.environment === target.texture) scene.environment = null;
        target.dispose();
      }
      targetRef.current = null;
      source.dispose();
    };
  }, [scene, source]);

  useEffect(() => {
    if (hdriEnvironmentActive) {
      // The warehouse HDRI takes `scene.environment` over. Adopted metals have
      // to let go of this rig's texture: it stops being regenerated, and its
      // absolute radiance is not the HDRI's, so honouring per-material
      // intensities against it would be guesswork. They fall back to
      // `scene.environmentIntensity`, which is exactly where Ultra sat before
      // adoption existed.
      const target = targetRef.current;
      if (target) releaseEnvironmentMap(scene, target.texture);
      // The release just cleared every adopted `envMap`, so the record of what
      // the scene is holding is now stale. Clearing it is what lets the branch
      // below re-adopt on identity alone: the render target is reused, so the
      // texture that comes back is the same object that was just released and a
      // pointer comparison would otherwise report nothing to do.
      adoptedTextureRef.current = null;
      return;
    }
    // Force a rebuild the moment the HDRI option is switched back off, rather
    // than waiting for the sun to drift far enough to trip the threshold.
    lastGeneratedRef.current = 0;
    lastAdoptedRef.current = 0;
    adoptedTextureRef.current = null;
    adoptIntervalRef.current = ADOPT_INTERVAL_MS;
    lastSunRef.current.set(0, 0, 0);
  }, [hdriEnvironmentActive, scene]);

  useFrame(() => {
    let ambient = ambientRef.current;
    if (!ambient) {
      const found = scene.getObjectByName(AMBIENT_LIGHT_NAME);
      if (found instanceof THREE.AmbientLight) ambientRef.current = ambient = found;
    }
    if (!ambient) return;

    // The horizon colour the sky already computes, reused rather than
    // re-derived: `OptimizedSkySystem` lerps this from night to day horizon by
    // the same daylight value that drives the sky shader.
    _horizon.copy(ambient.color);
    const background = scene.background;
    if (background instanceof THREE.Color) {
      _top.copy(background);
    } else {
      _top.copy(_horizon);
    }

    // Sampled rather than read back off the light. `sun-key-light.position`
    // clamps its height to 8 so the key never rakes in from below the floor,
    // which destroys the elevation the golden-hour term needs, and
    // `SunShadowRig` then rewrites the position entirely. The atmosphere model
    // is pure and cheap, so ask it directly - the same thing `FactoryExterior`
    // and `OptimizedExterior` already do.
    const { gameDay, gameTime, weather } = useGameSimulationStore.getState();
    const celestial = sampleCelestial(sampleAtmosphere(gameDay, gameTime, weather), _celestial);
    _ground.copy(GROUND_ALBEDO).lerp(GROUND_GOLDEN, celestial.goldenHour);
    // Without this the nadir band stays at daylight brightness all night and
    // lights the world from below under a black sky.
    const horizonLuminance = 0.2126 * _horizon.r + 0.7152 * _horizon.g + 0.0722 * _horizon.b;
    _ground.multiplyScalar(
      Math.max(GROUND_NIGHT_FLOOR, Math.min(1, horizonLuminance / DAY_HORIZON_LUMINANCE))
    );

    const hemisphere = hemisphereRef.current;
    if (hemisphere) {
      hemisphere.color.copy(_horizon);
      hemisphere.groundColor.copy(_ground);
    }

    if (hdriEnvironmentActive) return;

    const now = performance.now();

    _sunDirection.fromArray(celestial.sunDirection);
    const generator = pmremRef.current;
    if (generator && _sunDirection.lengthSq() >= 1e-6) {
      _sunDirection.normalize();

      const moved = _sunDirection.dot(lastSunRef.current) < REGENERATE_SUN_DOT;
      const recoloured =
        colorDistanceSquared(_top, lastTopRef.current) >
        REGENERATE_COLOR_DELTA * REGENERATE_COLOR_DELTA;
      const stale = lastGeneratedRef.current === 0;
      const settled = now - lastGeneratedRef.current >= REGENERATE_MIN_INTERVAL_MS;

      if (stale || ((moved || recoloured) && settled)) {
        const daylight = clamp01(celestial.sunLightIntensity / SUN_REFERENCE_INTENSITY);
        _sunTint.copy(SUN_TINT_DAY).lerp(SUN_TINT_GOLDEN, celestial.goldenHour);
        const topMean = (_top.r + _top.g + _top.b) / 3;
        _disc.copy(_sunTint).multiplyScalar(SUN_DISC_GAIN * topMean * daylight);

        writeEnvironmentBands(source, _top, _horizon, _ground, _sunDirection, _disc);

        // THE TARGET IS REUSED, NOT REALLOCATED. `fromEquirectangular` takes
        // the target to render into, and passing the previous one keeps the
        // texture identity stable. That matters twice over. `WebGLRenderer`
        // compares `materialProperties.envMap` against the current environment
        // on every draw, so a fresh object twice a second pushed every material
        // in the scene back through `getProgram` to rebuild its cache key; and
        // the materials adopted below would otherwise be left holding the
        // target that is disposed on the next line.
        const previous = targetRef.current;
        const generated = generator.fromEquirectangular(source, previous);
        targetRef.current = generated;
        scene.environment = generated.texture;
        // Written here and nowhere else, which is load-bearing on the Ultra
        // path: drei's `<Environment>` captures `scene.environment` and
        // `scene.environmentIntensity` at mount and restores both on unmount,
        // and this rig reclaims them because the effect above resets
        // `lastGeneratedRef` to 0 on the way back, forcing `stale` here. Drop
        // that reset and Ultra silently keeps whatever the HDRI left behind.
        // (Its restore of `scene.environment` is only safe because the target
        // below is reused - the pointer it captured is still the live one.)
        scene.environmentIntensity = ENVIRONMENT_INTENSITY;
        if (previous !== null && previous !== generated) previous.dispose();

        lastSunRef.current.copy(_sunDirection);
        lastTopRef.current.copy(_top);
        lastGeneratedRef.current = now;
      }
    }

    const target = targetRef.current;
    if (!target) return;

    // A REGENERATION IS NOT A REASON TO RE-WALK THE GRAPH.
    //
    // `PMREMGenerator._fromTexture` takes the target to render into and only
    // allocates when it is given none, so passing the previous one back keeps
    // the texture identity stable across every regeneration. Every material
    // adopted earlier therefore still holds the correct object, and the walk
    // this used to force twice a second - once per `REGENERATE_MIN_INTERVAL_MS`
    // while the sun is moving - re-assigned pointers that were already right.
    // What genuinely invalidates an adoption is the identity changing (first
    // convolution, or the return from the Ultra HDRI path, which releases).
    const identityChanged = adoptedTextureRef.current !== target.texture;
    if (identityChanged || now - lastAdoptedRef.current >= adoptIntervalRef.current) {
      const touched = adoptEnvironmentMap(scene, target.texture);
      adoptedTextureRef.current = target.texture;
      lastAdoptedRef.current = now;
      // Back off while nothing new is arriving, snap back the moment it does.
      adoptIntervalRef.current =
        touched > 0
          ? ADOPT_INTERVAL_MS
          : Math.min(ADOPT_INTERVAL_MAX_MS, adoptIntervalRef.current * 2);
    }
  });

  return (
    <hemisphereLight
      ref={hemisphereRef}
      name={HEMISPHERE_LIGHT_NAME}
      args={['#e3f1f2', '#6f806c', HEMISPHERE_INTENSITY]}
    />
  );
}
