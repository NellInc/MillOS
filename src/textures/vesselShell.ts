/**
 * Painted-steel shell maps for the horizontal storage tanks, laid out in METRES
 * on one vessel lathe.
 *
 * WHY MAPS AND NOT THE WORLD-SURFACE PROFILE. The tank-farm vessels read as
 * moulded plastic: one even satin sheen, no weld seams, no streaks, no
 * roughness break-up (final3-med-12, the rubric's weakest frame). The analytic
 * world-surface terms cannot give a tank what makes it steel, because those
 * things are LAYOUT, not grain: the shell is rolled from plate courses welded
 * end to end, each course closed by a longitudinal seam, and rain carries
 * run-off down the barrel from the fittings on the crown. When the `painted`
 * terms were tried instead, the shells turned to cotton. So the vessel finish
 * stays the near-silent `vessel` profile and the steel lives here.
 *
 * UV CONVENTION (pinned by `vesselShell.test.ts`). `vesselShellUvs` rewrites a
 * lathe's uv: u is the angle round the axis (three's lathe column, u 0.25 is
 * the crown once the tank lies on its side), v is ARC LENGTH along the profile
 * from the bottom pole over the total. Three's own v is the profile POINT
 * index, which gives the 12.8 m barrel - one segment between the two beads -
 * the same share of the map as one 6 cm step of a head.
 *
 * TEXEL DENSITY. 1024 round x 768 along: about 1.8 cm round and 2.3 cm along
 * a 3 m tank. Weld lines are 6-7 cm and rivulets 5-10 cm, three or more texels
 * each; every noise period is above 0.3 m (CLAUDE.md procedural rule 5).
 * Noise round the axis is periodic, so the lathe's u 0/1 column has no seam.
 */
import * as THREE from 'three';
import {
  createColorDataTexture,
  createLinearDataTexture,
  getTexture,
} from '../utils/textureGenerator';

const intHash = (x: number, y: number): number => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Value noise whose lattice wraps every `period` cells in x. */
const periodicNoise = (x: number, y: number, period: number): number => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const a = intHash(x0, iy);
  const b = intHash(x1, iy);
  const c = intHash(x0, iy + 1);
  const d = intHash(x1, iy + 1);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
};

/** Plain signed fBm in two dimensions, about [-0.5, 0.5]. */
const fbmFlat = (x: number, y: number, octaves: number, seed: number): number => {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  let frequency = 1;
  for (let i = 0; i < octaves; i += 1) {
    value +=
      periodicNoise(x * frequency + seed * 17.3, y * frequency + seed * 5.9, 1 << 20) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return value / total - 0.5;
};

/**
 * Signed fBm, about [-0.5, 0.5], wrapping round the axis. `u` is 0-1 round,
 * `along` is metres; `periodMetres` is the base feature size. Lacunarity is
 * exactly 2 so every octave's lattice still closes round the circumference.
 */
const fbmRound = (
  u: number,
  along: number,
  circumference: number,
  periodMetres: number,
  octaves: number,
  seed: number
): number => {
  let value = 0;
  let amplitude = 0.5;
  let total = 0;
  let cells = Math.max(1, Math.round(circumference / periodMetres));
  for (let i = 0; i < octaves; i += 1) {
    const scale = cells / circumference;
    value +=
      periodicNoise(u * cells, (along + seed * 13.7) * scale + seed * 3.1, cells) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    cells *= 2;
  }
  return value / total - 0.5;
};

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** A fitting on the crown that sheds run-off: its axial position (lathe y) and footprint radius. */
export interface VesselNozzle {
  readonly y: number;
  readonly radius: number;
}

export interface VesselShellLayout {
  /** Shell radius, metres. */
  readonly radius: number;
  /** The lathe profile, pole to pole, as (radius, axial y). */
  readonly profile: readonly THREE.Vector2[];
  /** Axial distance of each head-to-shell seam from the centre. */
  readonly seamOffset: number;
  /** Fittings on the crown. */
  readonly nozzles: readonly VesselNozzle[];
}

/** Target plate-course width; the barrel is split into whole courses near this. */
export const VESSEL_COURSE_WIDTH = 2.4;
/** Half-width of a weld line's dark core and of its shoulder, metres. */
export const VESSEL_WELD = { core: 0.022, shoulder: 0.06 } as const;
/** The crown's u, once the lathe lies on its side (three's lathe: x = r sin(2 pi u)). */
export const VESSEL_CROWN_U = 0.25;

/** Cumulative arc length at every profile point, and the total. */
export function profileArcLengths(profile: readonly THREE.Vector2[]): {
  at: number[];
  total: number;
} {
  const at = [0];
  for (let i = 1; i < profile.length; i += 1)
    at.push(at[i - 1] + profile[i].distanceTo(profile[i - 1]));
  return { at, total: at[at.length - 1] };
}

/** Rewrite a lathe's v as profile arc length over the total (see the header). */
export function vesselShellUvs(
  geometry: THREE.LatheGeometry,
  profile: readonly THREE.Vector2[]
): THREE.LatheGeometry {
  const { at, total } = profileArcLengths(profile);
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const rows = profile.length;
  for (let i = 0; i < uv.count; i += 1) uv.setY(i, at[i % rows] / total);
  uv.needsUpdate = true;
  return geometry;
}

/** Axial positions of the circumferential course welds between the two head seams. */
export function vesselCourseSeams(seamOffset: number): number[] {
  const barrel = 2 * seamOffset;
  const courses = Math.max(1, Math.round(barrel / VESSEL_COURSE_WIDTH));
  return Array.from({ length: courses - 1 }, (_, k) => -seamOffset + ((k + 1) * barrel) / courses);
}

/**
 * The u of each course's longitudinal weld, staggered either side of the
 * crown as plate courses are, high on the shell where the camera sees them.
 */
export function vesselLongitudinalSeamU(course: number): number {
  return VESSEL_CROWN_U + (course % 2 === 0 ? -0.1 : 0.1);
}

export interface VesselShellSample {
  /** Albedo multiplier, linear 0-1 (applied to the sRGB bytes as a display tint). */
  readonly tint: readonly [number, number, number];
  readonly roughness: number;
  /** Height in metres for the normal map. */
  readonly height: number;
}

/** Everything one texel knows: where it is on the vessel, and what is painted there. */
export function sampleVesselShell(
  layout: VesselShellLayout,
  courseSeams: readonly number[],
  u: number,
  y: number,
  r: number
): VesselShellSample {
  const { radius, seamOffset, nozzles } = layout;
  const circumference = 2 * Math.PI * radius;
  const onHead = Math.abs(y) > seamOffset;
  let tone = 1;
  let roughness = 0.44;
  let height = 0;

  // Paint drift and mottle: the two-pack has been touched up and has weathered
  // unevenly. Faint in albedo; most of it goes into roughness, where it breaks
  // the one long highlight into a satin that varies along the barrel. On a
  // head the field is sampled flat across the dish: round the axis the head's
  // circumference shrinks to nothing at the pole, and (u, y) noise there
  // collapses into a pinwheel of radial streaks.
  let macro: number;
  let mottle: number;
  let canning: number;
  if (onHead) {
    const angle = u * 2 * Math.PI;
    const hx = r * Math.cos(angle) + (y > 0 ? 101 : 0);
    const hz = r * Math.sin(angle);
    macro = fbmFlat(hx / 3.2, hz / 3.2, 2, 1);
    mottle = fbmFlat(hx / 0.6, hz / 0.6, 2, 2);
    canning = 0;
  } else {
    macro = fbmRound(u, y, circumference, 3.2, 2, 1);
    mottle = fbmRound(u, y, circumference, 0.6, 2, 2);
    // Plate distortion between the welds ("oil canning"): a few mm over a metre.
    canning = fbmRound(u, y, circumference, 1.3, 2, 3);
  }
  tone += macro * 0.06 + mottle * 0.03;
  roughness += macro * 0.22 + mottle * 0.1;
  height += canning * 0.004;

  // Distance round the shell from the crown, metres (wraps through u 0/1).
  const du = Math.abs(u - VESSEL_CROWN_U);
  const fromCrown = Math.min(du, 1 - du) * circumference;
  // The crown chalks and roughens in the sun; the underside stays glossier.
  const crown = 1 - smoothstep(0.15 * circumference, 0.3 * circumference, fromCrown);
  roughness += crown * 0.08;
  tone -= crown * 0.015;

  // Weld lines: a raised bead with a dirt line along its lower edge.
  let weld = 0;
  if (!onHead) {
    for (const s of [-seamOffset, ...courseSeams, seamOffset])
      weld = Math.max(
        weld,
        1 - smoothstep(VESSEL_WELD.core, VESSEL_WELD.shoulder, Math.abs(y - s))
      );
    // The longitudinal weld of the course this texel is on.
    const bounds = [-seamOffset, ...courseSeams, seamOffset];
    let course = 0;
    while (course < bounds.length - 2 && y > bounds[course + 1]) course += 1;
    const seamU = vesselLongitudinalSeamU(course);
    const dSeam = Math.min(Math.abs(u - seamU), 1 - Math.abs(u - seamU)) * circumference;
    weld = Math.max(weld, 1 - smoothstep(VESSEL_WELD.core, VESSEL_WELD.shoulder, dSeam));
  }
  tone -= weld * 0.3;
  roughness += weld * 0.14;
  height += weld * weld * 0.003;

  // Run-off from the crown fittings: rivulets down both flanks, strongest
  // at the fitting and fading by the equator.
  let streak = 0;
  if (!onHead || Math.abs(y) < seamOffset + 0.3) {
    for (let n = 0; n < nozzles.length; n += 1) {
      const nozzle = nozzles[n];
      const span = nozzle.radius * 1.6;
      if (Math.abs(y - nozzle.y) > span + 0.2) continue;
      const fall = fromCrown - nozzle.radius * 0.6;
      if (fall < 0) continue;
      const fade = Math.exp(-fall / (radius * 0.9)) * smoothstep(0, 0.08, fall);
      for (let k = 0; k < 6; k += 1) {
        const side = u > VESSEL_CROWN_U && u < VESSEL_CROWN_U + 0.5 ? 1 : 0;
        const h = intHash(n * 31 + k, side + 7);
        const centre = nozzle.y + (h - 0.5) * 2 * span;
        // Rivulets wander as they run: a slow sideways drift with distance.
        const wander = (periodicNoise(fall * 1.7 + k * 5.3, n + side * 3, 64) - 0.5) * 0.12;
        const width = 0.03 + intHash(n * 17 + k, side + 3) * 0.05;
        const along = Math.abs(y - centre - wander);
        const strength = 0.45 + 0.55 * intHash(n * 5 + k, side + 11);
        const length = radius * (0.5 + 1.1 * intHash(n * 13 + k, side + 19));
        streak = Math.max(
          streak,
          (1 - smoothstep(width * 0.4, width, along)) *
            fade *
            strength *
            (1 - smoothstep(length * 0.7, length, fall))
        );
      }
    }
  }

  // The head: grime settles toward the knuckle and the crown of the dish
  // keeps its gloss, and the relief carries the dish's fall-off a little
  // further than the 2:1 profile alone, so in flat light (18:30) it reads as
  // a dome rather than a disc. The height is zero at the rim, so the head
  // meets the barrel's field without a step.
  if (onHead) {
    const t = r / radius;
    const knuckle = smoothstep(0.25, 1, t);
    tone -= knuckle * 0.24;
    roughness += knuckle * 0.08 - (1 - t) * 0.1;
    height += 0.1 * radius * (1 - t * t);
  }

  // Rain has run down both flanks everywhere: fine streaks that follow the
  // shell round from the crown (0.15 m apart along the axis, metres long
  // round it), fading before the equator. Faint; they are what stops a long
  // white barrel reading as moulded.
  if (!onHead) {
    const fall = fromCrown / circumference;
    // fbmRound's lattice runs 1/3 per metre along at a 3 m period; x20 makes it 0.15 m.
    const weather = fbmRound(u, y * 20, circumference, 3, 2, 4);
    const band = smoothstep(0.02, 0.06, fall) * (1 - smoothstep(0.16, 0.26, fall));
    streak = Math.max(streak, Math.max(0, weather) * band * 0.6);
  }
  roughness += streak * 0.16;
  const dirt = streak * 0.5;
  return {
    tint: [
      clamp01(tone * (1 - dirt * 0.85)),
      clamp01(tone * (1 - dirt * 0.95)),
      clamp01(tone * (1 - dirt * 1.1)),
    ],
    roughness: Math.min(0.85, Math.max(0.3, roughness)),
    height,
  };
}

export interface VesselShellMaps {
  readonly map: THREE.DataTexture;
  readonly roughnessMap: THREE.DataTexture;
  readonly normalMap: THREE.DataTexture;
}

export const VESSEL_SHELL_SIZE = { width: 1024, height: 768 } as const;

/** Bake the three maps for one vessel size in one pass (cached by layout). */
export function generateVesselShellMaps(
  layout: VesselShellLayout,
  width: number = VESSEL_SHELL_SIZE.width,
  height: number = VESSEL_SHELL_SIZE.height
): VesselShellMaps {
  const key = `vessel-shell-${layout.radius}-${layout.seamOffset.toFixed(4)}-${layout.nozzles
    .map((n) => `${n.y}:${n.radius}`)
    .join(',')}-${width}x${height}`;
  let baked: { color: Uint8Array; rough: Uint8Array; normal: Uint8Array } | null = null;
  const bake = () => {
    if (baked) return baked;
    const { at, total } = profileArcLengths(layout.profile);
    const seams = vesselCourseSeams(layout.seamOffset);
    const color = new Uint8Array(width * height * 4);
    const rough = new Uint8Array(width * height * 4);
    const heights = new Float32Array(width * height);
    let segment = 0;
    for (let row = 0; row < height; row += 1) {
      const s = ((row + 0.5) / height) * total;
      while (segment < at.length - 2 && at[segment + 1] < s) segment += 1;
      const span = at[segment + 1] - at[segment] || 1;
      const f = (s - at[segment]) / span;
      const a = layout.profile[segment];
      const b = layout.profile[segment + 1];
      const y = a.y + (b.y - a.y) * f;
      const r = a.x + (b.x - a.x) * f;
      for (let col = 0; col < width; col += 1) {
        const u = (col + 0.5) / width;
        const sample = sampleVesselShell(layout, seams, u, y, r);
        const i = (row * width + col) * 4;
        // The tint is authored linear; store it as the sRGB byte that decodes to it.
        for (let c = 0; c < 3; c += 1)
          color[i + c] = Math.round(255 * linearToSrgb(sample.tint[c]));
        color[i + 3] = 255;
        const g = Math.round(sample.roughness * 255);
        rough[i] = g;
        rough[i + 1] = g;
        rough[i + 2] = g;
        rough[i + 3] = 255;
        heights[row * width + col] = sample.height;
      }
    }
    // Normals from the height field, in metres per texel on each axis.
    const metresU = (2 * Math.PI * layout.radius) / width;
    const metresV = total / height;
    const normal = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row += 1)
      for (let col = 0; col < width; col += 1) {
        const left = heights[row * width + ((col + width - 1) % width)];
        const right = heights[row * width + ((col + 1) % width)];
        const down = heights[Math.max(0, row - 1) * width + col];
        const up = heights[Math.min(height - 1, row + 1) * width + col];
        const dx = (right - left) / (2 * metresU);
        const dy = (up - down) / (2 * metresV);
        const length = Math.hypot(dx, dy, 1);
        const i = (row * width + col) * 4;
        normal[i] = Math.round((-dx / length) * 127.5 + 127.5);
        normal[i + 1] = Math.round((-dy / length) * 127.5 + 127.5);
        normal[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
        normal[i + 3] = 255;
      }
    baked = { color, rough, normal };
    return baked;
  };
  return {
    map: getTexture(`${key}-color`, () => createColorDataTexture(bake().color, width, height)),
    roughnessMap: getTexture(`${key}-roughness`, () =>
      createLinearDataTexture(bake().rough, width, height)
    ),
    normalMap: getTexture(`${key}-normal`, () =>
      createLinearDataTexture(bake().normal, width, height)
    ),
  };
}

/** Linear 0-1 to the sRGB-encoded 0-1 value that decodes back to it. */
function linearToSrgb(value: number): number {
  const v = clamp01(value);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}
