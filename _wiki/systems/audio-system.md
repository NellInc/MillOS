# Audio System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-08-13 -->
<!-- wiki:status = active -->

## Summary

`src/utils/audioManager.ts` owns the Web Audio graph, music, machine and ambient
sound, announcements, alarms, user settings, and cleanup. Event producers live
in simulation stores and components. Reactive analysis is optional and feeds
the post-processing vignette rather than a retired ambient-details component.

## Reactive path

`src/components/AudioReactiveProvider.tsx` runs
`src/hooks/useAudioReactive.ts` when the graphics setting is enabled. The hook
updates `src/stores/audioAnalyzerStore.ts`. `src/components/PostProcessing.tsx`
reads the analyzed treble level for a bounded vignette response.

`src/components/SpatialAudioTracker.tsx` maintains listener and source position
for spatial sound. `src/hooks/useAudioState.ts` exposes narrow reactive audio
state to the UI.

## Accessibility and rights

Muted state is checked at producers, effects, and render surfaces where timing
matters. PA captions and live regions remain available independently of visible
tickers. Music attribution is defined by `music-credits.json`, emitted to
`public/MUSIC_CREDITS.txt`, and checked by `scripts/validate-credits.mjs`.
Repository attribution proves internal consistency only; listening acceptance
and independent rights clearance remain separate gates.

## Provenance

- Sources: `src/utils/audioManager.ts`, `src/hooks/useAudioReactive.ts`,
  `src/hooks/useAudioState.ts`, `src/stores/audioAnalyzerStore.ts`,
  `src/components/PostProcessing.tsx`, `music-credits.json`
- Last verified: 2026-08-13

## See Also

- [[millos:systems/graphics-rendering]]
- [[millos:systems/game-simulation]]
