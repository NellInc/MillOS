# Game interface components

This directory contains the focused simulation interface modules re-exported by
`src/components/GameFeatures.tsx`.

The notification system captions every line and speaks it with the on-device
PA voice (`src/audio/paVoice.ts`, D-025), and uses an autonomous plant corpus.
It reports production milestones, machine states, logistics sequencing, safety
interlocks, weather adaptation, and day or night facility state. No embodied
characters, workforce rankings, or host voice services are part of the runtime.

Key modules:

- `shared.tsx`: machine-only notice corpus, schedulers, event mappings, and the
  camera-feed context.
- `PAAnnouncementSystem.tsx`: priority-aware accessible caption presentation.
- `MiniMap.tsx`: factory, vehicle, and zone overview.
- `IncidentReplayControls.tsx`: historical event playback.
- `AchievementsPanel.tsx`: goal list, opened from the Overview panel's Quick
  Actions.

Announcements are state-driven and cooldown protected. Muting prevents their
creation, critical safety notices pre-empt routine notices, and reduced-motion
preferences remove ticker movement and pulse effects.
