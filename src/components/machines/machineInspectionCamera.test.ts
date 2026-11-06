import { describe, expect, it } from 'vitest';
import { machineInspectionCamera, machineInspectionYaw } from './machineInspectionCamera';
import { createMachineObstacles, type FactoryObstacle } from '../../constants/factoryObstacles';
import {
  SITE_LAYOUT,
  getMachineAssemblyScale,
  getLandmarkBounds,
  getServiceAssetBounds,
  type Vec3Tuple,
} from '../../constants/siteLayout';
import { sampleWalkingGroundHeight } from '../../utils/castleNavigation';
import { MachineType } from '../../types';

const SILO_SIZE = SITE_LAYOUT.machineDimensions.silo as Vec3Tuple;
const scale = getMachineAssemblyScale({ type: MachineType.SILO, size: SILO_SIZE });
const silos = createMachineObstacles(0).filter((o) => o.id.startsWith('silo-'));
const sideBuildings: FactoryObstacle[] = [
  ...[...Object.values(SITE_LAYOUT.serviceYard), SITE_LAYOUT.bulkStorage.elevator].map((asset) => ({
    id: asset.id,
    ...getServiceAssetBounds(asset),
  })),
  ...Object.values(SITE_LAYOUT.landmarks).map((landmark) => ({
    id: landmark.id,
    ...getLandmarkBounds(landmark),
  })),
];

const inside = (p: Vec3Tuple, o: FactoryObstacle) =>
  p[0] > o.minX &&
  p[0] < o.maxX &&
  p[1] > o.minY &&
  p[1] < o.maxY &&
  p[2] > o.minZ &&
  p[2] < o.maxZ;

/** Slab test: does the segment a -> b pass through the box? */
function crosses(a: Vec3Tuple, b: Vec3Tuple, o: FactoryObstacle): boolean {
  const min = [o.minX, o.minY, o.minZ];
  const max = [o.maxX, o.maxY, o.maxZ];
  let enter = 0;
  let exit = 1;
  for (let axis = 0; axis < 3; axis++) {
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-9) {
      if (a[axis] <= min[axis] || a[axis] >= max[axis]) return false;
      continue;
    }
    let t0 = (min[axis] - a[axis]) / d;
    let t1 = (max[axis] - a[axis]) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    enter = Math.max(enter, t0);
    exit = Math.min(exit, t1);
    if (enter >= exit) return false;
  }
  return true;
}

describe('silo lesson camera', () => {
  const cases = SITE_LAYOUT.machines.silos.flatMap((anchor) =>
    [0, 1, 2, 3].map((stage) => ({ anchor, stage }))
  );

  it('never puts the eye inside a neighbouring silo or a yard building', () => {
    const problems: string[] = [];
    for (const { anchor, stage } of cases) {
      const { eye } = machineInspectionCamera('silo', stage, anchor.position, scale);
      for (const box of [...silos, ...sideBuildings]) {
        if (box.id !== anchor.id && inside(eye, box))
          problems.push(`${anchor.id} stage ${stage}: eye inside ${box.id}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps every eye above the ground it stands over', () => {
    for (const { anchor, stage } of cases) {
      const { eye } = machineInspectionCamera('silo', stage, anchor.position, scale);
      // The camera floor (CameraController MIN_CAMERA_HEIGHT) over the terrain.
      expect(eye[1]).toBeGreaterThanOrEqual(sampleWalkingGroundHeight(eye[0], eye[2], 128) + 1.5);
    }
  });

  it('looks at the cutaway past no neighbouring silo or yard building', () => {
    const problems: string[] = [];
    for (const { anchor, stage } of cases) {
      const { eye, target } = machineInspectionCamera('silo', stage, anchor.position, scale);
      for (const box of [...silos, ...sideBuildings]) {
        if (box.id !== anchor.id && crosses(eye, target, box))
          problems.push(`${anchor.id} stage ${stage}: sight line crosses ${box.id}`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('stands on the open-ground side, facing the open face of the cut', () => {
    const yaw = machineInspectionYaw('silo');
    // The cut's open face is local +z, turned by the inspection group's yaw.
    const normal = [Math.sin(yaw), Math.cos(yaw)];
    for (const { anchor, stage } of cases) {
      const { eye, target } = machineInspectionCamera('silo', stage, anchor.position, scale);
      const dx = eye[0] - target[0];
      const dz = eye[2] - target[2];
      const facing = (dx * normal[0] + dz * normal[1]) / Math.hypot(dx, dz);
      // Within 25 degrees of square-on to the cut.
      expect(facing).toBeGreaterThan(Math.cos((25 * Math.PI) / 180));
      // Away from the mill hall, never back across the silo row towards it.
      expect(eye[0]).toBeGreaterThan(SITE_LAYOUT.factory.bounds.maxX);
      expect(eye[0]).toBeGreaterThan(anchor.position[0]);
    }
  });
});
