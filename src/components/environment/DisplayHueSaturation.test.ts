import { describe, expect, it } from 'vitest';
import { BlendFunction, HueSaturationEffect } from 'postprocessing';
import { DisplayHueSaturationEffect } from './DisplayHueSaturation';

describe('display saturation gamut', () => {
  it('bounds the actual pinned shader output and leaves the rest of the equations unchanged', () => {
    const stock = new HueSaturationEffect();
    const guarded = new DisplayHueSaturationEffect();
    expect(guarded.getFragmentShader()).toContain('vec4(clamp(color,0.0,1.0),inputColor.a)');
    expect(guarded.getFragmentShader().replace('clamp(color,0.0,1.0)', 'min(color,1.0)')).toBe(
      stock.getFragmentShader()
    );
    stock.dispose();
    guarded.dispose();
  });

  it('retains the existing hue, saturation, blending and mutable uniform contracts', () => {
    const options = { hue: 0, saturation: 0.07, blendFunction: BlendFunction.SRC };
    const stock = new HueSaturationEffect(options);
    const guarded = new DisplayHueSaturationEffect(options);
    expect(guarded.blendMode.blendFunction).toBe(stock.blendMode.blendFunction);
    expect(guarded.uniforms.get('hue')?.value.toArray()).toEqual(
      stock.uniforms.get('hue')?.value.toArray()
    );
    expect(guarded.inputColorSpace).toBe(stock.inputColorSpace);
    expect(guarded.outputColorSpace).toBe(stock.outputColorSpace);
    const uniform = guarded.uniforms.get('saturation');
    guarded.saturation = 0.12;
    expect(guarded.uniforms.get('saturation')).toBe(uniform);
    expect(uniform?.value).toBe(0.12);
    stock.dispose();
    guarded.dispose();
  });
});
