import { ToneMappingEffect, ToneMappingMode } from 'postprocessing';
import { wrapEffect } from '@react-three/postprocessing';
import { DISPLAY_TOE_STRENGTH } from '../../constants/colorGrade';

/** Stock define value for NEUTRAL, checked so a library change is loud. */
const STOCK_NEUTRAL = 'NeutralToneMapping(texel)';
/** `LiftedNeutralToneMapping` comes from the installed chunk (displayToeToneMapping.ts). */
export const LIFTED_NEUTRAL = 'LiftedNeutralToneMapping(texel,toeStrength)';

/**
 * The composer's tone mapping with the night toe's dark-pixel lift. In NEUTRAL
 * mode the effect calls the lifted operator at the shared
 * `DISPLAY_TOE_STRENGTH` uniform (`nightToeStrength`, exactly 0 by day, so the
 * day image is stock Neutral bit for bit). Every other mode is untouched, which
 * keeps the LINEAR diagnostic (`setDisplayDiagnostics`) scene-referred.
 * `postprocessing` prefixes the uniform name inside the define value, as it
 * does inside the shader text.
 * Working if night fill-only faces read a few levels above void, hue kept,
 * while a med-12 paired control changes no pixel.
 */
export class DisplayToneMappingEffect extends ToneMappingEffect {
  constructor(options?: ConstructorParameters<typeof ToneMappingEffect>[0]) {
    super(options);
    this.uniforms.set('toeStrength', DISPLAY_TOE_STRENGTH);
    this.liftNeutral();
  }

  override get mode(): ToneMappingMode {
    return super.mode;
  }

  override set mode(value: ToneMappingMode) {
    super.mode = value;
    this.liftNeutral();
  }

  private liftNeutral(): void {
    if (this.defines.get('toneMapping(texel)') !== STOCK_NEUTRAL) return;
    this.defines.set('toneMapping(texel)', LIFTED_NEUTRAL);
    this.setChanged();
  }
}

export const DisplayToneMapping = wrapEffect(DisplayToneMappingEffect);
