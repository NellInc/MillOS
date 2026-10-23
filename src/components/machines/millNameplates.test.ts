import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { SITE_LAYOUT } from '../../constants/siteLayout';
import { MachineData, MachineType } from '../../types';
import { MILL_IDENTITY_TEXT } from './machineDecalAtlas';
import { DECAL_CELL, planMachineDecals } from './machineDecals';

/**
 * final-med-12 milling: once the mills were installed at real size (x0.4), the
 * R.M. plates became 0.45 x 0.17 m on the side and 0.5 x 0.12 m on the front,
 * with lettering about 10 px tall from the milling camera - unreadable. These
 * checks project the INSTALLED plates into the milling benchmark view.
 */

const FRAME_HEIGHT_PX = 1440;
const milling = SITE_LAYOUT.cameras.milling;
const focalPx = FRAME_HEIGHT_PX / 2 / Math.tan(THREE.MathUtils.degToRad(milling.fov / 2));
const cameraPosition = new THREE.Vector3(...milling.position);

const mills = SITE_LAYOUT.machines.rollerMills.map(
  (anchor) =>
    ({
      ...anchor,
      type: MachineType.ROLLER_MILL,
      size: [...SITE_LAYOUT.machineDimensions.rollerMill],
    }) as unknown as MachineData
);
const plates = planMachineDecals({ silos: [], mills, sifters: [], packers: [] }).filter((plate) =>
  [DECAL_CELL.mill101, DECAL_CELL.mill102, DECAL_CELL.mill103, DECAL_CELL.mill104].includes(
    plate.cell as never
  )
);

/** Lettering height and stroke width on screen, for one plate. */
function onScreen(plate: (typeof plates)[number]) {
  const centre = new THREE.Vector3(...plate.position);
  const distance = centre.distanceTo(cameraPosition);
  const yaw = plate.rotationY ?? 0;
  const normal = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const toCamera = cameraPosition.clone().sub(centre).normalize();
  const horizontal = new THREE.Vector3(toCamera.x, 0, toCamera.z).normalize();
  const capHeight = plate.size[1] * MILL_IDENTITY_TEXT.mainHeight;
  const columns = MILL_IDENTITY_TEXT.mainColumns;
  const strokeWidth = (plate.size[0] * MILL_IDENTITY_TEXT.mainWidth) / columns;
  return {
    facing: normal.dot(toCamera),
    capPx: (capHeight * focalPx) / distance,
    strokePx: (strokeWidth * Math.abs(normal.dot(horizontal)) * focalPx) / distance,
  };
}

describe('roller mill identity plates', () => {
  it('reads the two nearest mills from the milling camera', () => {
    for (const id of ['rm-101', 'rm-102']) {
      const visible = plates
        .filter((plate) => plate.machineId === id)
        .map(onScreen)
        .filter(({ facing }) => facing > 0.3);
      expect(visible.length, id).toBeGreaterThan(0);
      const best = visible.reduce((a, b) => (a.capPx > b.capPx ? a : b));
      // 14 px of digit height, with strokes wider than a pixel.
      expect(best.capPx, `${id} lettering`).toBeGreaterThanOrEqual(14);
      expect(best.strokePx, `${id} stroke`).toBeGreaterThanOrEqual(1.2);
    }
  });

  it('keeps the digits near square, not stretched by the plate', () => {
    for (const plate of plates) {
      const rowHeight = (plate.size[1] * MILL_IDENTITY_TEXT.mainHeight) / 7;
      const columnWidth =
        (plate.size[0] * MILL_IDENTITY_TEXT.mainWidth) / MILL_IDENTITY_TEXT.mainColumns;
      expect(rowHeight / columnWidth).toBeGreaterThan(0.6);
      expect(rowHeight / columnWidth).toBeLessThan(1.8);
    }
  });
});
