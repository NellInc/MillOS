import { describe, expect, it } from 'vitest';
import { BrightnessContrastEffect } from 'postprocessing';
import { DisplayBrightnessContrastEffect } from './DisplayBrightnessContrast';
import { COLOR_GRADE, DISPLAY_TOE, DISPLAY_TOE_STRENGTH } from '../../constants/colorGrade';

describe('display brightness/contrast toe', () => {
  it('keeps the stock line and replaces only the output', () => {
    const stock = new BrightnessContrastEffect(COLOR_GRADE);
    const toe = new DisplayBrightnessContrastEffect(COLOR_GRADE);
    const source = toe.getFragmentShader();
    const stockSource = stock.getFragmentShader();
    const lineEnd = stockSource.indexOf('outputColor=');
    expect(
      source.startsWith(
        stockSource
          .slice(0, lineEnd)
          .replace(
            'uniform float contrast;',
            'uniform float contrast;uniform float toeKnee;uniform float toeStrength;'
          )
      )
    ).toBe(true);
    expect(source).toContain('graded=mix(graded,toe,below*clamp(toeStrength,0.0,1.0));');
    expect(source).not.toContain('outputColor=vec4(color+vec3(0.5),inputColor.a);');
    stock.dispose();
    toe.dispose();
  });

  it('keeps the encoded input, blend and uniform contracts, and shares the toggle', () => {
    const stock = new BrightnessContrastEffect(COLOR_GRADE);
    const toe = new DisplayBrightnessContrastEffect(COLOR_GRADE);
    expect(toe.inputColorSpace).toBe(stock.inputColorSpace);
    expect(toe.outputColorSpace).toBe(stock.outputColorSpace);
    expect(toe.blendMode.blendFunction).toBe(stock.blendMode.blendFunction);
    expect(toe.uniforms.get('contrast')?.value).toBe(COLOR_GRADE.contrast);
    expect(toe.uniforms.get('toeKnee')?.value).toBe(DISPLAY_TOE.knee);
    // One shared uniform object, so a single write toggles every instance.
    expect(toe.uniforms.get('toeStrength')).toBe(DISPLAY_TOE_STRENGTH);
    stock.dispose();
    toe.dispose();
  });
});
