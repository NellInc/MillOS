import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { drivenLogisticsRoute } from '../logisticsRuntime';
import { FORKLIFT_PALLET_REACH_METRES } from '../../components/models/ForkliftModel';
import {
  FORKLIFT_INSERT_METRES,
  FORKLIFT_REVERSE_METRES,
  FORKLIFT_STATION_WAIT_METRES,
  forkliftWorkAlong,
  forkliftWorkOffset,
  isSpurMarker,
  FORKLIFT_MOBILITY_EXTRA_CLEARANCE,
  FORKLIFT_PEDESTRIAN_CORRIDOR,
  forkliftGiveWayExtra,
  markerArrivalHeading,
  nearestPedestrianAhead,
} from './forkliftWork';
import { sampleForkliftLoadPose } from './forkliftController';
import { sampleArcLengthPath } from './vehicleKinematics';

const plans = {
  shipping: drivenLogisticsRoute('shipping', SITE_LAYOUT.routes.forklifts.shipping.points).plan,
  receiving: drivenLogisticsRoute('receiving', SITE_LAYOUT.routes.forklifts.receiving.points).plan,
};
const markerOf = (dock: 'shipping' | 'receiving', type: 'pickup' | 'dropoff') => {
  const marker = plans[dock].markers.find((candidate) => candidate.action.type === type);
  if (!marker) throw new Error(`${dock} has no ${type}`);
  return marker;
};
/** Tine tip ahead of the forklift origin (forklift.glb forks to z 1.264). */
const TINE_TIP = 1.264;
/** Pallet half depth along the forks (0.8 m pallet). */
const PALLET_HALF_DEPTH = 0.4;

describe('working a pick or a drop', () => {
  it('creeps in from a metre short and backs straight out, with no jump at either end', () => {
    for (const action of ['pickup', 'dropoff'] as const) {
      const steps = 600;
      let previous = forkliftWorkAlong(forkliftWorkOffset(action, 0));
      expect(previous).toBeCloseTo(-FORKLIFT_INSERT_METRES, 9);
      let largest = 0;
      let reachedMarker = false;
      for (let step = 1; step <= steps; step += 1) {
        const along = forkliftWorkAlong(forkliftWorkOffset(action, step / steps));
        largest = Math.max(largest, Math.abs(along - previous));
        if (Math.abs(along) < 1e-6) reachedMarker = true;
        previous = along;
      }
      expect(reachedMarker).toBe(true);
      expect(previous).toBeCloseTo(-FORKLIFT_REVERSE_METRES, 9);
      // About a centimetre a frame at 60 Hz over a six-second operation.
      expect(largest).toBeLessThan(0.02);
    }
  });

  it('stands still on the marker from engaging until the load is up or set down', () => {
    for (const action of ['pickup', 'dropoff'] as const) {
      for (let step = 0; step <= 200; step += 1) {
        const t = step / 200;
        const pose = sampleForkliftLoadPose(action, t, 0.72);
        const along = forkliftWorkAlong(forkliftWorkOffset(action, t));
        const lifting =
          action === 'pickup' && ['engaging', 'lifting', 'tilting'].includes(pose.phase);
        const placing = action === 'dropoff' && ['placing', 'disengaging'].includes(pose.phase);
        if (lifting || placing) expect(Math.abs(along)).toBeLessThan(1e-9);
      }
    }
  });

  it('backs out on the way it came at each dock and the collection point, and turns clear of the load', () => {
    const spurs = [
      ['shipping', 'pickup'],
      ['shipping', 'dropoff'],
      ['receiving', 'pickup'],
    ] as const;
    for (const [dock, type] of spurs) {
      const plan = plans[dock];
      const marker = markerOf(dock, type);
      expect(isSpurMarker(plan, marker.distance)).toBe(true);
      // Where it turns standing, the tines' whole sweep stays short of the
      // load's near edge, a pallet reach past the marker.
      const nearEdge =
        FORKLIFT_REVERSE_METRES + FORKLIFT_PALLET_REACH_METRES.authored - PALLET_HALF_DEPTH;
      expect(TINE_TIP).toBeLessThan(nearEdge - 0.3);
    }
    // The packing-line store is a corner, not a spur: it eases back onto its lane.
    expect(isSpurMarker(plans.receiving, markerOf('receiving', 'dropoff').distance)).toBe(false);
  });

  it('waits for a pallet being built with its tines clear of the bags', () => {
    const marker = markerOf('shipping', 'pickup');
    const heading = markerArrivalHeading(plans.shipping, marker.distance);
    const at = sampleArcLengthPath(plans.shipping.path, marker.distance);
    const wait = sampleArcLengthPath(
      plans.shipping.path,
      marker.distance - FORKLIFT_INSERT_METRES - FORKLIFT_STATION_WAIT_METRES
    );
    // Along the forks' line, from the waiting origin to the pallet's near edge.
    const gap =
      (at.x - wait.x) * Math.sin(heading) +
      (at.z - wait.z) * Math.cos(heading) +
      FORKLIFT_PALLET_REACH_METRES.authored -
      PALLET_HALF_DEPTH -
      TINE_TIP;
    expect(gap).toBeGreaterThan(2.5);
  });
});

describe('giving way to people', () => {
  it('always gives way to someone using a mobility aid, even marked seated', () => {
    const base = { visible: true };
    expect(forkliftGiveWayExtra({ ...base, userData: { seated: false } })).toBe(0);
    expect(forkliftGiveWayExtra({ ...base, userData: { seated: true } })).toBe(-1);
    for (const mobility of ['wheelchair', 'long-cane'])
      for (const seated of [true, false])
        expect(forkliftGiveWayExtra({ ...base, userData: { seated, mobility } })).toBe(
          FORKLIFT_MOBILITY_EXTRA_CLEARANCE
        );
    expect(forkliftGiveWayExtra({ visible: false, userData: { mobility: 'wheelchair' } })).toBe(-1);
  });

  it('gives anyone using a wheelchair or a long cane more room', () => {
    const straight = (distance: number) => ({ x: 0, z: distance });
    // 1.3 m off the line: outside the ordinary corridor, inside the wider one.
    const walker = [{ x: 1.3, z: 3 }];
    const aided = [{ x: 1.3, z: 3, extra: FORKLIFT_MOBILITY_EXTRA_CLEARANCE }];
    expect(nearestPedestrianAhead(straight, walker, 1)).toBe(Infinity);
    expect(nearestPedestrianAhead(straight, aided, 1)).toBeLessThanOrEqual(3);
    expect(FORKLIFT_PEDESTRIAN_CORRIDOR + FORKLIFT_MOBILITY_EXTRA_CLEARANCE).toBeGreaterThan(1.3);
  });

  const straight = (distance: number) => ({ x: 0, z: distance });
  it('finds the nearest person in its corridor ahead and nobody beside or behind it', () => {
    const people = [
      { x: 0.4, z: 3.1 },
      { x: 3, z: 1 },
      { x: 0, z: -2 },
    ];
    expect(nearestPedestrianAhead(straight, people, people.length)).toBeCloseTo(2.5, 6);
    expect(nearestPedestrianAhead(straight, people.slice(1), 2)).toBe(Infinity);
    expect(nearestPedestrianAhead(straight, people, 0)).toBe(Infinity);
  });
});
