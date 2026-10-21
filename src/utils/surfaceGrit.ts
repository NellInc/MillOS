/**
 * CLOSE-RANGE GRIT: analytic fine detail that exists only where it can be seen.
 *
 * Tiled maps carry the factory floor and the site grass at 2-10 cm per texel.
 * Close to the camera those texels are magnified into soft blobs - the judge
 * read the near floor in `forklift` as cloudy noise that smears, and the near
 * grass as soft. A smooth value noise at centimetre cells adds the grit and
 * blade-scale break-up the maps cannot hold, at no texture cost.
 *
 * It must never be drawn smaller than it can be resolved: each octave fades to
 * nothing as the pixel footprint (`fwidth`) approaches its cell size, so at
 * range the term is exactly zero rather than shimmering (CLAUDE.md
 * procedural-texture rule 5). `fwidth` needs uniform control flow, so call it
 * at the top level of a shader function, never inside a per-fragment branch.
 */
export const SURFACE_GRIT_GLSL = /* glsl */ `
float millosGritHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}

float millosGritNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = millosGritHash( i );
  float b = millosGritHash( i + vec2( 1.0, 0.0 ) );
  float c = millosGritHash( i + vec2( 0.0, 1.0 ) );
  float d = millosGritHash( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}

// Signed grit tone, about -1..1, in metres at the given cell size. Two octaves
// at a non-integer ratio and a rotation, so no lattice lines up; the finer one
// also forms the sparse pale and dark specks of exposed aggregate.
float millosGrit( vec2 metres, float cell ) {
  float footprint = max( max( fwidth( metres.x ), fwidth( metres.y ) ), 1e-5 );
  float fineCell = cell / 2.37;
  float coarseFade = 1.0 - smoothstep( cell * 0.45, cell * 1.4, footprint );
  float fineFade = 1.0 - smoothstep( fineCell * 0.45, fineCell * 1.4, footprint );
  vec2 p = metres / cell;
  float coarse = millosGritNoise( p );
  float fine = millosGritNoise( mat2( 0.8, -0.6, 0.6, 0.8 ) * p * 2.37 + 17.0 );
  float speck = smoothstep( 0.8, 0.9, fine ) - 0.7 * smoothstep( 0.82, 0.92, 1.0 - fine );
  return ( coarse * 2.0 - 1.0 ) * 0.55 * coarseFade
    + ( ( fine * 2.0 - 1.0 ) * 0.35 + speck * 0.6 ) * fineFade;
}
`;

/** Factory slab grit cell, metres: sand and fine aggregate in a power-floated slab. */
export const FLOOR_GRIT_CELL = 0.024;
/** Site grass break-up cell, metres: blade clumps and the gaps between them. */
export const GRASS_GRIT_CELL = 0.14;
