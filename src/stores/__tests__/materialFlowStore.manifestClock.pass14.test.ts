import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import { useMaterialFlowStore } from '../materialFlowStore';
import { manifestStamp } from '../../components/ui-new/panels/OverviewPanel';

// Material Traceability stamped manifests with the material clock (plant
// seconds times line rate), so an hourly truck read T+00:02:00 apart while
// every other plant stamp reads 'Day N, HH:MM'. Working if a manifest carries
// the plant clock it was made at and Overview shows that stamp.
describe('manifest stamps', () => {
  beforeEach(() => {
    setLocale('en');
    useMaterialFlowStore.getState().resetMaterialFlow();
  });

  it('stamp a delivery and a shipment with the plant clock they were made at', () => {
    const flow = useMaterialFlowStore.getState();
    flow.receiveGrainDelivery(1000, { gameClock: { day: 0, hour: 10.5 } });
    const received = useMaterialFlowStore.getState().manifests.at(-1)!;
    expect(received.gameClock).toEqual({ day: 0, hour: 10.5 });
    expect(manifestStamp(received)).toBe('Day 1, 10:30');
  });

  it('falls back to the material clock for a manifest made before stamps', () => {
    const legacy = { simulationTime: 120 } as Parameters<typeof manifestStamp>[0];
    expect(manifestStamp(legacy)).toBe('T+00:02:00');
  });
});
