import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AVATAR_DATA_URI,
  getWorkerPresenceAssets,
  WORKER_PORTRAITS,
} from '../workerPortraits';

const EXPECTED_SLUGS = [
  'w1_marcus_chen',
  'w2_sarah_mitchell',
  'w3_james_rodriguez',
  'w4_emily_ronson',
  'w5_david_kim',
  'w6_lisa_thompson',
  'w7_robert_garcia',
  'w8_anna_kowalski',
  'w9_michael_brown',
  'w10_jennifer_lee',
];

describe('worker presence assets', () => {
  it('maps every canonical portrait to its reviewed idle animation and rest frame', () => {
    EXPECTED_SLUGS.forEach((slug, index) => {
      const workerId = `w${index + 1}`;
      const assets = getWorkerPresenceAssets(workerId);

      expect(WORKER_PORTRAITS[workerId]).toBe(`/assets/workers/${slug}.webp`);
      expect(assets).toEqual({
        portrait: `/assets/workers/${slug}.webp`,
        animation: `/assets/workers/idle/${slug}_idle.webp`,
        rest: `/assets/workers/idle/${slug}_idle_rest.webp`,
      });
    });
  });

  it('uses the embedded neutral portrait without requesting unknown animation assets', () => {
    expect(getWorkerPresenceAssets('unknown-worker')).toEqual({
      portrait: DEFAULT_AVATAR_DATA_URI,
    });
  });
});
