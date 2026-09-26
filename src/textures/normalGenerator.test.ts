import { describe, expect, it } from 'vitest';
import { generateMachinePanelNormal, generateProceduralNormal } from './normalGenerator';

function channels(texture: ReturnType<typeof generateProceduralNormal>) {
  const data = texture.image.data as Uint8Array;
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  for (let index = 0; index < data.length; index += 4) {
    red.push(data[index]);
    green.push(data[index + 1]);
    blue.push(data[index + 2]);
  }
  return { red, green, blue };
}

describe('normalGenerator', () => {
  it('caches identical procedural normal requests', () => {
    expect(generateProceduralNormal(32, 0.5, 12)).toBe(generateProceduralNormal(32, 0.5, 12));
  });

  it('produces signed, normalized procedural relief', () => {
    const { red, green, blue } = channels(generateProceduralNormal(64, 1, 10));
    expect(Math.min(...red)).toBeLessThan(127);
    expect(Math.max(...red)).toBeGreaterThan(127);
    expect(Math.min(...green)).toBeLessThan(127);
    expect(Math.max(...green)).toBeGreaterThan(127);
    expect(Math.min(...blue)).toBeGreaterThan(220);
  });

  it('keeps machine bevels while adding unbiased face relief', () => {
    const { red, green, blue } = channels(generateMachinePanelNormal(64, 4, 6));
    expect(Math.min(...red)).toBeLessThan(90);
    expect(Math.max(...red)).toBeGreaterThan(165);
    expect(Math.min(...green)).toBeLessThan(90);
    expect(Math.max(...green)).toBeGreaterThan(165);
    expect(Math.min(...blue)).toBeGreaterThan(190);
  });

  it('tiles without a relief seam at the wrap edge', () => {
    // A non-periodic height field turns the jump across u = 1 -> 0 into a
    // spike normal along both edge columns (FLOOR_AGGREGATE_NORMAL's shape).
    const size = 128;
    const data = generateProceduralNormal(size, 1, 26).image.data as Uint8Array;
    const columnTilt = (x: number) => {
      let sum = 0;
      for (let y = 0; y < size; y++) sum += Math.abs(data[(y * size + x) * 4] - 128);
      return sum / size;
    };
    const edge = (columnTilt(0) + columnTilt(size - 1)) / 2;
    let interior = 0;
    for (let x = 1; x < size - 1; x++) interior += columnTilt(x);
    interior /= size - 2;
    expect(edge).toBeLessThan(interior * 1.4);
  });
});
