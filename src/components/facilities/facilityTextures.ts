import * as THREE from 'three';
import { createColorDataTexture, fbmNoise, getTexture, hash } from '../../utils/textureGenerator';

/**
 * Hand-authored albedo for the staff facilities, rasterised in code.
 *
 * Every texture here is something the eye reads as colour, so every one is an
 * sRGB `createColorDataTexture` and its palette is written as display hexes.
 * Tiled finishes (blockwork, oak boards, tiles, carpet, ceiling grid) repeat in
 * world metres: `facilityGeometry.ts` writes each face's UVs from its world
 * position divided by the texture's `metres`, so a 0.3 m wall nib and a 14 m
 * wall carry the same block size. One-off prints (photographs of the mill's
 * history, the notice board, the whiteboard chart, the pictograms on the door
 * signs, the screens) share one atlas, addressed by `ATLAS` rectangles.
 *
 * Feature periods are kept at 5 px or more at the generated size (rule 5 of
 * the procedural texture rules) so nothing averages flat one mip down.
 */

type RGB = readonly [number, number, number];

const hex = (value: string): RGB => {
  const n = parseInt(value.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const shade = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

/** An RGBA raster with its origin at the BOTTOM left (DataTexture row 0 is v = 0). */
export class Raster {
  readonly data: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    fill: RGB = [255, 255, 255]
  ) {
    this.data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      this.data[i * 4] = fill[0];
      this.data[i * 4 + 1] = fill[1];
      this.data[i * 4 + 2] = fill[2];
      this.data[i * 4 + 3] = 255;
    }
  }

  /** Blend `c` over pixel (x, y) with coverage `a` in [0, 1]. */
  blend(x: number, y: number, c: RGB, a = 1): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    const t = a > 1 ? 1 : a;
    this.data[i] = clamp255(this.data[i] + (c[0] - this.data[i]) * t);
    this.data[i + 1] = clamp255(this.data[i + 1] + (c[1] - this.data[i + 1]) * t);
    this.data[i + 2] = clamp255(this.data[i + 2] + (c[2] - this.data[i + 2]) * t);
  }

  get(x: number, y: number): RGB {
    const i = (Math.floor(y) * this.width + Math.floor(x)) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  rect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.height, Math.ceil(y1)); y++)
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.width, Math.ceil(x1)); x++)
        this.blend(x, y, c, a);
  }

  /** Anti-aliased filled disc. */
  disc(cx: number, cy: number, r: number, c: RGB, a = 1): void {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        this.blend(x, y, c, a * Math.min(1, Math.max(0, r - d + 0.5)));
      }
  }

  /** Anti-aliased ring between radii r0 and r1, optionally an arc (radians, CCW from +x). */
  ring(cx: number, cy: number, r0: number, r1: number, c: RGB, a0 = -Math.PI, a1 = Math.PI): void {
    for (let y = Math.floor(cy - r1 - 1); y <= Math.ceil(cy + r1 + 1); y++)
      for (let x = Math.floor(cx - r1 - 1); x <= Math.ceil(cx + r1 + 1); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const ang = Math.atan2(dy, dx);
        if (ang < a0 || ang > a1) continue;
        const d = Math.hypot(dx, dy);
        const cov = Math.min(1, Math.max(0, Math.min(d - r0 + 0.5, r1 - d + 0.5)));
        this.blend(x, y, c, cov);
      }
  }

  /** Anti-aliased capsule stroke from (x0, y0) to (x1, y1). */
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1): void {
    const r = w / 2;
    const minX = Math.floor(Math.min(x0, x1) - r - 1);
    const maxX = Math.ceil(Math.max(x0, x1) + r + 1);
    const minY = Math.floor(Math.min(y0, y1) - r - 1);
    const maxY = Math.ceil(Math.max(y0, y1) + r + 1);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len2 = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x0;
        const py = y + 0.5 - y0;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / len2));
        const d = Math.hypot(px - t * dx, py - t * dy);
        this.blend(x, y, c, a * Math.min(1, Math.max(0, r - d + 0.5)));
      }
  }

  /** Filled polygon (even-odd), sampled at pixel centres with 2x2 supersampling. */
  polygon(points: readonly (readonly [number, number])[], c: RGB, a = 1): void {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const inside = (px: number, py: number) => {
      let hit = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    for (let y = Math.floor(Math.min(...ys)); y <= Math.ceil(Math.max(...ys)); y++)
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        let n = 0;
        for (const [sx, sy] of [
          [0.25, 0.25],
          [0.75, 0.25],
          [0.25, 0.75],
          [0.75, 0.75],
        ])
          if (inside(x + sx, y + sy)) n++;
        if (n) this.blend(x, y, c, (a * n) / 4);
      }
  }

  /** Multiply each pixel by (1 + amount * noise), noise in [-1, 1]. */
  grain(amount: number, seed: number, x0 = 0, y0 = 0, x1 = this.width, y1 = this.height): void {
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const n = (hash(x * 1.37 + seed, y * 2.11 - seed) * 2 - 1) * amount;
        const i = (y * this.width + x) * 4;
        for (let k = 0; k < 3; k++) this.data[i + k] = clamp255(this.data[i + k] * (1 + n));
      }
  }
}

const toTexture = (raster: Raster, repeat: boolean): THREE.DataTexture => {
  const texture = createColorDataTexture(raster.data, raster.width, raster.height);
  if (!repeat) {
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
  }
  texture.anisotropy = 4;
  return texture;
};

// ---------------------------------------------------------------------------
// Tiled finishes. `metres` is the world size one texture repeat covers.
// ---------------------------------------------------------------------------

export interface TiledFinish {
  readonly key: string;
  readonly metres: number;
  readonly build: () => Raster;
}

/** Painted dense-concrete blockwork, 440 x 215 mm faces, 10 mm joints; four courses by two blocks. */
function blockwork(): Raster {
  const S = 256; // 0.9 m square: two blocks of 450 mm, four courses of 225 mm
  const r = new Raster(S, S);
  const paint = hex('#ece4d4');
  const joint = hex('#cfc6b4');
  const course = S / 4;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const row = Math.floor(y / course);
      const offset = row % 2 ? S / 4 : 0;
      const bx = (x + offset) % (S / 2);
      const by = y % course;
      const inJoint = by < 3 || bx < 3;
      const pit = fbmNoise(x * 0.35, y * 0.35, 3);
      const cloud = fbmNoise(x * 0.03 + row * 7.1, y * 0.03, 3);
      let c = inJoint ? joint : shade(paint, 0.96 + cloud * 0.07);
      // Pinholes in the painted face of the block, a dense-block tell.
      if (!inJoint && pit > 0.74) c = shade(c, 0.93);
      // Top edge of each block catches the light, its underside shadows.
      if (!inJoint && by < 6) c = shade(c, 0.97);
      if (!inJoint && by > course - 4) c = shade(c, 1.02);
      r.blend(x, y, c);
    }
  return r;
}

/** Oak floorboards: 150 mm boards with staggered butt joints, warm honey tone. */
function oakBoards(): Raster {
  // 1.2 m: eight boards of 150 mm, 32 px each. Generated at 256 rather than 512
  // (a quarter of the time); `k` keeps every feature the same size in metres.
  const S = 256;
  const k = 512 / S;
  const r = new Raster(S, S);
  const boardW = S / 8;
  const tones = ['#b98a58', '#c49565', '#ad7f4f', '#c7a072', '#b48553', '#be9160'].map(hex);
  for (let x = 0; x < S; x++) {
    const board = Math.floor(x / boardW);
    const joint = (hash(board * 3.1, 7.7) * S) | 0;
    for (let y = 0; y < S; y++) {
      const seg = (y + joint) % S < S / 2 ? 0 : 1;
      const tone = tones[(board * 2 + seg) % tones.length];
      const u = x - board * boardW;
      // Grain period about 7 px at this size, above the 5 px floor.
      const grain =
        Math.sin((u + (fbmNoise(u * 0.05 * k, y * 0.012 * k + board, 3) * 30) / k) * 0.45 * k) *
          0.5 +
        0.5;
      const figure = fbmNoise(u * 0.08 * k + board * 11, y * 0.02 * k, 3);
      let c = shade(tone, 0.9 + grain * 0.08 + figure * 0.08);
      if (u < 1 || u > boardW - 2) c = shade(c, 0.72);
      if (Math.abs(((y + joint) % (S / 2)) - 0) < 2) c = shade(c, 0.75);
      r.blend(x, y, c);
    }
  }
  return r;
}

/** Oak veneer for joinery: fine straight grain, lighter than the floor. */
function oakVeneer(): Raster {
  const S = 256; // 1.0 m
  const r = new Raster(S, S);
  const base = hex('#c9a072');
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const warp = fbmNoise(x * 0.01, y * 0.02, 3) * 40;
      const g = Math.sin((x + warp) * 0.55) * 0.5 + 0.5;
      const fleck = fbmNoise(x * 0.2, y * 0.03, 3);
      r.blend(x, y, shade(base, 0.9 + g * 0.07 + fleck * 0.08));
    }
  return r;
}

/** 150 mm square porcelain floor tiles, a warm grey with pale grout. */
function floorTile(): Raster {
  const S = 256; // 0.6 m: four tiles of 150 mm
  const r = new Raster(S, S);
  const tile = hex('#b9b4aa');
  const grout = hex('#e4e0d8');
  const t = S / 4;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const tx = Math.floor(x / t);
      const ty = Math.floor(y / t);
      const g = x % t < 3 || y % t < 3;
      const k =
        0.94 + hash(tx * 5.3, ty * 9.1) * 0.1 + (fbmNoise(x * 0.25, y * 0.25, 2) - 0.5) * 0.05;
      r.blend(x, y, g ? grout : shade(tile, k));
    }
  return r;
}

/** Safety vinyl: a sheet floor with a fine quartz fleck, neutral (tinted per room). */
function safetyVinyl(): Raster {
  const S = 256; // 1.0 m
  const r = new Raster(S, S, hex('#d8d6d0'));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const cloud = fbmNoise(x * 0.04, y * 0.04, 3);
      r.blend(x, y, shade(hex('#d8d6d0'), 0.95 + cloud * 0.08));
      const h = hash(x * 3.7, y * 5.9);
      if (h > 0.985) r.blend(x, y, hex('#f6f4ee'), 0.8);
      else if (h < 0.012) r.blend(x, y, hex('#8f8b84'), 0.7);
    }
  return r;
}

/** White metro wall tiles, 150 x 75 mm, brick bond, soft grey grout. */
function metroTile(): Raster {
  const S = 256; // 0.6 m: four tiles across, eight courses
  const r = new Raster(S, S);
  const tile = hex('#f4f2ec');
  const grout = hex('#c9c6be');
  const w = S / 4;
  const h = S / 8;
  for (let y = 0; y < S; y++) {
    const row = Math.floor(y / h);
    const off = row % 2 ? w / 2 : 0;
    for (let x = 0; x < S; x++) {
      const bx = (x + off) % w;
      const by = y % h;
      const g = bx < 2 || by < 2;
      // A glazed tile's bevel: lighter at the top edge, darker at the bottom.
      const bevel = by > h - 5 ? 1.03 : by < 6 ? 0.95 : 1;
      const tone = 0.97 + hash(Math.floor((x + off) / w) * 3.3, row * 1.7) * 0.05;
      r.blend(x, y, g ? grout : shade(tile, tone * bevel));
    }
  }
  return r;
}

/** Carpet tiles, 500 mm, a blue-grey loop pile laid quarter-turned. */
function carpetTiles(): Raster {
  const S = 256; // 1.0 m: two by two tiles
  const r = new Raster(S, S);
  const base = hex('#5d6b78');
  const t = S / 2;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const tx = Math.floor(x / t);
      const ty = Math.floor(y / t);
      const turned = (tx + ty) % 2 === 1;
      const u = turned ? y : x;
      const v = turned ? x : y;
      const rib = Math.sin(u * 1.4) * 0.5 + 0.5;
      const pile = hash(x * 1.9, y * 2.7);
      const cloud = fbmNoise(u * 0.03 + tx * 3, v * 0.05 + ty * 5, 3);
      let c = shade(base, 0.86 + rib * 0.08 + pile * 0.1 + cloud * 0.08);
      if (x % t < 1 || y % t < 1) c = shade(c, 0.82);
      r.blend(x, y, c);
    }
  return r;
}

/** Suspended ceiling: 600 mm mineral tiles in a white grid. */
function ceilingGrid(): Raster {
  const S = 256; // 1.2 m: two by two tiles
  const r = new Raster(S, S);
  const tile = hex('#f1efe9');
  const grid = hex('#fbfbfa');
  const t = S / 2;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const gx = x % t;
      const gy = y % t;
      const isGrid = gx < 4 || gy < 4;
      const fissure = fbmNoise(x * 0.3, y * 0.3, 3);
      const edge = gx < 7 || gy < 7 ? 0.92 : 1;
      r.blend(x, y, isGrid ? grid : shade(tile, edge * (0.95 + fissure * 0.07)));
    }
  return r;
}

/** Woven wool rug: a border and a soft diamond field, terracotta and cream. */
function rug(): Raster {
  const W = 256;
  const H = 192;
  const r = new Raster(W, H, hex('#b5573c'));
  const cream = hex('#efe3c8');
  const deep = hex('#7f3527');
  const ochre = hex('#d39a45');
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const bx = Math.min(x, W - 1 - x);
      const by = Math.min(y, H - 1 - y);
      const b = Math.min(bx, by);
      let c: RGB = hex('#b5573c');
      if (b < 10) c = deep;
      else if (b < 16) c = cream;
      else if (b < 22) c = ochre;
      else {
        const d = (Math.abs(x - W / 2) + Math.abs(y - H / 2)) % 28;
        if (d < 4) c = cream;
        else if (d < 7) c = ochre;
      }
      const weave = (x + y) % 4 < 2 ? 1 : 0.94;
      r.blend(x, y, shade(c, weave * (0.95 + hash(x, y) * 0.08)));
    }
  return r;
}

/** Cork-free plain cream paint with a faint roller stipple. */
function paintStipple(): Raster {
  const S = 128; // 0.5 m
  const r = new Raster(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      r.blend(x, y, shade([255, 255, 255], 0.965 + fbmNoise(x * 0.4, y * 0.4, 2) * 0.05));
  return r;
}

export const FACILITY_FINISHES = {
  blockwork: { key: 'facility-blockwork-v1', metres: 0.9, build: blockwork },
  oakBoards: { key: 'facility-oak-boards-v1', metres: 1.2, build: oakBoards },
  oakVeneer: { key: 'facility-oak-veneer-v1', metres: 1.0, build: oakVeneer },
  floorTile: { key: 'facility-floor-tile-v1', metres: 0.6, build: floorTile },
  safetyVinyl: { key: 'facility-safety-vinyl-v1', metres: 1.0, build: safetyVinyl },
  metroTile: { key: 'facility-metro-tile-v1', metres: 0.6, build: metroTile },
  carpet: { key: 'facility-carpet-tiles-v1', metres: 1.0, build: carpetTiles },
  ceilingGrid: { key: 'facility-ceiling-grid-v1', metres: 1.2, build: ceilingGrid },
  paint: { key: 'facility-paint-stipple-v1', metres: 0.5, build: paintStipple },
} as const satisfies Record<string, TiledFinish>;

export type FacilityFinishName = keyof typeof FACILITY_FINISHES;

export const getFacilityFinish = (name: FacilityFinishName): THREE.DataTexture => {
  const finish = FACILITY_FINISHES[name];
  return getTexture(finish.key, () => toTexture(finish.build(), true));
};

export const getFacilityRug = (): THREE.DataTexture =>
  getTexture('facility-rug-v1', () => toTexture(rug(), false));

// ---------------------------------------------------------------------------
// The print atlas
// ---------------------------------------------------------------------------

export const ATLAS_SIZE = 1024;

/** Atlas rectangles in pixels, origin bottom left: [x, y, width, height]. */
export const ATLAS = {
  photoWaterMill: [0, 832, 256, 192],
  photoWagons: [256, 832, 256, 192],
  photoRollerHall: [512, 832, 256, 192],
  photoSilos: [768, 832, 256, 192],
  noticeBoard: [0, 576, 384, 256],
  whiteboard: [384, 576, 512, 256],
  clock: [896, 704, 128, 128],
  monitor: [0, 416, 256, 160],
  tv: [256, 416, 256, 160],
  signToilets: [512, 448, 128, 128],
  signAccessible: [640, 448, 128, 128],
  signFirstAid: [768, 448, 128, 128],
  signAed: [896, 448, 128, 128],
  signStaffRoom: [512, 320, 128, 128],
  signAlarm: [640, 320, 128, 128],
  firstAidPoster: [768, 256, 128, 192],
  millPlan: [0, 224, 256, 192],
  calendar: [256, 288, 128, 128],
  binderLabel: [384, 352, 64, 64],
  rota: [256, 160, 192, 128],
  lockerTag: [448, 352, 64, 64],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type AtlasRegion = keyof typeof ATLAS;

/** UV rectangle [u0, v0, u1, v1] of a region, inset half a pixel against bleed. */
export function atlasUv(region: AtlasRegion): [number, number, number, number] {
  const [x, y, w, h] = ATLAS[region];
  const s = ATLAS_SIZE;
  return [(x + 0.5) / s, (y + 0.5) / s, (x + w - 0.5) / s, (y + h - 0.5) / s];
}

const SEPIA_DARK = hex('#3b2a1c');
const SEPIA_MID = hex('#8a6a4a');
const SEPIA_LIGHT = hex('#e6d3b3');

/** A local painter for a region, with region-relative coordinates. */
class Region {
  constructor(
    readonly r: Raster,
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly h: number
  ) {}
  rect(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1) {
    this.r.rect(this.x + x0, this.y + y0, this.x + x1, this.y + y1, c, a);
  }
  disc(cx: number, cy: number, rad: number, c: RGB, a = 1) {
    this.r.disc(this.x + cx, this.y + cy, rad, c, a);
  }
  ring(cx: number, cy: number, r0: number, r1: number, c: RGB, a0?: number, a1?: number) {
    this.r.ring(this.x + cx, this.y + cy, r0, r1, c, a0, a1);
  }
  line(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB, a = 1) {
    this.r.line(this.x + x0, this.y + y0, this.x + x1, this.y + y1, w, c, a);
  }
  poly(points: readonly (readonly [number, number])[], c: RGB, a = 1) {
    this.r.polygon(
      points.map(([px, py]) => [this.x + px, this.y + py] as const),
      c,
      a
    );
  }
  /** Vertical gradient fill from `bottom` to `top`. */
  gradient(bottom: RGB, top: RGB, y0 = 0, y1 = this.h) {
    for (let y = y0; y < y1; y++)
      this.rect(0, y, this.w, y + 1, mix(bottom, top, (y - y0) / Math.max(1, y1 - y0)));
  }
  grain(amount: number, seed: number) {
    this.r.grain(amount, seed, this.x, this.y, this.x + this.w, this.y + this.h);
  }
  /** Darken toward the edges, as an old print does. */
  vignette(strength: number) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const dx = (x / this.w - 0.5) * 2;
        const dy = (y / this.h - 0.5) * 2;
        const k = Math.max(0, Math.hypot(dx * 0.85, dy) - 0.55);
        this.r.blend(this.x + x, this.y + y, SEPIA_DARK, Math.min(1, k * strength));
      }
  }
  /** Paper mount round the print. */
  mount(border: number, c: RGB) {
    this.rect(0, 0, this.w, border, c);
    this.rect(0, this.h - border, this.w, this.h, c);
    this.rect(0, 0, border, this.h, c);
    this.rect(this.w - border, 0, this.w, this.h, c);
  }
  /** A row of grey strokes standing in for a line of writing. */
  scribble(x0: number, y: number, length: number, c: RGB, weight = 2, seed = 0) {
    let x = x0;
    let i = 0;
    while (x < x0 + length) {
      const word = 6 + hash(i * 3.1 + seed, seed * 1.7) * 18;
      this.line(x, y, Math.min(x0 + length, x + word), y, weight, c);
      x += word + 5;
      i++;
    }
  }
}

function photoWaterMill(g: Region) {
  // The first mill on this river: a stone house and its undershot wheel, 1890s.
  g.gradient(hex('#a88b6a'), hex('#e8d8bc'), 0, g.h);
  g.poly(
    [
      [0, 90],
      [60, 120],
      [120, 104],
      [190, 128],
      [256, 100],
      [256, 70],
      [0, 70],
    ],
    hex('#b39a7a')
  );
  // Water in the foreground, with streaks of reflection.
  g.rect(0, 0, g.w, 58, hex('#6e5640'));
  for (let i = 0; i < 18; i++) {
    const y = 6 + hash(i, 2) * 48;
    const x = hash(i, 5) * 220;
    g.line(x, y, x + 20 + hash(i, 9) * 30, y, 2, SEPIA_LIGHT, 0.45);
  }
  // The mill house: rubble stone, a slate roof, small windows.
  g.rect(70, 50, 190, 128, hex('#9c8064'));
  g.poly(
    [
      [62, 128],
      [130, 168],
      [198, 128],
    ],
    hex('#4f3b29')
  );
  for (const [x, y] of [
    [90, 98],
    [124, 98],
    [158, 98],
    [90, 66],
    [158, 66],
  ])
    g.rect(x, y, x + 14, y + 18, SEPIA_DARK);
  g.rect(118, 50, 140, 84, hex('#4a3626'));
  // The wheel, half in the race.
  g.ring(212, 74, 30, 36, SEPIA_DARK);
  g.disc(212, 74, 6, SEPIA_DARK);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    g.line(212, 74, 212 + Math.cos(a) * 32, 74 + Math.sin(a) * 32, 2.5, SEPIA_DARK);
  }
  g.rect(176, 40, 256, 56, hex('#6e5640'));
  // A tree on the bank.
  g.disc(36, 112, 22, hex('#5a4532'));
  g.disc(22, 100, 16, hex('#5a4532'));
  g.rect(32, 58, 38, 96, SEPIA_DARK);
  g.vignette(1.4);
  g.grain(0.08, 11);
  g.mount(10, hex('#efe6d4'));
}

function photoWagons(g: Region) {
  // Grain arriving by cart at the brick mill, 1920s.
  g.gradient(hex('#b39878'), hex('#ece0c8'));
  g.rect(0, 0, g.w, 50, hex('#8f7559'));
  // Brick mill and its chimney.
  g.rect(20, 50, 170, 150, hex('#7b5e44'));
  g.poly(
    [
      [14, 150],
      [95, 176],
      [176, 150],
    ],
    hex('#4a3626')
  );
  g.rect(186, 50, 202, 182, hex('#5e4632'));
  g.rect(182, 178, 206, 184, hex('#4a3626'));
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 5; col++)
      g.rect(32 + col * 28, 70 + row * 26, 46 + col * 28, 86 + row * 26, hex('#3c2c1e'));
  // Smoke drifting off the stack.
  for (let k = 0; k < 6; k++) g.disc(204 + k * 9, 190 - k * 2, 6 + k * 2, hex('#d8c6a8'), 0.5);
  // Two carts with sacks.
  for (const cx of [60, 140]) {
    g.rect(cx - 30, 30, cx + 30, 46, hex('#4a3626'));
    for (let s = 0; s < 4; s++) g.disc(cx - 21 + s * 14, 52, 8, hex('#d9c7a6'));
    g.ring(cx - 18, 26, 6, 10, SEPIA_DARK);
    g.ring(cx + 18, 26, 6, 10, SEPIA_DARK);
    // The horse: body, neck and legs in silhouette.
    g.rect(cx + 36, 34, cx + 64, 50, hex('#3a2a1c'));
    g.line(cx + 62, 48, cx + 72, 64, 7, hex('#3a2a1c'));
    for (const lx of [cx + 39, cx + 60]) g.line(lx, 34, lx, 18, 4, hex('#3a2a1c'));
  }
  g.vignette(1.3);
  g.grain(0.09, 23);
  g.mount(10, hex('#efe6d4'));
}

function photoRollerHall(g: Region) {
  // The new roller-mill hall, 1950s: long, many-windowed, a lorry at the door.
  g.gradient(hex('#a9a9a2'), hex('#e4e2da'));
  g.rect(0, 0, g.w, 46, hex('#8c8a82'));
  g.rect(14, 46, 242, 132, hex('#6f6c64'));
  g.rect(10, 132, 246, 140, hex('#4c4a44'));
  for (let col = 0; col < 10; col++)
    for (let row = 0; row < 2; row++)
      g.rect(24 + col * 22, 64 + row * 32, 38 + col * 22, 88 + row * 32, hex('#2e2c28'));
  // MILL lettering on the parapet stands in as a white band.
  g.rect(90, 134, 166, 139, hex('#e9e7df'));
  // Bunting for the opening day.
  for (let k = 0; k < 14; k++) {
    const x = 18 + k * 16;
    g.poly(
      [
        [x, 150],
        [x + 10, 150],
        [x + 5, 140],
      ],
      k % 2 ? hex('#3a3934') : hex('#b9b7ae')
    );
  }
  g.line(14, 151, 242, 151, 1.5, hex('#3a3934'));
  // A flatbed lorry.
  g.rect(150, 22, 214, 40, hex('#2f2e2a'));
  g.rect(214, 22, 236, 52, hex('#2f2e2a'));
  g.rect(218, 40, 232, 50, hex('#9c9a92'));
  for (const wx of [162, 200, 226]) g.disc(wx, 20, 7, hex('#1f1e1b'));
  g.vignette(1.2);
  g.grain(0.07, 37);
  g.mount(10, hex('#f2efe6'));
}

function photoSilos(g: Region) {
  // The silo battery going up, 1970s, in faded colour.
  g.gradient(hex('#c9b98f'), hex('#a7c2c9'));
  g.rect(0, 0, g.w, 40, hex('#9a8a62'));
  for (let k = 0; k < 4; k++) {
    const x = 40 + k * 44;
    g.rect(x, 40, x + 36, 150 - (k === 3 ? 40 : 0), hex('#d9d3c2'));
    g.rect(x + 28, 40, x + 36, 150 - (k === 3 ? 40 : 0), hex('#b4ad9a'));
  }
  // Scaffold round the last one, and a crane.
  for (let y = 46; y < 150; y += 12) g.line(166, y, 214, y, 1.5, hex('#5d5546'));
  for (const x of [168, 190, 212]) g.line(x, 40, x, 154, 1.5, hex('#5d5546'));
  g.line(230, 40, 230, 178, 3, hex('#b2552c'));
  g.line(150, 176, 246, 176, 3, hex('#b2552c'));
  g.line(196, 176, 196, 140, 1, hex('#3d3a33'));
  g.vignette(0.9);
  g.grain(0.06, 41);
  g.mount(10, hex('#f4efe2'));
}

function noticeBoard(g: Region) {
  // Cork, an oak-coloured frame painted round it in the geometry.
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const n = fbmNoise((g.x + x) * 0.3, (g.y + y) * 0.3, 2);
      const fleck = hash(x * 2.3, y * 1.9);
      g.rect(
        x,
        y,
        x + 1,
        y + 1,
        shade(hex('#b98a5a'), 0.82 + n * 0.25 + (fleck > 0.93 ? -0.18 : 0))
      );
    }
  const papers: [number, number, number, number, string][] = [
    [18, 120, 118, 236, '#fbfaf5'],
    [132, 150, 236, 238, '#fff3a8'],
    [250, 112, 364, 236, '#fbfaf5'],
    [24, 18, 110, 104, '#cfe8f2'],
    [128, 22, 238, 136, '#fbfaf5'],
    [256, 20, 360, 96, '#f9d3d0'],
  ];
  papers.forEach(([x0, y0, x1, y1, c], i) => {
    g.rect(x0 + 3, y0 - 3, x1 + 3, y1 - 3, hex('#6e5134'), 0.35);
    g.rect(x0, y0, x1, y1, hex(c));
    const headY = y1 - 16;
    g.rect(x0 + 8, headY - 4, x1 - 8, headY + 4, hex(i % 2 ? '#2f5d8a' : '#9b3b2d'));
    for (let y = headY - 16; y > y0 + 10; y -= 11)
      g.scribble(x0 + 8, y, x1 - x0 - 18, hex('#7d7a74'), 2, i * 13 + y);
    g.disc((x0 + x1) / 2, y1 - 4, 5, hex(['#d23b2f', '#2d7bd3', '#2f9e55', '#e2b12f'][i % 4]));
  });
  // The shift rota as a grid on the big centre sheet.
  for (let k = 0; k <= 5; k++) g.line(136, 30 + k * 18, 230, 30 + k * 18, 1.2, hex('#9a978f'));
  for (let k = 0; k <= 4; k++) g.line(136 + k * 23.5, 30, 136 + k * 23.5, 120, 1.2, hex('#9a978f'));
  g.disc(300, 60, 18, hex('#e8c33c'));
  g.disc(294, 66, 3, hex('#3a2a1c'));
  g.disc(306, 66, 3, hex('#3a2a1c'));
  g.ring(300, 58, 8, 10.5, hex('#3a2a1c'), -Math.PI * 0.9, -Math.PI * 0.1);
}

function whiteboard(g: Region) {
  g.rect(0, 0, g.w, g.h, hex('#f7f8f6'));
  // Faint ghosts of old writing, sampled every 4 px: they are 25-50 px wide.
  for (let y = 0; y < g.h; y += 4)
    for (let x = 0; x < g.w; x += 4) {
      const smear = fbmNoise((g.x + x) * 0.02, (g.y + y) * 0.04, 3);
      if (smear > 0.62) g.rect(x, y, x + 4, y + 4, hex('#dfe2e4'), (smear - 0.62) * 1.2);
    }
  const blue = hex('#2350a0');
  const green = hex('#2b8a4a');
  const red = hex('#c83a32');
  const black = hex('#2b2d30');
  // Title.
  g.scribble(24, 226, 210, blue, 4, 5);
  g.scribble(300, 226, 120, black, 3, 9);
  // Weekly tonnage bars against a target line.
  const baseY = 40;
  g.line(30, baseY, 290, baseY, 3, black);
  g.line(30, baseY, 30, 200, 3, black);
  const bars = [0.62, 0.7, 0.66, 0.78, 0.84, 0.8, 0.9];
  bars.forEach((v, i) => {
    const x = 46 + i * 34;
    const top = baseY + v * 150;
    g.rect(x, baseY + 2, x + 22, top, i === bars.length - 1 ? green : blue);
    g.scribble(x, baseY - 14, 22, black, 2, i);
  });
  const target = baseY + 0.8 * 150;
  for (let x = 32; x < 290; x += 14) g.line(x, target, x + 8, target, 3, red);
  g.scribble(250, target + 10, 36, red, 2, 3);
  // Yield trend on the right.
  g.line(320, baseY, 490, baseY, 3, black);
  g.line(320, baseY, 320, 200, 3, black);
  const yieldPts = [0.5, 0.56, 0.52, 0.64, 0.7, 0.68, 0.76, 0.8];
  for (let i = 1; i < yieldPts.length; i++)
    g.line(
      330 + (i - 1) * 22,
      baseY + yieldPts[i - 1] * 150,
      330 + i * 22,
      baseY + yieldPts[i] * 150,
      3.5,
      green
    );
  yieldPts.forEach((v, i) => g.disc(330 + i * 22, baseY + v * 150, 4.5, green));
  // Magnets holding a printed sheet.
  g.rect(430, 150, 496, 214, hex('#ffffff'));
  for (let y = 200; y > 160; y -= 9) g.scribble(436, y, 54, hex('#8d8a84'), 2, y);
  g.disc(463, 210, 5, red);
}

function clock(g: Region) {
  const c = g.w / 2;
  g.rect(0, 0, g.w, g.h, hex('#2c3b35'));
  g.disc(c, c, 60, hex('#2c3b35'));
  g.disc(c, c, 54, hex('#fbf8ef'));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const r0 = k % 3 === 0 ? 40 : 45;
    g.line(
      c + Math.cos(a) * r0,
      c + Math.sin(a) * r0,
      c + Math.cos(a) * 50,
      c + Math.sin(a) * 50,
      k % 3 === 0 ? 4 : 2,
      hex('#2b2d30')
    );
  }
  // Ten past ten.
  const hour = Math.PI / 2 + (2 / 12) * Math.PI * 2 - (10 / 60) * (Math.PI / 6);
  const minute = Math.PI / 2 - (10 / 60) * Math.PI * 2;
  g.line(c, c, c + Math.cos(hour) * 28, c + Math.sin(hour) * 28, 5, hex('#2b2d30'));
  g.line(c, c, c + Math.cos(minute) * 42, c + Math.sin(minute) * 42, 3.5, hex('#2b2d30'));
  g.disc(c, c, 4, hex('#b5352b'));
}

function screen(g: Region, accent: RGB, seed: number) {
  g.gradient(hex('#0d1c2a'), hex('#14283a'));
  g.rect(0, g.h - 18, g.w, g.h, hex('#1d3b56'));
  g.scribble(8, g.h - 9, 90, hex('#cfe4f2'), 2, seed);
  // Four status tiles.
  for (let k = 0; k < 4; k++) {
    const x0 = 8 + k * ((g.w - 16) / 4);
    g.rect(x0, g.h - 58, x0 + (g.w - 16) / 4 - 6, g.h - 26, hex('#1b3247'));
    g.rect(x0 + 6, g.h - 46, x0 + 26, g.h - 34, k === 2 ? hex('#e3b341') : hex('#45c06b'));
  }
  // A trend line.
  let prev = 40;
  for (let x = 12; x < g.w - 12; x += 8) {
    const v = 30 + (Math.sin(x * 0.05 + seed) * 0.5 + 0.5) * 40 + hash(x, seed) * 10;
    g.line(x - 8, prev, x, v, 2.5, accent);
    prev = v;
  }
  g.line(8, 22, g.w - 8, 22, 1, hex('#3d5a73'));
}

function pictogramPlate(g: Region, plate: RGB) {
  g.rect(0, 0, g.w, g.h, plate);
}

/** A standing figure (head and body), its feet at y0. */
function figure(g: Region, cx: number, y0: number, dress: boolean, c: RGB) {
  g.disc(cx, y0 + 74, 9, c);
  if (dress) {
    g.poly(
      [
        [cx - 9, y0 + 62],
        [cx + 9, y0 + 62],
        [cx + 15, y0 + 26],
        [cx - 15, y0 + 26],
      ],
      c
    );
    g.line(cx - 5, y0 + 26, cx - 5, y0 + 2, 6, c);
    g.line(cx + 5, y0 + 26, cx + 5, y0 + 2, 6, c);
  } else {
    g.rect(cx - 10, y0 + 30, cx + 10, y0 + 62, c);
    g.line(cx - 5, y0 + 32, cx - 5, y0 + 2, 7, c);
    g.line(cx + 5, y0 + 32, cx + 5, y0 + 2, 7, c);
  }
  g.line(cx - 12, y0 + 60, cx - 15, y0 + 34, 5, c);
  g.line(cx + 12, y0 + 60, cx + 15, y0 + 34, 5, c);
}

/** The International Symbol of Access: a seated figure in a wheelchair. */
function accessSymbol(g: Region, cx: number, cy: number, s: number, c: RGB) {
  g.disc(cx - 4 * s, cy + 30 * s, 6 * s, c);
  g.line(cx - 6 * s, cy + 22 * s, cx - 8 * s, cy + 2 * s, 7 * s, c);
  g.line(cx - 8 * s, cy + 2 * s, cx + 12 * s, cy + 2 * s, 6 * s, c);
  g.line(cx + 12 * s, cy + 2 * s, cx + 20 * s, cy - 16 * s, 6 * s, c);
  g.line(cx - 7 * s, cy + 14 * s, cx + 8 * s, cy + 14 * s, 5 * s, c);
  g.ring(cx - 6 * s, cy - 10 * s, 15 * s, 20 * s, c, -Math.PI, Math.PI * 0.35);
}

function signToilets(g: Region) {
  pictogramPlate(g, hex('#1f3e6e'));
  const w = hex('#ffffff');
  figure(g, 36, 24, false, w);
  g.line(64, 16, 64, 112, 3, w);
  figure(g, 92, 24, true, w);
}

function signAccessible(g: Region) {
  pictogramPlate(g, hex('#1f3e6e'));
  const w = hex('#ffffff');
  accessSymbol(g, 60, 62, 1.45, w);
  g.disc(104, 104, 9, hex('#ffffff'));
  g.disc(104, 104, 6, hex('#1f3e6e'));
}

function signFirstAid(g: Region) {
  pictogramPlate(g, hex('#00843d'));
  g.rect(14, 14, 114, 114, hex('#ffffff'), 0.12);
  g.rect(50, 24, 78, 104, hex('#ffffff'));
  g.rect(24, 50, 104, 78, hex('#ffffff'));
}

function signAed(g: Region) {
  pictogramPlate(g, hex('#00843d'));
  const w = hex('#ffffff');
  // Heart.
  g.disc(48, 74, 22, w);
  g.disc(80, 74, 22, w);
  g.poly(
    [
      [28, 64],
      [100, 64],
      [64, 20],
    ],
    w
  );
  // Lightning bolt across it, in the plate colour.
  g.poly(
    [
      [70, 100],
      [52, 66],
      [66, 66],
      [56, 34],
      [80, 74],
      [66, 74],
    ],
    hex('#00843d')
  );
  g.rect(98, 98, 110, 102, w);
  g.rect(102, 94, 106, 106, w);
}

function signStaffRoom(g: Region) {
  pictogramPlate(g, hex('#1f3e6e'));
  const w = hex('#ffffff');
  // A cup and saucer with steam.
  g.poly(
    [
      [30, 76],
      [86, 76],
      [80, 40],
      [36, 40],
    ],
    w
  );
  g.ring(90, 60, 8, 14, w, -Math.PI / 2, Math.PI / 2);
  g.rect(22, 30, 96, 36, w);
  for (const x of [44, 58, 72]) {
    g.line(x, 84, x - 4, 96, 4, w);
    g.line(x - 4, 96, x + 2, 108, 4, w);
  }
}

function signAlarm(g: Region) {
  pictogramPlate(g, hex('#b5241d'));
  const w = hex('#ffffff');
  g.disc(64, 64, 34, w);
  g.disc(64, 64, 26, hex('#b5241d'));
  g.line(64, 98, 64, 18, 6, w);
  g.disc(64, 18, 8, w);
}

function firstAidPoster(g: Region) {
  g.rect(0, 0, g.w, g.h, hex('#ffffff'));
  g.rect(0, g.h - 40, g.w, g.h, hex('#00843d'));
  g.rect(52, g.h - 34, 76, g.h - 6, hex('#ffffff'));
  g.rect(50, g.h - 32, 78, g.h - 8, hex('#ffffff'));
  g.rect(40, g.h - 24, 88, g.h - 16, hex('#ffffff'));
  g.rect(60, g.h - 38, 68, g.h - 2, hex('#ffffff'));
  for (let k = 0; k < 4; k++) {
    const y = g.h - 60 - k * 34;
    g.disc(16, y, 8, hex('#00843d'));
    g.scribble(30, y + 6, 88, hex('#3a3c3f'), 2, k);
    g.scribble(30, y - 4, 70, hex('#8e9093'), 2, k + 9);
  }
}

function millPlan(g: Region) {
  // A blueprint of the hall, as pinned in the office.
  g.rect(0, 0, g.w, g.h, hex('#1f4f86'));
  for (let x = 0; x < g.w; x += 16) g.line(x, 0, x, g.h, 1, hex('#3a6aa0'), 0.6);
  for (let y = 0; y < g.h; y += 16) g.line(0, y, g.w, y, 1, hex('#3a6aa0'), 0.6);
  const w = hex('#e8f1fa');
  g.line(24, 24, 232, 24, 2.5, w);
  g.line(232, 24, 232, 168, 2.5, w);
  g.line(232, 168, 24, 168, 2.5, w);
  g.line(24, 168, 24, 24, 2.5, w);
  for (let k = 0; k < 4; k++) g.ring(60 + k * 44, 132, 10, 12.5, w);
  for (let k = 0; k < 3; k++) g.rect(60 + k * 60, 64, 92 + k * 60, 84, w, 0.85);
  g.line(40, 104, 216, 104, 1.5, w);
  g.line(40, 46, 216, 46, 1.5, w);
  g.scribble(150, 10, 80, w, 2, 4);
}

function calendar(g: Region) {
  g.rect(0, 0, g.w, g.h, hex('#ffffff'));
  g.rect(0, g.h - 46, g.w, g.h, hex('#e7d8b8'));
  g.disc(64, g.h - 24, 15, hex('#6a8f4a'));
  g.rect(60, g.h - 40, 68, g.h - 30, hex('#6a5130'));
  g.rect(0, g.h - 52, g.w, g.h - 46, hex('#b5352b'));
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 7; c++) {
      const x = 8 + c * 16.5;
      const y = 10 + r * 14;
      g.rect(x, y, x + 12, y + 9, r === 2 && c === 4 ? hex('#b5352b') : hex('#d7d4cc'));
    }
}

function binderLabel(g: Region) {
  g.rect(0, 0, g.w, g.h, hex('#f6f3ea'));
  g.rect(8, 40, 56, 48, hex('#2b2d30'));
  g.rect(8, 26, 46, 31, hex('#7d7a74'));
  g.rect(8, 14, 38, 19, hex('#7d7a74'));
}

function rota(g: Region) {
  g.rect(0, 0, g.w, g.h, hex('#fbfaf5'));
  g.rect(0, g.h - 20, g.w, g.h, hex('#2f5d8a'));
  for (let k = 0; k <= 6; k++) g.line(6, 8 + k * 16, g.w - 6, 8 + k * 16, 1.2, hex('#a8a59d'));
  for (let k = 0; k <= 7; k++) g.line(6 + k * 25.7, 8, 6 + k * 25.7, 104, 1.2, hex('#a8a59d'));
  for (let k = 0; k < 14; k++) {
    const c = (k * 5) % 7;
    const r = (k * 3) % 6;
    g.rect(
      9 + c * 25.7,
      11 + r * 16,
      28 + c * 25.7,
      21 + r * 16,
      hex(['#9fd29b', '#f3d27a', '#a9c9ec'][k % 3])
    );
  }
}

function lockerTag(g: Region) {
  g.rect(0, 0, g.w, g.h, hex('#e9e4d6'));
  g.rect(6, 6, 58, 58, hex('#f8f6ef'));
  g.rect(18, 22, 46, 42, hex('#2b2d30'), 0.85);
}

const ATLAS_PAINTERS: Record<AtlasRegion, (g: Region) => void> = {
  photoWaterMill,
  photoWagons,
  photoRollerHall,
  photoSilos,
  noticeBoard,
  whiteboard,
  clock,
  monitor: (g) => screen(g, hex('#59c2f0'), 3),
  tv: (g) => screen(g, hex('#7fd67a'), 7),
  signToilets,
  signAccessible,
  signFirstAid,
  signAed,
  signStaffRoom,
  signAlarm,
  firstAidPoster,
  millPlan,
  calendar,
  binderLabel,
  rota,
  lockerTag,
};

export function buildFacilityAtlas(): Raster {
  const r = new Raster(ATLAS_SIZE, ATLAS_SIZE, hex('#f4f1e8'));
  for (const name of Object.keys(ATLAS) as AtlasRegion[]) {
    const [x, y, w, h] = ATLAS[name];
    ATLAS_PAINTERS[name](new Region(r, x, y, w, h));
  }
  return r;
}

export const getFacilityAtlas = (): THREE.DataTexture =>
  getTexture('facility-print-atlas-v1', () => toTexture(buildFacilityAtlas(), false));

/** Sepia palette, exported for the tests that check the prints read as prints. */
export const FACILITY_SEPIA = { dark: SEPIA_DARK, mid: SEPIA_MID, light: SEPIA_LIGHT } as const;
