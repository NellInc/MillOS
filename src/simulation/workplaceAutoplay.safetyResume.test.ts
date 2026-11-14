import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { createWorkplace, restoreWorkplace, saveWorkplace } from './bilateralWorkplace';
import { bilateralWorkplaceMessages as wm } from './bilateralWorkplace.messages';
import { autoplayWorkplaceStep, useWorkplaceAutoplay } from './workplaceAutoplay';
import {
  campaignOutcomes,
  mondayHolds,
  seasonSobrasPool,
  shiftResumable,
} from './workplaceCampaign';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { stepLabBench, useQCLabStore } from '../stores/qcLabStore';
import { shipmentOrdersFrom } from './shipmentPlan';
import { endReplayClock } from './workplaceReplayRuntime';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { setLocale } from '../i18n';
import type { WorkplaceState } from '../types/workplace';
import { fulfilFirstDelivery } from '../test/firstDelivery';

beforeEach(() => {
  useWorkplaceAutoplay.getState().pause();
  endReplayClock();
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
  useWorkplaceStore.setState({
    workplace: createWorkplace(),
    participationMode: 'solo',
    turn: null,
  });
  useOperationsCampaignStore.setState(useOperationsCampaignStore.getInitialState(), true);
  useOperationsCampaignStore.getState().initializeCampaign();
  // D4: a season starts only after the first delivery.
  fulfilFirstDelivery();
});
afterEach(() => {
  setLocale('en');
  useGameSimulationStore.setState({ emergencyActive: false, emergencyDrillMode: false });
});

const workplace = () => useWorkplaceStore.getState().workplace;

/**
 * Drives the autonomous season by its own steps, ticking the plant in active
 * work and, in review, while recovery is owed. `interrupt` runs before each
 * active tick and returns true when it ticked (or stopped) the shift itself.
 */
function driveSeason(interrupt: (s: WorkplaceState) => boolean = () => false) {
  for (let i = 0; i < 1200; i++) {
    const result = autoplayWorkplaceStep('team');
    if (result.reasonKey === 'seasonComplete') return;
    if (!result.changed) expect(result.reason).toBeNull();
    const s = workplace();
    if (s.phase === 'active') {
      if (s.campaign?.shift === 1 && mondayHolds(s) && s.campaign.decision === null) continue;
      if (!interrupt(s)) useWorkplaceStore.getState().tick(5, 0, false);
    } else if (s.phase === 'review' && s.members.some((m) => m.recoveryOwedMinutes > 0))
      useWorkplaceStore.getState().tick(5, 0, false);
  }
  throw new Error('season did not finish');
}

/** The plant tick under a drill (UnifiedGameTick passes the drill as an emergency). */
function runDrill() {
  useGameSimulationStore.setState({ emergencyDrillMode: true });
  useWorkplaceStore.getState().tick(5, 0, true);
  // The runner waits the drill out: it changes nothing while it lasts.
  const held = workplace();
  expect(autoplayWorkplaceStep('team').changed).toBe(false);
  expect(workplace()).toBe(held);
  useGameSimulationStore.setState({ emergencyDrillMode: false });
}

describe('voice and safety cost the season nothing', () => {
  it('an uninterrupted autonomous season ends with the agreement honoured', () => {
    driveSeason();
    const s = workplace();
    expect(s.campaign?.shift).toBe(2);
    expect(campaignOutcomes(s).agreement.status).toBe('honoured');
  });

  it('a drill inside the Monday inspection pauses the shift; it resumes and the season is honoured', () => {
    // 5.7: Monday holds for a real sample of the season's order on the bench.
    useMaterialFlowStore.setState({ productionBatches: [] });
    useQCLabStore.getState().resetQCLab();
    let drilled = false;
    driveSeason((s) => {
      if (s.campaign?.shift === 1) {
        const order = useOperationsCampaignStore
          .getState()
          .orders.find((o) => o.id === s.campaign?.mission?.orderId)!;
        if (useMaterialFlowStore.getState().productionBatches.length === 0)
          useMaterialFlowStore.setState({
            productionBatches: [
              {
                id: 'batch-00042',
                disposition: 'released',
                packerId: 'packer-2',
                materialType: order.recipe.finishedMaterial,
                producedKg: 800,
                availableKg: 800,
                simulationTime: 1,
                sourceContributions: [
                  { lotId: 'lot-00001', amount: 800, path: ['silo-4', 'packer-2'] },
                ],
                dispositionReason: null,
                qcTestIds: [],
                dispatchManifestIds: [],
                sealed: true,
                qualityScore: 96,
                awaitingTest: true,
              },
            ],
          });
        // The lab reads it once Quality has put it first on the bench.
        if (s.campaign.decision === 'inspect')
          stepLabBench(
            5,
            shipmentOrdersFrom(useOperationsCampaignStore.getState().orders),
            () => false
          );
      }
      if (
        drilled ||
        s.campaign?.shift !== 1 ||
        s.campaign.decision !== 'inspect' ||
        s.campaign.inspectionComplete
      )
        return false;
      drilled = true;
      runDrill();
      const paused = workplace();
      expect(paused.phase).toBe('review');
      expect(paused.minute).toBeLessThan(90);
      expect(shiftResumable(paused)).toBe(true);
      return true;
    });
    expect(drilled).toBe(true);
    const s = workplace();
    expect(s.campaign?.history[1].minute).toBe(90);
    expect(s.campaign?.history[1].inspectionComplete).toBe(true);
    expect(campaignOutcomes(s).agreement.status).toBe('honoured');
    // The finished season survives a reload unchanged in outcome.
    const reloaded = restoreWorkplace(saveWorkplace(s));
    expect(reloaded.campaign?.shift).toBe(2);
    expect(campaignOutcomes(reloaded).agreement.status).toBe('honoured');
  });

  it('a raised objection pauses the final shift until its raiser resolves it, then the season is honoured', () => {
    let objected = false;
    driveSeason((s) => {
      if (objected || s.campaign?.shift !== 2 || s.minute < 40) return false;
      objected = true;
      expect(useWorkplaceStore.getState().object('packing', 'rest').changed).toBe(true);
      const paused = workplace();
      expect(paused.phase).toBe('review');
      // Open, it waits with its raiser; the outcome is not yet final.
      expect(shiftResumable(paused)).toBe(false);
      expect(campaignOutcomes(paused).agreement.status).toBe('pending');
      const id = paused.objections.find((o) => o.status === 'open')!.id;
      expect(useWorkplaceStore.getState().resolveObjection(id, 'packing').changed).toBe(true);
      expect(shiftResumable(workplace())).toBe(true);
      return true;
    });
    expect(objected).toBe(true);
    expect(campaignOutcomes(workplace()).agreement.status).toBe('honoured');
  });

  it.each(['safety', 'reload'] as const)(
    'sobras wait out a %s pause, then are shared and survive a reload',
    (cause) => {
      for (let i = 0; i < 400 && workplace().phase !== 'active'; i++)
        autoplayWorkplaceStep('toe-dip');
      useWorkplaceStore.getState().tick(30, 0, false);
      if (cause === 'safety') useWorkplaceStore.getState().tick(5, 0, true);
      else useWorkplaceStore.setState({ workplace: restoreWorkplace(saveWorkplace(workplace())) });
      const paused = workplace();
      expect(shiftResumable(paused)).toBe(true);
      // Fresh real dispatch earned this shift: 1,200 kg at 0.30 net per kg.
      useWorkplaceStore.setState({
        workplace: {
          ...paused,
          shippedKg: paused.shippedKg + 1200,
          finance: {
            ...paused.finance,
            operatingRevenue: paused.finance.operatingRevenue + 600,
            operatingCost: paused.finance.operatingCost + 240,
            cash: paused.finance.cash + 360,
          },
        },
      });
      // Paused, the shift has not ended, so its surplus is not yet decided.
      expect(useWorkplaceStore.getState().voteSurplus('packing', 'members').changed).toBe(false);
      expect(useWorkplaceStore.getState().distributeSurplus().changed).toBe(false);
      for (let i = 0; i < 400 && workplace().minute < 90; i++) {
        autoplayWorkplaceStep('toe-dip');
        if (workplace().phase === 'active') useWorkplaceStore.getState().tick(5, 0, false);
      }
      const finished = workplace();
      expect(finished.minute).toBe(90);
      expect(finished.phase).toBe('review');
      // 5.5: sobras are the season's. The first shift shares nothing, and what
      // it earned stays in the season's pool across a reload.
      expect(useWorkplaceStore.getState().voteSurplus('packing', 'members').reasonCopy?.key).toBe(
        'rejSurplusSeasonEnd'
      );
      const pool = seasonSobrasPool(finished);
      expect(pool).toBeGreaterThan(0);
      const reloaded = restoreWorkplace(saveWorkplace(finished));
      expect(reloaded.revision).toBeGreaterThan(0);
      expect(reloaded.campaign?.shift).toBe(0);
      expect(reloaded.minute).toBe(90);
      expect(seasonSobrasPool(reloaded)).toBeCloseTo(pool, 6);
    }
  );

  it('an old save that shared sobras after its emergency stays ended, and reloads intact', () => {
    for (let i = 0; i < 400 && workplace().phase !== 'active'; i++)
      autoplayWorkplaceStep('toe-dip');
    useWorkplaceStore.getState().tick(30, 0, false);
    useWorkplaceStore.getState().tick(5, 0, true);
    const stopped = workplace();
    // As an old build left it: the emergency sentence, and the sobras shared
    // that shift, whole and in equal shares (the rule before 5.5).
    const f = stopped.finance;
    const surplus =
      f.operatingRevenue + 600 - (f.operatingCost + 240) - f.wagesPaid - f.compensationPaid;
    useWorkplaceStore.setState({
      workplace: {
        ...stopped,
        reviewReason: wm.en.settleEmergency,
        shippedKg: stopped.shippedKg + 1200,
        distributionComplete: true,
        members: stopped.members.map((m) => ({ ...m, earnedPay: m.earnedPay + surplus / 4 })),
        finance: {
          ...f,
          operatingRevenue: f.operatingRevenue + 600,
          operatingCost: f.operatingCost + 240,
          cash: f.cash + 360 - surplus,
          distributed: surplus,
        },
      },
    });
    expect(surplus).toBeGreaterThan(0);
    useWorkplaceStore.setState({ workplace: restoreWorkplace(saveWorkplace(workplace())) });
    expect(workplace().distributionComplete).toBe(true);
    expect(shiftResumable(workplace())).toBe(false);
    for (let i = 0; i < 20 && workplace().campaign?.shift === 0; i++)
      autoplayWorkplaceStep('toe-dip');
    expect(workplace().campaign?.shift).toBe(1);
    const reloaded = restoreWorkplace(saveWorkplace(workplace()));
    expect(reloaded.campaign?.shift).toBe(1);
    expect(reloaded.campaign?.history[0].finance.distributed).toBeGreaterThan(0);
  });

  it('a stop the player chose still ends the shift for good', () => {
    let stopped = false;
    for (let i = 0; i < 400 && !stopped; i++) {
      autoplayWorkplaceStep('team');
      const s = workplace();
      if (s.phase !== 'active') continue;
      if (s.minute >= 30) {
        useWorkplaceStore.getState().stop();
        stopped = true;
      } else useWorkplaceStore.getState().tick(5, 0, false);
    }
    expect(stopped).toBe(true);
    expect(workplace().phase).toBe('review');
    expect(shiftResumable(workplace())).toBe(false);
  });

  it.each(['en', 'pt-BR'] as const)(
    'a %s save that already holds an emergency stop reason loads, resumes and is honoured',
    (locale) => {
      let saved: unknown = null;
      driveSeason((s) => {
        if (saved || s.campaign?.shift !== 0 || s.minute < 30) return false;
        useGameSimulationStore.setState({ emergencyActive: true });
        useWorkplaceStore.getState().tick(5, 0, true);
        useGameSimulationStore.setState({ emergencyActive: false });
        // The save as builds before this change wrote it: the emergency
        // sentence, in the language active then, as the review reason.
        const old = structuredClone(workplace());
        old.reviewReason = wm[locale].settleEmergency;
        saved = JSON.parse(JSON.stringify(saveWorkplace(old)));
        setLocale('en');
        useWorkplaceStore.setState({ workplace: restoreWorkplace(saved) });
        expect(workplace().campaign?.shift).toBe(0);
        expect(shiftResumable(workplace())).toBe(true);
        return true;
      });
      expect(saved).not.toBeNull();
      expect(campaignOutcomes(workplace()).agreement.status).toBe('honoured');
    }
  );

  it('a season archived before this change, ended by an emergency, still reads incomplete', () => {
    let record: WorkplaceState | null = null;
    driveSeason((s) => {
      if (record || s.campaign?.shift !== 2 || s.minute < 30) return false;
      useGameSimulationStore.setState({ emergencyActive: true });
      useWorkplaceStore.getState().tick(5, 0, true);
      useGameSimulationStore.setState({ emergencyActive: false });
      const old = structuredClone(workplace());
      old.reviewReason = wm['pt-BR'].settleEmergency;
      // Retained records restore keeping why their shift ended.
      record = restoreWorkplace(JSON.parse(JSON.stringify(saveWorkplace(old))), true);
      return true;
    });
    expect(record).not.toBeNull();
    expect(record!.reviewReason).toBe(wm['pt-BR'].settleEmergency);
    expect(shiftResumable(record!)).toBe(false);
    expect(campaignOutcomes(record!).agreement.status).toBe('incomplete');
  });
});
