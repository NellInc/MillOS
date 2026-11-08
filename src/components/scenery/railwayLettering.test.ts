import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import typrFactory from 'troika-three-text/libs/typr.factory.js';
import woff2otfFactory from 'troika-three-text/libs/woff2otf.factory.js';
import { RAILWAY_LETTERING_FONT } from './RailwayStation';

/**
 * Riverside's lettering is Rosario with Ocean Sans's diamond tittle
 * (`scripts/build-riverside-font.py`). The font is read here by troika's own
 * parser, because a font troika cannot parse suspends every `SceneText` and
 * blanks the scene (SceneText.tsx); fontTools accepting it proves nothing.
 */
const FONT_FILE = 'public/fonts/RiversideRosario-Regular.ttf';

type GlyphObj = { path: string; yMin: number; yMax: number };
type FontObj = {
  xHeight: number;
  forEachGlyph: (
    text: string,
    size: number,
    spacing: number,
    callback: (glyph: GlyphObj) => void
  ) => number;
};

function troikaParser(): (buffer: ArrayBuffer) => FontObj {
  // parserFactory is module-private; take its declaration from the shipped source.
  const file = 'node_modules/troika-three-text/src/FontParser.js';
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022);
  const declaration = source.statements.find(
    (node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === 'parserFactory'
  );
  if (!declaration) throw new Error('troika parserFactory not found');
  const factory = new Function(`${declaration.getText(source)}; return parserFactory;`)();
  return factory(typrFactory(), woff2otfFactory());
}

/** The contours of a troika glyph path, as vertex lists (control points included). */
function contours(path: string): [number, number][][] {
  return path
    .split('M')
    .filter(Boolean)
    .map((contour) =>
      [...contour.matchAll(/[MLQCZ]?(-?[\d.]+),(-?[\d.]+)/g)].map(
        (m) => [Number(m[1]), Number(m[2])] as [number, number]
      )
    );
}

describe('Riverside station lettering', () => {
  it('sets every station sign in the vendored Riverside font', () => {
    expect(RAILWAY_LETTERING_FONT).toMatch(/fonts\/RiversideRosario-Regular\.ttf$/);
    const station = readFileSync('src/components/scenery/RailwayStation.tsx', 'utf8');
    const signs = station.match(/<SceneText\b[\s\S]*?>/g) ?? [];
    expect(signs.length).toBeGreaterThanOrEqual(4);
    for (const sign of signs) expect(sign).toContain('font={RAILWAY_LETTERING_FONT}');
    expect(readFileSync('public/fonts/RiversideRosario-OFL.txt', 'utf8')).toContain(
      'SIL Open Font License, Version 1.1'
    );
  });

  it('is TrueType that troika parses, with a diamond over i and j', () => {
    const bytes = readFileSync(FONT_FILE);
    expect(bytes.readUInt32BE(0)).toBe(0x00010000);
    const tables = new Set<string>();
    for (let i = 0; i < bytes.readUInt16BE(4); i++)
      tables.add(bytes.toString('latin1', 12 + i * 16, 16 + i * 16));
    expect(tables.has('glyf')).toBe(true);
    expect(tables.has('CFF ')).toBe(false);

    const font = troikaParser()(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    );
    for (const letter of ['i', 'j']) {
      let glyph: GlyphObj | undefined;
      font.forEachGlyph(letter, 1, 0, (g) => (glyph = g));
      expect(glyph, letter).toBeDefined();
      const tittles = contours(glyph!.path).filter((points) =>
        points.every(([, y]) => y > font.xHeight)
      );
      expect(tittles, letter).toHaveLength(1);
      // A square on its point: four corners, top and bottom on one vertical,
      // left and right on one horizontal, equal half-diagonals.
      const corners = tittles[0].filter(
        ([x, y], k, all) => k === 0 || x !== all[0][0] || y !== all[0][1]
      );
      expect(corners, letter).toHaveLength(4);
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const half = Math.max(...ys) - cy;
      expect(Math.max(...xs) - cx, letter).toBeCloseTo(half, 0);
      for (const [x, y] of corners)
        expect(Math.abs(x - cx) + Math.abs(y - cy), letter).toBeCloseTo(half, 0);
    }
    // Dotless i stays dotless; capitals carry no tittle.
    let dotless: GlyphObj | undefined;
    font.forEachGlyph('ı', 1, 0, (g) => (dotless = g));
    expect(dotless!.yMax).toBeLessThanOrEqual(font.xHeight + 20);
  });
});
