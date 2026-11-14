# Game interface components

This directory contains the focused simulation interface modules re-exported by
`src/components/GameFeatures.tsx`.

The notification system captions every line and speaks it with the on-device
PA voice (`src/audio/paVoice.ts`, D-025). It speaks only problems and pertinent
updates (D-054): machine faults and recoveries, drills and emergency stops, the
end of a shift, a programme's orders all delivered (D11: the goal is the
running programme's committed tonnes, not a daily bag count) and the on-device
AI's incident notices.
Nothing is said on a timer, and a plant running as it should is not announced.
No embodied characters, workforce rankings, or host voice services are part of
the runtime.

Key modules:

- `shared.tsx`: the event-driven PA scheduler, its corpus (`shared.messages.ts`)
  and the camera-feed context.
- `PAAnnouncementSystem.tsx`: priority-aware accessible caption presentation.
- `MiniMap.tsx`: factory, vehicle, and zone overview.
- `IncidentReplayControls.tsx`: historical event playback.
- `AchievementsPanel.tsx`: goal list, opened from the Overview panel's Quick
  Actions.

Announcements are state-driven and cooldown protected. Muting prevents their
creation, critical safety notices pre-empt routine notices, and reduced-motion
preferences remove ticker movement and pulse effects.
