import { describe, expect, it } from 'vitest';
import {
  advanceCreatureStride,
  creatureCadence,
  createHorseRestPose,
  sampleHorseRest,
  createSheepRestPose,
  sampleSheepRest,
  creatureForageWeight,
  creaturePerchLook,
  duckSwimPose,
  creaturePoseBlend,
  creatureTravelDistance,
  fountainRippleScale,
  createDuckWaterLife,
  sampleDuckWaterLife,
} from '../creatureMotion';

describe('creature ground motion and individuality', () => {
  it('gives each authored seed reproducible, bounded timing without changing placement', () => {
    const values = Array.from({ length: 20 }, (_, i) => creatureCadence(100 + i));
    expect(new Set(values).size).toBe(20);
    values.forEach((value, i) => {
      expect(value).toBe(creatureCadence(100 + i));
      expect(value).toBeGreaterThanOrEqual(0.88);
      expect(value).toBeLessThanOrEqual(1.12);
    });
  });

  it('turns in place instead of sliding backwards or sideways', () => {
    expect(creatureTravelDistance(3, Math.PI, 0.1, 1.5)).toBe(0);
    expect(creatureTravelDistance(3, Math.PI / 2, 0.1, 1.5)).toBeCloseTo(0);
    expect(creatureTravelDistance(3, Math.PI / 3, 0.1, 1.5)).toBeCloseTo(0.075);
    expect(creatureTravelDistance(3, 0, 0.1, 1.5)).toBeCloseTo(0.15);
  });

  it('clamps arrival to the actual target and applies no paused travel', () => {
    expect(creatureTravelDistance(0.02, 0, 0.1, 1.5)).toBe(0.02);
    expect(creatureTravelDistance(2, 0, 0, 1.5)).toBe(0);
    expect(creatureTravelDistance(2, 0, 0.1, 0)).toBe(0);
    expect(creatureTravelDistance(0, 0, 0.1, 1.5)).toBe(0);
  });

  it('advances the same foot phase for the same ground travel at clear/storm speeds', () => {
    const radiansPerMetre = 3.5 / 0.5;
    let clearPhase = 0;
    let stormPhase = 0;
    for (let i = 0; i < 10; i++)
      clearPhase = advanceCreatureStride(clearPhase, 0.05, radiansPerMetre);
    for (let i = 0; i < 50; i++)
      stormPhase = advanceCreatureStride(stormPhase, 0.01, radiansPerMetre);
    expect(clearPhase).toBeCloseTo(stormPhase, 12);
    expect(advanceCreatureStride(clearPhase, 0, radiansPerMetre)).toBe(clearPhase);
    // External position changes are not an input: reset/spawn cannot advance phase.
    expect(advanceCreatureStride(0, 0, radiansPerMetre)).toBe(0);
    expect(advanceCreatureStride(6, 0.5, radiansPerMetre)).toBeLessThan(Math.PI * 2);
  });

  it('preserves the 15Hz pose blend under irregular and lower frame rates', () => {
    expect(creaturePoseBlend(0.15, 1 / 15)).toBeCloseTo(0.15);
    expect(creaturePoseBlend(0.15, 0)).toBe(0);
    const twoSteps = 1 - (1 - creaturePoseBlend(0.15, 0.02)) * (1 - creaturePoseBlend(0.15, 0.08));
    expect(twoSteps).toBeCloseTo(creaturePoseBlend(0.15, 0.1));
  });
});

describe('generated fountain ripple contact', () => {
  it('keeps the entire ring inside the measured water rather than crossing the coping', () => {
    for (let i = 0; i <= 100; i++) {
      const scale = fountainRippleScale(i / 100, 1.28, 0.5);
      expect(0.5 * scale).toBeLessThanOrEqual(1.28);
      expect(0.38 * scale).toBeGreaterThanOrEqual(0.36);
    }
    expect(fountainRippleScale(0, 1.28, 0.5)).toBe(1);
    expect(fountainRippleScale(1, 1.28, 0.5)).toBe(2.56);
  });
});

describe('quiet animal life between purposeful bouts', () => {
  it('derives duck wake speed from the unchanged actual swim trajectory', () => {
    for (let seed = 800; seed < 804; seed++)
      for (let t = 0.1; t < 120; t += 0.2) {
        const a = duckSwimPose(t - 0.0001, seed),
          b = duckSwimPose(t + 0.0001, seed),
          p = duckSwimPose(t, seed);
        expect(p.speed).toBeCloseTo(Math.hypot(b.x - a.x, b.z - a.z) / 0.0002, 6);
        expect(p.speed).toBeGreaterThanOrEqual(0);
        expect(p.speed).toBeLessThan(0.08);
      }
  });

  it('gives quiet head-up attention without perpetual foam or bill-down swivelling', () => {
    const out = createDuckWaterLife();
    const resting = { swimming: false, speed: 0 };
    let quiet = 0,
      looks = 0;
    for (let i = 1; i < 1200; i++) {
      const t = i / 10;
      expect(sampleDuckWaterLife(t, 800, resting, 0, out)).toBe(out);
      expect(out.opacity).toBe(0);
      expect(Math.abs(out.look)).toBeLessThanOrEqual(0.18);
      if (out.look === 0) quiet++;
      else looks++;
      sampleDuckWaterLife(t, 800, resting, 1, out);
      expect(out.look).toBe(0);
      expect(out.aft).toBeLessThan(0);
      expect(out.opacity).toBeGreaterThanOrEqual(0);
      expect(out.opacity).toBeLessThanOrEqual(0.136);
    }
    expect(quiet).toBeGreaterThan(850);
    expect(looks).toBeGreaterThan(100);
    for (const time of [0, -1, NaN, Infinity]) {
      sampleDuckWaterLife(time, 800, resting, 1, out);
      expect(out).toEqual(createDuckWaterLife());
    }
  });

  it('fades every expansion wrap and keeps seeded copies independent', () => {
    const out = createDuckWaterLife(),
      other = createDuckWaterLife();
    sampleDuckWaterLife(4, 801, { swimming: true, speed: 0.06 }, 0, other);
    const saved = { ...other };
    let wraps = 0,
      previousScale = 0;
    for (let i = 1; i < 4000; i++) {
      sampleDuckWaterLife(i / 100, 800, { swimming: true, speed: 0.06 }, 0, out);
      expect(out.look).toBe(0);
      expect(out.opacity).toBeGreaterThanOrEqual(0);
      expect(out.opacity).toBeLessThanOrEqual(0.17);
      expect(out.scale).toBeGreaterThanOrEqual(0.5);
      expect(out.scale).toBeLessThan(1.65);
      if (out.scale < previousScale) {
        expect(out.opacity).toBeLessThan(0.00005);
        wraps++;
      }
      previousScale = out.scale;
    }
    expect(wraps).toBeGreaterThan(15);
    expect(other).toEqual(saved);
  });

  it('gives every animal both full feeding and head-up rest, on distinct schedules', () => {
    const schedules = [100, 101, 200, 300, 400, 401, 500].map((seed) => {
      const values = Array.from({ length: 600 }, (_, i) => creatureForageWeight(i / 5, seed));
      expect(Math.min(...values)).toBe(0);
      expect(Math.max(...values)).toBe(1);
      expect(values).toEqual(
        Array.from({ length: 600 }, (_, i) => creatureForageWeight(i / 5, seed))
      );
      return values.join(',');
    });
    expect(new Set(schedules).size).toBe(schedules.length);
  });

  it('separates brief head turns with still intervals rather than continuous swivelling', () => {
    const angles = Array.from({ length: 900 }, (_, i) => creaturePerchLook(i / 10, 601));
    expect(angles.filter((angle) => angle === 0).length).toBeGreaterThan(600);
    expect(Math.max(...angles.map(Math.abs))).toBeGreaterThan(0.3);
    expect(Math.max(...angles.map(Math.abs))).toBeLessThanOrEqual(0.4);
  });

  it('keeps swimmers in their existing pond lanes, with continuous stops for dabbling', () => {
    const anchors = [
      [2, 1],
      [-1, -2],
      [0, 2],
      [1.5, -1.5],
    ];
    const didSwim = new Set<number>();
    const didRest = new Set<number>();
    for (let frame = 0; frame < 7200; frame++) {
      const poses = anchors.map(([x, z], i) => {
        const pose = duckSwimPose(frame / 60, 800 + i);
        expect(Math.hypot(pose.x, pose.z)).toBeLessThanOrEqual(0.400001);
        // Delivered water has an inner bank at r=4.635; allow 0.4 m for each body.
        expect(Math.hypot(x + pose.x, z + pose.z) + 0.4).toBeLessThan(4.635);
        const next = duckSwimPose((frame + 1) / 60, 800 + i);
        expect(Math.hypot(next.x - pose.x, next.z - pose.z)).toBeLessThan(0.002);
        if (pose.swimming) didSwim.add(i);
        else didRest.add(i);
        return [x + pose.x, z + pose.z];
      });
      for (let i = 0; i < poses.length; i++)
        for (let j = i + 1; j < poses.length; j++)
          expect(Math.hypot(poses[i][0] - poses[j][0], poses[i][1] - poses[j][1])).toBeGreaterThan(
            0.8
          );
    }
    expect(didSwim.size).toBe(4);
    expect(didRest.size).toBe(4);
    for (let i = 0; i < 4; i++) expect(duckSwimPose(0, 800 + i)).toMatchObject({ x: 0, z: 0 });
  });
});

describe('quiet horse rest channels', () => {
  it('has an exact neutral reset, finite inputs and reusable output', () => {
    const out = createHorseRestPose();
    for (const time of [0, -1, NaN, Infinity]) {
      sampleHorseRest(4, 733, out);
      expect(sampleHorseRest(time, 733, out)).toBe(out);
      expect(out).toEqual(createHorseRestPose());
    }
    expect(Object.values(sampleHorseRest(4, NaN, out)).every(Number.isFinite)).toBe(true);
  });

  it('separates ears and tail with quiet dwells, bounded smooth motion and individual cadence', () => {
    const sequences = [500, 733].map((seed) => {
      const values = Array.from({ length: 3601 }, (_, i) => ({
        ...sampleHorseRest(i / 60, seed, createHorseRestPose()),
      }));
      for (const key of ['leftEar', 'rightEar', 'tail'] as const) {
        expect(values.filter((v) => v[key] === 0).length).toBeGreaterThan(3000);
        expect(Math.max(...values.map((v) => Math.abs(v[key])))).toBeGreaterThan(0.6);
      }
      expect(values.some((v) => v.leftEar > 0.8 && v.rightEar === 0)).toBe(true);
      expect(values.some((v) => v.rightEar > 0.8 && v.leftEar === 0)).toBe(true);
      for (let i = 1; i < values.length; i++)
        for (const key of ['breath', 'leftEar', 'rightEar', 'tail'] as const) {
          expect(Math.abs(values[i][key])).toBeLessThanOrEqual(1);
          expect(Math.abs(values[i][key] - values[i - 1][key])).toBeLessThan(0.075);
        }
      return values;
    });
    expect(sequences[0]).not.toEqual(sequences[1]);
  });

  it('samples the same pose regardless of display or owner throttle', () => {
    for (const fps of [15, 30, 60, 120]) {
      const out = createHorseRestPose();
      for (let i = 0; i <= 18 * fps; i++) sampleHorseRest(i / fps, 500, out);
      expect(out).toEqual(sampleHorseRest(18, 500, createHorseRestPose()));
    }
  });
});

describe('four-beat quadruped walk', () => {
  it.each(['cow', 'pig'] as const)(
    'matches %s stance travel, including instance scaling, and has four distinct return arcs',
    async (species) => {
      const { sampleHoofStep, QUADRUPED_WALK } = await import('../creatureMotion');
      const step = { forward: 0, lift: 0 },
        cycle = QUADRUPED_WALK[species].cycle;
      for (const scale of [0.96, 1, 1.04]) {
        const start = sampleHoofStep(species, 0, 0.3, step).forward;
        const worldTravel = 0.025 * scale;
        const phase = advanceCreatureStride(0.3, worldTravel / scale, (Math.PI * 2) / cycle);
        expect(sampleHoofStep(species, 0, phase, step).forward - start).toBeCloseTo(
          -worldTravel / scale,
          12
        );
      }
      const peaks = [];
      for (let leg = 0; leg < 4; leg++) {
        const samples = Array.from(
          { length: 400 },
          (_, i) => sampleHoofStep(species, leg, (i * Math.PI) / 200, step).lift
        );
        expect(samples.filter((v) => v === 0).length).toBeGreaterThan(270);
        expect(Math.max(...samples)).toBeCloseTo(QUADRUPED_WALK[species].lift, 5);
        peaks.push(samples.indexOf(Math.max(...samples)));
        const start = { ...sampleHoofStep(species, leg, 0, step) };
        expect(sampleHoofStep(species, leg, Math.PI * 2, step)).toEqual(start);
      }
      expect(new Set(peaks).size).toBe(4);
    }
  );
});

describe('independent quiet sheep attention', () => {
  it('has exact neutral reset and smooth, bounded, distinct ear dwells and breathing', () => {
    const schedules = [400, 401, 402, 403].map((seed) => {
      const out = createSheepRestPose();
      for (const time of [0, -1, NaN, Infinity]) {
        sampleSheepRest(8, seed, out);
        expect(sampleSheepRest(time, seed, out)).toBe(out);
        expect(out).toEqual(createSheepRestPose());
      }
      const values = Array.from({ length: 2401 }, (_, i) => ({
        ...sampleSheepRest(i / 60, seed, out),
      }));
      for (const key of ['leftEar', 'rightEar'] as const) {
        expect(values.filter((v) => v[key] === 0).length).toBeGreaterThan(2100);
        expect(Math.max(...values.map((v) => v[key]))).toBeGreaterThan(0.99);
      }
      expect(values.some((v) => v.leftEar > 0.8 && v.rightEar === 0)).toBe(true);
      expect(values.some((v) => v.rightEar > 0.8 && v.leftEar === 0)).toBe(true);
      let maxStep = 0,
        maxValue = 0;
      for (let i = 1; i < values.length; i++)
        for (const key of ['breath', 'leftEar', 'rightEar'] as const) {
          maxValue = Math.max(maxValue, Math.abs(values[i][key]));
          maxStep = Math.max(maxStep, Math.abs(values[i][key] - values[i - 1][key]));
        }
      expect(maxValue).toBeLessThanOrEqual(1);
      expect(maxStep).toBeLessThan(0.065);
      return values.map((v) => Object.values(v).join(',')).join(';');
    });
    expect(new Set(schedules).size).toBe(4);
    expect(
      Object.values(sampleSheepRest(4, NaN, createSheepRestPose())).every(Number.isFinite)
    ).toBe(true);
  });
  it('uses the same admitted time across rates, with a continuous initial breath and no accumulated phase', () => {
    for (const fps of [15, 30, 60, 120]) {
      const out = createSheepRestPose();
      for (let i = 0; i <= fps * 20; i++) sampleSheepRest(i / fps, 401, out);
      expect(out).toEqual(sampleSheepRest(20, 401, createSheepRestPose()));
    }
    expect(Math.abs(sampleSheepRest(0.00001, 400, createSheepRestPose()).breath)).toBeLessThan(
      1e-8
    );
  });
});
