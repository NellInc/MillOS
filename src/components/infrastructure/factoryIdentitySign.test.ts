import { describe, expect, it } from 'vitest';
import { identitySignGlow } from './OptimizedFactoryInfrastructure';
import { getExteriorLampLevel } from '../exterior/ExteriorLighting';

describe('backlit MillOS fascia sign', () => {
  it('is dark by day and reads as a light source at night', () => {
    // base-med-22 overview: the fascia sign was lit only by the night fill and
    // vanished into the facade.
    expect(identitySignGlow(getExteriorLampLevel(12, 'clear'))).toBe(0);
    expect(identitySignGlow(getExteriorLampLevel(22, 'clear'))).toBeGreaterThan(1);
    expect(identitySignGlow(Number.NaN)).toBe(0);
  });
});
