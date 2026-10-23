import * as THREE from 'three';

/**
 * Wet exterior ground.
 *
 * `AtmosphereState.wetness` was read only by the water shaders, so in rain the
 * apron and roads darkened with the light and stayed matte - which reads as
 * dusk, not as wet. One shared uniform object carries a damped wetness into
 * every ground material that opts in; changing it never recompiles anything.
 *
 * Water darkens a porous surface (the film fills the pores, so less light is
 * scattered back out) and lowers its roughness toward a thin specular sheet.
 */
export const SURFACE_WETNESS = { value: 0 };

/** Albedo kept and roughness kept at full wetness. */
export const WET_GROUND = { albedo: 0.7, roughness: 0.42 } as const;

/** Rate (1/s) at which the ground follows the weather: rain soaks in over seconds. */
export const WETTING_RATE = 0.9;

export function wetGroundResponse(wetness: number): { albedo: number; roughness: number } {
  const w = Number.isFinite(wetness) ? THREE.MathUtils.clamp(wetness, 0, 1) : 0;
  return {
    albedo: 1 - (1 - WET_GROUND.albedo) * w,
    roughness: 1 - (1 - WET_GROUND.roughness) * w,
  };
}

export function dampSurfaceWetness(current: number, target: number, delta: number): number {
  if (!Number.isFinite(target) || !Number.isFinite(delta)) return current;
  return THREE.MathUtils.damp(current, THREE.MathUtils.clamp(target, 0, 1), WETTING_RATE, delta);
}

/** Declares the uniform and `millosWetGround`; inject once per fragment shader. */
export const WET_GROUND_GLSL = /* glsl */ `
uniform float uSurfaceWetness;
void millosWetGround( inout vec3 albedo, inout float roughness ) {
  albedo *= 1.0 - ${(1 - WET_GROUND.albedo).toFixed(3)} * uSurfaceWetness;
  roughness *= 1.0 - ${(1 - WET_GROUND.roughness).toFixed(3)} * uSurfaceWetness;
}
`;
