import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  TRAILER_REAR_DOOR,
  TRAILER_REAR_LAMPS,
  TRUCK_REAR_LAMP_EMISSIVE,
  truckRearLampIntensities,
} from './OptimizedTruckBay';
import { TONE_EXPOSURE } from '../../constants/colorGrade';

/** three's NeutralToneMapping (the renderer and composer default), then sRGB encode. */
function displayed(linear: THREE.Color) {
  const c = [linear.r, linear.g, linear.b].map((v) => v * TONE_EXPOSURE);
  const x = Math.min(...c);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  let out = c.map((v) => v - offset);
  const peak = Math.max(...out);
  const start = 0.8 - 0.04;
  if (peak >= start) {
    const d = 1 - start;
    const newPeak = 1 - (d * d) / (peak + d - start);
    out = out.map((v) => (v * newPeak) / peak);
    const g = 1 - 1 / (0.15 * (peak - newPeak) + 1);
    out = out.map((v) => v + (newPeak - v) * g);
  }
  const encoded = new THREE.Color(out[0], out[1], out[2]).convertLinearToSRGB();
  return [encoded.r, encoded.g, encoded.b];
}
const lens = (hex: string, intensity: number) =>
  displayed(new THREE.Color(hex).multiplyScalar(intensity));
const off = { brakeLights: false, reverseLights: false, leftSignal: false, rightSignal: false };

// The trailer faces +Z, so its rear faces are its most negative z.
const doorOuterFace = TRAILER_REAR_DOOR.z - TRAILER_REAR_DOOR.depth / 2;

describe('trailer rear lamp cluster', () => {
  it('stands every lamp lens proud of the closed doors, sharing no face with them', () => {
    // The z-fight probe found the reverse and signal lenses exactly on the door
    // face (0 mm, flickering against the door paint from behind the truck), and
    // the brake lamps 1 cm inside the doors, where they never showed at all.
    for (const { lamp, position, scale } of TRAILER_REAR_LAMPS) {
      const lens = position[2] - scale[2] / 2;
      const back = position[2] + scale[2] / 2;
      expect(doorOuterFace - lens, `${lamp} at x ${position[0]}`).toBeGreaterThanOrEqual(0.02);
      // Still seated on the door leaf, not floating behind it.
      expect(back, `${lamp} at x ${position[0]}`).toBeGreaterThan(doorOuterFace);
    }
  });
});

describe('trailer rear lamp lighting', () => {
  it('shows a lit brake lamp as red and brighter than the tail lamp, not tone-mapped pink', () => {
    // At 4.5 the Neutral curve compressed the lens's red peak and blended a
    // third of the way to white: the brake lamps read pink at noon.
    const brake = truckRearLampIntensities({ ...off, brakeLights: true }, false).brake;
    const tail = truckRearLampIntensities(off, true).brake;
    const [r, g, b] = lens(TRUCK_REAR_LAMP_EMISSIVE.brake, brake);
    expect(g / r, `brake at ${brake}: ${[r, g, b].map((v) => v.toFixed(2))}`).toBeLessThan(0.35);
    expect(b / r).toBeLessThan(0.35);
    expect(r - lens(TRUCK_REAR_LAMP_EMISSIVE.brake, tail)[0]).toBeGreaterThan(0.1);
  });

  it('keeps a flashing signal amber rather than washed to pale yellow', () => {
    const on = truckRearLampIntensities({ ...off, leftSignal: true }, false).leftSignal;
    const [r, g, b] = lens(TRUCK_REAR_LAMP_EMISSIVE.signal, on);
    expect(r).toBeGreaterThan(0.9);
    expect(g / r, `signal at ${on}: ${[r, g, b].map((v) => v.toFixed(2))}`).toBeLessThan(0.7);
    expect(b / r).toBeLessThan(0.35);
  });
});
