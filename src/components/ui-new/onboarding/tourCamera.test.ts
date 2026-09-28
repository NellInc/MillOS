import { describe, expect, it } from 'vitest';
import { getTourCameraPreset } from './tourCamera';

describe('tour camera route', () => {
  it('flies through silos, packing, and milling', () => {
    expect([0, 1, 2].map(getTourCameraPreset)).toEqual([1, 4, 2]);
  });

  it('ignores inactive or invalid tour steps', () => {
    expect(getTourCameraPreset(null)).toBeNull();
    expect(getTourCameraPreset(3)).toBeNull();
  });
});
