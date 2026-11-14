/**
 * The temper card (plan item 7.7), pure: each answer priced on the stamp its
 * flour carries against the open minimums, the drying's money and the rest
 * before a change reaches the rolls; the partner reads the prices; what an
 * answer does; a saved card re-read field by field. Words in both languages.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../i18n';
import { TEMPER_REST_MINUTES } from '../chronicle/temper';
import {
  priceAll,
  proposalEffect,
  raiseProposals,
  sanitizeProposal,
  type PlantWorld,
} from './partnerProposals';
import {
  formatProposalPrice,
  proposalOptionLabel,
  proposalReasonText,
} from './partnerProposalText';
import type { TemperFacts } from './temperProposal';

const facts = (extra: Partial<TemperFacts> = {}): TemperFacts => ({
  shiftIndex: 10,
  cropYear: 1,
  moisturePct: 15.6,
  base: 99.2,
  standardPenalty: 5,
  driedPenalty: 0,
  openMinimums: [95, 92, 90],
  dryingCost: 95.4,
  dryingKwh: 636,
  inForce: 'standard',
  ...extra,
});

const world = (temper: TemperFacts | null): PlantWorld => ({
  sessionId: 's',
  minute: 600,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [],
  temper: { raise: temper, outcome: null },
});

afterEach(() => setLocale('en'));

describe('the temper card', () => {
  it('prices the stamp, the drying and the rest', () => {
    const [standard, dried] = priceAll('temper', facts());
    expect(standard.id).toBe('standard');
    expect(standard.price).toMatchObject({
      quality: 94.2,
      gradeRisk: true,
      belowMinimums: [95],
      currency: 0,
      waitMinutes: 0,
    });
    expect(dried.price).toMatchObject({
      quality: 99.2,
      gradeRisk: false,
      belowMinimums: [],
      currency: 95.4,
      waitMinutes: TEMPER_REST_MINUTES,
    });
    expect(formatProposalPrice(dried.price, 'en')).toMatch(/starts in/);
  });

  it('is raised once a shift, the partner reading its own prices', () => {
    const [raised] = raiseProposals(world(facts()), [], (i) => `p-${i}`);
    expect(raised.kind).toBe('temper');
    expect(raised.subject).toBe('temper-1-10');
    expect(raised.defaultOptionId).toBe('dry-first');
    expect(raiseProposals(world(facts()), [raised], (i) => `p-${i}`)).toHaveLength(0);
    // Moisture meters' point back on a serviced line: tempered as it comes makes 95.
    const [metered] = raiseProposals(world(facts({ standardPenalty: 4 })), [], (i) => `p-${i}`);
    expect(metered.defaultOptionId).toBe('standard');
    expect(raiseProposals(world(null), [], (i) => `p-${i}`)).toHaveLength(0);
  });

  it('tempers the shift and books the drying', () => {
    expect(proposalEffect('temper', 'dry-first', facts())).toEqual({
      type: 'temper',
      option: 'dry-first',
      kwh: 636,
      cost: 95.4,
      // The card it answers, so a second answer after a reload books nothing.
      key: 'temper-1-10',
    });
    expect(proposalEffect('temper', 'standard', facts())).toEqual({
      type: 'temper',
      option: 'standard',
      kwh: 0,
      cost: 0,
      key: 'temper-1-10',
    });
  });

  it('reads a saved card field by field', () => {
    const [raised] = raiseProposals(world(facts()), [], (i) => `p-${i}`);
    const restored = sanitizeProposal(JSON.parse(JSON.stringify(raised)));
    expect(restored).toEqual(raised);
    expect(sanitizeProposal({ ...raised, facts: { ...raised.facts, inForce: 'boil' } })).toBeNull();
  });

  it('words its answers and reason in both languages', () => {
    const [raised] = raiseProposals(world(facts()), [], (i) => `p-${i}`);
    expect(proposalOptionLabel('dry-first', 'en')).toBe('Dry first, then temper');
    expect(proposalReasonText(raised, 'en')).toBe('Wet wheat for the rolls: moisture 15.6%.');
    expect(proposalOptionLabel('dry-first', 'pt-BR')).toBe('Secar antes de condicionar');
    expect(proposalReasonText(raised, 'pt-BR')).toBe('Trigo úmido para os rolos: umidade 15,6%.');
  });
});
