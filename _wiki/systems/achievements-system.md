# Achievements System

<!-- wiki:type = system -->
<!-- wiki:scope = millos -->
<!-- wiki:created = 2026-05-23 -->
<!-- wiki:updated = 2026-05-23 -->
<!-- wiki:status = active -->

## Summary

`achievementsStore.ts` (extracted from `productionStore` for separation of concerns) manages a named achievement registry with per-achievement progress tracking. Five categories reflect the game's core values: production, safety, efficiency, bilateral alignment, and social mission.

## Achievement Structure (`src/stores/achievementsStore.ts:8–29`)

Each `Achievement` has:

- `id`, `name`, `description` — human-readable identity
- `category` — `'production' | 'safety' | 'efficiency' | 'bilateral' | 'social'`
- `icon` — string (Lucide icon name)
- `unlocked` — boolean; `unlockedAt` date when triggered
- `progress` / `target` — incremental unlock tracking

## API

- `unlockAchievement(id)` — marks as unlocked, sets timestamp
- `updateAchievementProgress(id, progress)` — incremental progress
- `getAchievementsByCategory(category)` — filter by pillar
- `getUnlockedAchievements()` — summary for display

## Default Achievements (sample, `achievementsStore.ts:31–60`)

| ID | Category | Target |
|----|---------|--------|
| `first-bag` | production | 1 bag |
| `century` | production | 100 bags |
| `thousand` | production | 1,000 bags |

The `bilateral` and `social` categories mirror BAS commitments — achievements in those categories require demonstrating welfare, voice, or community impact, not just throughput. This makes the achievement system pedagogically aligned with the game's cooperative values.

## Provenance

- Sources: `src/stores/achievementsStore.ts:1–60`
- Last verified: 2026-05-23

## See Also

- [[millos:domain/bilateral-autonomy-system]] — bilateral axis that achievement category mirrors
- [[millos:systems/scenarios-social-mission]] — social category achievements (socialMissionStore: community/environmental/knowledge-sharing)
- [[millos:systems/game-simulation]] — shift and production events that fire achievement triggers
