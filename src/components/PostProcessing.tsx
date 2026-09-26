import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  ChromaticAberration,
  DepthOfField,
  HueSaturation,
  N8AO,
  Noise,
  SMAA,
  ToneMapping,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
// `n8ao` ships no type declarations, so the pass is held through the
// `postprocessing` base class it extends. Only `.enabled` is touched here.
import type { Pass, VignetteEffect } from 'postprocessing';
import { useFrame } from '@react-three/fiber';
import { useShallow } from 'zustand/react/shallow';
import { useGraphicsStore, isPostProcessingActive } from '../stores/graphicsStore';
import { useAudioAnalyzerStore } from '../stores/audioAnalyzerStore';
import { SSAO_PALETTE_COLOR } from '../utils/digitalTwinPalette';
import { fulfilComposerCapture, setComposerCaptureAvailable } from '../utils/sceneCapture';
import {
  AMBIENT_OCCLUSION,
  AO_QUALITY_LEVELS,
  BLOOM,
  COLOR_GRADE,
  COMPOSER_MULTISAMPLING,
  VIGNETTE,
  aoQualityLevel,
  vignetteDarknessFor,
} from '../constants/colorGrade';

/**
 * Reads screenshot requests back from the composer's finished frame (see
 * `sceneCapture.ts`). Priority 2 runs after the composer's priority-1 render in
 * the same animation frame, while the drawing buffer still holds the graded
 * image. Mounted as the composer's NEXT sibling so that on unmount the
 * composer's effect cleanup restores `gl.toneMapping` before this cleanup
 * settles any pending request through the synchronous fallback render.
 */
function ComposerCaptureReader(): null {
  useEffect(() => {
    setComposerCaptureAvailable(true);
    return () => setComposerCaptureAvailable(false);
  }, []);
  useFrame(({ gl }) => fulfilComposerCapture(gl.domElement), 2);
  return null;
}

/**
 * Post-processing chain.
 *
 * PASS ORDER MATTERS AND IS NOT ALPHABETICAL:
 *
 *   1. N8AO           - a Pass, not an Effect, so JSX order IS pass order. It
 *                       must come first, before anything that writes colour.
 *   2. Depth of field - convolution, scene-referred.
 *   3. Bloom          - convolution, scene-referred, needs pre-tone-map values.
 *   4. Tone mapping   - the scene-referred to display-referred boundary.
 *   5. Grade          - brightness/contrast then saturation, display-referred.
 *   6. Vignette       - framing, display-referred.
 *   7. Chromatic ab.  - lens artefact, display-referred.
 *   8. Film grain     - sits on top of the finished image.
 *   9. SMAA           - last, so it anti-aliases the image the viewer sees.
 *
 * WHY THE CHILD LIST IS MEMOISED: R3F's `EffectComposer` lists `children` in
 * the dependency array of the `useLayoutEffect` that builds its passes. Any
 * re-render of this component produces a new children element identity, which
 * makes that effect call `composer.removePass(...)` for every pass and
 * construct a fresh `EffectPass` for each. `removePass` takes no dispose
 * argument and never disposes the `EffectMaterial`, so a component that
 * re-renders at animation rate churns allocations and leaks GL materials.
 * Measured on this scene before the fix: 358 EffectPass constructions in 15
 * seconds. The memo must therefore depend ONLY on the boolean toggles and
 * numeric knobs - and it must list every one of them, because a key left out
 * of the deps is a Settings switch that silently stops working.
 */
export const PostProcessing: React.FC = () => {
  // Selective subscription - only re-render when these specific values change.
  // Deliberately does NOT subscribe to the audio analyzer: that store is
  // written 30 times a second and would defeat the memo above.
  const graphics = useGraphicsStore(
    useShallow((state) => ({
      enableAmbientOcclusion: state.graphics.enableAmbientOcclusion,
      enableBloom: state.graphics.enableBloom,
      enableVignette: state.graphics.enableVignette,
      enableChromaticAberration: state.graphics.enableChromaticAberration,
      enableFilmGrain: state.graphics.enableFilmGrain,
      enableDepthOfField: state.graphics.enableDepthOfField,
      enableColorGrade: state.graphics.enableColorGrade,
      enableSMAA: state.graphics.enableSMAA,
      toneMappingMode: state.graphics.toneMappingMode,
      aoQuality: state.graphics.aoQuality,
      enableAudioReactive: state.graphics.enableAudioReactive,
    }))
  );

  // --- Audio-reactive vignette -------------------------------------------
  // The alarm response writes the uniform directly through a ref. Routing it
  // through React state instead would re-render this component at the
  // analyzer's 30 Hz and rebuild every pass on every tick.
  const vignetteRef = useRef<VignetteEffect | null>(null);
  // A CALLBACK ref, not an object ref, on purpose: the `wrapEffect` wrapper
  // memoises the effect's constructor `args` on `JSON.stringify(props)`, and
  // `JSON.stringify` omits functions but would hit a circular structure on a
  // populated `{ current: VignetteEffect }`.
  const setVignetteRef = useCallback((effect: VignetteEffect | null) => {
    vignetteRef.current = effect;
  }, []);

  const { enableVignette, enableAudioReactive } = graphics;
  useEffect(() => {
    const apply = (trebleLevel: number): void => {
      const vignette = vignetteRef.current;
      if (!vignette) return;
      vignette.darkness = vignetteDarknessFor(trebleLevel, enableAudioReactive);
    };

    apply(useAudioAnalyzerStore.getState().trebleLevel);
    if (!enableVignette || !enableAudioReactive) return;

    // `audioAnalyzerStore` is a plain `create(...)` with no
    // `subscribeWithSelector` middleware, so selector-subscribe is unavailable
    // and the equality check has to be manual.
    return useAudioAnalyzerStore.subscribe((state, previous) => {
      if (state.trebleLevel === previous.trebleLevel) return;
      apply(state.trebleLevel);
    });
  }, [enableVignette, enableAudioReactive]);

  // --- Ambient occlusion --------------------------------------------------
  // The R3F N8AO wrapper carries an upstream note that the effect has memory
  // leaks without a dispose implementation, so the pass is constructed at most
  // once per composer lifetime. Mounting is latched: once AO has been on, the
  // pass stays in the tree and the user's switch drives `pass.enabled` through
  // a ref instead of unmounting it. `postprocessing` skips disabled passes, so
  // an off pass costs nothing per frame.
  const n8aoRef = useRef<Pass | null>(null);
  const [aoMounted, setAoMounted] = useState(graphics.enableAmbientOcclusion);
  useEffect(() => {
    if (graphics.enableAmbientOcclusion) setAoMounted(true);
  }, [graphics.enableAmbientOcclusion]);
  useEffect(() => {
    if (n8aoRef.current) n8aoRef.current.enabled = graphics.enableAmbientOcclusion;
  }, [graphics.enableAmbientOcclusion, aoMounted]);

  const aoQuality = aoQualityLevel(graphics.aoQuality);
  // Half resolution below the top AO step. Derived from the numeric knob rather
  // than from `quality` so the tier string is not an extra subscription.
  const aoHalfRes = graphics.aoQuality < AO_QUALITY_LEVELS.length - 1;

  const children = useMemo(
    () => (
      <>
        {/* N8AO is a Pass. It needs no NormalPass and no second scene render:
            `N8AOPostPass` sets `needsDepthTexture`, and `EffectComposer.addPass`
            wires the RenderPass depth in response. (Not to be confused with the
            standalone `N8AOPass`, which defaults `autoRenderBeauty: true` and
            does re-render the scene.)
            `gammaCorrection` is deliberately never passed: `autosetGamma`
            derives it from `renderToScreen`, and assigning it permanently
            disables that. */}
        {aoMounted && (
          <N8AO
            ref={n8aoRef}
            aoRadius={AMBIENT_OCCLUSION.aoRadius}
            distanceFalloff={AMBIENT_OCCLUSION.distanceFalloff}
            intensity={AMBIENT_OCCLUSION.intensity}
            color={SSAO_PALETTE_COLOR}
            quality={aoQuality}
            halfRes={aoHalfRes}
            depthAwareUpsampling={aoHalfRes}
          />
        )}

        {/* Cinematic focus, opt-in at every tier. */}
        {graphics.enableDepthOfField && (
          <DepthOfField
            focusDistance={0.02}
            focalLength={0.15} // Very wide = almost everything in focus
            bokehScale={0.2} // Extremely subtle blur
            height={480}
          />
        )}

        {/* SCREEN, not the ADD that the R3F wrapper substitutes for
            `BloomEffect`'s own default: ADD stacks linearly onto already-bright
            pixels and blows them out. */}
        {graphics.enableBloom && (
          <Bloom
            blendFunction={BlendFunction.SCREEN}
            mipmapBlur
            intensity={BLOOM.intensity}
            radius={BLOOM.radius}
            levels={BLOOM.levels}
            luminanceThreshold={BLOOM.luminanceThreshold}
            luminanceSmoothing={BLOOM.luminanceSmoothing}
          />
        )}

        {/* THE scene-referred to display-referred boundary. Present on every
            composer tier so an adaptive quality change never moves the curve.
            While the composer is mounted it forces `gl.toneMapping` to
            NoToneMapping, so this pass is the only tone curve in the frame. */}
        <ToneMapping mode={graphics.toneMappingMode} />

        {/* Both non-convolution, so the composer merges them into the same
            EffectPass as the tone mapping - effectively free. */}
        {graphics.enableColorGrade && (
          <BrightnessContrast brightness={COLOR_GRADE.brightness} contrast={COLOR_GRADE.contrast} />
        )}
        {graphics.enableColorGrade && (
          <HueSaturation hue={COLOR_GRADE.hue} saturation={COLOR_GRADE.saturation} />
        )}

        {/* `darkness` is the mount-time value only; the audio response writes
            the uniform through `setVignetteRef` above. Passing a changing
            `darkness` prop would change `JSON.stringify(props)` and make the
            wrapper construct a new VignetteEffect on every frame. */}
        {graphics.enableVignette && (
          <Vignette
            ref={setVignetteRef}
            offset={VIGNETTE.offset}
            darkness={VIGNETTE.darkness}
            blendFunction={BlendFunction.NORMAL}
          />
        )}

        {graphics.enableChromaticAberration && (
          <ChromaticAberration offset={[0.0005, 0.0005]} blendFunction={BlendFunction.NORMAL} />
        )}

        {graphics.enableFilmGrain && (
          <Noise opacity={0.025} blendFunction={BlendFunction.OVERLAY} />
        )}

        {/* Last, so it operates on the tone-mapped image. The composer renders
            to its own HalfFloat target, which makes the canvas `antialias`
            context attribute inert - without this the composer tiers would ship
            with no anti-aliasing at all. */}
        {graphics.enableSMAA && <SMAA />}
      </>
    ),
    [
      aoMounted,
      aoQuality,
      aoHalfRes,
      graphics.enableDepthOfField,
      graphics.enableBloom,
      graphics.toneMappingMode,
      graphics.enableColorGrade,
      graphics.enableVignette,
      graphics.enableChromaticAberration,
      graphics.enableFilmGrain,
      graphics.enableSMAA,
      setVignetteRef,
    ]
  );

  // Must agree exactly with the `postProcessingEnabled` derivation in
  // MillScene: if MillScene mounts this component and this returns null, the
  // renderer keeps its own tone mapping and the entire grade silently vanishes.
  if (!isPostProcessingActive(graphics)) {
    return null;
  }

  return (
    // `enableNormalPass` stays false. The old SSAO mounted it, which re-rendered
    // the whole scene with a normal material - a second full draw-call
    // submission. N8AO needs only depth.
    // `multisampling` is set explicitly: the R3F default of 8 costs roughly
    // 132 MB of MSAA storage at 1920x1080 plus a per-frame resolve.
    <>
      <EffectComposer enableNormalPass={false} multisampling={COMPOSER_MULTISAMPLING}>
        {children}
      </EffectComposer>
      <ComposerCaptureReader />
    </>
  );
};
