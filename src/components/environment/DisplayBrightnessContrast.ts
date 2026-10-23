import * as THREE from 'three';
import { BrightnessContrastEffect } from 'postprocessing';
import { wrapEffect } from '@react-three/postprocessing';
import { DISPLAY_TOE, DISPLAY_TOE_STRENGTH } from '../../constants/colorGrade';

const STOCK_HEAD = 'uniform float brightness;uniform float contrast;';
const STOCK_OUTPUT = 'outputColor=vec4(color+vec3(0.5),inputColor.a);';

/**
 * Brightness/contrast whose black does not clip. See `DISPLAY_TOE` in
 * `colorGrade.ts` for why, and `gradeContrast` there for the TypeScript mirror
 * of the expression below. Above the knee this is the stock line exactly; below
 * it, the cubic that leaves black at slope 1 and meets the line with the same
 * value and slope at the knee, faded out by the pixel's brightest encoded
 * channel between knee/2 and knee (a saturated colour's deep channels keep the
 * line) and scaled by `toeStrength` (`nightToeStrength`, 0 by day). Only
 * engaged when the line's own black (`lift`) is below zero, the only case
 * where it clips.
 * Working if night fill-only faces read above 0 while midday is unchanged.
 */
export class DisplayBrightnessContrastEffect extends BrightnessContrastEffect {
  constructor(options?: ConstructorParameters<typeof BrightnessContrastEffect>[0]) {
    super(options);
    const source = this.getFragmentShader();
    if (source.split(STOCK_OUTPUT).length !== 2 || source.split(STOCK_HEAD).length !== 2) {
      throw new Error('Postprocessing brightness/contrast output changed; review the display toe.');
    }
    this.uniforms.set('toeKnee', new THREE.Uniform(DISPLAY_TOE.knee));
    this.uniforms.set('toeStrength', DISPLAY_TOE_STRENGTH);
    this.setFragmentShader(
      source
        .replace(STOCK_HEAD, `${STOCK_HEAD}uniform float toeKnee;uniform float toeStrength;`)
        .replace(
          STOCK_OUTPUT,
          'vec3 graded=color+vec3(0.5);' +
            'float gain=contrast>0.0?1.0/(1.0-contrast):1.0+contrast;' +
            'float lift=(brightness-0.5)*gain+0.5;' +
            'float toeWeight=clamp(toeStrength,0.0,1.0);' +
            'if(lift<0.0&&toeWeight>0.0){' +
            'vec3 c=max(inputColor.rgb,vec3(0.0));' +
            'float k=toeKnee;' +
            'float delta=k*gain+lift-k;' +
            'float slope=gain-1.0;' +
            'float b=(3.0*delta-slope*k)/(k*k);' +
            'float d=(slope*k-2.0*delta)/(k*k*k);' +
            'vec3 toe=c+b*c*c+d*c*c*c;' +
            'float peak=max(inputColor.r,max(inputColor.g,inputColor.b));' +
            'float t=clamp((peak-0.5*k)/(0.5*k),0.0,1.0);' +
            'toeWeight*=1.0-t*t*(3.0-2.0*t);' +
            'vec3 below=vec3(lessThan(inputColor.rgb,vec3(k)));' +
            'graded=mix(graded,toe,below*toeWeight);' +
            '}' +
            'outputColor=vec4(graded,inputColor.a);'
        )
    );
  }
}

export const DisplayBrightnessContrast = wrapEffect(DisplayBrightnessContrastEffect);
