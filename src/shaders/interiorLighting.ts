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
  /**
   * Share of the slab's irradiance a down-facing surface above it receives
   * back: the concrete's albedo (~0.4) times the large view factor of a hall
   * floor seen from its deck. Without it the deck took only the uplight and
   * read black at night.
   */
  floorBounce: 0.3,
  /** Receivers lower than this above the slab take no bounce, metres. */
  bounceMinHeight: 0.5,
  /**
   * A deck sees the whole slab, not the patch under it: the slab is sampled
   * under the receiver and this many receiver-heights either side, across the
   * rows, weighted 1:2:1 (a 3-tap fit to the Lambertian view kernel). Under a
   * row that softens the bounce; at the hall's ends, far from any row, it
   * roughly doubles it.
   */
  bounceSpread: 0.7,
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

/**
 * 3. THE SKY'S INDIRECT LIGHT UNDER THE ROOF (experiment, D-063, off by default).
 *
 *    Ambient, hemisphere and diffuse IBL reach every fragment at the open
 *    sky's strength, so at noon the hall took most of its light from a sky it
 *    can only see through its walls: removing the sky fill changed 97.7% of the
 *    `interior` frame, removing the sun 31% (layer ablation, 2026-11-09). The
 *    fill also flattened the skylight sun patches, the hall's one directional
 *    read. With `MILLOS_INDOOR_SKY` defined (`IndoorSkyOcclusion` tags the
 *    materials), that indirect diffuse is scaled by a sky-visibility term: 1 at
 *    the glazed wall planes, falling over `ramp` metres to `floor` in the
 *    middle of the hall, and 1 anywhere outside the footprint or above the roof
 *    underside, so no exterior pixel can change.
 *
 *    Diffuse only. Metals that adopted the PMREM have no diffuse term, and
 *    darkening their sky reflection indoors is a separate experiment. The
 *    skylights are not modelled: the sun through them is direct light under
 *    the shadow map already, and six 9 x 11 m apertures are ~7% of the roof.
 *    `indoorBounce` divides `indirectDiffuse` by albedo after this chunk; the
 *    scale is linear, so that division stays exact.
 */
export const INDOOR_SKY = {
  /** Share of the open sky's indirect diffuse reaching the middle of the hall. */
  floor: 0.3,
  /**
   * The roof is pitched (0.05 rad from a ridge at x 0) and its top face is at
   * the flat `ROOF.underside` only at the eaves, so a flat height gate counted
   * the plant and skylight kerbs standing on the deck near the eaves as
   * indoors. The gate follows the deck instead: these mirror `ROOF_DECK_TOP`,
   * `ROOF_HALF_CENTRE` and `ROOF_PITCH` in `OptimizedFactoryInfrastructure`
   * (pinned equal by `indoorSky.test.ts`), and anything on or above the top
   * face is outdoors.
   */
  deckTop: SITE_LAYOUT.factory.bounds.maxY + 0.63,
  deckHalfCentre: SITE_LAYOUT.factory.floor.width / 4,
  deckPitch: 0.05,
  /** Metres inside the wall plane where the ramp starts: clear of the outer face and glazing. */
  inset: 0.6,
  /** Metres over which visibility falls from the walls to `floor`. */
  ramp: 12,
} as const;

/**
 * Ceiling-bank multiplier while the experiment is on. The banks are dimmed by
 * day (`zoneWorkLightIntensity`) because the sky fill was lighting the hall;
 * with that fill cut they hold their night level. A starting value, tuned
 * against the interior floor luma target, not derived.
 */
export const INDOOR_SKY_BANK_GAIN = 1.85;

/** The define `IndoorSkyOcclusion` sets on a material to compile the term in. */
export const INDOOR_SKY_DEFINE = 'MILLOS_INDOOR_SKY';

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

/** World height of the roof deck's top face above world x. */
export function indoorSkyDeckTop(x: number): number {
  return (
    INDOOR_SKY.deckTop - (Math.abs(x) - INDOOR_SKY.deckHalfCentre) * Math.tan(INDOOR_SKY.deckPitch)
  );
}

/**
 * 1 for a receiver the banks can reach, 0 for one on or above the roof deck
 * inside the hall footprint. The banks are unshadowed points under the roof,
 * so without this the rooftop plant and skylight kerbs took the hall's light
 * through the deck (brighter by up to 3 luma at night, and by day once the
 * indoor sky experiment holds the banks at their night level). Outside the
 * footprint it is 1: light through the glazing onto the yard is real.
 */
export function bankDeckPass(x: number, y: number, z: number): number {
  const inside = Math.abs(x) < ROOF.maxX && Math.abs(z) < ROOF.maxZ ? 1 : 0;
  const deckTop = indoorSkyDeckTop(x);
  return 1 - inside * smoothstep(deckTop - 0.2, deckTop, y);
}

/** Share of the sky's indirect diffuse a world point receives with the experiment on. */
export function indoorSkyVisibility(x: number, y: number, z: number): number {
  const startX = ROOF.maxX - INDOOR_SKY.inset;
  const startZ = ROOF.maxZ - INDOOR_SKY.inset;
  const inX = smoothstep(startX, startX - INDOOR_SKY.ramp, Math.abs(x));
  const inZ = smoothstep(startZ, startZ - INDOOR_SKY.ramp, Math.abs(z));
  const deckTop = indoorSkyDeckTop(x);
  const under = smoothstep(deckTop - 0.1, deckTop - 0.45, y);
  return 1 - (1 - INDOOR_SKY.floor) * inX * inZ * under;
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

function bankLineTerms(
  light: THREE.Vector3,
  intensity: number,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  cutoff: number,
  includeBounce: boolean
): BankTerms {
  const L = BANK_LINE.halfLength;
  const w = _w.copy(light).sub(point);
  const b = w.x;
  const c = w.lengthSq();
  const perp2 = Math.max(c - b * b, 0);
  const D = Math.max(perp2, BANK_LINE.minDistance ** 2);
  const nw = normal.dot(w);
  const nd = normal.x;
  const height = light.y - BANK_LINE.floorDrop;
  const lambda = lambdaScale(height);
  const overshoot = Math.max(Math.abs(b) - L, 0);
  const endWindow = Math.max(0, 1 - (overshoot / BANK_LINE.endRange) ** 4) ** 2;
  const window = (p2: number) => Math.max(0, 1 - (Math.sqrt(p2) / cutoff) ** 4) ** 2;

  // Floor bounce: the slab under and around the receiver, lit by this row,
  // returned to a down-facing receiver. The slab's normal is up, so its line
  // integral has no clipping and nd = 0.
  const slab = (wx: number, wy: number, wz: number): number => {
    const cf = wx * wx + wy * wy + wz * wz;
    const perpF = Math.max(cf - wx * wx, 0);
    const DF = Math.max(perpF, BANK_LINE.minDistance ** 2);
    const rf1 = Math.sqrt(Math.max(L * L + 2 * wx * L + cf, 1e-4));
    const rf0 = Math.sqrt(Math.max(L * L - 2 * wx * L + cf, 1e-4));
    const floorE = (height * ((L + wx) / rf1 + (L - wx) / rf0)) / DF;
    const tsF = Math.min(L, Math.max(-L, -wx));
    const toF = Math.hypot(wx + tsF, wy, wz);
    const emitF =
      BANK_LINE.uplight + (1 - BANK_LINE.uplight) * Math.max(wy / Math.max(toF, 1e-4), 0);
    const overshootF = Math.max(Math.abs(wx) - L, 0);
    const endF = Math.max(0, 1 - (overshootF / BANK_LINE.endRange) ** 4) ** 2;
    return floorE * lambda * emitF * endF * window(perpF);
  };
  let bounce = 0;
  const facingDown = Math.max(-normal.y, 0);
  const above = point.y;
  if (includeBounce && facingDown > 0 && above > BANK_LINE.bounceMinHeight) {
    const wy = w.y + above;
    const spread = BANK_LINE.bounceSpread * above;
    bounce =
      BANK_LINE.floorBounce *
      facingDown *
      (0.25 * slab(b, wy, w.z - spread) +
        0.5 * slab(b, wy, w.z) +
        0.25 * slab(b, wy, w.z + spread));
  }

  let t0: number = -L;
  let t1: number = L;
  if (Math.abs(nd) > 1e-5) {
    const tz = -nw / nd;
    if (nd > 0) t0 = Math.max(t0, tz);
    else t1 = Math.min(t1, tz);
  } else if (nw <= 0) t1 = t0;
  const facing = { facingDown, bounce: intensity * bounce };
  if (t1 <= t0) return { ...facing, received: intensity * bounce, line: null };
  // The clipped segment's VECTOR irradiance, w * A - d * B: its dot with the
  // normal is the scalar integral, and its direction is where the light
  // arrives from on average.
  const r = (t: number) => Math.sqrt(Math.max(t * t + 2 * b * t + c, 1e-4));
  const A = (t1 + b) / (D * r(t1)) - (t0 + b) / (D * r(t0));
  const B = (b * t1 + c) / (D * r(t1)) - (b * t0 + c) / (D * r(t0));
  // d is world X here.
  const vector = new THREE.Vector3(w.x * A - B, w.y * A, w.z * A).multiplyScalar(lambda);
  const E = Math.max(nw * A - nd * B, 0) * lambda;
  const ts = Math.min(t1, Math.max(t0, -b));
  _toLight.set(w.x + ts, w.y, w.z);
  const distance = Math.max(_toLight.length(), 1e-4);
  const emit = BANK_LINE.uplight + (1 - BANK_LINE.uplight) * Math.max(_toLight.y / distance, 0);
  const scale = intensity * emit * endWindow * window(perp2);
  return {
    ...facing,
    received: E * scale + intensity * bounce,
    line: { vector, scale },
  };
}

interface BankTerms {
  facingDown: number;
  /** Floor bounce reaching the receiver, already times intensity. */
  bounce: number;
  /** Total irradiance on a surface with exactly this normal. */
  received: number;
  /** The direct row: vector irradiance and the scalar it is weighted by. */
  line: { vector: THREE.Vector3; scale: number } | null;
}

/**
 * World-space mirror of `millosBankIncident`'s irradiance, for tests and
 * design numbers. `light` is the row centre, the line runs along world X.
 */
export function bankLineIrradiance(
  light: THREE.Vector3,
  intensity: number,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  cutoff = 44,
  includeBounce = true
): number {
  return bankLineTerms(light, intensity, point, normal, cutoff, includeBounce).received;
}

/** What `millosBankIncident` hands three's `RE_Direct`: one direction and its radiance. */
export interface BankIncident {
  direction: THREE.Vector3;
  /** Scalar on `light.color`; RE_Direct multiplies it by saturate(N.L). */
  radiance: number;
}

/**
 * World-space mirror of the incident the shader builds for a receiver whose
 * INTERPOLATED (not normal-mapped) normal is `normal`.
 *
 * The row and the floor bounce are each turned into an equivalent directional
 * light - the row along its clipped segment's vector irradiance, the bounce
 * straight up from the slab - and the two are summed as vectors. On the
 * geometric normal that reproduces `bankLineIrradiance` exactly; a normal map
 * then shades by N.L against that one direction, as it does under a point
 * light, instead of re-clipping the row on every bevel.
 */
export function bankLineIncident(
  light: THREE.Vector3,
  intensity: number,
  point: THREE.Vector3,
  normal: THREE.Vector3,
  cutoff = 44
): BankIncident {
  const terms = bankLineTerms(light, intensity, point, normal, cutoff, true);
  const total = new THREE.Vector3(0, -terms.bounce / Math.max(terms.facingDown, 0.05), 0);
  if (terms.line) total.addScaledVector(terms.line.vector, terms.line.scale);
  const radiance = total.length() * bankDeckPass(point.x, point.y, point.z);
  return {
    direction: radiance > 1e-8 ? total.normalize() : new THREE.Vector3(0, 1, 0),
    radiance,
  };
}

/**
 * Diffuse irradiance three actually delivers from one row to a fragment whose
 * interpolated normal is `geometricNormal` and whose normal-mapped shading
 * normal is `shadingNormal`: the incident's radiance times saturate(N.L).
 */
export function bankLineDelivered(
  light: THREE.Vector3,
  intensity: number,
  point: THREE.Vector3,
  geometricNormal: THREE.Vector3,
  shadingNormal: THREE.Vector3,
  cutoff = 44
): number {
  const incident = bankLineIncident(light, intensity, point, geometricNormal, cutoff);
  return incident.radiance * Math.min(1, Math.max(0, shadingNormal.dot(incident.direction)));
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
float millosIndoorSkyVisibility( const in vec3 viewPosition ) {
  vec3 world = ( viewPosition - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
  float inX = smoothstep( ${f(ROOF.maxX - INDOOR_SKY.inset)}, ${f(ROOF.maxX - INDOOR_SKY.inset - INDOOR_SKY.ramp)}, abs( world.x ) );
  float inZ = smoothstep( ${f(ROOF.maxZ - INDOOR_SKY.inset)}, ${f(ROOF.maxZ - INDOOR_SKY.inset - INDOOR_SKY.ramp)}, abs( world.z ) );
  float deckTop = ${f(INDOOR_SKY.deckTop)} - ( abs( world.x ) - ${f(INDOOR_SKY.deckHalfCentre)} ) * ${f(Math.tan(INDOOR_SKY.deckPitch))};
  float under = smoothstep( deckTop - 0.1, deckTop - 0.45, world.y );
  return 1.0 - ${f(1 - INDOOR_SKY.floor)} * inX * inZ * under;
}
// Mirror of bankDeckPass: no bank light on or above the deck inside the hall.
float millosBankDeckPass( const in vec3 viewPosition ) {
  vec3 world = ( viewPosition - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
  float inside = ( abs( world.x ) < ${f(ROOF.maxX)} && abs( world.z ) < ${f(ROOF.maxZ)} ) ? 1.0 : 0.0;
  float deckTop = ${f(INDOOR_SKY.deckTop)} - ( abs( world.x ) - ${f(INDOOR_SKY.deckHalfCentre)} ) * ${f(Math.tan(INDOOR_SKY.deckPitch))};
  return 1.0 - inside * smoothstep( deckTop - 0.2, deckTop, world.y );
}
#if NUM_POINT_LIGHTS > 0
// The slab's irradiance from one row at a floor point, given light - point.
float millosBankSlab( const in PointLight light, const in vec3 wf, const in vec3 d, const in vec3 up, const in float height, const in float lambda ) {
  float b = dot( wf, d );
  float cf = dot( wf, wf );
  float perpF = max( cf - b * b, 0.0 );
  float DF = max( perpF, ${f(BANK_LINE.minDistance ** 2)} );
  float rf1 = sqrt( max( ${f(BANK_LINE.halfLength ** 2)} + ${f(2 * BANK_LINE.halfLength)} * b + cf, 1e-4 ) );
  float rf0 = sqrt( max( ${f(BANK_LINE.halfLength ** 2)} - ${f(2 * BANK_LINE.halfLength)} * b + cf, 1e-4 ) );
  float floorE = height * ( ( ${f(BANK_LINE.halfLength)} + b ) / rf1 + ( ${f(BANK_LINE.halfLength)} - b ) / rf0 ) / DF;
  vec3 toF = wf + clamp( -b, -${f(BANK_LINE.halfLength)}, ${f(BANK_LINE.halfLength)} ) * d;
  float emitF = ${f(BANK_LINE.uplight)} + ${f(1 - BANK_LINE.uplight)} * max( dot( toF, up ) / max( length( toF ), 1e-4 ), 0.0 );
  float overshootF = max( abs( b ) - ${f(BANK_LINE.halfLength)}, 0.0 );
  float endF = pow2( saturate( 1.0 - pow4( overshootF / ${f(BANK_LINE.endRange)} ) ) );
  float perpWindowF = light.distance > 0.0
    ? pow2( saturate( 1.0 - pow4( sqrt( perpF ) / light.distance ) ) )
    : 1.0;
  return floorE * lambda * emitF * endF * perpWindowF;
}
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
  // Height of the row above the slab is its view-space offset along world up.
  float height = dot( light.position - ( viewMatrix[ 3 ].xyz ), up ) - ${f(BANK_LINE.floorDrop)};
  float lambda = height * sqrt( ${f(BANK_LINE.halfLength ** 2)} + height * height ) / ${f(2 * BANK_LINE.halfLength)};
  float overshoot = max( abs( b ) - ${f(BANK_LINE.halfLength)}, 0.0 );
  float endWindow = pow2( saturate( 1.0 - pow4( overshoot / ${f(BANK_LINE.endRange)} ) ) );
  // Floor bounce: the slab under and around the receiver, lit by this row,
  // returned to a down-facing receiver (the roof deck, gantry and platform
  // undersides). Three slab taps across the rows, weighted 1:2:1.
  float facingDown = max( -dot( n, up ), 0.0 );
  float above = dot( x - viewMatrix[ 3 ].xyz, up );
  float bounce = 0.0;
  if ( facingDown > 0.0 && above > ${f(BANK_LINE.bounceMinHeight)} ) {
    vec3 across = viewMatrix[ 2 ].xyz * ( ${f(BANK_LINE.bounceSpread)} * above );
    vec3 wf = w + above * up;
    bounce = ${f(BANK_LINE.floorBounce)} * facingDown * (
      0.25 * millosBankSlab( light, wf - across, d, up, height, lambda ) +
      0.5 * millosBankSlab( light, wf, d, up, height, lambda ) +
      0.25 * millosBankSlab( light, wf + across, d, up, height, lambda ) );
  }
  float t0 = -${f(BANK_LINE.halfLength)};
  float t1 = ${f(BANK_LINE.halfLength)};
  if ( abs( nd ) > 1e-5 ) {
    float tz = -nw / nd;
    if ( nd > 0.0 ) t0 = max( t0, tz ); else t1 = min( t1, tz );
  } else if ( nw <= 0.0 ) {
    t1 = t0;
  }
  if ( t1 <= t0 ) {
    // Only the bounce reaches this face; it arrives from the slab below.
    incident.direction = -up;
    incident.color = light.color * ( bounce / max( facingDown, 0.05 ) ) * millosBankDeckPass( x );
    incident.visible = bounce > 0.0;
    return;
  }
  float r0 = sqrt( max( t0 * t0 + 2.0 * b * t0 + c, 1e-4 ) );
  float r1 = sqrt( max( t1 * t1 + 2.0 * b * t1 + c, 1e-4 ) );
  // Vector irradiance of the clipped segment, w * A - d * B. Its dot with n is
  // the exact scalar integral; its direction is where the light arrives from
  // on average, so RE_Direct's N.L against the NORMAL-MAPPED normal shades a
  // bevel as it would under a point light.
  float lineA = ( t1 + b ) / ( D * r1 ) - ( t0 + b ) / ( D * r0 );
  float lineB = ( b * t1 + c ) / ( D * r1 ) - ( b * t0 + c ) / ( D * r0 );
  vec3 lineVector = ( w * lineA - d * lineB ) * lambda;
  float ts = clamp( -b, t0, t1 );
  vec3 toLight = w + ts * d;
  float emit = ${f(BANK_LINE.uplight)} + ${f(1 - BANK_LINE.uplight)} * max( dot( toLight, up ) / max( length( toLight ), 1e-4 ), 0.0 );
  float perpWindow = light.distance > 0.0
    ? pow2( saturate( 1.0 - pow4( sqrt( perp2 ) / light.distance ) ) )
    : 1.0;
  // The row and the floor bounce as two directional equivalents, summed.
  vec3 arriving = lineVector * ( emit * endWindow * perpWindow )
    - up * ( bounce / max( facingDown, 0.05 ) );
  float radiance = length( arriving );
  incident.direction = radiance > 1e-8 ? arriving / radiance : up;
  incident.color = light.color * radiance * millosBankDeckPass( x );
  incident.visible = radiance > 0.0;
}
#endif
`;

const POINT_INCIDENT = 'getPointLightInfo( pointLight, geometryPosition, directLight );';
const BANK_CALL =
  ' millosBankIncident( pointLight, geometryPosition, nonPerturbedNormal, directLight );';
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

const INDOOR_SKY_MARKER = 'millosIndoorSkyVisibility( geometryPosition )';
const INDIRECT_DIFFUSE_CALL = 'RE_IndirectDiffuse( irradiance,';
const INDOOR_SKY_TERM = /* glsl */ `
#if defined( ${INDOOR_SKY_DEFINE} ) && defined( RE_IndirectDiffuse )
	{
		float millosSkyVisibility = ${INDOOR_SKY_MARKER};
		irradiance *= millosSkyVisibility;
		iblIrradiance *= millosSkyVisibility;
	}
#endif
`;

/**
 * Prepended to `lights_fragment_end`, before anything reads the indirect
 * diffuse. The `#include <lights_fragment_end>` line that six material hooks
 * anchor on is untouched, so they still land after it.
 */
export function patchIndoorSkyEnd(source: string): string {
  if (source.includes(INDOOR_SKY_MARKER)) return source;
  if (source.split(INDIRECT_DIFFUSE_CALL).length !== 2)
    throw new Error('Three light assembly changed; review the indoor sky visibility term.');
  return `${INDOOR_SKY_TERM}${source}`;
}

/** Install after `installPunctualLightCulling`, before any program compiles. */
export function installInteriorLighting(): void {
  const begin = patchInteriorLightingBegin(THREE.ShaderChunk.lights_fragment_begin);
  THREE.ShaderChunk.lights_pars_begin = patchInteriorLightingPars(
    THREE.ShaderChunk.lights_pars_begin
  );
  THREE.ShaderChunk.lights_fragment_begin = begin;
  THREE.ShaderChunk.lights_fragment_end = patchIndoorSkyEnd(THREE.ShaderChunk.lights_fragment_end);
}
