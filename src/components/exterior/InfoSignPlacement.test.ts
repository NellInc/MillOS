import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateHeightmap } from '../terrain/splatMapGenerator';
import { TERRAIN_BOUNDS } from '../terrain/terrainTypes';
import { SITE_LAYOUT } from '../../constants/siteLayout';

const source = readFileSync(resolve('src/components/FactoryExterior.tsx'), 'utf8');
const signs = [...source.matchAll(/<InfoSign position=\{\[([^\]]+)\]\} text="([^"]+)"/g)].map(
  ([, coordinates, text]) => ({ text, position: coordinates.split(',').map(Number) })
);

describe('waterside information sign placement', () => {
  it('keeps every sign on undisplaced terrain, including the river approach', () => {
    expect(signs.map((sign) => sign.text)).toEqual(['CANAL', 'LAKE', 'RIVER', 'DOCK']);
    const resolution = 512;
    const map = generateHeightmap(resolution);
    const sample = (x: number, z: number) => {
      const px = Math.round(
        ((x - TERRAIN_BOUNDS.minX) / (TERRAIN_BOUNDS.maxX - TERRAIN_BOUNDS.minX)) * resolution - 0.5
      );
      const py =
        resolution -
        1 -
        Math.round(
          ((z - TERRAIN_BOUNDS.minZ) / (TERRAIN_BOUNDS.maxZ - TERRAIN_BOUNDS.minZ)) * resolution -
            0.5
        );
      return map.image.data![(py * resolution + px) * 4];
    };
    // Reproduces the old river sign floating above the displaced canyon bank.
    expect(sample(10, -130)).toBeLessThan(255);
    for (const {
      text,
      position: [x, , z],
    } of signs) {
      for (const dx of [-0.4, 0.4]) {
        for (const dz of [-0.4, 0.4]) expect(sample(x + dx, z + dz), text).toBe(255);
      }
    }
    map.dispose();
  });

  it('keeps the canal sign outside the actual canal footprint and its stone wall', () => {
    // The canal is separate geometry, so the river heightmap cannot detect it.
    // FactoryExterior mounts it from the site layout, so read the same record.
    expect(source).toContain('<Canal {...SITE_LAYOUT.exteriorFeatures.canal} />');
    const { canal } = SITE_LAYOUT.exteriorFeatures;
    expect(canal.rotation).toBe(0);
    const canalX = canal.position[0];
    const halfWidth = canal.width / 2;
    const sign = signs.find(({ text }) => text === 'CANAL')!;
    expect(Math.abs(-150 - canalX)).toBeLessThan(halfWidth);
    expect(Math.abs(sign.position[0] - canalX) - 0.4).toBeGreaterThan(halfWidth + 0.5);
  });
});
