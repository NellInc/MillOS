# Skybox Freeze Fix

**Date:** 2025-12-28
**Issue:** Sky/skybox stuck at initial color when `perfDebug.disableEnvironment` is true

## Problem

The sky color would freeze because `GameTimeTicker` was inside `FactoryEnvironment`, which is conditionally rendered. When disabled for performance debugging, game time stopped advancing.

## Solution

Created `CoreGameTimeSystem` - an always-on game time ticker that runs independently of `FactoryEnvironment`.

### Architecture

```
CoreGameTimeSystem (always mounted in MillScene.tsx:765)
├── CoreGameTimeAnimationManager
│   └── useFrame loop that only handles gameTimeRegistry
│   └── Does NOT call incrementGlobalFrame() (avoids double-increment)
└── CoreGameTimeTicker
    └── Registers with 'core' key
    └── Ticks game time + production metrics

FactoryEnvironment (conditionally mounted based on disableEnvironment)
├── EnvironmentAnimationManager
│   └── Handles visual effects (lens flares, power flicker, lighting)
│   └── Calls incrementGlobalFrame() for throttling
│   └── Does NOT iterate gameTimeRegistry (avoids double-tick)
└── OrphanedStoresTicker (formerly GameTimeTicker)
    └── setInterval-based ticking for supplemental stores
    └── BAS history (10s), breakdowns (5s), emergent cooperation (3s)
```

## Files Changed

| File | Change |
|------|--------|
| `src/components/Environment.tsx` | Added `CoreGameTimeSystem`, renamed `GameTimeTicker` to `OrphanedStoresTicker`, removed game time handling from `EnvironmentAnimationManager` |
| `src/components/MillScene.tsx` | Import and mount `CoreGameTimeSystem` unconditionally |
| `docs/sky-time-cycle-investigation.md` | Updated with fix details |

## Verification

1. Build passes: `npm run build`
2. Game time advances even with `disableEnvironment: true`
3. No double-ticking when both systems are mounted
4. Frame throttling works correctly (single `incrementGlobalFrame` call)

## Related Documentation

- `docs/sky-time-cycle-investigation.md` - Original investigation and fix details
