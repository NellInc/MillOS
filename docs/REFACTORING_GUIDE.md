# AmbientDetails.tsx Refactoring Guide

## Current Status

Phase 1 of the refactoring is complete. The following components have been extracted:

### Completed Extractions

1. **SteamEffects.tsx** - SteamVent, CondensationDrip
2. **AtmosphericEffects.tsx** - Cobweb, RustStain, DustBunny
3. **LightingEffects.tsx** - FlickeringLight, GodRays, WarningLight, ControlPanelLED, PulsingIndicator
4. **FactoryProps.tsx** - OilPuddle, RainPuddle, StackedPallets, OilDrum, etc.
5. **IndustrialDetails.tsx** - CableTray, DrainageGrate, ExhaustFan, etc.

## How to Update AmbientDetails.tsx

### Step 1: Update Imports

Replace the current imports at the top of `AmbientDetails.tsx` with:

```tsx
import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useMillStore } from '../store';
import { audioManager } from '../utils/audioManager';
import { shouldRunThisFrame } from '../utils/frameThrottle';

// Import refactored components
import {
  // Steam Effects
  SteamVent,
  CondensationDrip,
  // Atmospheric
  Cobweb,
  RustStain,
  DustBunny,
  // Lighting
  FlickeringLight,
  GodRays,
  WarningLight,
  ControlPanelLED,
  PulsingIndicator,
  // Factory Props
  OilPuddle,
  RainPuddle,
  StackedPallets,
  OilDrum,
  GasCylinder,
  Toolbox,
  TrashBin,
  CoffeeCup,
  CleaningEquipment,
  HardHatHook,
  // Industrial
  CableTray,
  DrainageGrate,
  ExhaustFan,
  ElectricalPanel,
  SwingingChain,
  PressureGauge,
  ValveWheel,
  LoadingDockDoor
} from './ambient';
```

### Step 2: Remove Extracted Component Definitions

Delete the following component definitions from AmbientDetails.tsx (they're now imported):

**Lines to remove:**
- Lines 9-73: `Cobweb` component
- Lines 76-140: `RustStain` component
- Lines 143-205: `OilPuddle` component
- Lines 208-270: `RainPuddle` component
- Lines 609-634: `WarningLight` component
- Lines 637-674: `ControlPanelLED` component
- Lines 721-760: `CondensationDrip` component
- Lines 795-839: `StackedPallets` component
- Lines 927-969: `HardHatHook` component
- Lines 972-1029: `CleaningEquipment` component
- Lines 1032-1098: `CableTray` component
- Lines 1101-1171: `SteamVent` component
- Lines 1174-1201: `DrainageGrate` component
- Lines 1208-1268: `FlickeringLight` component
- Lines 1271-1320: `SwingingChain` component
- Lines 1323-1365: `ExhaustFan` component
- Lines 1368-1440: `ElectricalPanel` component
- Lines 1601-1682: `GodRays` component
- Lines 1902-1950: `OilDrum` component
- Lines 1951-2006: `GasCylinder` component
- Lines 2007-2058: `Toolbox` component
- Lines 2059-2106: `TrashBin` component
- Lines 2107-2163: `CoffeeCup` component
- Lines 2751-2771: `DustBunny` component
- Lines 3105-3166: `PressureGauge` component
- Lines 3167-3203: `ValveWheel` component
- Lines 3204-3248: `PulsingIndicator` component

### Step 3: Keep Exported Components

The following exports MUST remain in AmbientDetails.tsx:
- `export const FactoryWallClock` (line 336)
- `export const LoadingDockDoor` (line 511) - Now imported from ambient/
- `export const ControlPanelLED` (line 637) - Now imported from ambient/
- `export const ControlPanel` (line 677)
- `export const CondensationDrip` (line 721) - Now imported from ambient/
- `export const VibrationIndicator` (line 763)
- `export const PulsingIndicator` (line 3204) - Now imported from ambient/

### Step 4: Update the AmbientDetailsGroup Component

The main `AmbientDetailsGroup` component (starting at line 4162) should NOT be modified except for removing duplicate definitions. All JSX usage remains the same since the components maintain the same interface.

## Recommended Approach

Given the file's massive size (4,689 lines), the safest refactoring approach:

### Option A: Careful Manual Editing
1. Create a new file `AmbientDetails.new.tsx`
2. Copy the imports from the guide above
3. Copy all remaining components (not extracted)
4. Copy the `AmbientDetailsGroup` component
5. Copy the export statement
6. Test thoroughly
7. If successful, rename to `AmbientDetails.tsx`

### Option B: Automated Script
Create a Python script to:
1. Read the original file
2. Remove lines containing extracted components
3. Add new imports
4. Write to new file

### Option C: Incremental Approach (Safest)
1. Add the new imports at the top
2. Comment out one extracted component definition
3. Test that it still works
4. Repeat for each component
5. Once all are commented, delete them

## Testing After Refactoring

```bash
# Start dev server
npm run dev

# Check for:
1. No TypeScript errors
2. All ambient details render correctly
3. Animations work (cobwebs sway, lights flicker, etc.)
4. No console errors
5. Performance is maintained
```

## Verification Checklist

- [ ] File imports correctly from `./ambient`
- [ ] No duplicate component definitions
- [ ] All exports are present
- [ ] TypeScript compiles without errors
- [ ] Visual inspection shows all effects
- [ ] Animations are smooth
- [ ] Frame rate is good (check FPS)
- [ ] No memory leaks
- [ ] Hot reload works

## File Size Comparison

- **Before:** 4,689 lines
- **After (estimated):** ~2,500-3,000 lines (46-36% reduction)
- **Extracted:** ~1,500-2,000 lines into 5 focused files

## Future Enhancements

After completing this refactoring, consider:

1. Create `SafetyEquipment.tsx` for safety-related components
2. Create `AmbientLife.tsx` for wildlife components
3. Create `PersonalItems.tsx` for micro-details
4. Create `DecorativeElements.tsx` for storytelling elements
5. Add complete JSDoc comments to each component
6. Create Storybook stories for visual testing
7. Add unit tests for animation logic

## Rollback Plan

If issues occur:
```bash
# Restore original file
mv src/components/AmbientDetails.tsx.backup src/components/AmbientDetails.tsx

# Delete ambient folder if needed
rm -rf src/components/ambient
```

## Support

The refactored components are in:
- `/src/components/ambient/SteamEffects.tsx`
- `/src/components/ambient/AtmosphericEffects.tsx`
- `/src/components/ambient/LightingEffects.tsx`
- `/src/components/ambient/FactoryProps.tsx`
- `/src/components/ambient/IndustrialDetails.tsx`
- `/src/components/ambient/index.ts`

All components maintain backward compatibility.
