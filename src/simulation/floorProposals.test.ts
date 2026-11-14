import { beforeEach, describe, expect, it } from 'vitest';
import { CROP_YEARS, cropWheatPenalty } from '../chronicle/cropYears';
import type { CropKind, CropYearState } from '../chronicle/types';
import {
  cropPointsForReadings,
  mixReadings,
  stampPenaltyFor,
  type LotStampContext,
} from './lotQuality';
import { intakeKind, type IntakeFacts } from './intakeProposal';
import { delayLateCost, incidentKind, type IncidentFacts } from './incidentProposal';
import { INCIDENT_RESPONSES } from './incidentResponses';
import { priceAll, raiseProposals, sanitizeProposal, type PlantWorld } from './partnerProposals';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { actOnMetIncidents, runIncidentResponse } from '../systems/incidentRuntime';
import { proposalRecordOf, proposalRecordText } from './shiftReview';
import { formatProposalPrice } from './partnerProposalText';

// Plan items 3.1 and 3.5. Working if: a silo of one crop year's lots stamps
// exactly the old plant-wide figure, and only a blend of years differs; the
// intake's three answers are priced on the stamp against each open minimum,
// and the partner takes the best of them, so none is right on every lot; an
// incident's two answers trade money against grade or lateness, so neither
// is right in every situation; a plant incident ends at its stated minute and
// a Chronicle one keeps its own route.

const crop = (kind: CropKind, treated = false): CropYearState => ({ index: 1, kind, treated });
const context = (
  kind: CropKind,
  lots: Record<string, IntakeFacts | null> = {}
): LotStampContext => ({
  crop: crop(kind),
  relieved: [],
  otherPenalty: 0,
  cropOf: (id) => {
    const lot = lots[id];
    return lot
      ? {
          cropYear: 1,
          kind: lot.cropKind,
          moisturePct: lot.moisturePct,
          proteinPct: lot.proteinPct,
          fallingNumberS: lot.fallingNumberS,
        }
      : undefined;
  },
});

describe('a lot readings band reproduces each crop year at every draw', () => {
  for (const kind of Object.keys(CROP_YEARS) as CropKind[]) {
    const year = CROP_YEARS[kind];
    for (const end of [-1, 1] as const)
      for (const treated of [false, true])
        it(`${kind} at ${end < 0 ? 'its lowest' : 'its highest'} draw${treated ? ', treated' : ''}`, () => {
          const readings = {
            moisturePct: year.moisture.mean + end * year.moisture.spread,
            proteinPct: year.protein.mean,
            fallingNumberS: year.fallingNumber.mean + end * year.fallingNumber.spread,
          };
          expect(cropPointsForReadings(readings, { crop: crop(kind, treated), relieved: [] })).toBe(
            cropWheatPenalty(crop(kind, treated), [])
          );
        });
  }

  it('an unstamped lot reads as the year in force', () => {
    const ctx = context('sprouted');
    expect(stampPenaltyFor([{ lotId: 'opening', amount: 20000 }], ctx)).toBe(9);
    expect(stampPenaltyFor([], ctx)).toBe(9);
  });

  it('a sprouted lot blended into twice its mass of sound grain stamps nothing', () => {
    const lots = {
      sound: { cropKind: 'typical', moisturePct: 13.2, proteinPct: 11.8, fallingNumberS: 320 },
      bad: { cropKind: 'sprouted', moisturePct: 14.6, proteinPct: 11, fallingNumberS: 190 },
    } as unknown as Record<string, IntakeFacts>;
    const ctx = context('sprouted', lots);
    const mix = [
      { lotId: 'sound', amount: 30000 },
      { lotId: 'bad', amount: 15000 },
    ];
    expect(mixReadings(mix, ctx)?.fallingNumberS).toBeCloseTo(276.7, 1);
    expect(stampPenaltyFor(mix, ctx)).toBe(0);
    // Alone it carries the sprouted year's 9; with the meters' -1 elsewhere, 8.
    expect(stampPenaltyFor([{ lotId: 'bad', amount: 15000 }], ctx)).toBe(9);
    expect(stampPenaltyFor([{ lotId: 'bad', amount: 15000 }], { ...ctx, otherPenalty: -1 })).toBe(
      8
    );
  });
});

const intake = (overrides: Partial<IntakeFacts> = {}): IntakeFacts => ({
  deliveryIndex: 14,
  amountKg: 15000,
  supplier: null,
  cropYear: 1,
  cropKind: 'sprouted',
  moisturePct: 14.6,
  proteinPct: 11,
  fallingNumberS: 190,
  siloId: 'silo-2',
  blendSiloId: 'silo-0',
  base: 99.2,
  straightPenalty: 9,
  blendPenalty: 0,
  refusePenalty: 0,
  openMinimums: [95, 92],
  refusalFee: 120,
  shortMinutes: 0,
  ...overrides,
});

const world = (extra: Partial<PlantWorld>): PlantWorld => ({
  sessionId: 's',
  minute: 100,
  programme: { canAccept: false, programmeCount: 0, lastAcceptedBy: null, offer: null },
  units: [],
  ...extra,
});

describe('intake: accept, blend or refuse, priced on the stamp', () => {
  const partner = (facts: IntakeFacts) =>
    raiseProposals(world({ intake: facts }), [], () => 'p-1')[0];

  it('a sprouted lot straight in fails both flour minimums; the partner blends', () => {
    const [accept, blend, refuse] = priceAll('intake', intake());
    expect(accept.price.belowMinimums).toEqual([95, 92]);
    expect(blend.price.gradeRisk).toBe(false);
    expect(refuse.price.currency).toBe(120);
    expect(partner(intake()).defaultOptionId).toBe('blend');
  });

  it('with no silo to blend into, the partner refuses it', () => {
    const facts = intake({ blendSiloId: null, blendPenalty: null });
    expect(priceAll('intake', facts).map((o) => o.id)).toEqual(['accept', 'refuse']);
    expect(partner(facts).defaultOptionId).toBe('refuse');
  });

  it('in a year where every lot is as bad, refusing changes no stamp, so the partner accepts', () => {
    const facts = intake({ blendSiloId: null, blendPenalty: null, refusePenalty: 9 });
    expect(priceAll('intake', facts).find((o) => o.id === 'refuse')?.price.belowMinimums).toEqual([
      95, 92,
    ]);
    expect(partner(facts).defaultOptionId).toBe('accept');
  });

  it('short of wheat for the flour owed, accepting beats refusing', () => {
    const facts = intake({ blendSiloId: null, blendPenalty: null, shortMinutes: 40 });
    expect(partner(facts).defaultOptionId).toBe('accept');
  });

  it('a sound lot is accepted: refusing only costs its fee', () => {
    const facts = intake({
      cropKind: 'typical',
      fallingNumberS: 320,
      moisturePct: 13.2,
      straightPenalty: 0,
      blendSiloId: null,
      blendPenalty: null,
    });
    expect(partner(facts).defaultOptionId).toBe('accept');
  });

  it('refusing carries the even chance that the next grain truck is 45 minutes late, priced and on its button', () => {
    // Review 2, finding 8: refuseLot's seeded delay was in no price.
    const refuse = (facts: IntakeFacts) =>
      priceAll('intake', facts).find((option) => option.id === 'refuse')!.price;
    const sound = refuse(intake());
    expect(sound.truckDelay).toEqual({ chance: 0.5, minutes: 45 });
    // Short of wheat until that truck, the delay's expected minutes are minutes short.
    expect(refuse(intake({ shortMinutes: 40 })).minutes).toBe(Math.round(40 + 0.5 * 45));
    expect(formatProposalPrice(sound, 'en')).toContain(
      '50% chance the next grain truck is 45 min late'
    );
    expect(formatProposalPrice(sound, 'pt-BR')).toContain(
      '50% de chance de o próximo caminhão de grãos atrasar 45 min'
    );
    // Saved and read back with it.
    const raised = partner(intake());
    expect(sanitizeProposal(JSON.parse(JSON.stringify(raised)))).toEqual(raised);
  });

  it('saved and read back unchanged; a lot with no readings is not a saved intake', () => {
    const raised = partner(intake());
    expect(sanitizeProposal(JSON.parse(JSON.stringify(raised)))).toEqual(raised);
    const { fallingNumberS: _drop, ...noReadings } = intake();
    expect(sanitizeProposal({ ...raised, facts: noReadings })).toBeNull();
  });
});

const incident = (overrides: Partial<IncidentFacts> = {}): IncidentFacts => ({
  incidentId: 'incident-0042',
  incidentKind: 'delayed_truck',
  origin: 'plant',
  machineId: null,
  qualityPenalty: 0,
  energyMultiplier: 1,
  minutes: 120,
  lineStamp: 99.2,
  openMinimums: [95, 92, 90],
  energyCostPerHour: 52,
  delayLateMinutes: 0,
  delayLateCost: 0,
  reliefCost: 90,
  servicePartPrice: 35,
  serviceMinutes: 30,
  recallKg: 0,
  recallCost: 0,
  ...overrides,
});

const partnerAnswer = (facts: IncidentFacts) =>
  incidentKind.chooseDefault!(priceAll('incident', facts), facts);

describe('incidents: two answers, neither right everywhere', () => {
  it('every incident kind offers exactly its two answers', () => {
    for (const [kind, pair] of Object.entries(INCIDENT_RESPONSES))
      expect(
        priceAll('incident', incident({ incidentKind: kind as IncidentFacts['incidentKind'] })).map(
          (o) => o.id
        )
      ).toEqual(pair.map((r) => r.id));
  });

  it('a delayed truck: wait when it makes nothing late, relief when it would', () => {
    expect(partnerAnswer(incident())).toBe('wait');
    expect(partnerAnswer(incident({ delayLateMinutes: 25, delayLateCost: 300 }))).toBe('relief');
  });

  it('dust filter: run on at pressure on a fresh line, change the filter on a worn one', () => {
    const dust = {
      incidentKind: 'dust_filter_pressure',
      qualityPenalty: 3,
      energyMultiplier: 1.12,
    } as const;
    expect(partnerAnswer(incident({ ...dust, lineStamp: 99.4 }))).toBe('run-on');
    expect(partnerAnswer(incident({ ...dust, lineStamp: 97.2 }))).toBe('change-filter');
  });

  it('the delay projection prices the late order at its own rate', () => {
    const late = delayLateCost(
      [
        {
          remainingKg: 2000,
          dueAtMinute: 130,
          priority: 'high',
          product: 'flour',
          reachable: true,
          active: true,
          latePerKgHour: 0.3,
        },
      ],
      { nextTruckInMinutes: 20, cycleMinutes: 83, capacityKg: 4450 },
      100,
      45
    );
    // Leaves at 120 on time; delayed, at 165: 35 minutes late on 2,000 kg at 0.3.
    expect(late.lateMinutes).toBe(35);
    expect(late.lateCost).toBe(350);
  });
});

describe('a plant incident ends at its stated minute; a Chronicle one keeps its route', () => {
  beforeEach(() => useOperationsCampaignStore.getState().resetCampaign());

  it('answered, its shares apply, and it resolves 120 game minutes on', () => {
    const store = useOperationsCampaignStore.getState();
    const raised = store.triggerIncident('control_network_degraded', { origin: 'plant' })!;
    expect(raised.origin).toBe('plant');
    store.markIncidentEffectApplied(raised.id);
    expect(useOperationsCampaignStore.getState().respondToIncident(raised.id, 'manual')).toBe(true);
    const effect = useOperationsCampaignStore.getState().getIncidentEffect();
    expect(effect.qualityPenalty).toBe(0);
    expect(effect.productionMultiplier).toBeCloseTo(0.75, 6);
    useOperationsCampaignStore.setState({ elapsedMinutes: 119 });
    useOperationsCampaignStore.getState().endPlantIncidents();
    expect(useOperationsCampaignStore.getState().incidents[0].phase).toBe('mitigated');
    useOperationsCampaignStore.setState({ elapsedMinutes: 120 });
    useOperationsCampaignStore.getState().endPlantIncidents();
    expect(useOperationsCampaignStore.getState().incidents[0].phase).toBe('resolved');
  });

  it("the free Mitigate gives a plant incident its kind's first answer", () => {
    const store = useOperationsCampaignStore.getState();
    const raised = store.triggerIncident('power_sag', { origin: 'plant' })!;
    store.acknowledgeIncident(raised.id, 'operator');
    useOperationsCampaignStore.getState().mitigateIncident(raised.id, 'operator');
    const after = useOperationsCampaignStore.getState().incidents[0];
    expect(after.response).toBe('shed');
    expect(after.endsAtMinute).toBe(120);
    expect(useOperationsCampaignStore.getState().getIncidentEffect().qualityPenalty).toBe(0);
  });

  it('an incident with no origin (Chronicle, or an old save) halves on Mitigate and never ends by itself', () => {
    const store = useOperationsCampaignStore.getState();
    const raised = store.triggerIncident('control_network_degraded')!;
    expect('origin' in raised).toBe(false);
    store.acknowledgeIncident(raised.id, 'operator');
    useOperationsCampaignStore.getState().mitigateIncident(raised.id, 'operator');
    expect(useOperationsCampaignStore.getState().getIncidentEffect().qualityPenalty).toBe(2);
    useOperationsCampaignStore.setState({ elapsedMinutes: 10_000 });
    useOperationsCampaignStore.getState().endPlantIncidents();
    expect(useOperationsCampaignStore.getState().incidents[0].phase).toBe('mitigated');
    // Taking an answer without meeting it: only the shares it will have.
    const other = useOperationsCampaignStore.getState().triggerIncident('severe_rain')!;
    expect(
      useOperationsCampaignStore
        .getState()
        .respondToIncident(other.id, 'slow-line', 'operator', false)
    ).toBe(true);
    const kept = useOperationsCampaignStore.getState().incidents.find((i) => i.id === other.id)!;
    expect(kept.phase).toBe('raised');
    expect(kept.response).toBe('slow-line');
  });
});

describe('a saved report words an intake and an incident record in both languages', () => {
  const compared = <P extends ReturnType<typeof raiseProposals>[number]>(
    proposal: P,
    optionId: string
  ): P => ({
    ...proposal,
    status: 'resolved',
    resolution: { optionId, decidedBy: 'partner', atMinute: 110, ran: true },
    comparison: {
      atMinute: 170,
      prices: proposal.options,
      chosenOptionId: optionId,
      bestOptionId: optionId,
    },
  });

  it('reads back from JSON and names the lot, the incident and both answers', () => {
    const lot = compared(
      raiseProposals(world({ intake: intake() }), [], () => 'proposal-00007')[0],
      'blend'
    );
    const sag = compared(
      raiseProposals(
        world({
          incidents: [
            {
              id: 'incident-0042',
              phase: 'raised',
              response: null,
              facts: incident({
                incidentKind: 'power_sag',
                qualityPenalty: 1,
                energyMultiplier: 0.7,
              }),
            },
          ],
        }),
        [],
        () => 'proposal-00008'
      )[0],
      'shed'
    );
    const saved = JSON.parse(JSON.stringify([proposalRecordOf(lot), proposalRecordOf(sag)]));
    const [lotEn, sagEn] = saved.map((record: unknown) => proposalRecordText(record, 'en'));
    const [lotPt, sagPt] = saved.map((record: unknown) => proposalRecordText(record, 'pt-BR'));
    expect(lotEn).toContain('the lot at the intake');
    expect(lotEn).toContain('Blend');
    // 'accept' is the shared label (partnerProposalText OPTION_KEYS).
    expect(lotEn).toContain('Accept now');
    expect(lotPt).toContain('o lote no recebimento');
    expect(lotPt).toContain('Misturar');
    expect(sagEn).toContain('Site power sag');
    expect(sagEn).toContain('Shed load');
    expect(sagEn).toContain('Ride through');
    expect(sagPt).toContain('Queda de tensão na unidade');
    expect(sagPt).toContain('Cortar carga');
    for (const line of [lotEn, sagEn, lotPt, sagPt]) expect(line).not.toMatch(/undefined|NaN/);
  });
});

describe('a Chronicle incident keeps its route: the answer waits for its own Mitigate', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useBreakdownStore.getState().resetBreakdownStore();
  });

  it('sets only the answer, acts once it is mitigated, and the restore still ends it', () => {
    const raised = useOperationsCampaignStore.getState().triggerIncident('dust_filter_pressure')!;
    const filters = useBreakdownStore.getState().partsInventory.filters;
    expect(
      runIncidentResponse({ incidentId: raised.id, response: 'change-filter' }, 'controller', null)
    ).toBe(true);
    let incident = useOperationsCampaignStore.getState().incidents[0];
    expect(incident.phase).toBe('raised');
    expect(incident.response).toBe('change-filter');
    actOnMetIncidents(null);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filters);
    // Its own route: acknowledged and mitigated (the Chronicle's or the guide's buttons).
    useOperationsCampaignStore.getState().acknowledgeIncident(raised.id, 'operator');
    useOperationsCampaignStore.getState().mitigateIncident(raised.id, 'operator');
    expect(useOperationsCampaignStore.getState().getIncidentEffect().qualityPenalty).toBe(0);
    actOnMetIncidents(null);
    actOnMetIncidents(null);
    expect(useBreakdownStore.getState().partsInventory.filters).toBe(filters - 1);
    incident = useOperationsCampaignStore.getState().incidents[0];
    expect(incident.endsAtMinute).toBeUndefined();
    useOperationsCampaignStore.getState().markIncidentEffectApplied(raised.id);
    useOperationsCampaignStore.getState().resolveIncident(raised.id, 'controller');
    expect(useOperationsCampaignStore.getState().incidents[0].phase).toBe('resolved');
  });
});
