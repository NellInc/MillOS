// @vitest-environment node
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import { createSignMaterial } from './HeritageSignage';
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

  it('backlights shelter and pylon artwork without changing the trailer print', () => {
    const print = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
    expect(print).toContain('THREE.SRGBColorSpace');
    expect(print).toContain('alphaTest: map ? 0.5 : 0');
    expect(print).toContain('EXTERIOR_LAMP_LEVEL.value * 0.85');
    expect(print.match(/userData=\{\{ noStaticBatch: true \}\}/g)).toHaveLength(2);
    expect(print).toContain('backlit = false');
    expect(print).toContain('material.dispose()');
    expect(print).not.toContain('<meshBasicMaterial');
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

describe('sign lightbox materials', () => {
  it('uses the actual artwork for emission, preserving its colours and alpha mask', () => {
    const texture = new THREE.Texture();
    const material = createSignMaterial('#ffffff', texture);
    expect(material.map).toBe(texture);
    expect(material.emissiveMap).toBe(texture);
    expect(material.alphaTest).toBe(0.5);
    expect(material.transparent).toBe(false);
    expect(material.emissiveIntensity).toBe(0);
    material.dispose();
    texture.dispose();
  });

  it('keeps dark lettering distinct from cream lightbox backgrounds', () => {
    const ink = createSignMaterial('#254b3c');
    const paper = createSignMaterial('#efe3c7');
    expect(ink.emissive.equals(ink.color)).toBe(true);
    expect(paper.emissive.equals(paper.color)).toBe(true);
    expect(paper.emissive.g / ink.emissive.g).toBeGreaterThan(8);
    expect(paper.alphaTest).toBe(0);
    expect(paper.emissiveMap).toBe(null);
    ink.dispose();
    paper.dispose();
  });

  it('illuminates both canopy wordmarks and the shop sign through the same dimmer', () => {
    const station = readFileSync('src/components/GasStationInstanced.tsx', 'utf8');
    expect(station).toContain('name={`station-canopy-wordmark-${side}`}');
    expect(station).toContain('name="station-shop-wordmark"');
    expect(station.match(/<IlluminatedSignText/g)).toHaveLength(2);
    const print = readFileSync('src/components/scenery/HeritageSignage.tsx', 'utf8');
    expect(print).not.toMatch(/<(?:pointLight|spotLight|rectAreaLight)/);
  });
});
