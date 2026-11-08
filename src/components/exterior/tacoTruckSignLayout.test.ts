import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { SURFACE_LAYERS } from '../../constants/renderLayers';
import {
  TACO_BOARD,
  TACO_BOARD_LAMPS_Z,
  TACO_BOARD_POSTS_Z,
  TACO_MENU_BOARD,
  TACO_SIGN_ATLAS,
  TACO_VALANCE,
  tacoAtlasUv,
  tacoBoardOutline,
  tacoBoardTop,
} from './tacoTruckSignLayout';

const script = readFileSync('scripts/author-taco-truck-sign.py', 'utf8');
const file = `public/${TACO_SIGN_ATLAS.url.replace(/^.*?textures\//, 'textures/')}`;

describe('taco truck sign atlas', () => {
  it('draws the same regions and board outline the runtime maps', () => {
    for (const [name, rect] of Object.entries(TACO_SIGN_ATLAS.regions))
      expect(script, name).toContain(`'${name}': (${rect.join(', ')}),`);
    const board =
      /BOARD_W, BOARD_H, BOARD_SHOULDER, BOARD_CORNER = ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)/.exec(
        script
      );
    expect(board?.slice(1).map(Number)).toEqual([
      TACO_BOARD.width,
      TACO_BOARD.height,
      TACO_BOARD.shoulder,
      TACO_BOARD.corner,
    ]);
    expect(script).toContain(`ATLAS = (${TACO_SIGN_ATLAS.width}, ${TACO_SIGN_ATLAS.height})`);
  });

  it('keeps each painted face at its region aspect, so nothing is stretched', () => {
    const aspect = (r: readonly number[]) => r[2] / r[3];
    const { regions } = TACO_SIGN_ATLAS;
    expect(aspect(regions.board)).toBeCloseTo(TACO_BOARD.width / TACO_BOARD.height, 2);
    expect(aspect(regions.valance)).toBeCloseTo(TACO_VALANCE.size[2] / TACO_VALANCE.size[1], 2);
    const [faceH, faceW] = TACO_MENU_BOARD.face;
    expect(Math.abs(aspect(regions.menu) / (faceW / faceH) - 1)).toBeLessThan(0.02);
  });

  it('ships the provenance-recorded image: opaque, compact, at its stated size', async () => {
    const bytes = readFileSync(file);
    const provenance = JSON.parse(readFileSync('public/textures/signage/PROVENANCE.json', 'utf8'));
    const asset = provenance.tacoTruckSign.assets[0];
    expect(file.endsWith(asset.file)).toBe(true);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    expect(bytes.byteLength).toBeLessThan(200000);
    const { data, info } = await sharp(bytes)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([TACO_SIGN_ATLAS.width, TACO_SIGN_ATLAS.height]);
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) throw new Error('alpha in atlas');
  });

  it('maps region corners to the atlas with three’s flipped v', () => {
    const [x, y, w, h] = TACO_SIGN_ATLAS.regions.menu;
    expect(tacoAtlasUv('menu', 0, 1)).toEqual([x / 2048, 1 - y / 1024]);
    expect(tacoAtlasUv('menu', 1, 0)).toEqual([(x + w) / 2048, 1 - (y + h) / 1024]);
  });
});

describe('taco truck roof board', () => {
  it('humps from the shoulder at its ends to its full height at the centre', () => {
    expect(tacoBoardTop(0)).toBeCloseTo(TACO_BOARD.height, 6);
    expect(tacoBoardTop(TACO_BOARD.width / 2)).toBeCloseTo(TACO_BOARD.shoulder, 6);
    const outline = tacoBoardOutline();
    for (const [px, py] of outline) {
      expect(Math.abs(px)).toBeLessThanOrEqual(TACO_BOARD.width / 2 + 1e-9);
      expect(py).toBeGreaterThanOrEqual(-1e-9);
      expect(py).toBeLessThanOrEqual(TACO_BOARD.height + 1e-9);
    }
  });

  it('stands its painted faces off the board body by the label standoff', () => {
    expect(TACO_BOARD.standoff).toBeGreaterThanOrEqual(SURFACE_LAYERS.label);
  });

  it('carries the board on posts and lights it from lamps within its span', () => {
    const half = TACO_BOARD.width / 2;
    for (const z of [...TACO_BOARD_POSTS_Z, ...TACO_BOARD_LAMPS_Z])
      expect(Math.abs(z - TACO_BOARD.z)).toBeLessThan(half - 0.2);
  });
});
