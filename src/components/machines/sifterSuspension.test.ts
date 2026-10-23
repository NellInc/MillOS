import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SIFTER_LAYOUT, SITE_LAYOUT, installMachinePoint } from '../../constants/siteLayout';
import { MachineType, type MachineData } from '../../types';
import { buildSpoutRoutes, SPOUT_PIPE_RADIUS } from '../flow/spoutRoutes';
import { buildProcessGallery } from '../infrastructure/OptimizedFactoryInfrastructure';
import { SIFTER_SUSPENSION, type SuspensionBox } from './sifterSuspension';

/**
 * final-med-12 interior (700,540)-(1420,700): the plansifters read as crates
 * standing on the deck. A plansifter hangs: canes from steel overhead to
 * brackets on its frame, with air under it. Authored metres (x0.5 installed)
 * unless a name says world.
 */

/** Casing (6.5 x 5.65) with its trays standing 0.15 m proud (6.8 x 5.95). */
const TRAY_HALF = { x: 3.4, z: 2.975 };
const CASING_HALF = { x: 3.25, z: 2.825 };
/** Course 1 of the casing, the full-width band above the underframe. */
const COURSE_ONE = {
  bottom: SIFTER_LAYOUT.bodyCentreY - 0.405 * SIFTER_LAYOUT.bodyHeight,
  top: SIFTER_LAYOUT.bodyCentreY - 0.33 * SIFTER_LAYOUT.bodyHeight,
};

const box3 = ({ centre, size }: SuspensionBox) =>
  new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(...centre), new THREE.Vector3(...size));

const sifters = SITE_LAYOUT.machines.sifters.map(
  (anchor) =>
    ({
      ...anchor,
      type: MachineType.PLANSIFTER,
      size: [...SITE_LAYOUT.machineDimensions.sifter],
    }) as unknown as MachineData
);

describe('plansifter suspension', () => {
  const r = SIFTER_SUSPENSION.caneRadius;

  it('hangs every cane outside the casing and its trays', () => {
    expect(SIFTER_SUSPENSION.canes.length).toBeGreaterThanOrEqual(4);
    for (const cane of SIFTER_SUSPENSION.canes)
      expect(
        Math.abs(cane.x) - r > TRAY_HALF.x || Math.abs(cane.z) - r > TRAY_HALF.z,
        `cane at (${cane.x}, ${cane.z})`
      ).toBe(true);
  });

  it('runs each cane from a bracket on the frame up to the underside of overhead steel', () => {
    for (const cane of SIFTER_SUSPENSION.canes) {
      const inside = (b: THREE.Box3) =>
        cane.x - r >= b.min.x - 1e-9 &&
        cane.x + r <= b.max.x + 1e-9 &&
        cane.z - r >= b.min.z - 1e-9 &&
        cane.z + r <= b.max.z + 1e-9;
      const beam = SIFTER_SUSPENSION.gantry
        .map(box3)
        .find((b) => inside(b) && Math.abs(b.min.y - cane.top) < 1e-6);
      expect(beam, `steel over (${cane.x}, ${cane.z})`).toBeDefined();
      const bracket = SIFTER_SUSPENSION.brackets
        .map(box3)
        .find((b) => inside(b) && Math.abs(b.max.y - cane.bottom) < 1e-6);
      expect(bracket, `bracket under (${cane.x}, ${cane.z})`).toBeDefined();
    }
  });

  it('bolts each bracket into the casing, clear of the trays above and below', () => {
    expect(SIFTER_SUSPENSION.brackets.length).toBeGreaterThanOrEqual(4);
    for (const bracket of SIFTER_SUSPENSION.brackets.map(box3)) {
      const nearX = Math.min(Math.abs(bracket.min.x), Math.abs(bracket.max.x));
      const nearZ = Math.min(Math.abs(bracket.min.z), Math.abs(bracket.max.z));
      expect(nearX).toBeLessThan(CASING_HALF.x);
      expect(nearZ).toBeLessThan(CASING_HALF.z);
      expect(bracket.min.y).toBeGreaterThanOrEqual(COURSE_ONE.bottom);
      expect(bracket.max.y).toBeLessThanOrEqual(COURSE_ONE.top);
    }
  });

  it('stands the gantry on the gallery deck, clear of the gyrating sifter', () => {
    const gallery = buildProcessGallery();
    const deckTop = gallery.deck[0].position[1] + gallery.deck[0].scale[1] / 2;
    // Gyration 55 mm installed is 0.11 authored, plus 0.1 of air.
    const swing = 0.21;
    const envelopes = [
      // Casing, trays and lid.
      new THREE.Box3(
        new THREE.Vector3(-TRAY_HALF.x - swing, -1, -TRAY_HALF.z - swing),
        new THREE.Vector3(TRAY_HALF.x + swing, 6.33 + swing, TRAY_HALF.z + swing)
      ),
      // Drive drum on +x.
      new THREE.Box3(
        new THREE.Vector3(3, 1.89 - swing, -0.31 - swing),
        new THREE.Vector3(4.255 + swing, 2.51 + swing, 0.31 + swing)
      ),
      // Inlet.
      new THREE.Box3(
        new THREE.Vector3(-0.36 - swing, 6, -0.36 - swing),
        new THREE.Vector3(0.36 + swing, 7.56 + swing, 0.36 + swing)
      ),
    ];
    expect(SIFTER_SUSPENSION.gantry.length).toBeGreaterThan(0);
    for (const part of SIFTER_SUSPENSION.gantry.map(box3))
      for (const envelope of envelopes) expect(part.intersectsBox(envelope)).toBe(false);
    for (const sifter of sifters) {
      const lowest = Math.min(
        ...SIFTER_SUSPENSION.gantry.map(
          ({ centre, size }) =>
            installMachinePoint(sifter, [centre[0], centre[1] - size[1] / 2, centre[2]])[1]
        )
      );
      expect(lowest).toBeCloseTo(deckTop, 6);
    }
  });

  it('keeps the gantry out of every spout run', () => {
    const machines = (
      [
        [SITE_LAYOUT.machines.silos, MachineType.SILO, SITE_LAYOUT.machineDimensions.silo],
        [
          SITE_LAYOUT.machines.rollerMills,
          MachineType.ROLLER_MILL,
          SITE_LAYOUT.machineDimensions.rollerMill,
        ],
        [
          SITE_LAYOUT.machines.sifters,
          MachineType.PLANSIFTER,
          SITE_LAYOUT.machineDimensions.sifter,
        ],
        [SITE_LAYOUT.machines.packers, MachineType.PACKER, SITE_LAYOUT.machineDimensions.packer],
      ] as const
    ).flatMap(([anchors, type, size]) =>
      anchors.map((anchor) => ({ ...anchor, type, size: [...size] }) as unknown as MachineData)
    );
    const parts = sifters.flatMap((sifter) =>
      SIFTER_SUSPENSION.gantry.map(({ centre, size }) => {
        const min = installMachinePoint(sifter, [
          centre[0] - size[0] / 2,
          centre[1] - size[1] / 2,
          centre[2] - size[2] / 2,
        ]);
        const max = installMachinePoint(sifter, [
          centre[0] + size[0] / 2,
          centre[1] + size[1] / 2,
          centre[2] + size[2] / 2,
        ]);
        return new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)).expandByScalar(
          SPOUT_PIPE_RADIUS
        );
      })
    );
    const hits: string[] = [];
    for (const { curve, length, fromMachineId, toMachineId } of buildSpoutRoutes(machines)) {
      const steps = Math.ceil(length / 0.1);
      for (let i = 0; i <= steps; i += 1) {
        const point = curve.getPointAt(i / steps);
        if (parts.some((part) => part.containsPoint(point)))
          hits.push(
            `${fromMachineId}->${toMachineId} at ${point.toArray().map((v) => v.toFixed(2))}`
          );
      }
    }
    expect(hits.slice(0, 5)).toEqual([]);
  }, 60_000);

  it('leaves air under the casing: it hangs, nothing stands it on the deck', () => {
    const gallery = buildProcessGallery();
    const deckTop = gallery.deck[0].position[1] + gallery.deck[0].scale[1] / 2;
    for (const sifter of sifters) {
      const underframe = installMachinePoint(sifter, [
        0,
        SIFTER_LAYOUT.bodyCentreY - SIFTER_LAYOUT.bodyHeight / 2,
        0,
      ])[1];
      expect(underframe - deckTop).toBeGreaterThanOrEqual(0.15);
    }
    expect(SIFTER_SUSPENSION.standsOnPlatform).toBe(false);
  });

  it('drops the outlet sock from the casing through the deck aperture onto the spout', () => {
    const { sock } = SIFTER_SUSPENSION;
    const underframe = SIFTER_LAYOUT.bodyCentreY - SIFTER_LAYOUT.bodyHeight / 2;
    // Tucked into the underframe, never hanging below it in air.
    expect(sock.top).toBeGreaterThan(underframe);
    expect(sock.top - underframe).toBeLessThan(0.1);
    for (const sifter of sifters) {
      const route = buildSpoutRoutes([
        sifter,
        {
          ...SITE_LAYOUT.machines.packers[0],
          type: MachineType.PACKER,
          size: [...SITE_LAYOUT.machineDimensions.packer],
        } as unknown as MachineData,
      ])[0];
      const start = route.curve.getPointAt(0);
      expect(installMachinePoint(sifter, [0, sock.bottom, 0])[1]).toBeCloseTo(start.y, 6);
    }
    // The deck leaves a 1.1 m (world) aperture under each sifter.
    expect(sock.radius * 0.5).toBeLessThan(0.55);
  });
});
