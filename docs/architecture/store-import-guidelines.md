# Store Import Guidelines

## Overview

Best practices for importing Zustand stores in the MillOS codebase to prevent state synchronization issues.

## The Golden Rule

**Always import stores directly from their source files in `src/stores/*`**

## Import Patterns

### ✅ Correct Pattern

```typescript
// Import from source files
import { useGameSimulationStore } from './stores/gameSimulationStore';
import { useProductionStore } from './stores/productionStore';
import { useGraphicsStore } from './stores/graphicsStore';
import { useUIStore } from './stores/uiStore';
import { useSafetyStore } from './stores/safetyStore';
```

### ❌ Incorrect Pattern

```typescript
// DO NOT import from compatibility layer
import { useGameSimulationStore } from './store';
import { useProductionStore } from '../store';
```

## Why This Matters

### The Problem: Module Singleton Behavior

Zustand stores are **singletons per module path**, not global singletons. When you import the same store via different paths:

```typescript
// File A
import { useGameSimulationStore } from './stores/gameSimulationStore';

// File B  
import { useGameSimulationStore } from './store'; // Re-exports from stores/
```

...the bundler may create **two separate instances**, leading to:
- State desynchronization between components
- Updates not propagating correctly
- Difficult-to-debug "split-brain" scenarios

### Real-World Example

In December 2025, we encountered a critical bug where:
- `SkySystem` used `import from './stores/gameSimulationStore'`
- `App.tsx` used `import from './store'`
- Result: Two store instances, sky stuck at midday while game time advanced to night

See [split-brain-store-issue.md](../debugging/split-brain-store-issue.md) for full details.

## Store Directory Structure

```
src/
├── stores/               # ✅ Import from here
│   ├── index.ts         # Re-exports for convenience
│   ├── gameSimulationStore.ts
│   ├── productionStore.ts
│   ├── graphicsStore.ts
│   ├── uiStore.ts
│   └── safetyStore.ts
└── store.ts             # ❌ Legacy compatibility layer - avoid
```

## Migration Guide

### For Existing Code

If you find imports from `./store` or `../store`:

1. **Identify the store being imported**
2. **Replace with direct import**
3. **Verify no regressions**

Example:

```diff
- import { useGameSimulationStore, useProductionStore } from './store';
+ import { useGameSimulationStore } from './stores/gameSimulationStore';
+ import { useProductionStore } from './stores/productionStore';
```

### For New Code

Always use direct imports from the start:

```typescript
// ✅ New component
import { useGameSimulationStore } from '@/stores/gameSimulationStore';
import { useProductionStore } from '@/stores/productionStore';
```

## Enforcement

### ESLint Rule (Recommended)

Add to `.eslintrc.json`:

```json
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["**/store", "*/store"],
            "message": "Import stores directly from src/stores/* to ensure singleton behavior"
          }
        ]
      }
    ]
  }
}
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Check for forbidden import patterns
if git diff --cached --name-only | grep -E '\.(ts|tsx)$' | xargs grep -l "from ['\"].*\/store['\"]"; then
  echo "❌ Error: Found imports from ./store or ../store"
  echo "   Use direct imports from src/stores/* instead"
  echo "   See docs/architecture/store-import-guidelines.md"
  exit 1
fi
```

## Testing Store Singletons

### Integration Test

```typescript
// src/__tests__/store-singleton.test.ts
import { describe, it, expect } from 'vitest';

describe('Store Singleton Behavior', () => {
  it('should have single instance across different import paths', () => {
    // Import via different paths
    const { useGameSimulationStore: StoreA } = await import('./stores/gameSimulationStore');
    const { useGameSimulationStore: StoreB } = await import('./stores');
    
    // Both should reference the same instance
    expect(StoreA.getState()).toBe(StoreB.getState());
    
    // State changes should be reflected in both
    StoreA.getState().setGameTime(15);
    expect(StoreB.getState().gameTime).toBe(15);
  });
});
```

## FAQ

### Q: Can I use `src/stores/index.ts` for imports?

**A:** Yes, but with caution. `src/stores/index.ts` re-exports from individual store files, so it should be safe:

```typescript
// ✅ This is acceptable
import { useGameSimulationStore } from './stores';
```

However, for maximum clarity and to avoid any bundler edge cases, **direct imports are still preferred**.

### Q: What about the `useMillStore` combined hook?

**A:** The `useMillStore` hook (from `src/stores/index.ts`) is safe to use as it internally uses `useSyncExternalStore` and subscribes to all stores. However, for new code, prefer using individual stores directly for better performance and type safety.

### Q: When will `src/store.ts` be removed?

**A:** The compatibility layer will be deprecated once all legacy code is migrated. Track progress in issue #TBD.

## Related Documentation

- [Split-Brain Store Issue](../debugging/split-brain-store-issue.md) - Detailed case study
- [Zustand Best Practices](https://github.com/pmndrs/zustand#best-practices)
- [Vite Module Resolution](https://vitejs.dev/guide/dep-pre-bundling.html)

## Changelog

- **2025-12-13**: Initial guidelines created after sky color sync bug
