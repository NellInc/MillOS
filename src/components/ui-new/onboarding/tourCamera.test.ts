import { describe, expect, it } from 'vitest';
import { CAMERA_PRESETS } from '../../CameraController';
import { resolveCameraCollision } from '../../../utils/cameraCollision';
import { SITE_LAYOUT, type Vec3Tuple } from '../../../constants/siteLayout';
import { getTourCameraPreset, TOUR_CAMERA_PRESETS } from './tourCamera';

/**
 * Every point a preset flight passes through. CameraController moves the
 * camera along the straight line between the two poses (a smoothstep only
 * sets the pace), with collision off for the whole flight, so the line is
 * the path the viewer sees.
 */
const flightPoint = (from: number, to: number, t: number): Vec3Tuple => {
  const start = CAMERA_PRESETS[from].position;
  const end = CAMERA_PRESETS[to].position;
  return [0, 1, 2].map((axis) => start[axis] + (end[axis] - start[axis]) * t) as Vec3Tuple;
};

const FLIGHT_SAMPLES = 400;

/**
 * What the flight enters: a machine's own bounding box (a silo's is the
 * square round its drum) or a wall outside its portal. Clearance 0, because
 * the 0.65 m manual-navigation margin is a stand-off for a walking camera,
 * not the edge of a solid.
 */
const flightCollisions = (from: number, to: number): string[] => {
  const hits = new Set<string>();
  let previous = flightPoint(from, to, 0);
  for (let index = 1; index <= FLIGHT_SAMPLES; index += 1) {
    const next = flightPoint(from, to, index / FLIGHT_SAMPLES);
    const { collidedWith } = resolveCameraCollision(previous, next, 0);
    if (collidedWith) hits.add(collidedWith);
    previous = next;
  }
  return [...hits];
};

/** The flight's closest approach to any silo drum's surface, in metres. */
const closestSiloSurface = (from: number, to: number): number => {
  const radius = SITE_LAYOUT.machineDimensions.silo[0] / 2;
  const height = SITE_LAYOUT.machineDimensions.silo[1];
  let closest = Infinity;
  for (let index = 0; index <= FLIGHT_SAMPLES; index += 1) {
    const [x, y, z] = flightPoint(from, to, index / FLIGHT_SAMPLES);
    if (y > height) continue;
    for (const { position } of SITE_LAYOUT.machines.silos) {
      closest = Math.min(closest, Math.hypot(x - position[0], z - position[2]) - radius);
    }
  }
  return closest;
};

describe('tour camera route', () => {
  it('follows the grain: silos, milling, then packing', () => {
    expect([0, 1, 2].map(getTourCameraPreset)).toEqual([1, 2, 4]);
    expect(TOUR_CAMERA_PRESETS.map((index) => CAMERA_PRESETS[index].name)).toEqual([
      'Silos',
      'Milling',
      'Packing',
    ]);
  });

  it('flies between consecutive steps, Next and Back, without passing through anything', () => {
    for (let step = 1; step < TOUR_CAMERA_PRESETS.length; step += 1) {
      const from = TOUR_CAMERA_PRESETS[step - 1];
      const to = TOUR_CAMERA_PRESETS[step];
      expect(flightCollisions(from, to), `${from} -> ${to}`).toEqual([]);
      expect(flightCollisions(to, from), `${to} -> ${from}`).toEqual([]);
      // Silos -> Packing went 2.4 m inside Silo Alpha's drum; Silos -> Milling
      // passes 1.45 m outside it.
      expect(closestSiloSurface(from, to)).toBeGreaterThan(1);
    }
  });

  it('ignores inactive or invalid tour steps', () => {
    expect(getTourCameraPreset(null)).toBeNull();
    expect(getTourCameraPreset(3)).toBeNull();
  });
});
