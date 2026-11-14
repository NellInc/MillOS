/**
 * The 63-shift chronicle pinned to the last value (plan item 4.2, D3): a
 * chronicle signed without a length, or with the full one, runs exactly as it
 * did before lengths existed. Each digest rolls up the whole state after every
 * close of a seeded run, quiz fields left out (another lane owns them).
 *
 * The digests were taken on the tree before 4.2 (13 November 2026). A later
 * change that moves one on purpose re-pins it here and says why.
 */
import { describe, expect, it } from 'vitest';
import { CHRONICLE_SHIFTS } from '../cropYears';
import { playChronicle, type PlayResult } from './chronicleRun';

const RUNS: Array<[string, () => PlayResult]> = [
  ['seed 3, answering', () => playChronicle(3, 'answer')],
  ['seed 11, lapsing', () => playChronicle(11, 'lapse')],
  ['seed 29, delegated', () => playChronicle(29, 'delegate')],
  [
    'seed 7, hard charter, answering',
    () =>
      playChronicle(7, 'answer', {
        grain: 'marginal',
        plant: 'tired',
        customers: 'demanding',
        fortune: 'hard',
      }),
  ],
  ['seed 5, no dispatch', () => playChronicle(5, 'answer', {}, 0)],
  ['seed 13, no trials', () => playChronicle(13, 'answer', { mode: 'no_trials' })],
];

/**
 * Taken before 4.2 and held green through it (the 4.2 change alone moved
 * none). Re-pinned once on 13 November for the deliberate changes after it:
 * 4.5 (trial announcements carry what they test; failures name the condition;
 * Grid Winter announced six shifts ahead), 4.6 (the wet year's penalty 6 to 5),
 * and the 4b leftovers (rush freight 70 to 65, relief lorry 80 to 35, the
 * administrator's federation paying the upkeep). Before: 27qcnkkcv9e,
 * 1fee96zj5c8, lhr5i2fphu, g5mywkvhv4, lmj3zorbc6, 2alyk3ne9ge.
 *
 * Re-pinned again for item 4.1's re-tune on the measured plant and its
 * companions (4c): the fund in plant currency at a 1.02% reinvestment share,
 * the net read through shiftMargin, avoided costs credited to plans, trial
 * windows and tonnage from the measured pace, Grid Winter's 0.008 cap, the
 * mitigation and plan prices, the bench's tests earning nothing, forfeits and
 * seasons read, D17's wording. Before: muczuokbxo, 145qcl2y3a5, 2eonmz1ykii,
 * 1utqtq6d3bb, 1kyw2vzga0t, od2mdfb5ej.
 *
 * Re-pinned for plan item 7.7: the wet year is dried on the floor's temper
 * card, so the wet-intake event treats nothing (its dryer 2 fund, making the
 * card's drying free for three shifts; its blend free), the falling-number
 * event answers a sprouted year only, and a crop event is moot once its year
 * is treated; and close-out 1 of item 7c: the reinvestment share 38.8 of a
 * measured net of 4,259 (0.91%, was 39.41 of 3,864). Before: fymcftdwti,
 * jukat65int, 18xcy3q3ey9, 11oo01hplgc, 1rm181uxqna, 1u5s13cdhin.
 *
 * Re-pinned for the last tuning pass on the final plant (13 November): the
 * reinvestment share 33.5 of 4,259 (0.79%), so every buyer's fund ends under
 * three times the dearest plan; the storm's and grid strain's mitigations 6
 * to 5, which that share left priced above the damage they avoid; and D14's
 * trims, which change the notices the digest reads (a trial's announcement is
 * its briefing alone, and the shortfall, struck-forecast and fallen-front
 * notices end without their advice). Before: 271pegsu9b, 20utfklkd8u,
 * 1x66iw63gmu, svmdf6l4fi, 1x6yhb3sqc9, 99z6jj9mvu.
 *
 * Then three of them for the long night: the AI partner's answer, which a
 * lapse takes, holds the less prepared front instead of always the roller
 * floor, so the runs that left the night to the partner with the intake the
 * weaker now hold the intake. Before: 7zakmsrto6,
 * 3gxsi157sl, 1rgkuhvozey.
 *
 * Re-pinned once more on the final tree, after the plant's temper card came to
 * be judged silo by silo: that raised wet-year revenue, and one buyer's fund
 * ended over the cap, so the reinvestment share went from 33.5 to 30 of 4,259
 * (0.79% to 0.70%), and dust's mitigation from 2 to 1, which that share left
 * priced at 1.53 times what it avoids. The plant change itself moves none of
 * these digests: the pins close on fixed evidence. Before: 71kultup2z,
 * hwev4q44jz, gjf3g0oxc3, s3bndixvj9, 14f38rj9kef, z4nz0vp6vb.
 *
 * Re-pinned for review 2 (stage A): the hired dryer costs one shift of
 * drying (73, was 2), since what it keeps off the books is now credited in
 * full; and a wet year's notice names the Tempering card instead of a
 * treatment that no longer exists. Stage B's re-measure will move them again.
 * Before: 1t08rvs6fth, 2bmo2ojxgmo, 253p1r93abm, 1xzdtgpzgts, 22tcha7yix6,
 * 5lvkavunc3.
 *
 * Re-pinned for review 2 (stage B), on the final tree: the measured plant
 * re-copied from the no-charter arm (20,500 kg a shift, was 19,500; energy
 * 176, was 167), which moves every trial's tonnage, the reference shift the
 * engine prices with and the dryer's price; and the long night's held notice
 * worded as its buttons are ("4 prepared, 2 needed"). The no-trials run moved
 * nothing. Before: p3gv80v29k, 3crjdu5o9b, 1b97cjvzsjt, gj2eq6hic4,
 * 2ez9y1raad0.
 */
const PINNED: Record<string, string> = {
  'seed 3, answering': '2f5dgbr66xh',
  'seed 11, lapsing': '1o0e3ld51qr',
  'seed 29, delegated': '3zo1su1ir0',
  'seed 7, hard charter, answering': 's3th12olqe',
  'seed 5, no dispatch': '1km4oq0fqeg',
  'seed 13, no trials': 'fykjz693yr',
};

describe('the 63-shift chronicle is unchanged to the last value', () => {
  for (const [name, run] of RUNS)
    it(name, () => {
      const { state, trail } = run();
      expect(state.status).toBe('ended');
      expect(state.shift).toBe(CHRONICLE_SHIFTS);
      expect(`${name}: ${trail}`).toBe(`${name}: ${PINNED[name]}`);
    });
});
