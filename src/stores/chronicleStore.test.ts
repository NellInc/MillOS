import { beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from './chronicleStore';
import { useOperationsCampaignStore, type ShiftCampaignReport } from './operationsCampaignStore';
import { useGameSimulationStore } from './gameSimulationStore';
import { useKnowledgeStore } from './knowledgeStore';
import { DEFAULT_CHARTER } from '../chronicle/charter';
import { createInitialState, fundOf, recordOwnedIncident } from '../chronicle/engine';
import { NEUTRAL_EFFECT } from '../chronicle/effects';

let reportCount = 0;
function closeShift(net = 2000, grade: ShiftCampaignReport['grade'] = 'A', paused = false) {
  reportCount += 1;
  const report: ShiftCampaignReport = {
    id: `period-report-test-${reportCount}`,
    shiftKey: `day-1-${reportCount}`,
    shiftLabel: 'Morning',
    startedAtMinute: 0,
    // Real reports end later each time; an earlier end reads as a rewind.
    endedAtMinute: reportCount * 480,
    metrics: {
      revenue: net,
      energyCost: 0,
      automationCost: 0,
      wasteCost: 0,
      maintenanceCost: 0,
      demurrageCost: 0,
      latePenalties: 0,
      dispatchedKg: 3000,
      qualityFailureKg: 0,
      incidentsResolved: 0,
      automaticActions: 0,
    },
    completedOrderIds: [],
    openRisks: [],
    grade,
    summary: '',
  };
  useOperationsCampaignStore.setState((s) => ({ reports: [...s.reports, report].slice(-12) }));
  useChronicleStore.getState().observe(paused);
}

describe('chronicle store', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
    useGameSimulationStore.getState().resolveCrisis();
  });

  it('is inert until a charter is signed', () => {
    expect(useChronicleStore.getState().getEffect(true)).toBe(NEUTRAL_EFFECT);
    expect(useChronicleStore.getState().stampDelivery()).toBeNull();
    closeShift();
    expect(useChronicleStore.getState().chronicle.shift).toBe(0);
  });

  it('signs, unlocks its first note in Datalinks, and credits each new shift report once', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    expect(useKnowledgeStore.getState().isUnlocked('history-first-grain')).toBe(true);
    const fund = fundOf(useChronicleStore.getState().chronicle);
    closeShift();
    const after = useChronicleStore.getState().chronicle;
    expect(after.shift).toBe(1);
    expect(fundOf(after)).not.toBe(fund);
    useChronicleStore.getState().observe(false);
    expect(useChronicleStore.getState().chronicle.shift).toBe(1);
  });

  it('keeps counting after the campaign report list saturates at twelve', () => {
    useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
    for (let i = 0; i < 15; i++) closeShift();
    expect(useOperationsCampaignStore.getState().reports).toHaveLength(12);
    expect(useChronicleStore.getState().chronicle.shift).toBe(15);
  });

  it('skips reports made while a replay or improvement trial owns the clock', () => {
    useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'sandbox' }, 21);
    closeShift(2000, 'A', true);
    expect(useChronicleStore.getState().chronicle.shift).toBe(0);
    useChronicleStore.getState().observe(false);
    expect(useChronicleStore.getState().chronicle.shift).toBe(0);
  });

  it('stamps receiving lots with crop attributes after signing', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const crop = useChronicleStore.getState().stampDelivery();
    expect(crop?.kind).toBe('typical');
    expect(useChronicleStore.getState().chronicle.deliveries).toBe(1);
  });

  it('restores a mitigated incident it raised and clears the storm it brought', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const campaign = useOperationsCampaignStore.getState();
    const incident = campaign.triggerIncident('severe_rain')!;
    useChronicleStore.setState((s) => ({
      chronicle: recordOwnedIncident(s.chronicle, incident.id, incident.kind),
    }));
    useGameSimulationStore.getState().setWeather('storm');
    campaign.acknowledgeIncident(incident.id);
    campaign.mitigateIncident(incident.id);
    campaign.markIncidentEffectApplied(incident.id);
    useChronicleStore.getState().restore(incident.id);
    expect(
      useOperationsCampaignStore.getState().incidents.find((i) => i.id === incident.id)?.phase
    ).toBe('resolved');
    expect(useGameSimulationStore.getState().weather).toBe('clear');
    expect(useChronicleStore.getState().chronicle.ownedIncidents).toHaveLength(0);
  });

  it('retries a fire restart that a running drill held back', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    useGameSimulationStore.getState().triggerCrisis('fire', 'high', { source: 'chronicle' });
    useGameSimulationStore.setState({ emergencyDrillMode: true });
    useChronicleStore.setState((s) => ({
      chronicle: {
        ...s.chronicle,
        fire: { active: true, suppressing: true, resolveAtMinute: 0 },
      },
    }));
    useChronicleStore.getState().observe(false);
    expect(useGameSimulationStore.getState().crisisState.type).toBe('fire');
    expect(useChronicleStore.getState().chronicle.fire.suppressing).toBe(true);
    useGameSimulationStore.setState({ emergencyDrillMode: false });
    useOperationsCampaignStore.setState((s) => ({ elapsedMinutes: s.elapsedMinutes + 10 }));
    useChronicleStore.getState().observe(false);
    expect(useGameSimulationStore.getState().crisisState.active).toBe(false);
  });

  it('keeps the inspector visit out of the plant safety state', () => {
    // Whether the inspector is drawn depends on the seed and the deck's size;
    // search seeds rather than pin one, so adding events cannot hide the check.
    for (
      let seed = 21;
      seed < 61 && !useChronicleStore.getState().chronicle.inspectionOpen;
      seed++
    ) {
      useChronicleStore.getState().sign({ ...DEFAULT_CHARTER, mode: 'no_trials' }, seed);
      for (let i = 0; i < 63 && !useChronicleStore.getState().chronicle.inspectionOpen; i++)
        closeShift();
    }
    expect(useChronicleStore.getState().chronicle.inspectionOpen).toBe(true);
    expect(useGameSimulationStore.getState().crisisState.active).toBe(false);
  });

  it('loads a chronicle saved before part two with organisations, a certifier and desks', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const saved = { ...useChronicleStore.getState().chronicle, shift: 40 } as Record<
      string,
      unknown
    >;
    // A save from before part two has none of its fields.
    for (const key of [
      'marks',
      'followUps',
      'firedScheduled',
      'stakeholders',
      'certifier',
      'desks',
      'longNightTelegraphed',
    ])
      delete saved[key];
    const merge = useChronicleStore.persist.getOptions().merge!;
    const restored = merge({ chronicle: saved }, useChronicleStore.getState()) as ReturnType<
      typeof useChronicleStore.getState
    >;
    const chronicle = restored.chronicle;
    expect(chronicle.stakeholders.map((s) => s.id)).toEqual([
      'growers',
      'haulier',
      'village',
      'federation',
    ]);
    expect(chronicle.certifier).toEqual({ score: 500, suspended: false });
    expect(chronicle.desks.council.points).toBe(2);
    expect(chronicle.marks).toEqual({});
    // Scheduled events whose shift has gone are passed over, not all delivered at once;
    // the long night (shift 54) is still to come.
    expect(chronicle.firedScheduled).toContain('evt-standby-cover');
    expect(chronicle.firedScheduled).toContain('evt-valley-meeting');
    expect(chronicle.firedScheduled).not.toContain('evt-long-night');
  });

  it('releases its fire and incidents when abandoned', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    const incident = useOperationsCampaignStore.getState().triggerIncident('packaging_shortage')!;
    useChronicleStore.setState((s) => ({
      chronicle: {
        ...recordOwnedIncident(s.chronicle, incident.id, incident.kind),
        fire: { active: true, suppressing: false, resolveAtMinute: null },
      },
    }));
    useGameSimulationStore.getState().triggerCrisis('fire', 'high', { source: 'chronicle' });
    useChronicleStore.getState().abandon();
    expect(useGameSimulationStore.getState().crisisState.active).toBe(false);
    expect(useGameSimulationStore.getState().emergencyActive).toBe(false);
    expect(
      useOperationsCampaignStore.getState().incidents.find((i) => i.id === incident.id)?.phase
    ).toBe('resolved');
    expect(useChronicleStore.getState().chronicle.status).toBe('unsigned');
  });

  it('starts and clears a duct fire through the fail-safe crisis', () => {
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
    useChronicleStore.setState((s) => ({
      chronicle: {
        ...s.chronicle,
        fire: { active: true, suppressing: false, resolveAtMinute: null },
      },
    }));
    useGameSimulationStore.getState().triggerCrisis('fire', 'high', { source: 'chronicle' });
    expect(useGameSimulationStore.getState().emergencyActive).toBe(true);
    useChronicleStore.getState().suppress();
    expect(useChronicleStore.getState().chronicle.fire.suppressing).toBe(true);
    useOperationsCampaignStore.setState((s) => ({ elapsedMinutes: s.elapsedMinutes + 60 }));
    useChronicleStore.getState().observe(false);
    expect(useChronicleStore.getState().chronicle.fire.active).toBe(false);
    expect(useGameSimulationStore.getState().crisisState.active).toBe(false);
    expect(useGameSimulationStore.getState().emergencyActive).toBe(false);
  });
});
