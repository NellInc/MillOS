import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BAG_WEIGHT_KG } from '../../types';
import { useMaterialFlowStore, type ProductionBatch } from '../../stores/materialFlowStore';
import { getFlourPalletGeometry, PALLET_SACK_LAYOUT } from '../../utils/flourSacks';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { createTruckController, stepTruckController } from './truckController';
import {
  getStagedFlourBagCount,
  stagedPalletPosition,
  STAGING_BAG_CAPACITY,
  STAGING_LAYOUT,
  STAGING_PALLET_CAPACITY,
} from './palletStagingLayout';

const batch = (overrides: Partial<ProductionBatch> = {}): ProductionBatch => ({
  id: 'batch-test',
  packerId: 'packer-0',
  materialType: 'flour',
  producedKg: 325,
  availableKg: 325,
  simulationTime: 0,
  sourceContributions: [],
  disposition: 'released',
  dispositionReason: null,
  qcTestIds: [],
  dispatchManifestIds: [],
  sealed: true,
  ...overrides,
});

afterEach(() => useMaterialFlowStore.getState().resetMaterialFlow());

describe('truthful yard flour staging', () => {
  it('keeps absent, partial and overflow inventory bounded without rounding up', () => {
    expect(getStagedFlourBagCount([])).toBe(0);
    expect(getStagedFlourBagCount([batch({ availableKg: 24.999 })])).toBe(0);
    expect(getStagedFlourBagCount([batch({ availableKg: 25 })])).toBe(1);
    expect(getStagedFlourBagCount([batch()])).toBe(13);
    expect(getStagedFlourBagCount([batch({ availableKg: 1e8 })])).toBe(STAGING_BAG_CAPACITY);
  });

  it('never labels semolina, quarantined product or invalid mass as dispatched flour', () => {
    const batches = [
      batch({ materialType: 'semolina' }),
      batch({ disposition: 'hold' }),
      batch({ disposition: 'recalled' }),
      batch({ disposition: 'shipped' }),
      batch({ availableKg: -200 }),
      batch({ availableKg: NaN }),
      batch({ availableKg: Infinity }),
      batch({ availableKg: 25 }),
    ];
    expect(getStagedFlourBagCount(batches)).toBe(1);
  });

  it('follows real packing, disposition and shipping without writing inventory', () => {
    const store = useMaterialFlowStore;
    store.getState().resetMaterialFlow();
    expect(getStagedFlourBagCount(store.getState().productionBatches)).toBe(0);
    for (let i = 0; i < 120; i++) store.getState().tickMaterialFlow(1, 1);
    const before = store.getState();
    const initialCount = getStagedFlourBagCount(before.productionBatches);
    expect(initialCount).toBeGreaterThan(12);
    expect(store.getState()).toBe(before);
    const flourIds = before.productionBatches
      .filter((b) => b.materialType === 'flour')
      .map((b) => b.id);
    store.getState().setBatchDisposition(flourIds, 'hold', 'Staging regression test');
    expect(getStagedFlourBagCount(store.getState().productionBatches)).toBe(0);
    store.getState().setBatchDisposition(flourIds, 'released', 'Staging regression test');
    expect(getStagedFlourBagCount(store.getState().productionBatches)).toBe(initialCount);
    expect(store.getState().shipFinishedGoods(325, 'flour')).toBe(325);
    expect(getStagedFlourBagCount(store.getState().productionBatches)).toBe(initialCount - 13);
  });

  it('fits the complete default output capacity with grounded, separated pallets', () => {
    const capacity = [...useMaterialFlowStore.getState().machineBuffers.values()]
      .filter((b) => b.machineId.startsWith('packer-'))
      .reduce((sum, b) => sum + b.outputCapacity, 0);
    expect(STAGING_BAG_CAPACITY * BAG_WEIGHT_KG).toBe(capacity);
    expect(STAGING_LAYOUT.bagsPerPallet).toBe(PALLET_SACK_LAYOUT.length);
    const geometry = getFlourPalletGeometry().pallet;
    const base = geometry.boundingBox!.clone();
    const boxes = Array.from({ length: STAGING_PALLET_CAPACITY }, (_, i) => {
      const position = stagedPalletPosition(i);
      const box = base
        .clone()
        .applyMatrix4(
          new THREE.Matrix4().compose(
            new THREE.Vector3(...position),
            new THREE.Quaternion(),
            new THREE.Vector3().setScalar(STAGING_LAYOUT.scale)
          )
        );
      expect(box.min.y).toBeCloseTo(0, 7);
      return box;
    });
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        expect(boxes[i].intersectsBox(boxes[j])).toBe(false);
      }
    for (const box of boxes) {
      box.translate(new THREE.Vector3(...STAGING_LAYOUT.shippingOrigin));
      const apron = SITE_LAYOUT.docks.shipping.apron;
      expect(box.min.x).toBeGreaterThan(apron.minX);
      expect(box.max.x).toBeLessThan(apron.maxX);
      expect(box.min.z).toBeGreaterThan(apron.minZ);
      expect(box.max.z).toBeLessThan(apron.maxZ);
    }
  });

  it('keeps every staged load outside the full articulated shipping route', () => {
    const palletBounds = getFlourPalletGeometry().pallet.boundingBox!;
    const palletRadius = Math.hypot(palletBounds.max.x, palletBounds.max.z) * STAGING_LAYOUT.scale;
    const centres = Array.from({ length: STAGING_PALLET_CAPACITY }, (_, i) => {
      const p = stagedPalletPosition(i);
      return [p[0] + STAGING_LAYOUT.shippingOrigin[0], p[2] + STAGING_LAYOUT.shippingOrigin[2]];
    });
    let state = createTruckController('shipping');
    let minimum = Infinity;
    let departed = false;
    // Conservative envelope of the actual near truck: cab Z 0..5.5,
    // trailer Z -11.6..0 and 3 m overall width, including its trim.
    const distance = (x: number, z: number, yaw: number, minZ: number, maxZ: number) => {
      const dx = x - state.x,
        dz = z - state.z;
      const localX = dx * Math.cos(yaw) - dz * Math.sin(yaw);
      const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      return (
        Math.hypot(Math.max(0, Math.abs(localX) - 1.5), Math.max(minZ - localZ, 0, localZ - maxZ)) -
        palletRadius
      );
    };
    for (let frame = 0; frame < 60 * 240; frame++) {
      const result = stepTruckController(state, {
        deltaSeconds: 1 / 60,
        arrivalReady: false,
        safetyHold: false,
        serviceComplete: true,
        speedMultiplier: 1,
      });
      state = result.state;
      for (const [x, z] of centres) {
        minimum = Math.min(
          minimum,
          distance(x, z, state.tractorYaw, 0, 5.5),
          distance(x, z, state.trailerYaw, -11.6, 0)
        );
      }
      if (result.departedThisStep) {
        departed = true;
        break;
      }
    }
    expect(departed).toBe(true);
    expect(minimum).toBeGreaterThan(0.75);
  });
});
