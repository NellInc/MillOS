# Accessibility Recommendations - Medium and Low Priority

**Date:** 2025-12-04
**For:** MillOS Development Team

Detailed recommendations for addressing Medium and Low priority accessibility issues identified in the audit. While these are not blocking issues, implementing them will significantly improve the user experience for all users, including those with disabilities.

---

## Medium Priority Recommendations

### 18. Insufficient Text Size (WCAG 1.4.4 Resize Text - Level AA)

**Issue:** Many labels use 8-10px font sizes, below the recommended 12px minimum.

**Impact:** Users with low vision struggle to read small text, even at 200% zoom.

**Affected Components:**
- `ProductionMetrics.tsx` - Lines 120, 182, 227
- `AICommandCenter.tsx` - Lines 659, 747, 844
- `SCADAPanel.tsx` - Various small labels

**Recommendation:**

```tsx
// Before
<div className="text-[8px] text-slate-500 uppercase">Throughput</div>

// After - Option 1: Increase minimum size
<div className="text-xs text-slate-500 uppercase">Throughput</div>
// text-xs = 12px in Tailwind

// After - Option 2: Responsive sizing
<div className="text-[10px] sm:text-xs text-slate-500 uppercase">Throughput</div>
// 10px mobile, 12px desktop
```

**Implementation Plan:**
1. Search for `text-[8px]`, `text-[9px]`, `text-[10px]` in codebase
2. Replace with `text-xs` (12px) or `text-sm` (14px) as appropriate
3. For compact mobile views, use responsive classes: `text-[10px] sm:text-xs`
4. Test layouts at 200% zoom to ensure no horizontal scroll

**Code Example:**
```tsx
// ProductionMetrics.tsx - Before
<div className="text-[8px] text-slate-500 uppercase">Stops</div>

// After
<div className="text-xs text-slate-600 uppercase tracking-wide">Stops</div>
// Increased to 12px, improved contrast, added tracking for readability
```

---

### 19. No Accessible Name for Landmark Regions (WCAG 1.3.1 Info and Relationships - Level A)

**Issue:** Panels don't use semantic HTML5 landmarks or aria-label.

**Impact:** Screen reader users can't efficiently navigate between major sections.

**Recommendation:**

Use semantic HTML landmarks with descriptive labels:

```tsx
// Before
<motion.div className="fixed right-0 top-0...">
  {/* AI Command Center content */}
</motion.div>

// After
<motion.aside
  aria-label="AI Command Center"
  className="fixed right-0 top-0..."
>
  {/* AI Command Center content */}
</motion.aside>
```

**Landmark Mappings:**

| Component | Current | Recommended | aria-label |
|-----------|---------|-------------|------------|
| AICommandCenter | `<div>` | `<aside>` | "AI Command Center" |
| SCADAPanel | `<div>` | `<aside>` | "SCADA Monitor Panel" |
| UIOverlay | `<div>` | `<nav>` + `<main>` | "Production Controls" / "Mill Visualization" |
| AlertSystem | `<div>` | `<aside>` | "System Alerts" |
| ProductionMetrics | `<div>` | `<section>` | "Production Metrics" |

**Screen Reader Navigation Benefits:**
- NVDA: Landmarks list (Insert+F7)
- JAWS: Region list (Insert+Ctrl+R)
- VoiceOver: Rotor > Landmarks (Cmd+U)

**Implementation:**
```tsx
// AICommandCenter.tsx
<motion.aside
  aria-label="AI Command Center"
  role="complementary"
  className="fixed right-0 top-0..."
>
  <header className="p-4 border-b...">
    <h2 className="text-lg font-bold">AI Command Center</h2>
  </header>
  <nav aria-label="Command Center Tabs">
    {/* Tabs */}
  </nav>
  <main className="flex-1 overflow-hidden">
    {/* Content */}
  </main>
</motion.aside>
```

---

### 20. Slider Controls Without Labels (WCAG 1.3.1 Info and Relationships - Level A)

**Issue:** Volume and production speed sliders lack proper labels and value announcements.

**Impact:** Screen reader users don't know current values or slider purpose.

**Recommendation:**

```tsx
// Before
<input
  type="range"
  value={volume}
  onChange={(e) => setVolume(Number(e.target.value))}
  min={0}
  max={100}
  className="..."
/>

// After
<label htmlFor="volume-slider" className="text-sm text-slate-300">
  Volume
  <span className="sr-only">: {volume}%</span>
</label>
<input
  id="volume-slider"
  type="range"
  value={volume}
  onChange={(e) => setVolume(Number(e.target.value))}
  min={0}
  max={100}
  aria-valuenow={volume}
  aria-valuemin={0}
  aria-valuemax={100}
  aria-valuetext={`${volume} percent`}
  className="..."
/>
<output htmlFor="volume-slider" aria-live="polite" className="text-xs text-slate-400">
  {volume}%
</output>
```

**Key Attributes:**
- `aria-valuenow` - Current value
- `aria-valuemin` - Minimum value
- `aria-valuemax` - Maximum value
- `aria-valuetext` - Human-readable value (e.g., "50 percent" instead of "50")
- `<output>` - Displays current value, updates announced via aria-live

**Production Speed Example:**
```tsx
<div className="space-y-2">
  <label htmlFor="production-speed" className="block text-sm font-medium text-slate-300">
    Production Speed
  </label>
  <div className="flex items-center gap-3">
    <input
      id="production-speed"
      type="range"
      value={productionSpeed}
      onChange={(e) => setProductionSpeed(Number(e.target.value))}
      min={0}
      max={2}
      step={0.1}
      aria-valuenow={productionSpeed}
      aria-valuemin={0}
      aria-valuemax={2}
      aria-valuetext={`${(productionSpeed * 100).toFixed(0)} percent speed`}
      className="flex-1 focus:outline-none focus:ring-2 focus:ring-cyan-500"
    />
    <output
      htmlFor="production-speed"
      aria-live="polite"
      className="text-sm font-mono text-cyan-400 min-w-[3rem] text-right"
    >
      {(productionSpeed * 100).toFixed(0)}%
    </output>
  </div>
</div>
```

---

### 21. Inconsistent Focus Order (WCAG 2.4.3 Focus Order - Level A)

**Issue:** Multiple overlapping panels create confusing focus order.

**Impact:** Keyboard users get lost when tabbing through overlapping content.

**Recommendation:**

Implement focus management when panels open/close:

```tsx
// Store previous focus
const triggerRef = useRef<HTMLButtonElement>(null);

// Open panel handler
const openPanel = () => {
  setShowPanel(true);
  // Focus will be managed by useFocusTrap
};

// Close panel handler
const closePanel = () => {
  setShowPanel(false);
  // Return focus to trigger
  triggerRef.current?.focus();
};

// Trigger button
<button
  ref={triggerRef}
  onClick={openPanel}
  aria-expanded={showPanel}
  aria-controls="panel-id"
>
  Open Panel
</button>
```

**Panel Stacking Order:**
1. Base UI (z-10)
2. Alerts (z-30)
3. Modals/Panels (z-50)
4. Tooltips/Dropdowns (z-60)

**Focus Order Rules:**
- Only one modal/panel should be focusable at a time
- When modal opens, all background content should be inert
- Use `aria-hidden="true"` on background when modal is open
- Focus returns to trigger element on close

**Implementation with Inert Background:**
```tsx
// App.tsx or parent component
const [openPanels, setOpenPanels] = useState<string[]>([]);

const hasOpenPanel = openPanels.length > 0;

return (
  <>
    <div aria-hidden={hasOpenPanel} inert={hasOpenPanel ? '' : undefined}>
      {/* Main UI content */}
      <UIOverlay />
      <Canvas />
    </div>

    {/* Panels render on top */}
    <AnimatePresence>
      {showAIPanel && <AICommandCenter />}
      {showSCADAPanel && <SCADAPanel />}
      {selectedWorker && <WorkerDetailPanel />}
    </AnimatePresence>
  </>
);
```

---

## Low Priority Recommendations

### 22. No Support for prefers-reduced-motion (WCAG 2.3.3 Animation from Interactions - Level AAA)

**Issue:** Animations play regardless of user motion preference.

**Impact:** Users with vestibular disorders experience discomfort from motion.

**Recommendation:**

Respect `prefers-reduced-motion` media query:

```tsx
// Create utility hook
// src/hooks/useReducedMotion.ts
import { useState, useEffect } from 'react';

export const useReducedMotion = () => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const listener = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener('change', listener);
    return () => mediaQuery.removeEventListener('change', listener);
  }, []);

  return prefersReducedMotion;
};
```

**Usage in Components:**
```tsx
import { useReducedMotion } from '../hooks/useReducedMotion';

export const MyComponent = () => {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? {} : { opacity: 0, x: 400 }}
      animate={prefersReducedMotion ? {} : { opacity: 1, x: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
    >
      {/* Content */}
    </motion.div>
  );
};
```

**Tailwind Alternative:**
```css
/* In your CSS or Tailwind config */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

### 23. 3D Canvas Not Keyboard Accessible (WCAG 2.1.1 Keyboard - Level A)

**Issue:** OrbitControls only work with mouse, no keyboard camera navigation.

**Impact:** Keyboard-only users cannot explore the 3D environment.

**Recommendation:**

Implement keyboard controls for 3D navigation:

```tsx
// src/components/KeyboardCameraControls.tsx
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';

interface KeyboardCameraControlsProps {
  enabled?: boolean;
  rotateSpeed?: number;
  zoomSpeed?: number;
}

export const KeyboardCameraControls: React.FC<KeyboardCameraControlsProps> = ({
  enabled = true,
  rotateSpeed = 0.05,
  zoomSpeed = 0.5,
}) => {
  const { camera } = useThree();

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default if we handle the key
      const handled = true;

      switch (e.key) {
        case 'ArrowLeft':
          // Rotate camera left
          camera.position.x -= rotateSpeed;
          break;
        case 'ArrowRight':
          // Rotate camera right
          camera.position.x += rotateSpeed;
          break;
        case 'ArrowUp':
          // Rotate camera up
          camera.position.y += rotateSpeed;
          break;
        case 'ArrowDown':
          // Rotate camera down
          camera.position.y -= rotateSpeed;
          break;
        case '+':
        case '=':
          // Zoom in
          camera.position.z -= zoomSpeed;
          break;
        case '-':
        case '_':
          // Zoom out
          camera.position.z += zoomSpeed;
          break;
        default:
          return; // Don't prevent default for unhandled keys
      }

      if (handled) {
        e.preventDefault();
        camera.lookAt(0, 0, 0); // Keep looking at center
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [camera, enabled, rotateSpeed, zoomSpeed]);

  return null;
};

// Usage in MillScene.tsx
<Canvas>
  <KeyboardCameraControls />
  {/* Rest of scene */}
</Canvas>
```

**Alternative: Provide 2D Representations**

For complex 3D data, provide alternative 2D views:

```tsx
// src/components/FactoryLayoutMap.tsx
export const FactoryLayoutMap: React.FC = () => {
  const machines = useMillStore(state => state.machines);

  return (
    <div
      role="img"
      aria-label="Factory layout showing machine positions and status"
      className="w-full h-full bg-slate-900 p-4"
    >
      <svg viewBox="0 0 800 600" className="w-full h-full">
        {/* Floor plan */}
        <rect x="0" y="0" width="800" height="600" fill="#1e293b" />

        {/* Machines as 2D shapes */}
        {machines.map(machine => (
          <g key={machine.id}>
            <rect
              x={machine.position[0] * 10 + 400}
              y={machine.position[2] * 10 + 300}
              width="20"
              height="20"
              fill={getStatusColor(machine.status)}
              stroke="#fff"
              strokeWidth="2"
            />
            <text
              x={machine.position[0] * 10 + 410}
              y={machine.position[2] * 10 + 315}
              fill="#fff"
              fontSize="12"
              textAnchor="middle"
            >
              {machine.id}
            </text>
          </g>
        ))}
      </svg>

      {/* Textual description */}
      <div className="sr-only">
        <h3>Machine Locations and Status:</h3>
        <ul>
          {machines.map(machine => (
            <li key={machine.id}>
              {machine.id}: {machine.type}, status {machine.status},
              located at position {machine.position.join(', ')}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
```

**Keyboard Controls Help:**
```tsx
// Add to UIOverlay.tsx
<div className="bg-slate-800/50 rounded p-2 text-xs text-slate-400">
  <h4 className="font-semibold mb-1">Keyboard Controls:</h4>
  <ul className="space-y-0.5">
    <li>Arrow Keys - Rotate camera</li>
    <li>+/- - Zoom in/out</li>
    <li>Tab - Navigate UI elements</li>
    <li>Esc - Close panels</li>
  </ul>
</div>
```

---

## Implementation Priority

### Phase 1 (Immediate - Current Sprint)
- [x] Critical issues (focus traps, ARIA labels, live regions)
- [x] High priority issues (tabs, alerts)

### Phase 2 (Next Sprint)
- [ ] Text size fixes (#18) - 2 hours
- [ ] Landmark regions (#19) - 3 hours
- [ ] Slider labels (#20) - 2 hours

### Phase 3 (Future Sprint)
- [ ] Focus order management (#21) - 4 hours
- [ ] Reduced motion support (#22) - 3 hours
- [ ] Keyboard 3D controls (#23) - 6 hours

---

## Testing Checklist

After implementing these recommendations, test with:

### Automated Tools
- [ ] axe DevTools Chrome extension
- [ ] WAVE browser extension
- [ ] Lighthouse accessibility audit (target: 95+)

### Manual Testing
- [ ] Keyboard-only navigation through entire app
- [ ] Screen reader testing (NVDA, JAWS, VoiceOver)
- [ ] 200% zoom level (no horizontal scroll)
- [ ] Color contrast analyzer (all text meets 4.5:1)
- [ ] Reduced motion preference enabled

### User Testing
- [ ] Keyboard-only user session
- [ ] Screen reader user session
- [ ] Low vision user session (high zoom, high contrast)

---

## Resources

### Documentation
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Articles](https://webaim.org/articles/)

### Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE](https://wave.webaim.org/extension/)
- [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/)
- [NVDA Screen Reader](https://www.nvaccess.org/download/) (Free)

### Testing Guides
- [WebAIM Keyboard Testing](https://webaim.org/articles/keyboard/)
- [WebAIM Screen Reader Testing](https://webaim.org/articles/screenreader_testing/)
- [Gov.UK Accessibility Testing](https://www.gov.uk/service-manual/technology/testing-for-accessibility)

---

## Conclusion

Implementing these Medium and Low priority recommendations will bring the MillOS application closer to full WCAG 2.1 AA compliance and provide an excellent experience for all users.

**Benefits:**
- Improved usability for keyboard users
- Better screen reader experience
- Enhanced low vision support
- Reduced motion sickness risk
- Broader user base accessibility

**Next Steps:**
1. Review and prioritize recommendations with team
2. Create tickets for each recommendation
3. Implement in phases alongside feature development
4. Test thoroughly with assistive technologies
5. Gather feedback from users with disabilities

---

**Document Version:** 1.0
**Last Updated:** 2025-12-04
**Maintained By:** Accessibility Team
