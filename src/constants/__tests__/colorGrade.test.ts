import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BrightnessContrastEffect } from 'postprocessing';
import {
  COLOR_GRADE,
  DISPLAY_TOE,
  composerDisplayLevels,
  gradeContrast,
  neutralToneMap,
  rendererDisplayLevels,
  srgbEncode,
} from '../colorGrade';

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
