import { describe, expect, it } from 'vitest';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import {
  DOCK_DECK,
  TRAILER_BED_Y,
  dockForkliftHoldsTruck,
  forkliftInDockLane,
} from '../../constants/dockLoading';
import { drivenLogisticsRoute } from '../../simulation/logisticsRuntime';
import { protectedEgressApproaches } from '../../simulation/layoutPlanning';
import { sampleArcLengthPath } from '../../simulation/vehicles/vehicleKinematics';
import {
  FORKLIFT_HOLD_CLEARANCE_METRES,
  distanceAheadOnClosedPath,
  forkliftActionHoldDistance,
  sampleForkliftLoadPose,
} from '../../simulation/vehicles/forkliftController';
import { FORKLIFT_TIER_FOOTPRINTS } from '../models/ForkliftModel';
import { getFlourPalletGeometry } from '../../utils/flourSacks';
import { DOCK_BUMPER_FACE_Z, TRAILER_REAR_OVERHANG } from './truckController';
import { TRAILER_REAR_DOOR, TRAILER_UNDERRIDE_GUARD } from './OptimizedTruckBay';
import { DOCK_BUMPER_BLOCKS, DOCK_LEVELER_LIP, DOCK_PLATFORM_SECTION } from './dockApronLayout';

/**
 * A forklift on the hall floor loads the docked trailer across the dock deck:
 * it lifts the pallet to the trailer bed's height and sets it on the deck at
 * the trailer's tail, at both docks and in both render tiers. The deck used to
 * be 2 m up (in the docked trailer's body) while the forks set the pallet on
 * the channel floor at the door.
 * Working if, for each tier, the pallet rests on the deck at bed height, the
 * mast and tyres stay clear of it, and the deck meets the trailer.
 */
const pallet = getFlourPalletGeometry().pallet;
pallet.computeBoundingBox();
const palletUnderside = pallet.boundingBox!.min.y;
const palletDepth = pallet.boundingBox!.max.z - pallet.boundingBox!.min.z;
const palletHalfWidth = pallet.boundingBox!.max.x;

/** Dock group origin (world z) and outward sign. */
const DOCKS = {
  shipping: { z: 50, sign: 1, action: 'dropoff' },
  receiving: { z: -50, sign: -1, action: 'pickup' },
} as const;

/** The pose in which the pallet stands on the work surface. */
const restingFork = (action: 'pickup' | 'dropoff', surface: number) =>
  action === 'dropoff'
    ? sampleForkliftLoadPose('dropoff', 3.5 / 6, 0.72, surface).forkHeight // disengaging
    : sampleForkliftLoadPose('pickup', 2.5 / 8, 0.72, surface).forkHeight; // inserting

describe('dock loading geometry', () => {
  it('builds the deck at trailer-bed height, from the door to the trailer tail', () => {
    expect(DOCK_DECK.topY).toBeCloseTo(TRAILER_BED_Y, 6);
    // Clear of the closed roll-up door (u -1.8, 0.15 m deep).
    expect(DOCK_DECK.nearU).toBeGreaterThanOrEqual(-1.8 + 0.075);
    // Ends at the bumper face; the docked trailer's doors are just beyond it.
    const trailerDoorFaceU =
      DOCK_BUMPER_FACE_Z +
      TRAILER_REAR_OVERHANG +
      0.02 +
      TRAILER_REAR_DOOR.z -
      TRAILER_REAR_DOOR.depth / 2 -
      50;
    expect(DOCK_DECK.farU).toBeCloseTo(DOCK_BUMPER_FACE_Z - 50, 6);
    expect(DOCK_DECK.farU).toBeLessThan(trailerDoorFaceU);
    // Between the platform sections, not over them.
    expect(DOCK_DECK.width / 2).toBeLessThan(
      DOCK_PLATFORM_SECTION.x - DOCK_PLATFORM_SECTION.width / 2
    );
    // The lip, stowed or deployed, stops short of the docked trailer's
    // underride guard and clears the bumper block below it.
    const trailerZ = DOCK_BUMPER_FACE_Z + TRAILER_REAR_OVERHANG + 0.02;
    const guardU =
      trailerZ + TRAILER_UNDERRIDE_GUARD.position[2] - TRAILER_UNDERRIDE_GUARD.scale[2] / 2 - 50;
    const hingeY = DOCK_DECK.topY - DOCK_DECK.thickness;
    const lipCorners = (angle: number) =>
      [0, DOCK_LEVELER_LIP.thickness].flatMap((y) =>
        [0, DOCK_LEVELER_LIP.depth].map((z) => ({
          u: DOCK_DECK.farU + y * Math.sin(angle) + z * Math.cos(angle),
          y: hingeY + y * Math.cos(angle) - z * Math.sin(angle),
        }))
      );
    const centreBlock = DOCK_BUMPER_BLOCKS.find((block) => block.x === 0)!;
    for (const angle of [DOCK_LEVELER_LIP.stowedAngle, DOCK_LEVELER_LIP.deployedAngle]) {
      for (const corner of lipCorners(angle)) {
        expect(corner.u, `lip at ${angle}`).toBeLessThan(guardU);
        expect(corner.u).toBeGreaterThanOrEqual(DOCK_DECK.farU - 1e-9);
        expect(corner.y).toBeGreaterThanOrEqual(centreBlock.y + centreBlock.height / 2);
      }
    }
    // No bumper block stands up through the deck.
    for (const block of DOCK_BUMPER_BLOCKS) {
      const overlapsX = Math.abs(block.x) - block.width / 2 < DOCK_DECK.width / 2;
      const overlapsU =
        block.u + block.depth / 2 > DOCK_DECK.nearU && block.u - block.depth / 2 < DOCK_DECK.farU;
      if (overlapsX && overlapsU)
        expect(block.y + block.height / 2, `bumper x ${block.x}`).toBeLessThanOrEqual(
          DOCK_DECK.topY - DOCK_DECK.thickness + 1e-9
        );
    }
  });

  for (const dock of ['shipping', 'receiving'] as const) {
    it(`${dock}: the truck's doors stay open while its forklift drives in, works and backs off`, () => {
      const spec = DOCKS[dock];
      const { plan } = drivenLogisticsRoute(dock, SITE_LAYOUT.routes.forklifts[dock].points);
      const marker = plan.markers.find(({ action }) => action.type === spec.action)!;
      const hold = forkliftActionHoldDistance(
        plan,
        marker.distance,
        protectedEgressApproaches(),
        FORKLIFT_HOLD_CLEARANCE_METRES
      );
      const at = (distance: number) => {
        const total = plan.path.totalLength;
        const s = sampleArcLengthPath(plan.path, ((distance % total) + total) % total);
        return forkliftInDockLane(s.x, s.z);
      };
      // Waiting at the hold point it is outside the lane, so it never holds a truck.
      expect(at(hold)).toBe(false);
      // From just past the hold point, through the stand and back out the same way.
      const leg = distanceAheadOnClosedPath(plan.path, hold, marker.distance);
      for (let along = 0.3; along <= leg; along += 0.1) expect(at(hold + along)).toBe(true);
      for (let back = 0; back <= leg - 0.3; back += 0.1)
        expect(at(marker.distance + back), `${back} m back`).toBe(true);
      // The rest of the lap is not.
      expect(at(marker.distance + plan.path.totalLength / 2)).toBe(false);
      // Working or backing off it holds the truck; stuck on its own interlock
      // (permission lost after it drove in) it must not, or neither moves again.
      const stand = sampleArcLengthPath(plan.path, marker.distance);
      expect(dockForkliftHoldsTruck(stand, 'load-operation')).toBe(true);
      expect(dockForkliftHoldsTruck(stand, 'none')).toBe(true);
      expect(dockForkliftHoldsTruck(stand, 'logistics-interlock')).toBe(false);
      expect(dockForkliftHoldsTruck(undefined, 'none')).toBe(false);
    });

    it(`${dock}: the forklift sets the pallet on the deck at the trailer tail`, () => {
      const spec = DOCKS[dock];
      const { plan } = drivenLogisticsRoute(dock, SITE_LAYOUT.routes.forklifts[dock].points);
      const marker = plan.markers.find(({ action }) => action.type === spec.action)!;
      const stand = sampleArcLengthPath(plan.path, marker.distance);
      // Dock-local: u outward, x across the bay.
      const standU = (stand.z - spec.z) * spec.sign;
      const standX = stand.x * spec.sign;
      expect(Math.abs(standX), 'stand on the bay centreline').toBeLessThan(1e-6);
      expect(stand.tangentZ * spec.sign, 'facing the trailer').toBeGreaterThan(0.999);
      const surface = marker.action.surfaceForkHeight ?? 0;

      for (const [tier, footprint] of Object.entries(FORKLIFT_TIER_FOOTPRINTS)) {
        const label = `${dock} ${tier}`;
        // Rests at bed height (the tiers' carrier datums differ by 2.5 cm).
        const palletBottom =
          footprint.palletRestY + palletUnderside + restingFork(spec.action, surface);
        expect(
          Math.abs(palletBottom - DOCK_DECK.topY),
          `${label} pallet height`
        ).toBeLessThanOrEqual(0.03);
        // Wholly on the deck.
        const palletU = standU + footprint.palletReach;
        expect(palletU - palletDepth / 2, `${label} pallet hall edge`).toBeGreaterThanOrEqual(
          DOCK_DECK.nearU - 1e-6
        );
        expect(palletU + palletDepth / 2, `${label} pallet far edge`).toBeLessThanOrEqual(
          DOCK_DECK.farU
        );
        expect(palletHalfWidth).toBeLessThan(DOCK_DECK.width / 2);
        // The mast stays on the hall side of the deck.
        expect(standU + footprint.mastFaceZ, `${label} mast`).toBeLessThanOrEqual(
          DOCK_DECK.nearU + 1e-6
        );
        // The front tyre passes under the deck's hall edge without touching it.
        const tyreU = standU + footprint.frontTyre.z;
        const nearestU = Math.max(tyreU, DOCK_DECK.nearU);
        const underside = DOCK_DECK.topY - DOCK_DECK.thickness;
        const nearestY = Math.min(Math.max(footprint.frontTyre.y, underside), DOCK_DECK.topY);
        expect(
          Math.hypot(nearestU - tyreU, nearestY - footprint.frontTyre.y),
          `${label} tyre clearance`
        ).toBeGreaterThanOrEqual(footprint.frontTyre.radius);
        // No part of the vehicle reaches the platform sections.
        expect(footprint.halfWidth).toBeLessThan(
          DOCK_PLATFORM_SECTION.x - DOCK_PLATFORM_SECTION.width / 2
        );
      }
    });
  }
});
