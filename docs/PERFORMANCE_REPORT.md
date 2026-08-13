# MillOS Performance Test Report

> **Historical record.** This document preserves an earlier audit, plan, or implementation snapshot. It is not current status or operating instruction. See [the 12 August 2026 exhaustive improvement ledger](../_contprompts/millos_exhaustive_improvements_2026-08-12.md) and [its second pass](../_contprompts/millos_exhaustive_improvements_second_pass_2026-08-12.md) for current evidence, dispositions, and remaining gates.
**Date:** 2025-12-05
**Test Duration:** 10 seconds sampling after 15s warmup
**Testing Tool:** Puppeteer automated performance testing

---

## Executive Summary

**Performance Grade:** POOR (34 FPS average)
**Status:** Optimization Required
**Gap to Target:** 26 FPS improvement needed to reach 60 FPS

---

## Performance Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Average FPS | **34** | 60 | 🔴 POOR |
| Min FPS | 30 | 60 | 🔴 |
| Max FPS | 51 | 60 | 🟡 |
| FPS Variance | 21 | <10 | ⚠️ High |
| Avg Memory | 130 MB | <200 MB | ✅ OK |
| Total Frames | 342 | 600 | 🔴 |
| Console Errors | 4 | 0 | ❌ |

---

## Critical Issues

### 1. WebGL Context Errors (CRITICAL)
```
THREE.WebGLRenderer: A WebGL context could not be created.
Reason: VENDOR = 0xffff, DEVICE = 0xffff, GL_VENDOR = Disabled, GL_RENDERER = Disabled
```

**Impact:** 4 WebGL errors detected
**Cause:** Puppeteer headless browser has limited GPU/WebGL support
**Note:** These errors are test environment artifacts. Real browser performance will differ.

### 2. Low Frame Rate (34 FPS Average)
**Impact:** 43% below target (26 FPS gap)
**Severity:** POOR - Immediate optimization required

### 3. High FPS Variance (21 FPS)
**Impact:** Inconsistent performance (30-51 FPS range)
**Indicates:**
- Periodic heavy operations (likely garbage collection)
- Components re-rendering on every frame
- Possible render storms

---

## Suspected Bottlenecks

Based on codebase analysis, these are the most likely performance culprits:

### Primary Suspects (High Impact)

1. **TruckBay Component**
   - **useFrame hooks:** 28+ per component
   - **Impact:** VERY HIGH
   - **File:** `/Users/nellwatson/Documents/GitHub/Experiments/src/components/TruckBay.tsx`
   - **Why:** Multiple useFrame hooks running every frame is extremely expensive

2. **WorkerSystem Component**
   - **useFrame hooks:** 3+ per worker (15+ total with 5 workers)
   - **Impact:** HIGH
   - **File:** `/Users/nellwatson/Documents/GitHub/Experiments/src/components/WorkerSystem.tsx`
   - **Why:** Each worker has multiple animation/update hooks

3. **Machines Component**
   - **useFrame hooks:** 9 hooks
   - **Impact:** MEDIUM-HIGH
   - **File:** `/Users/nellwatson/Documents/GitHub/Experiments/src/components/Machines.tsx`
   - **Why:** Machine animations and vibrations

### Secondary Suspects (Medium Impact)

4. **ConveyorSystem Component**
   - Multiple animated conveyor belts
   - **File:** `/Users/nellwatson/Documents/GitHub/Experiments/src/components/ConveyorSystem.tsx`

5. **ForkliftSystem Component**
   - Pathfinding + animations
   - **File:** `/Users/nellwatson/Documents/GitHub/Experiments/src/components/ForkliftSystem.tsx`

---

## Immediate Action Items

### 1. Profile with React DevTools (DO THIS FIRST)
**Priority:** CRITICAL
**Time:** 5 minutes

**Steps:**
1. Open the Puppeteer browser window (should still be open)
2. Install React DevTools extension if not present
3. Open React DevTools → Profiler tab
4. Click "Record" → Wait 5 seconds → Stop
5. Switch to "Ranked" view
6. Look for:
   - Components rendering >10 times in 5 seconds
   - Components with >50ms render time
   - Any "render storms" (red/orange bars)

**What to look for:**
- TruckBay, WorkerSystem, Machines rendering every frame
- Missing React.memo() on pure components
- Unnecessary prop changes causing re-renders

---

### 2. Fix Console Errors
**Priority:** HIGH
**Time:** 15 minutes

Fix the 4 console errors before optimizing further. Errors can cause cascading performance issues.

---

### 3. Optimize useFrame Hooks
**Priority:** CRITICAL
**Time:** 1-2 hours

**Target components:**
- TruckBay.tsx (28+ hooks)
- WorkerSystem.tsx (15+ hooks)
- Machines.tsx (9 hooks)

**Optimization strategies:**
1. **Consolidate hooks:** Combine multiple useFrame hooks into one
2. **Add throttling:** Not every hook needs to run every frame
3. **Use React.memo():** Prevent unnecessary re-renders
4. **Skip when off-screen:** Don't update objects outside camera frustum

**Example optimization:**
```typescript
// BEFORE (3 separate useFrame hooks)
useFrame(() => { updatePosition(); });
useFrame(() => { updateRotation(); });
useFrame(() => { updateAnimation(); });

// AFTER (1 consolidated hook)
useFrame(() => {
  updatePosition();
  updateRotation();
  updateAnimation();
});
```

---

### 4. Implement Performance Debug Mode
**Priority:** MEDIUM
**Time:** 30 minutes

The app already has `perfDebug` toggles in graphicsStore:
- `disableWorkerSystem`
- `disableTruckBay`
- `disableMachines`
- `disableConveyorSystem`
- `disableForkliftSystem`
- `disableEnvironment`

**Action:** Add UI controls to Graphics Settings panel to toggle these on/off for A/B testing.

---

### 5. Add React.memo() to Pure Components
**Priority:** HIGH
**Time:** 30 minutes

**Components to wrap:**
- WorkerModel
- ForkliftModel
- All UI overlay components
- Any component that doesn't need to re-render on every parent update

**Example:**
```typescript
export const WorkerModel = React.memo(({ position, rotation }) => {
  // ... component code
});
```

---

## Testing Strategy

### Phase 1: Isolate Bottleneck (15 minutes)
1. Open app in browser
2. Open Graphics Settings
3. Disable TruckBay → Note FPS change
4. Re-enable, disable WorkerSystem → Note FPS change
5. Re-enable, disable Machines → Note FPS change
6. Identify which system has largest FPS impact

### Phase 2: Profile Bottleneck (15 minutes)
1. Use React DevTools Profiler on the identified bottleneck
2. Record 5 seconds of rendering
3. Identify specific render storms
4. Find components without React.memo()

### Phase 3: Optimize (1-2 hours)
1. Add React.memo() to identified components
2. Consolidate useFrame hooks
3. Add frame skipping for expensive operations
4. Test FPS improvement

### Phase 4: Validate (15 minutes)
1. Re-run performance test: `npm run benchmark:runtime`
2. Verify FPS improvement
3. Ensure no new errors
4. Test on real devices (not just Puppeteer)

---

## Expected Outcomes

### After TruckBay Optimization
**Expected FPS gain:** +10-15 FPS
**New FPS:** 44-49 FPS
**Effort:** 1 hour

### After WorkerSystem Optimization
**Expected FPS gain:** +5-8 FPS
**New FPS:** 39-42 FPS
**Effort:** 30 minutes

### After Machines Optimization
**Expected FPS gain:** +3-5 FPS
**New FPS:** 37-39 FPS
**Effort:** 30 minutes

### Combined Optimization
**Expected FPS:** 55-60 FPS
**Total Effort:** 2-3 hours
**Success Criteria:** Reach 60 FPS average with <10 FPS variance

---

## Performance Budget (Recommended)

| System | Current useFrame Hooks | Budget | Action |
|--------|----------------------|--------|--------|
| TruckBay | 28+ | 3-5 | Consolidate 80% |
| WorkerSystem | 15+ | 5-7 | Consolidate 50% |
| Machines | 9 | 3-4 | Consolidate 60% |
| ConveyorSystem | ~5 | 3-4 | Optimize 20% |
| ForkliftSystem | ~5 | 3-4 | Optimize 20% |
| **TOTAL** | **60+** | **20-25** | **Reduce by 60%** |

---

## Long-term Optimizations

### 1. Instanced Rendering
Render multiple copies of same geometry with one draw call.
**Use for:** Workers, forklifts, conveyor segments
**Expected gain:** +5-10 FPS

### 2. Level of Detail (LOD)
Switch to low-poly models when objects are far from camera.
**Use for:** Workers, machines, detailed props
**Expected gain:** +3-5 FPS

### 3. Object Pooling
Reuse objects instead of creating/destroying them.
**Use for:** Particles, temporary effects
**Expected gain:** +2-3 FPS, smoother frame times

### 4. Frustum Culling
Skip updates for objects outside camera view.
**Use for:** All systems
**Expected gain:** +5-8 FPS (depending on camera angle)

---

## Monitoring & Regression Prevention

### 1. Add FPS Tracking
Already implemented via `FPSMonitor.tsx` - good!

### 2. Add Performance Tests to CI
Run `npm run benchmark:runtime` in CI pipeline.
Alert if FPS drops below threshold.

### 3. useFrame Hook Linting
Add ESLint rule to warn about multiple useFrame hooks in one component.

### 4. Bundle Size Monitoring
Track bundle size changes in PRs to catch bloat early.

---

## Files to Review

Priority order for performance optimization:

1. `/Users/nellwatson/Documents/GitHub/Experiments/src/components/TruckBay.tsx` (CRITICAL)
2. `/Users/nellwatson/Documents/GitHub/Experiments/src/components/WorkerSystem.tsx` (HIGH)
3. `/Users/nellwatson/Documents/GitHub/Experiments/src/components/Machines.tsx` (HIGH)
4. `/Users/nellwatson/Documents/GitHub/Experiments/src/components/ConveyorSystem.tsx` (MEDIUM)
5. `/Users/nellwatson/Documents/GitHub/Experiments/src/components/ForkliftSystem.tsx` (MEDIUM)

---

## Conclusion

The MillOS app is running at **34 FPS** - significantly below the 60 FPS target. The primary bottleneck is **excessive useFrame hooks** (60+ total) causing unnecessary per-frame computations.

**Immediate priority:** Reduce useFrame hooks by 60% through consolidation and React.memo() optimization.

**Expected outcome:** 55-60 FPS after 2-3 hours of focused optimization.

**Risk:** LOW - Optimizations are non-breaking and can be tested incrementally.

---

**Next Step:** Run React DevTools Profiler (instructions above) to confirm which components are the worst offenders, then start with TruckBay optimization.
