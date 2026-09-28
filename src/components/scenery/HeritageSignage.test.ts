// @vitest-environment node
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

describe('delivered heritage print', () => {
  for (const [name, width, height] of [
    ['dead-dino', 1024, 683],
    ['wheat-sheaf', 512, 512],
  ] as const) {
    it(`${name} is compact, alpha-masked colour artwork`, async () => {
      const bytes = readFileSync(`public/textures/signage/${name}.webp`);
      expect(bytes.byteLength).toBeLessThan(60000);
      const { data, info } = await sharp(bytes)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, info.channels]).toEqual([width, height, 4]);
      for (const index of [0, width - 1, width * (height - 1), width * height - 1]) {
        expect(data[index * 4 + 3]).toBe(0);
      }
      let covered = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] >= 128) covered++;
      expect(covered / (width * height)).toBeGreaterThan(0.15);
      expect(covered / (width * height)).toBeLessThan(0.65);
    });
  }

  it('shares lit, opaque-pass artwork across the pylon, shelter and grain trailers', () => {
    const print = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
    expect(print).toContain('THREE.SRGBColorSpace');
    expect(print).toContain('alphaTest={0.5}');
    expect(print).not.toContain('<meshBasicMaterial');
    expect(print).not.toContain('emissive=');
    expect(print).not.toContain('transparent');
    expect(print.match(/surface="painted"/g)).toHaveLength(5);
    const exterior = readFileSync('src/components/FactoryExterior.tsx', 'utf8');
    expect(exterior).toContain('side * 0.04');
    expect(exterior).toContain("brand={end === -1 ? 'flour' : 'dino'}");
    expect(exterior).not.toContain('DeadDinoAdvertRelief');
    const trucks = readFileSync('src/components/truckbay/OptimizedTruckBay.tsx', 'utf8');
    expect(trucks).toContain('useTexture(HERITAGE_ART.wheat)');
    expect(trucks).toContain('context.drawImage(badge, 790, 14)');
    expect(trucks).toContain("company === 'GRAIN CO'");
  });

  it('seats both trailer panels outside the accent strip that previously obscured them', () => {
    const source = readFileSync('src/components/truckbay/OptimizedTruckBay.tsx', 'utf8');
    const panels = [
      ...source.matchAll(
        /name="trailer-identity-(?:left|right)"\s+position=\{\[(-?[\d.]+), 2.55, -5.65\]\}/g
      ),
    ];
    expect(panels).toHaveLength(2);
    for (const panel of panels)
      expect(Math.abs(Number(panel[1])) - 0.035 / 2).toBeGreaterThan(1.3 + 0.06 / 2);
    expect(source.match(/scale=\{\[8.2, 2.05, 0.035\]\}/g)).toHaveLength(2);
    expect(source.match(/scale=\{\[0.06, 0.56, 9.6\]\}/g)).toHaveLength(2);
  });

  it('restores distinct shop identities and removes the obsolete school burial', () => {
    const village = readFileSync('src/components/VillageArea.tsx', 'utf8');
    expect(village).toContain('<VillageShopSign trade={signText} />');
    const signs = readFileSync('src/components/scenery/VillageSignage.tsx', 'utf8');
    expect(signs).toContain("trade ?? 'VILLAGE SHOP'");
    expect(signs).toContain('maxWidth={textWidth}');
    for (const sign of ['BAKER', 'BUTCHER', 'GENERAL STORE'])
      expect(village).toContain(`signText="${sign}"`);
    expect(village).toContain(
      '<GeneratedBody asset="school" fallback={<SchoolPrimitiveBody />} />'
    );
    expect(village).not.toContain('asset="school" sink=');
  });
});
