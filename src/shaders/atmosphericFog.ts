/**
 * Atmospheric fog: exponential-squared, height-attenuated, far-plane safe.
 *
 * WHY A GLOBAL CHUNK OVERRIDE RATHER THAN PER-MATERIAL PLUMBING
 *
 * Fog is evaluated on every lit surface in the scene, and those surfaces are
 * authored across a dozen files owned by different systems. Threading a new
 * uniform through all of them is both a large diff and a permanent maintenance
 * tax: a material added later silently opts out. Three.js composes fog from
 * four named chunks, so replacing those chunks reaches every fog-enabled
 * material - stock and custom - for one edit and zero uniforms. Every constant
 * below is baked into the GLSL as a literal for exactly that reason.
 *
 * WHAT IT CHANGES, IN ORDER OF HOW MUCH IT MATTERS
 *
 * 1. EXPONENTIAL-SQUARED INSTEAD OF LINEAR. `THREE.Fog` ramps linearly between
 *    `near` and `far` and then CLAMPS at 1.0. With the shipping clear-weather
 *    values (175 / 350) that put the site perimeter at radius 255 on a fog
 *    factor of 0.46 and everything past 350 on a flat 1.0: the whole middle
 *    distance converged to one blue-white wash and stopped carrying depth.
 *    `FogExp2` asymptotes instead - at density 0.0020 the same 255 reads 0.23,
 *    so distant geometry keeps roughly three quarters of its own albedo and
 *    silhouettes separate again.
 *
 * 2. HEIGHT ATTENUATION. Haze is a ground-hugging layer, so a rooftop at y=32
 *    should not haze like the slab at y=0. `FOG_HEIGHT_FALLOFF` gives a scale
 *    height around 71 world units, floored by `FOG_HEIGHT_FLOOR` so tall
 *    geometry never punches out to a hard, unhazed silhouette.
 *
 * 3. RADIAL DISTANCE, NOT VIEW-SPACE Z. Three.js ships `vFogDepth = -mvPosition.z`,
 *    which is the depth-buffer coordinate rather than the distance light
 *    actually travelled. At this scene's 97-degree horizontal field of view a
 *    fragment at the edge of the frame is 50 degrees off axis, so its z is only
 *    0.64 of its true distance and it receives roughly a third less haze than a
 *    fragment the same distance away in the centre. That is visible here and
 *    not subtle: the far ground pokes over the mountain ring at the left of the
 *    overview frame and, under z-based fog, stayed saturated green while the
 *    same terrain in the middle of the frame had faded out. `length()` costs one
 *    inverse square root per vertex and removes the artefact entirely.
 *
 * 4. A FAR-PLANE GUARD, WHICH IS NOT A NEW EFFECT BUT A PRESERVED CONTRACT.
 *    The former camera far plane was 360 (`constants/renderLayers.ts`), and the world
 *    is larger than that: from the `overview` camera the far rim of the ground
 *    disc sits about 413 units away and is clipped. That clip is invisible
 *    today only because the linear fog reached a saturated 1.0 at 350 and the
 *    fog colour is kept equal to the sky's horizon colour, so the clipped edge
 *    faded into the sky before it could be seen. `FogExp2` has no far cutoff
 *    and would have exposed a hard geometry edge through 40% haze. The guard
 *    re-establishes the old guarantee - full extinction before the frustum cuts.
 *    Because `vFogDepth` now carries radial distance and the frustum clips on
 *    view-space z, and z is never greater than radial distance, the guard is
 *    guaranteed to have saturated by the time anything reaches the far plane,
 *    at every angle across the frame.
 *
 * The current guard starts beyond the whole visible site and saturates at
 * 592 m, before the 600 m far plane. Its extinction model is unchanged.
 *
 * WHAT IT DOES NOT TOUCH: the fog COLOUR, which `OptimizedSkySystem` owns and
 * drives per frame from the sky's horizon colour plus a sun-direction inscatter
 * term. This module only decides how much of that colour a fragment receives.
 */

import * as THREE from 'three';

/*
 * DENSITY LIVES IN `simulation/atmosphere.ts`, NOT HERE. It is a property of
 * the weather event, alongside cloud coverage, wetness and wind, and that file
 * is the single place a weather state is described. This module owns only the
 * shape of the falloff. Reference values for the clear-weather density 0.0020,
 * as fog factor at ground level:
 *   100 -> 0.039   180 -> 0.124   255 -> 0.229   315 -> 0.325
 */

/** Reciprocal scale height of the haze layer, in inverse world units. */
export const FOG_HEIGHT_FALLOFF = 0.014;

/**
 * Floor on the height term.
 *
 * Without it a silo top or a roofline eventually reaches zero haze and reads as
 * a cut-out pasted over the fogged distance behind it. 0.35 keeps a thin veil
 * on everything while still separating high geometry from the ground plane.
 */
export const FOG_HEIGHT_FLOOR = 0.35;

/** Radial distance at which the far-plane guard starts to take over. */
export const FOG_HORIZON_START = 780;

/**
 * Radial distance at which fog is fully saturated.
 *
 * Must stay strictly inside `CAMERA_DEPTH.far` (960) or the frustum clips
 * before the fog has hidden the edge. The mountain rings are not a constraint
 * on this number: all three carry
 * `fog: false` and are shaded by their own aerial-perspective ramp instead.
 */
export const FOG_HORIZON_END = 952;

/**
 * CPU twin of the fragment-stage fog function.
 *
 * The GLSL below is the shipping implementation and cannot be unit tested
 * directly, so this mirrors it exactly and `__tests__/atmosphericFog.test.ts`
 * pins the curve shape through it: monotonic in distance, decreasing in height,
 * and fully saturated before the far plane. If the two ever disagree, the test
 * is asserting a fiction - change both.
 */
export function fogFactorAt(distance: number, height: number, density: number): number {
  const safeDistance = Math.max(0, distance);
  const heightFactor = Math.max(
    Math.exp(-Math.max(height, 0) * FOG_HEIGHT_FALLOFF),
    FOG_HEIGHT_FLOOR
  );
  const scaled = density * heightFactor * safeDistance;
  const exponential = 1 - Math.exp(-scaled * scaled);
  const guardRange = FOG_HORIZON_END - FOG_HORIZON_START;
  const t = Math.max(0, Math.min(1, (safeDistance - FOG_HORIZON_START) / guardRange));
  const guard = t * t * (3 - 2 * t);
  return Math.max(exponential, guard);
}

const glslNumber = (value: number): string => (Number.isInteger(value) ? `${value}.0` : `${value}`);

/**
 * ONE VARYING: THE VIEW-SPACE POSITION. Distance and height are both derived
 * from it in the fragment stage, and both have to be, for different reasons.
 *
 * DISTANCE MUST BE PER FRAGMENT. Three ships `vFogDepth = -mvPosition.z`, a
 * per-vertex scalar, and that is only safe because view-space z IS linear in
 * world space, so the rasteriser's perspective-correct interpolation
 * reconstructs it exactly. Radial `length()` is NOT linear, so interpolating it
 * per vertex is wrong by however coarse the mesh is - and this scene has a
 * ground plane spanning about 510 units with vertices only at its corners.
 * Every corner is 300 to 400 units out, so the interpolated "distance" under
 * the camera came out around 400 and the entire low-tier ground rendered as
 * flat fog colour. Verified by capture, not by reasoning: the missing terrain
 * in the low-quality overview shot was the ground at fogFactor 1.0.
 * Interpolating the view-space POSITION and taking its length in the fragment
 * shader is exact everywhere, because position is linear in world space.
 *
 * HEIGHT MUST BE RECOVERED FROM mvPosition, not from `modelMatrix *
 * transformed`: instancing, skinning and batching are all applied after
 * `begin_vertex`, so the model matrix alone does not describe where the vertex
 * ended up. `mvPosition` is the one value correct and in scope in every
 * standard vertex shader. A view matrix is rigid, so its rotation R is
 * orthonormal and R^-1 = R^T; the y component of the world-space offset is
 *   (R^T v).y = sum_j R[j][y] * v[j]
 * which in GLSL column-major terms is dot(vec3(m[0].y, m[1].y, m[2].y), v).
 * Adding the camera's own world height completes the reconstruction.
 * `viewMatrix` and `cameraPosition` are both declared in three's fragment
 * prefix, so this works in the fragment stage without extra plumbing.
 */
const FOG_PARS_VERTEX = /* glsl */ `
#ifdef USE_FOG

	varying vec3 vFogViewPosition;

#endif
`;

const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG

	vFogViewPosition = mvPosition.xyz;

#endif
`;

const FOG_PARS_FRAGMENT = /* glsl */ `
#ifdef USE_FOG

	uniform vec3 fogColor;
	varying vec3 vFogViewPosition;

	#ifdef FOG_EXP2

		uniform float fogDensity;

	#else

		uniform float fogNear;
		uniform float fogFar;

	#endif

#endif
`;

const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG

	// RADIAL distance, evaluated here rather than interpolated. See the note
	// above: -mvPosition.z is linear and safe to interpolate, length() is not.
	float vFogDepth = length( vFogViewPosition );
	float vFogWorldY = cameraPosition.y + dot( vec3( viewMatrix[ 0 ].y, viewMatrix[ 1 ].y, viewMatrix[ 2 ].y ), vFogViewPosition );

	#ifdef FOG_EXP2

		float fogHeightFactor = max( exp( - max( vFogWorldY, 0.0 ) * ${glslNumber(FOG_HEIGHT_FALLOFF)} ), ${glslNumber(FOG_HEIGHT_FLOOR)} );
		float fogScaled = fogDensity * fogHeightFactor * vFogDepth;
		float fogFactor = 1.0 - exp( - fogScaled * fogScaled );

	#else

		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );

	#endif

	// Far-plane guard. Outside the FOG_EXP2 branch on purpose: it is a
	// property of the frustum, not of the density model, and it is harmless
	// under linear fog, which already saturates before this range.
	fogFactor = max( fogFactor, smoothstep( ${glslNumber(FOG_HORIZON_START)}, ${glslNumber(FOG_HORIZON_END)}, vFogDepth ) );

	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );

#endif
`;

let installed = false;

/**
 * Replace the four stock fog chunks.
 *
 * MUST run before any fog-enabled material compiles its program, because
 * Three.js snapshots chunk source at compile time and a program already built
 * keeps the old code for the rest of the session. Called at module scope from
 * `App.tsx`, which is evaluated long before React mounts the Canvas.
 *
 * Called explicitly rather than relying on a bare `import` for side effects:
 * a side-effect-only import is exactly what a bundler is allowed to drop.
 * Idempotent, so a hot reload cannot double-apply it.
 */
export function installAtmosphericFogChunks(): void {
  if (installed) return;
  installed = true;
  THREE.ShaderChunk.fog_pars_vertex = FOG_PARS_VERTEX;
  THREE.ShaderChunk.fog_vertex = FOG_VERTEX;
  THREE.ShaderChunk.fog_pars_fragment = FOG_PARS_FRAGMENT;
  THREE.ShaderChunk.fog_fragment = FOG_FRAGMENT;
}

/** Test seam: reports whether the chunks currently carry the override. */
export function atmosphericFogChunksInstalled(): boolean {
  return THREE.ShaderChunk.fog_fragment === FOG_FRAGMENT;
}
