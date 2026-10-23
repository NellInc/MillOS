/**
 * CONCRETE HARDSTANDING: slab joints and slab-to-slab tone, analytic, in metres.
 *
 * The site's yards and perimeter used to share one warm tan gain over the tarmac
 * tile (`YARD_PAVING_TINT` was 2.1 / 1.7 / 1.5) and nothing that varied above
 * the 3.3 m tile but a soft macro field. The art judge measured it at mean sRGB
 * (142, 129, 116), sigma ~10, over 30-55% of every exterior frame, and read it
 * as sand. A poured yard is not a continuous surface: it is a grid of slabs cut
 * by sawn joints every 4.5-6 m, each slab a slightly different pour. Those two
 * features are what make a large flat area read as concrete at every distance,
 * and both are free to compute.
 *
 * ONE CHUNK, TWO HOSTS. `TerrainMaterial` (the splat's hardstanding channel)
 * and `worldSurface` (the authored yard planes, through the `slab` profile)
 * both include this GLSL, with the same pitch and origin, so a joint line runs
 * straight across the seam between the terrain and the 60 m yard plane laid
 * over it.
 *
 * THE PITCH IS NOT A FREE CHOICE. Joints sit on multiples of `SLAB_JOINT_PITCH`
 * in world X and Z, and the hardstanding edges are all on that grid: the
 * perimeter (x +/-100, z +/-90), the yards (x +/-30, z 50..110 and its mirror).
 * A pitch that does not divide them leaves a sliver slab against every kerb.
 * `concreteSlab.test.ts` pins this against the real layout.
 *
 * ANTIALIASING. A 35 mm joint is ~1.5 px at 40 m on the art viewport and far
 * less than a pixel past that. The joint is therefore box-filtered against the
 * fragment's own footprint (`fwidth`), so its coverage falls smoothly to
 * width/footprint instead of flickering on and off, and the whole grid fades
 * out once a pixel spans a sizeable fraction of a slab, before it can moire.
 * `fwidth` needs uniform control flow: call this at the top level of a shader
 * function, never inside a branch on a per-fragment value.
 */

/** Metres between saw-cut joints, both axes. Divides 200, 180 and 60. */
export const SLAB_JOINT_PITCH = 5;
/** Visible joint width, metres: the 6 mm cut plus its dirt-filled arrises. */
export const SLAB_JOINT_WIDTH = 0.035;

/**
 * `millosConcreteSlab( xz, pitch, width )` returns
 *   x - joint coverage, 0..1, box-filtered and faded with distance
 *   y - this slab's tone, -1..1 (a stable hash of the slab's cell)
 *   z - the dirt band either side of a joint, 0..1, faded with distance
 *   w - 1 on the occasional replaced slab (a later, paler pour), else 0
 *
 * The hash is transcendental-free, like `worldSurface`'s, so the term costs a
 * handful of ALU on surfaces that cover most of an exterior frame.
 */
export const CONCRETE_SLAB_GLSL = /* glsl */ `
float millosSlabHash( vec2 p ) {
  vec3 q = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
  q += dot( q, q.yzx + 33.33 );
  return fract( ( q.x + q.y ) * q.z );
}

vec4 millosConcreteSlab( vec2 xz, float pitch, float width ) {
  vec2 cellCoord = xz / pitch;
  vec2 cell = floor( cellCoord );
  vec2 f = cellCoord - cell;
  // Metres to the nearest joint on each axis.
  vec2 d = min( f, 1.0 - f ) * pitch;
  vec2 fw = max( fwidth( xz ), vec2( 1e-4 ) );
  // Exact box filter of a line [-w/2, w/2] over the pixel [d - fw/2, d + fw/2].
  vec2 halfWidth = vec2( width * 0.5 );
  vec2 cover = clamp(
    ( min( d + fw * 0.5, halfWidth ) - max( d - fw * 0.5, -halfWidth ) ) / fw,
    0.0,
    1.0
  );
  float footprint = max( fw.x, fw.y );
  float gridFade = 1.0 - smoothstep( pitch * 0.03, pitch * 0.12, footprint );
  float joint = max( cover.x, cover.y ) * gridFade;
  // Grit and tyre dirt collect in a soft band either side of the cut.
  vec2 band = 1.0 - smoothstep( vec2( 0.0 ), vec2( 0.22 ) + fw, d );
  float dirt = max( band.x, band.y ) * gridFade;
  float tone = millosSlabHash( cell ) * 2.0 - 1.0;
  float replaced = step( 0.93, millosSlabHash( cell + vec2( 41.0, 17.0 ) ) );
  return vec4( joint, tone, dirt, replaced );
}
`;
