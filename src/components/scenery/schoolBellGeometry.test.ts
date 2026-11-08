import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  SCHOOL_BELL_CLAPPER_HANG_Y,
  SCHOOL_BELL_LIP_Y,
  SCHOOL_BELL_MOUTH_RADIUS,
  SCHOOL_BELL_PIVOT,
  createSchoolBellCastingGeometry,
  createSchoolBellClapperGeometry,
  createSchoolBellHeadstockGeometry,
} from './schoolBellGeometry';
import { SCHOOL_BELL_CLAPPER_LAG, SCHOOL_BELL_MAX_ANGLE } from './schoolBellMotion';

const front = new THREE.MeshBasicMaterial({ side: THREE.FrontSide });
/** Authored school-local y to pivot-relative y. */
const local = (y: number) => y - SCHOOL_BELL_PIVOT[1] - 0.008;

describe('school bell geometry', () => {
  it('is a hollow casting: front-facing inner wall, closed crown, open mouth', () => {
    // The same rays the GLB carried while the bell was baked into school.glb.
    const bell = new THREE.Mesh(createSchoolBellCastingGeometry(), front);
    bell.updateMatrixWorld();
    for (const [x, z, dx, dz] of [
      [0.2, 0.1, 1, 0],
      [-0.2, 0.1, -1, 0],
      [0.1, 0.2, 0, 1],
      [0.1, -0.2, 0, -1],
    ]) {
      const hit = new THREE.Raycaster(
        new THREE.Vector3(x, local(9.72), z),
        new THREE.Vector3(dx, 0, dz),
        0,
        0.4
      ).intersectObject(bell)[0];
      expect(hit, 'visible inward-facing bronze casting').toBeDefined();
      expect(hit.distance).toBeGreaterThan(0.1);
    }
    const up = new THREE.Raycaster(
      new THREE.Vector3(0.1, local(9.74), 0.08),
      new THREE.Vector3(0, 1, 0),
      0,
      0.6
    ).intersectObject(bell)[0];
    expect(up, 'closed inner crown').toBeDefined();
    expect(up.point.y).toBeGreaterThan(local(10.2));
    expect(up.point.y).toBeLessThan(local(10.3));
    const down = new THREE.Raycaster(
      new THREE.Vector3(0.2, local(9.72), 0.1),
      new THREE.Vector3(0, -1, 0),
      0,
      0.5
    ).intersectObject(bell);
    expect(down, 'open mouth').toHaveLength(0);
    // From outside, the outer wall faces the viewer too.
    const side = new THREE.Raycaster(
      new THREE.Vector3(2, local(9.9), 0),
      new THREE.Vector3(-1, 0, 0)
    ).intersectObject(bell)[0];
    expect(side?.point.x).toBeGreaterThan(0.3);
    bell.geometry.dispose();
  });

  it('keeps the clapper inside the mouth at the largest swing', () => {
    const clapper = createSchoolBellClapperGeometry();
    clapper.computeBoundingBox();
    const box = clapper.boundingBox!;
    // Geometry hangs from its own pivot, so the ball's lowest point is min.y.
    const length = -box.min.y;
    // Relative to the casting the clapper swings by the lagged angle; the ball
    // (r 96 mm) must stay inside the sound bow's inner wall (r 515 mm).
    const relative = SCHOOL_BELL_MAX_ANGLE * SCHOOL_BELL_CLAPPER_LAG;
    expect(Math.sin(relative) * length + 0.096).toBeLessThan(0.515);
    expect(0.515).toBeLessThan(SCHOOL_BELL_MOUTH_RADIUS);
    // The ball hangs at the lip, not far below the mouth.
    expect(SCHOOL_BELL_CLAPPER_HANG_Y + box.min.y).toBeGreaterThan(SCHOOL_BELL_LIP_Y - 0.15);
    clapper.dispose();
  });

  it('swings clear of the belfry posts, base, bearings and crown', () => {
    const casting = createSchoolBellCastingGeometry();
    const { oak, iron } = createSchoolBellHeadstockGeometry();
    const p = new THREE.Vector3();
    for (const angle of [-SCHOOL_BELL_MAX_ANGLE, 0, SCHOOL_BELL_MAX_ANGLE]) {
      const turn = new THREE.Matrix4().makeRotationX(angle);
      for (const geometry of [casting, oak]) {
        const position = geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
          p.fromBufferAttribute(position, i).applyMatrix4(turn);
          const y = p.y + SCHOOL_BELL_PIVOT[1];
          // Posts: centres (+-0.85, +-0.85), 0.21 square.
          expect(Math.abs(p.x) < 0.745 || Math.abs(p.z) < 0.745).toBe(true);
          // Belfry base top 8.975; crown underside 10.635.
          expect(y).toBeGreaterThan(8.975);
          expect(y).toBeLessThan(10.635);
          // Bearings (x 0.57-0.71, y 10.315-10.465, z +-0.12) take only the
          // round gudgeons, never the headstock or the casting.
          if (y > 10.315 && y < 10.465 && Math.abs(p.z) < 0.12) {
            expect(Math.abs(p.x)).toBeLessThan(0.57);
          }
        }
      }
    }
    // The gudgeons pass through both bearings.
    iron.computeBoundingBox();
    expect(iron.boundingBox!.max.x).toBeGreaterThan(0.71);
    expect(iron.boundingBox!.min.x).toBeLessThan(-0.71);
    casting.dispose();
    oak.dispose();
    iron.dispose();
  });
});
