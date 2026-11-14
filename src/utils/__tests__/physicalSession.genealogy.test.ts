/**
 * The genealogy rule and the save (plan wave 3d): a record from before the
 * rule (every lot ever received on record, none stamped) restores, and its
 * first tick trims it to the rule with both balances closed; lot
 * contributions are saved compactly and come back exactly as they were.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  capturePhysicalSession,
  decodePhysicalSession,
  encodePhysicalSession,
  installPhysicalSession,
  PHYSICAL_SESSION_KEY,
} from '../physicalSession';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useUIStore } from '../../stores/uiStore';
import {
  EARLIER_STOCK_LOT_IDS,
  type MaterialFlowState,
  type SourceContribution,
  useMaterialFlowStore,
} from '../../stores/materialFlowStore';
import { batchCreditKey } from '../../stores/operationsCampaignStore';
import { REQUIRED_REPLAY_PARTICIPANTS } from '../../simulation/workplaceReplayRuntime';

const FIXTURE = join(__dirname, 'fixtures/physical-saves/2026-11-13-long-genealogy.json.gz');

/** A record with the scene's continuations, as a page with the scene mounted writes it. */
function withScene(raw: string): string {
  const record = JSON.parse(raw);
  record.participants = REQUIRED_REPLAY_PARTICIPANTS.map((id) => ({
    id,
    value: { phase: 'waiting' },
  }));
  return JSON.stringify(record);
}

/** The fixture: 4.5 game days of the plain plant, written with the rule off. */
const oldRecord = () => withScene(gunzipSync(readFileSync(FIXTURE)).toString('utf8'));

function namedLots(state: MaterialFlowState): Set<string> {
  const ids = new Set<string>();
  const add = (list: readonly SourceContribution[] | undefined) =>
    list?.forEach((c) => ids.add(c.lotId));
  state.machineBuffers.forEach((buffer) =>
    [...buffer.inputBuffer, ...buffer.outputBuffer].forEach((m) => add(m.sourceContributions))
  );
  state.network.segments.forEach((s) => s.inTransit.forEach((p) => add(p.sourceContributions)));
  state.productionBatches.forEach((b) => add(b.sourceContributions));
  state.manifests.forEach((m) => add(m.sourceLots));
  add(state.shippedSourceContributions);
  add(state.wasteSourceContributions);
  add(state.byproductSourceContributions);
  return ids;
}

/** Lot contributions on record outside the batches. */
const entries = (state: MaterialFlowState) => {
  let count = 0;
  const add = (list: readonly SourceContribution[] | undefined) => (count += list?.length ?? 0);
  state.machineBuffers.forEach((buffer) =>
    [...buffer.inputBuffer, ...buffer.outputBuffer].forEach((m) => add(m.sourceContributions))
  );
  state.network.segments.forEach((s) => s.inTransit.forEach((p) => add(p.sourceContributions)));
  state.manifests.forEach((m) => add(m.sourceLots));
  add(state.shippedSourceContributions);
  add(state.wasteSourceContributions);
  add(state.byproductSourceContributions);
  return count;
};

const materialBytes = () =>
  JSON.stringify(
    (JSON.parse(encodePhysicalSession(capturePhysicalSession())) as { material: unknown }).material
  ).length * 2;

beforeEach(() => useMaterialFlowStore.getState().resetMaterialFlow());

describe('a record from before the genealogy rule', () => {
  it('restores, and its first tick merges the lots over three game days old', () => {
    const saved = decodePhysicalSession(oldRecord());
    const lots = [...saved.material.sourceLots.values()];
    // Every lot ever received is on record, and none carries a receipt minute.
    expect(lots.filter((lot) => lot.origin === 'receiving')).toHaveLength(
      saved.material.lotSequence
    );
    expect(lots.some((lot) => lot.receivedAtMinute !== undefined || lot.mergedInto)).toBe(false);
    useMaterialFlowStore.setState(saved.material);
    const before = useMaterialFlowStore.getState();
    const material = before.getMaterialBalance();
    const genealogy = before.getGenealogyBalance();
    const bytes = materialBytes();

    // The central tick's material step, as the live plant asks for it.
    before.tickMaterialFlow(0.5, 1, undefined, undefined, { planFeed: true });
    const after = useMaterialFlowStore.getState();
    expect(after.sourceLots.has(EARLIER_STOCK_LOT_IDS.wheat_grain)).toBe(true);
    expect(after.sourceLots.has(EARLIER_STOCK_LOT_IDS.corn_grain)).toBe(true);
    const merged =
      (after.sourceLots.get(EARLIER_STOCK_LOT_IDS.wheat_grain)?.receivedKg ?? 0) +
      (after.sourceLots.get(EARLIER_STOCK_LOT_IDS.corn_grain)?.receivedKg ?? 0);
    expect(merged).toBeGreaterThan(100_000);
    // A merged lot's record stays only while a kept batch (held, or begun to
    // ship) still names it; nothing else on record names it.
    const kept = after.productionBatches.filter(
      (b) => b.disposition !== 'released' || b.dispatchManifestIds.length > 0
    );
    const mergedLots = [...after.sourceLots.values()].filter((lot) => lot.mergedInto);
    expect(mergedLots.length).toBeGreaterThan(10);
    const others = {
      ...after,
      productionBatches: after.productionBatches.filter((b) => !kept.includes(b)),
    };
    for (const lot of mergedLots) {
      expect(namedLots(others as MaterialFlowState).has(lot.id)).toBe(false);
      expect(kept.some((b) => b.sourceContributions.some((c) => c.lotId === lot.id))).toBe(true);
    }
    for (const id of namedLots(after)) expect(after.sourceLots.has(id)).toBe(true);
    expect(after.getMaterialBalance().errorKg).toBeCloseTo(material.errorKg, 6);
    expect(after.getGenealogyBalance().errorKg).toBeCloseTo(genealogy.errorKg, 6);
    // Smaller at once; the batches that keep their lots leave the record as they ship.
    expect(materialBytes()).toBeLessThan(bytes);
    expect(entries(others as MaterialFlowState)).toBeLessThan(entries(before) * 0.75);
    // And the trimmed record saves and restores.
    const again = decodePhysicalSession(withScene(encodePhysicalSession(capturePhysicalSession())));
    expect(again.material.sourceLots.size).toBe(after.sourceLots.size);
  });
});

describe('lot contributions in the save', () => {
  it('are written compactly and decode exactly, so no batch credit key moves', () => {
    const saved = decodePhysicalSession(oldRecord());
    useMaterialFlowStore.setState(saved.material);
    const plain = JSON.stringify(capturePhysicalSession().material, (_key, v: unknown) =>
      v instanceof Map ? [...v] : v
    );
    const raw = withScene(encodePhysicalSession(capturePhysicalSession()));
    expect(raw).toContain('"__millosPhysicalType":"lots"');
    const back = decodePhysicalSession(raw).material;
    expect(JSON.stringify(back, (_key, v: unknown) => (v instanceof Map ? [...v] : v))).toBe(plain);
    const session = saved.material.sessionId;
    expect(back.productionBatches.map((batch) => batchCreditKey(session, batch))).toEqual(
      saved.material.productionBatches.map((batch) => batchCreditKey(session, batch))
    );
  });

  it('refuses a compact list that does not hold together', () => {
    const raw = withScene(encodePhysicalSession(capturePhysicalSession()));
    const broken = raw.replace(
      /"__millosPhysicalType":"lots","value":\[\[/,
      '"__millosPhysicalType":"lots","value":[7,['
    );
    expect(broken).not.toBe(raw);
    expect(() => decodePhysicalSession(broken)).toThrow();
  });
});

describe('the save format and builds of other ages', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    useGameSimulationStore.getState().releaseClock('restoreFailed');
    useUIStore.setState({ alerts: [] });
  });

  it('writes the compact form as version 2, and still reads a version 1 record', () => {
    const raw = encodePhysicalSession(capturePhysicalSession());
    expect((JSON.parse(raw) as { version: number }).version).toBe(2);
    // The fixture is a version 1 record, written before the compact form.
    expect((JSON.parse(oldRecord()) as { version: number }).version).toBe(1);
    expect(decodePhysicalSession(oldRecord()).material.sourceLots.size).toBeGreaterThan(0);
    // A record this build wrote (fixture, 18 game hours): compact lists, read back.
    const v2 = withScene(
      gunzipSync(
        readFileSync(join(__dirname, 'fixtures/physical-saves/2026-11-13-compact-v2.json.gz'))
      ).toString('utf8')
    );
    expect(v2).toContain('"__millosPhysicalType":"lots"');
    const saved = decodePhysicalSession(v2);
    expect(saved.version).toBe(2);
    expect(saved.material.productionBatches.some((b) => b.sourceContributions.length > 0)).toBe(
      true
    );
  });

  // An older build meets a newer save the way this build meets a version it
  // does not know: it refuses the record, keeps it untouched, holds the shift
  // and says so; it never writes over it.
  it('refuses a newer record cleanly: kept, never overwritten, the shift held and the player told', () => {
    const newer = JSON.parse(withScene(encodePhysicalSession(capturePhysicalSession())));
    newer.version = 3;
    const raw = JSON.stringify(newer);
    const writes: string[] = [];
    const storage = {
      getItem: (key: string) => (key === PHYSICAL_SESSION_KEY ? raw : null),
      setItem: (_key: string, value: string) => void writes.push(value),
    };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const dispose = installPhysicalSession(storage);
    try {
      vi.advanceTimersByTime(15_000);
      expect(writes).toEqual([]);
      expect(useGameSimulationStore.getState().clockHolds.map((hold) => hold.holder)).toContain(
        'restoreFailed'
      );
      const notice = useUIStore.getState().alerts.find((a) => a.id === 'physical-save-unavailable');
      expect(notice?.type).toBe('warning');
    } finally {
      dispose();
    }
  });
});
