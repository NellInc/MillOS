# Audio System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

MillOS uses a Zustand-backed audio analysis store (`audioAnalyzerStore.ts`) plus an `AudioReactiveProvider` component that drives visual effects based on audio input. The system feeds real-time frequency data into the 3D scene for dynamic ambient effects. (src/stores/audioAnalyzerStore.ts; src/components/AudioReactiveProvider.tsx)

## Components

`src/components/AudioReactiveProvider.tsx` — top-level audio context provider. Wraps scene content; provides audio analysis data to child components via context or store. Likely uses Web Audio API `AnalyserNode` for frequency data.

`src/stores/audioAnalyzerStore.ts` — Zustand store tracking audio state. Exposes frequency/amplitude data to the store layer for reactive scene updates (ambient details, effects, etc.).

## Audio-Reactive Visuals

`src/components/AmbientDetails.tsx` — ambient detail component driven by audio data. `src/components/SpatialAudioTracker.tsx` — 3D spatial audio positioning system, maps audio sources to 3D positions in the scene.

`src/stores/audioAnalyzerStore.ts` has a `__tests__/` subdirectory — the audio store is unit-tested.

## Integration with Scene

The audio system feeds into particle effects, ambient lighting, and ambient detail animation. This creates a responsive factory environment where machine noise or music influences visual atmosphere.

## Provenance

- Sources: `src/stores/audioAnalyzerStore.ts` (file name + store index), `src/components/AudioReactiveProvider.tsx` (file name), `src/components/SpatialAudioTracker.tsx` (file name), `src/components/AmbientDetails.tsx` (file name)
- Last verified: 2026-05-23

## See Also

- [[millos:systems/graphics-rendering]] — visual system the audio feeds into
- [[millos:systems/scene-zones]] — 3D scene structure where spatial audio positions sources
