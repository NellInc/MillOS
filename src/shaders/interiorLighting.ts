import * as THREE from 'three';
import { SITE_LAYOUT } from '../constants/siteLayout';

/**
 * Two global edits to three's light assembly, both about the covered hall.
 *
 * 1. THE FLUORESCENT ROWS ARE LINES, NOT BULBS.
 *
 *    `InteriorLightRig` approximates each row of five ceiling fittings with one
 *    point light on the hall centre-line (x = 0). An isotropic point lights a
 *    face only when the face looks back at x = 0, so of three identical
 *    plansifters standing at x = -14, 0, 14 only sifter C's west face - the one
 *    the interior and milling cameras look at - was lit; A and B went black at
 *    night while C stayed cream (19:00 / 22:00 captures). No placement of one or
 *    two points can light three faces in a row alike. A row of fittings can, so
 *    the rig's broad banks (marked by `decay === 0`, which no other light in the
 *    scene uses) are now evaluated as a finite line along world X with the
 *    exact irradiance integral of an isotropic line, clipped to the receiver's
 *    horizon, then shaped by a down-facing optic with a small uplight fraction.
 *    Same uniforms, same light count, no new program define: the reference arm
 *    (`perfDebug.disableInteriorLightBanks`, decay 2) still gets three's stock
 *    point light, so the two arms are one toggle apart.
 *
 * 2. NO SHADOW MAP, NO SUN UNDER THE ROOF.
 *
 *    `low` renders without a shadow pass, so the noon key lit the interior slab
 *    as if the roof were not there: interior floor luma 172 against Medium's 86
 *    (base-low-12 vs base-med-12). Every program compiled without
 *    `USE_SHADOWMAP` - which is exactly the shadowless tier - now scales each
 *    directional light by an analytic roof term. Tiers with a shadow map compile
 *    the term out entirely, so their pixels cannot change.
 */

/** Line-source profile shared by the GLSL and its TypeScript mirror. */
export const BANK_LINE = {
  /** Half-length along X: the outermost fittings are at +-28 with 3.1 m housings. */
  halfLength: 31.1,
  /** Floor drop the under-fixture radiance is matched at. */
  floorDrop: 0,
  /** Near-field clamp, metres. Bounds the 1/d growth beside the tube. */
  minDistance: 5,
  /** Fade-out beyond each end of the row, metres. Keeps the outdoor silos dark. */
  endRange: 24,
  /** Fraction of the optic's output that is not directed downward. */
  uplight: 0.15,
} as const;

const ROOF = {
  minX: SITE_LAYOUT.factory.bounds.minX,
  maxX: SITE_LAYOUT.factory.bounds.maxX,
  minZ: SITE_LAYOUT.factory.bounds.minZ,
  maxZ: SITE_LAYOUT.factory.bounds.maxZ,
  underside: SITE_LAYOUT.factory.bounds.maxY - 0.4,
  /** Light that still arrives through glazing and skylights on Low. */
  residual: 0.1,
};

const smoothstep = (edge0: number, edge1: number, value: number): number => {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Directional-light multiplier at a world point when no shadow map exists. */
export function roofSunOcclusion(x: number, y: number, z: number): number {
  const inX = smoothstep(ROOF.maxX + 0.5, ROOF.maxX - 1, Math.abs(x));
  const inZ = smoothstep(ROOF.maxZ + 0.5, ROOF.maxZ - 1, Math.abs(z));
  const under = smoothstep(ROOF.underside + 0.3, ROOF.underside - 0.3, y);
  return 1 - (1 - ROOF.residual) * inX * inZ * under;
}

/**
 * Height the row's radiance is normalised against: the old point light gave
 * exactly its intensity to the slab directly beneath it (decay 0, N.L = 1).
 */
function lambdaScale(height: number): number {
  const L = BANK_LINE.halfLength;
  return (height * Math.sqrt(L * L + height * height)) / (2 * L);
}

const _w = new THREE.Vector3();
const _toLight = new THREE.Vector3();

/**
 * World-space mirror of `millosBankIncident`, for tests and design numbers.
 * `light` is the row centre, the line runs along world X.
 */
export function bankLineIrradiance(
  light: THREE.Vector3,
  intensity: number,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  cutoff = 44
): number {
  const L = BANK_LINE.halfLength;
  const w = _w.copy(light).sub(point);
  const b = w.x;
  const c = w.lengthSq();
  const perp2 = Math.max(c - b * b, 0);
  const D = Math.max(perp2, BANK_LINE.minDistance ** 2);
  const nw = normal.dot(w);
  const nd = normal.x;
  let t0: number = -L;
  let t1: number = L;
  if (Math.abs(nd) > 1e-5) {
    const tz = -nw / nd;
    if (nd > 0) t0 = Math.max(t0, tz);
    else t1 = Math.min(t1, tz);
  } else if (nw <= 0) t1 = t0;
  if (t1 <= t0) return 0;
  const bracket = (t: number) =>
    (nw * (t + b) - nd * (b * t + c)) / (D * Math.sqrt(Math.max(t * t + 2 * b * t + c, 1e-4)));
  const height = light.y - BANK_LINE.floorDrop;
  const E = Math.max(bracket(t1) - bracket(t0), 0) * lambdaScale(height);
  const ts = Math.min(t1, Math.max(t0, -b));
  _toLight.set(w.x + ts, w.y, w.z);
  const distance = Math.max(_toLight.length(), 1e-4);
  const emit = BANK_LINE.uplight + (1 - BANK_LINE.uplight) * Math.max(_toLight.y / distance, 0);
  const overshoot = Math.max(Math.abs(b) - L, 0);
  const endWindow = Math.max(0, 1 - (overshoot / BANK_LINE.endRange) ** 4) ** 2;
  const perpWindow = Math.max(0, 1 - (Math.sqrt(perp2) / cutoff) ** 4) ** 2;
  return intensity * E * emit * endWindow * perpWindow;
}

const f = (value: number) => value.toFixed(4);

const PARS_MARKER = 'millosBankIncident';

const PARS_GLSL = /* glsl */ `
float millosRoofOcclusion( const in vec3 viewPosition ) {
  vec3 world = ( viewPosition - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
  float inX = smoothstep( ${f(ROOF.maxX + 0.5)}, ${f(ROOF.maxX - 1)}, abs( world.x ) );
  float inZ = smoothstep( ${f(ROOF.maxZ + 0.5)}, ${f(ROOF.maxZ - 1)}, abs( world.z ) );
  float under = smoothstep( ${f(ROOF.underside + 0.3)}, ${f(ROOF.underside - 0.3)}, world.y );
  return 1.0 - ${f(1 - ROOF.residual)} * inX * inZ * under;
}
#if NUM_POINT_LIGHTS > 0
void millosBankIncident( const in PointLight light, const in vec3 x, const in vec3 n, inout IncidentLight incident ) {
  if ( light.decay > 0.0 ) return;
  vec3 d = viewMatrix[ 0 ].xyz;
  vec3 up = viewMatrix[ 1 ].xyz;
  vec3 w = light.position - x;
  float b = dot( w, d );
  float c = dot( w, w );
  float perp2 = max( c - b * b, 0.0 );
  float D = max( perp2, ${f(BANK_LINE.minDistance ** 2)} );
  float nw = dot( n, w );
  float nd = dot( n, d );
  float t0 = -${f(BANK_LINE.halfLength)};
  float t1 = ${f(BANK_LINE.halfLength)};
  if ( abs( nd ) > 1e-5 ) {
    float tz = -nw / nd;
    if ( nd > 0.0 ) t0 = max( t0, tz ); else t1 = min( t1, tz );
  } else if ( nw <= 0.0 ) {
    t1 = t0;
  }
  if ( t1 <= t0 ) {
    incident.color = vec3( 0.0 );
    incident.visible = false;
    return;
  }
  float r0 = sqrt( max( t0 * t0 + 2.0 * b * t0 + c, 1e-4 ) );
  float r1 = sqrt( max( t1 * t1 + 2.0 * b * t1 + c, 1e-4 ) );
  float e1 = ( nw * ( t1 + b ) - nd * ( b * t1 + c ) ) / ( D * r1 );
  float e0 = ( nw * ( t0 + b ) - nd * ( b * t0 + c ) ) / ( D * r0 );
  // Height of the row above the slab is its view-space offset along world up.
  float height = dot( light.position - ( viewMatrix[ 3 ].xyz ), up ) - ${f(BANK_LINE.floorDrop)};
  float lambda = height * sqrt( ${f(BANK_LINE.halfLength ** 2)} + height * height ) / ${f(2 * BANK_LINE.halfLength)};
  float irradiance = max( e1 - e0, 0.0 ) * lambda;
  float ts = clamp( -b, t0, t1 );
  vec3 toLight = w + ts * d;
  vec3 direction = toLight / max( length( toLight ), 1e-4 );
  float emit = ${f(BANK_LINE.uplight)} + ${f(1 - BANK_LINE.uplight)} * max( dot( direction, up ), 0.0 );
  float overshoot = max( abs( b ) - ${f(BANK_LINE.halfLength)}, 0.0 );
  float endWindow = pow2( saturate( 1.0 - pow4( overshoot / ${f(BANK_LINE.endRange)} ) ) );
  float perpWindow = light.distance > 0.0
    ? pow2( saturate( 1.0 - pow4( sqrt( perp2 ) / light.distance ) ) )
    : 1.0;
  float received = irradiance * emit * endWindow * perpWindow;
  incident.direction = direction;
  incident.color = light.color * ( received / max( dot( n, direction ), 0.05 ) );
  incident.visible = received > 0.0;
}
#endif
`;

const POINT_INCIDENT = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
const BANK_CALL =
  ' millosBankIncident( pointLight, geometryPosition, geometryNormal, directLight );';
const DIRECTIONAL_INCIDENT = 'getDirectionalLightInfo( directionalLight, directLight );';
const ROOF_TERM = `
		#ifndef USE_SHADOWMAP
		directLight.color *= millosRoofOcclusion( geometryPosition );
		#endif`;

/** Declarations, appended so `PointLight` and `IncidentLight` already exist. */
export function patchInteriorLightingPars(source: string): string {
  if (source.includes(PARS_MARKER)) return source;
  return `${source}\n${PARS_GLSL}`;
}

/**
 * The point incident runs inside a single-line `#define` once punctual
 * compaction is installed, so the bank call is appended on that same line.
 * Without compaction it is appended after the stock call. Either way the
 * canonical call still occurs exactly once, which is what civic lamp shadows
 * split on.
 */
export function patchInteriorLightingBegin(source: string): string {
  if (source.includes(BANK_CALL.trim())) return source;
  if (source.split(POINT_INCIDENT).length !== 2 || source.split(DIRECTIONAL_INCIDENT).length !== 2)
    throw new Error(
      'Three light assembly changed; review interior line lights and roof occlusion.'
    );
  return source
    .replace(POINT_INCIDENT, `${POINT_INCIDENT}${BANK_CALL}`)
    .replace(DIRECTIONAL_INCIDENT, `${DIRECTIONAL_INCIDENT}${ROOF_TERM}`);
}

/** Install after `installPunctualLightCulling`, before any program compiles. */
export function installInteriorLighting(): void {
  const begin = patchInteriorLightingBegin(THREE.ShaderChunk.lights_fragment_begin);
  THREE.ShaderChunk.lights_pars_begin = patchInteriorLightingPars(
    THREE.ShaderChunk.lights_pars_begin
  );
  THREE.ShaderChunk.lights_fragment_begin = begin;
}
