import React, { useMemo } from 'react';
import {
  EffectComposer,
  Bloom,
  Vignette,
  ChromaticAberration,
  SSAO,
  Noise,
  ToneMapping,
  DepthOfField,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { Color } from 'three';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useTrebleLevel } from '../stores/audioAnalyzerStore';
import { useShallow } from 'zustand/react/shallow';

// SSAO color constant (dark blue-gray for contact shadows)
const SSAO_COLOR = new Color(0x1a1a2e);

export const PostProcessing: React.FC = () => {
  // Selective subscription - only re-render when these specific values change
  const graphics = useGraphicsStore(
    useShallow((state) => ({
      enableSSAO: state.graphics.enableSSAO,
      enableBloom: state.graphics.enableBloom,
      enableVignette: state.graphics.enableVignette,
      enableChromaticAberration: state.graphics.enableChromaticAberration,
      enableFilmGrain: state.graphics.enableFilmGrain,
      enableDepthOfField: state.graphics.enableDepthOfField,
      ssaoSamples: state.graphics.ssaoSamples,
      enableAudioReactive: state.graphics.enableAudioReactive,
    }))
  );
  const trebleLevel = useTrebleLevel();

  // Audio-reactive vignette darkness boost for alarm response
  // When treble is high (>0.5), darken screen edges as visual alert
  const vignetteDarkness = useMemo(() => {
    const baseDarkness = 0.4;
    if (!graphics.enableAudioReactive) return baseDarkness;
    // Treble above 0.5 triggers edge darkening (smooth ramp from 0.5 to 1.0)
    const trebleBoost = Math.max(0, (trebleLevel - 0.5) * 2) * 0.3;
    return baseDarkness + trebleBoost;
  }, [graphics.enableAudioReactive, trebleLevel]);

  // Check if any post-processing effects are enabled
  const hasAnyEffect =
    graphics.enableSSAO ||
    graphics.enableBloom ||
    graphics.enableVignette ||
    graphics.enableChromaticAberration ||
    graphics.enableFilmGrain ||
    graphics.enableDepthOfField;

  // If no effects are enabled, don't render the effect composer for performance
  if (!hasAnyEffect) {
    return null;
  }

  return (
    <EffectComposer enableNormalPass={graphics.enableSSAO}>
      <>
        {/* SSAO for contact shadows and depth in crevices */}
        {/* Tuned for more visible depth perception - Bruno Simon quality */}
        {graphics.enableSSAO && (
          <SSAO
            blendFunction={BlendFunction.MULTIPLY}
            samples={graphics.ssaoSamples}
            radius={0.2} // Was 0.15 - slightly larger radius
            intensity={2.0} // Was 1.5 - more visible
            luminanceInfluence={0.4} // Was 0.5 - less brightness dependency
            color={SSAO_COLOR}
            worldDistanceThreshold={40} // Was 50 - tighter falloff
            worldDistanceFalloff={5} // Was 8 - sharper falloff
            worldProximityThreshold={0.3} // Was 0.5
            worldProximityFalloff={0.15} // Was 0.2
          />
        )}

        {/* Depth of Field for subtle cinematic focus effect */}
        {/* Very subtle - barely perceptible blur at extreme distances */}
        {graphics.enableDepthOfField && (
          <DepthOfField
            focusDistance={0.02}
            focalLength={0.15} // Very wide = almost everything in focus
            bokehScale={0.2} // Extremely subtle blur
            height={480}
          />
        )}

        {/* Bloom for emissive lights and glow effects */}
        {/* Only affects very bright emissive surfaces (lights, indicators) - NOT pavement */}
        {graphics.enableBloom && (
          <Bloom
            intensity={0.25} // Subtle glow - was 0.6
            luminanceThreshold={0.9} // Only very bright surfaces - was 0.7
            luminanceSmoothing={0.95} // Smoother falloff
            mipmapBlur
          />
        )}

        {/* Film grain for industrial grittiness - DISABLED per user request */}
        {graphics.enableFilmGrain && (
          <Noise opacity={0.025} blendFunction={BlendFunction.OVERLAY} />
        )}

        {/* Linear tone mapping - ACES can cause brightness fluctuations with animated lights */}
        <ToneMapping mode={ToneMappingMode.LINEAR} />

        {/* Vignette for cinematic framing */}
        {/* Audio-reactive: treble spikes darken edges as alarm response */}
        {graphics.enableVignette && (
          <Vignette
            offset={0.4} // Was 0.3 - push edges in slightly more
            darkness={vignetteDarkness} // Dynamic: base 0.4 + treble boost
            blendFunction={BlendFunction.NORMAL}
          />
        )}

        {/* Chromatic aberration - DISABLED per user request */}
        {graphics.enableChromaticAberration && (
          <ChromaticAberration offset={[0.0005, 0.0005]} blendFunction={BlendFunction.NORMAL} />
        )}
      </>
    </EffectComposer>
  );
};
