import { HueSaturationEffect } from 'postprocessing';
import { wrapEffect } from '@react-three/postprocessing';

/**
 * Keep the authored grade inside its display gamut before the next transfer.
 * Stock saturation caps only the upper bound. Dark saturated leaves can become
 * negative, and the fractional pow in the sRGB transfer then produces NaNs.
 * Working if the actual dusk foliage stays green with every grade effect on.
 */
export class DisplayHueSaturationEffect extends HueSaturationEffect {
  constructor(options?: ConstructorParameters<typeof HueSaturationEffect>[0]) {
    super(options);
    const source = this.getFragmentShader();
    const output = 'vec4(min(color,1.0),inputColor.a)';
    if (source.split(output).length !== 2) {
      throw new Error('Postprocessing saturation output changed; review display gamut protection.');
    }
    this.setFragmentShader(source.replace(output, 'vec4(clamp(color,0.0,1.0),inputColor.a)'));
  }
}

export const DisplayHueSaturation = wrapEffect(DisplayHueSaturationEffect);
