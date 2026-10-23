import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BrightnessContrastEffect } from 'postprocessing';
import {
  COLOR_GRADE,
  DISPLAY_TOE,
  composerDisplayLevels,
  gradeContrast,
  neutralToneMap,
  nightToeStrength,
  rendererDisplayLevels,
  srgbEncode,
} from '../colorGrade';
import { sampleAtmosphere } from '../../simulation/atmosphere';

/**
 * A neutral surface lit only by the night fill, scene-linear, before exposure.
 * The milling barrier's foot and the mill base-plate fronts at med-22.
 */
const NIGHT_FILL_ONLY = 0.02;

describe('display mirror is locked to the shaders it mirrors', () => {
  it("mirrors three's NeutralToneMapping source", () => {
    const source = THREE.ShaderChunk.tonemapping_pars_fragment;
    expect(source).toContain('const float StartCompression = 0.8 - 0.04;');
    expect(source).toContain('const float Desaturation = 0.15;');
    expect(source).toContain('float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;');
    expect(source).toContain('float newPeak = 1. - d * d / ( peak + d - StartCompression );');
    // Spot values computed by hand from the shader text.
    const [r] = neutralToneMap([0.05, 0.05, 0.05], 1);
    expect(r).toBeCloseTo(6.25 * 0.05 * 0.05, 10);
    const [hi] = neutralToneMap([0.5, 0.5, 0.5], 1);
    expect(hi).toBeCloseTo(0.46, 10);
  });

  it("mirrors postprocessing's stock brightness/contrast line at toe strength 0", () => {
    const stock = new BrightnessContrastEffect();
    expect(stock.getFragmentShader()).toContain(
      'vec3 color=inputColor.rgb+vec3(brightness-0.5);if(contrast>0.0){color/=vec3(1.0-contrast);}'
    );
    stock.dispose();
    for (const c of [0, 0.01, 0.03, 0.1, 0.5, 0.9]) {
      expect(gradeContrast(c, 0)).toBeCloseTo((c - 0.5) / (1 - COLOR_GRADE.contrast) + 0.5, 12);
    }
  });
});

describe('the grade does not clip night fill to void', () => {
  it('stock contrast clips a fill-only neutral to black (the defect)', () => {
    expect(composerDisplayLevels([NIGHT_FILL_ONLY, NIGHT_FILL_ONLY, NIGHT_FILL_ONLY], 0)).toEqual([
      1, 1, 1,
    ]);
  });

  it('maps a fill-only neutral at night to at least 3/255 on the composer tiers', () => {
    for (const level of composerDisplayLevels([
      NIGHT_FILL_ONLY,
      NIGHT_FILL_ONLY,
      NIGHT_FILL_ONLY,
    ])) {
      expect(level).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps true black black and never lifts above the no-contrast encoding', () => {
    expect(gradeContrast(0)).toBe(0);
    for (let c = 0; c < DISPLAY_TOE.knee; c += 0.002) {
      expect(gradeContrast(c)).toBeLessThanOrEqual(c + 1e-12);
    }
  });

  it('is continuous, monotonic and identical to stock above the knee', () => {
    let previous = -Infinity;
    for (let c = 0; c <= 1; c += 0.001) {
      const value = gradeContrast(c, 1);
      expect(value).toBeGreaterThanOrEqual(previous);
      previous = value;
      if (c >= DISPLAY_TOE.knee) expect(value).toBe(gradeContrast(c, 0));
    }
    const k = DISPLAY_TOE.knee;
    expect(gradeContrast(k - 1e-9, 1)).toBeCloseTo(gradeContrast(k, 0), 6);
  });

  it('leaves every display level from the knee up unchanged', () => {
    for (let x = 0; x <= 2; x += 0.0005) {
      const encoded = srgbEncode(neutralToneMap([x, x, x])[0]);
      if (encoded < DISPLAY_TOE.knee) continue;
      expect(composerDisplayLevels([x, x, x], 1)).toEqual(composerDisplayLevels([x, x, x], 0));
    }
  });

  it('the knee keeps the toe slope at black non-negative', () => {
    const gain = 1 / (1 - COLOR_GRADE.contrast);
    const lift = (COLOR_GRADE.brightness - 0.5) * gain + 0.5;
    expect(DISPLAY_TOE.knee).toBeGreaterThanOrEqual((-2 * lift) / gain);
  });

  it('the low tier, which has no contrast, does not clip the same value', () => {
    expect(
      rendererDisplayLevels([NIGHT_FILL_ONLY, NIGHT_FILL_ONLY, NIGHT_FILL_ONLY])[0]
    ).toBeGreaterThanOrEqual(3);
  });
});

/**
 * The conveyor's west side at 22:00, read scene-referred on the live page
 * (LINEAR tone mapping, no grade): sRGB (13.4, 15.8, 19.9) at exposure 1.02.
 * A face lit only by the night fill, faintly cool.
 */
const CONVEYOR_FILL_ONLY = [0.004, 0.0048, 0.0067];
/** The same light on neutral paint, now that the night fill is neutralised. */
const NEUTRAL_FILL_ONLY = [0.006, 0.006, 0.006];
/** FLOUR EXPRESS maroon at noon: one bright channel, two deep ones. */
const MAROON = [0.2, 0.012, 0.01];

/** Stock display, independent of the toe code: Neutral, sRGB, the stock line. */
function stockLevels(linear: readonly number[]): number[] {
  const gain = 1 / (1 - COLOR_GRADE.contrast);
  return neutralToneMap(linear, undefined, 0).map((v) =>
    Math.round(255 * Math.min(1, Math.max(0, (srgbEncode(v) - 0.5) * gain + 0.5)))
  );
}

describe('fill-only faces at night read as dark, legible, hue-kept surfaces', () => {
  it('composer: the conveyor side lands at 8-15/255 on its brightest channel, still cool', () => {
    const [r, g, b] = composerDisplayLevels(CONVEYOR_FILL_ONLY, 1);
    expect(b).toBeGreaterThanOrEqual(8);
    expect(b).toBeLessThanOrEqual(15);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('composer and low agree on a neutral fill-only face, both off the void', () => {
    // A hypothetical value ("the same light on neutral paint"), unlike the
    // conveyor, which was read live. Round 5 pinned it at 8/255; that lift
    // flattened the pallet stacks at med-22 (see the local-contrast tests
    // below), so it is pinned to the same 3/255 floor as the base plates:
    // stock clips it to 0.
    const composer = composerDisplayLevels(NEUTRAL_FILL_ONLY, 1);
    const low = rendererDisplayLevels(NEUTRAL_FILL_ONLY);
    expect(stockLevels(NEUTRAL_FILL_ONLY)).toEqual([0, 0, 0]);
    expect(Math.max(...composer)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...low)).toBeGreaterThanOrEqual(3);
    expect(Math.abs(composer[0] - low[0])).toBeLessThanOrEqual(3);
  });

  /**
   * Round 5's lift (amount 0.65) was nearly flat across scene 0.01-0.025: a
   * slat at 0.012 and a face at 0.02 both displayed at 10/255, and the pallet
   * stacks at med-22 read as flat brown blocks (lc-pallets2, sh-pallets). The
   * lift may raise the dark end, but it must keep local contrast: the grey
   * curve's elasticity d(log out)/d(log in) is 1 for a pure gain, and 0 is a
   * plateau.
   */
  it('keeps local contrast through the lift: grey elasticity stays at or above 0.5', () => {
    const grey = (x: number) => neutralToneMap([x, x, x], 1, 1)[0];
    for (let x = 0.002; x < DISPLAY_TOE.liftCeiling; x += 0.0005) {
      const h = x * 1e-3;
      const elasticity = (Math.log(grey(x + h)) - Math.log(grey(x - h))) / (2 * h / x);
      expect(elasticity, `x ${x.toFixed(4)}`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('two fill-lit faces with 40% less light on one stay at least two levels apart', () => {
    for (const [dim, lit] of [
      [0.012, 0.02],
      [0.006, 0.01],
    ]) {
      const a = composerDisplayLevels([dim, dim, dim], 1)[0];
      const b = composerDisplayLevels([lit, lit, lit], 1)[0];
      expect(b - a, `${dim} vs ${lit}`).toBeGreaterThanOrEqual(2);
    }
  });

  it('low: the conveyor side keeps its hue and reaches roughly 8-15/255', () => {
    // Low has no contrast toe after the curve, so it sits a few levels above
    // the composer on the same face.
    const [r, g, b] = rendererDisplayLevels(CONVEYOR_FILL_ONLY);
    expect(b).toBeGreaterThanOrEqual(8);
    expect(b).toBeLessThanOrEqual(18);
    expect(b).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(r);
  });

  it('the night stays dark: nothing above the lift ceiling moves on either tier', () => {
    for (let x = 0.035; x <= 2; x += 0.005) {
      expect(rendererDisplayLevels([x, x, x])[0]).toBe(
        neutralToneMap([x, x, x], undefined, 0).map((v) => Math.round(255 * srgbEncode(v)))[0]
      );
    }
  });

  it('the lift stays inside its monotonic bound', () => {
    // Grey output 6.25x^2 + a x (1 - x/c)^2 has a non-negative slope iff
    // a <= 12.5 c / (4 - sqrt(12)).
    expect(DISPLAY_TOE.liftAmount).toBeLessThanOrEqual(
      (12.5 * DISPLAY_TOE.liftCeiling) / (4 - Math.sqrt(12))
    );
  });

  it('the lifted grey toe is monotonic', () => {
    let previous = -Infinity;
    for (let x = 0; x <= 0.1; x += 0.0002) {
      const [y] = neutralToneMap([x, x, x]);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
  });
});

describe('noon is exactly the stock image', () => {
  it('the toe strength is zero in daylight and full at night', () => {
    expect(nightToeStrength(1)).toBe(0);
    expect(nightToeStrength(0.5)).toBe(0);
    expect(nightToeStrength(0)).toBe(1);
    expect(nightToeStrength(Number.NaN)).toBe(0);
  });

  it('the simulated clock gives strength 0 from dawn to dusk and 1 at 22:00', () => {
    for (const hour of [6.5, 9, 12, 15, 17.5]) {
      expect(nightToeStrength(sampleAtmosphere(1, hour, 'clear').daylight)).toBe(0);
    }
    expect(nightToeStrength(sampleAtmosphere(1, 22, 'clear').daylight)).toBe(1);
  });

  it('at strength 0 every composer level equals the stock pipeline', () => {
    for (const x of [0, 0.002, 0.006, 0.01, 0.02, 0.05, 0.2, 0.8]) {
      for (const colour of [[x, x, x], [x, x * 0.1, x * 0.05], CONVEYOR_FILL_ONLY, MAROON]) {
        expect(composerDisplayLevels(colour, 0)).toEqual(stockLevels(colour));
      }
    }
  });

  it('a saturated colour with one bright channel is untouched even at full strength', () => {
    expect(composerDisplayLevels(MAROON, 1)).toEqual(stockLevels(MAROON));
  });
});
