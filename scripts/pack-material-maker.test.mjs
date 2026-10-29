import { expect, it } from 'vitest';
import { packLinearRoughness } from './pack-material-maker.mjs';
it('registers bottom-up EXR rows with top-down colour/normal PNGs without gamma decoding', () => {
  const data = new Float32Array(4 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) data[(y * 4 + x) * 4] = (y + 1) * 0.2;
  const { raw, min, max } = packLinearRoughness(data, 4, 4);
  expect(Array.from(raw)).toEqual([179, 179, 179, 179, 179, 179, 77, 77, 77, 77, 77, 77]);
  expect(min).toBeCloseTo(0.3, 6);
  expect(max).toBeCloseTo(0.7, 6);
});
