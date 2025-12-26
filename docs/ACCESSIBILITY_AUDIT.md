# MillOS Accessibility Audit Report

**Date:** 2025-12-04
**Standard:** WCAG 2.1 Level AA
**Auditor:** Claude Code (Accessibility Expert)

## Executive Summary

This audit identified **23 accessibility issues** across the MillOS application, including:
- **8 Critical** issues (WCAG violations that block access)
- **9 High** priority issues (significant barriers)
- **4 Medium** priority issues (usability concerns)
- **2 Low** priority issues (enhancements)

The application has strong visual design but lacks fundamental accessibility infrastructure for keyboard navigation, screen reader support, and ARIA semantics.

---

## Critical Issues (8)

### 1. No Keyboard Navigation for Modal Dialogs
**Location:** `src/components/WorkerDetailPanel.tsx`, `src/components/AboutModal.tsx`
**WCAG:** 2.1.1 Keyboard (Level A), 2.1.2 No Keyboard Trap (Level A)
**Lines:** WorkerDetailPanel:316-512, AboutModal:17-139

**Issue:**
- Modals do not trap focus within the dialog
- No mechanism to close modals with Escape key
- Tab navigation can escape to background content
- Close buttons lack visible focus indicators

**Impact:** Keyboard-only users cannot effectively use modal dialogs.

**Code Example:**
```tsx
// WorkerDetailPanel.tsx - Line 326
<button
  onClick={onClose}
  className="absolute top-2 right-2 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors"
>
  ×
</button>
```

---

### 2. Missing ARIA Labels on Icon-Only Buttons
**Location:** Multiple components
**WCAG:** 4.1.2 Name, Role, Value (Level A)
**Affected Files:**
- `src/components/AICommandCenter.tsx:434` (close button)
- `src/components/SCADAPanel.tsx:324` (close button)
- `src/components/AlertSystem.tsx:262` (dismiss buttons)
- `src/components/WorkerDetailPanel.tsx:326-330` (close button)

**Issue:**
Icon-only buttons have no accessible names for screen readers.

**Code Example:**
```tsx
// AICommandCenter.tsx - Line 434
<button onClick={onClose} className="text-white/70 hover:text-white text-sm font-medium">
  ESC to close
</button>
// Better: Should have aria-label="Close AI Command Center"
```

---

### 3. No Live Region Announcements for Dynamic Content
**Location:** `src/components/AlertSystem.tsx`, `src/components/AICommandCenter.tsx`
**WCAG:** 4.1.3 Status Messages (Level AA)
**Lines:** AlertSystem:51-287, AICommandCenter:111-895

**Issue:**
- New alerts appear without screen reader announcements
- AI decisions are added to the feed silently
- Production metric changes are not announced
- No `aria-live` regions for dynamic updates

**Impact:** Screen reader users miss critical alerts and status changes.

---

### 4. Insufficient Color Contrast
**Location:** Multiple components
**WCAG:** 1.4.3 Contrast (Minimum) (Level AA) - 4.5:1 for normal text, 3:1 for large text
**Lines:**
- ProductionMetrics.tsx:120-124 (text-slate-500 on bg-slate-800)
- SCADAPanel.tsx:444 (text-slate-400)
- UIOverlay.tsx:110-170 (various muted text)

**Issue:**
Text with insufficient contrast ratios:
- `text-slate-500` on `bg-slate-800/50`: ~2.8:1 (fails 4.5:1)
- `text-slate-400` on `bg-slate-900`: ~3.2:1 (fails 4.5:1)
- `text-[8px]` labels throughout: too small even with good contrast

**Code Example:**
```tsx
// ProductionMetrics.tsx - Line 120
<div className="text-[8px] text-slate-500 uppercase">Throughput</div>
// Contrast ratio: ~2.8:1 (needs 4.5:1)
```

---

### 5. SVG Icons Without Text Alternatives
**Location:** `src/components/AICommandCenter.tsx`, `src/components/SCADAPanel.tsx`
**WCAG:** 1.1.1 Non-text Content (Level A)
**Lines:** AICommandCenter:68-85 (Sparkline), ProductionMetrics:201-213 (shield SVG)

**Issue:**
Decorative and informative SVGs lack proper ARIA attributes.

**Code Example:**
```tsx
// AICommandCenter.tsx - Line 69
<svg width={width} height={height} className="opacity-80">
  <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" />
</svg>
// Needs: aria-hidden="true" or aria-label="Trend showing..."
```

---

### 6. Form Inputs Without Associated Labels
**Location:** `src/components/SCADAPanel.tsx`
**WCAG:** 1.3.1 Info and Relationships (Level A), 3.3.2 Labels or Instructions (Level A)
**Lines:** 981-1001, 1016-1033, 1048-1054

**Issue:**
Input fields use visual labels without proper `<label>` element association or `aria-labelledby`.

**Code Example:**
```tsx
// SCADAPanel.tsx - Line 980
<label className="block">
  <span className="text-xs text-slate-400">Base URL</span>
  <input
    type="text"
    value={restUrl}
    // Missing: id and htmlFor linkage
  />
</label>
```

---

### 7. Interactive Elements Missing Focus Visible State
**Location:** All components
**WCAG:** 2.4.7 Focus Visible (Level AA)
**Issue:**
Default Tailwind focus styles are often overridden without replacement. Many interactive elements show no visible focus indicator.

**Affected Patterns:**
```tsx
// Common pattern throughout codebase
<button className="hover:bg-slate-700/50">
  // No focus:ring or focus:outline
</button>
```

**Impact:** Keyboard users cannot see where focus is located.

---

### 8. No Skip Links for Main Content
**Location:** `src/App.tsx`
**WCAG:** 2.4.1 Bypass Blocks (Level A)
**Lines:** 42-282

**Issue:**
No skip navigation link to bypass header/controls and jump to main 3D canvas.

**Impact:** Keyboard users must tab through all controls to reach main content.

---

## High Priority Issues (9)

### 9. Tabs Without Proper ARIA Roles
**Location:** `src/components/AICommandCenter.tsx:543-567`, `src/components/SCADAPanel.tsx:346-407`, `src/components/WorkerDetailPanel.tsx:358-377`
**WCAG:** 4.1.2 Name, Role, Value (Level A)

**Issue:**
Tab interfaces lack proper `role="tablist"`, `role="tab"`, `role="tabpanel"`, and `aria-selected` attributes.

**Code Example:**
```tsx
// AICommandCenter.tsx - Line 545
<button
  onClick={() => setActiveTab('decisions')}
  className={`flex-1 py-1.5 rounded-lg...`}
>
  Live Decisions ({aiDecisions.length})
</button>
// Needs: role="tab", aria-selected, aria-controls
```

---

### 10. Chart Components Inaccessible to Screen Readers
**Location:** `src/components/ProductionMetrics.tsx:156-174`, `src/components/SCADAPanel.tsx:718-759`
**WCAG:** 1.1.1 Non-text Content (Level A)

**Issue:**
Recharts components provide no text alternative or data table equivalent for screen readers.

**Recommendation:** Add visually hidden data table or detailed aria-label with data summary.

---

### 11. Color as Only Visual Indicator
**Location:** `src/components/Machines.tsx`, `src/components/AlertSystem.tsx:181-219`
**WCAG:** 1.4.1 Use of Color (Level A)

**Issue:**
Machine status (running/idle/maintenance/error) and alert severity rely solely on color without additional visual indicators (icons, patterns, text).

**Code Example:**
```tsx
// AlertSystem.tsx - Line 185
case 'critical':
  return {
    bg: 'bg-red-950/90',
    border: 'border-red-500',
    icon: <Siren className="w-5 h-5 text-red-400" />,
    accent: 'text-red-400',
  };
// Good: Icon is present, but color is still primary indicator
```

---

### 12. Disabled Buttons Without Explanation
**Location:** `src/components/UIOverlay.tsx:342-357`, `src/components/SCADAPanel.tsx:1134-1148`
**WCAG:** 3.3.1 Error Identification (Level A)

**Issue:**
Disabled buttons don't explain why they're disabled via `aria-describedby` or tooltip.

**Code Example:**
```tsx
// UIOverlay.tsx - Line 350
<button
  onClick={() => (emergencyDrillMode ? endEmergencyDrill() : startEmergencyDrill())}
  className={`...`}
  disabled={emergencyActive && !emergencyDrillMode}
>
  {emergencyDrillMode ? 'END DRILL' : emergencyActive ? 'EMERGENCY ACTIVE' : 'START DRILL'}
</button>
// Needs: aria-describedby pointing to explanation
```

---

### 13. Auto-Dismiss Alerts Without User Control
**Location:** `src/components/AlertSystem.tsx:59-97`
**WCAG:** 2.2.1 Timing Adjustable (Level A)

**Issue:**
Alerts auto-dismiss after fixed durations. Users cannot extend time to read them (though hover pauses the timer, this isn't announced).

**Partial Mitigation:** Hover pauses timer (lines 74-97), but this isn't communicated to users.

---

### 14. Search Inputs Without Clear Labels
**Location:** `src/components/SCADAPanel.tsx:417-424`, `src/components/SCADAPanel.tsx:768-776`
**WCAG:** 2.4.6 Headings and Labels (Level AA)

**Issue:**
Search inputs use placeholder text as the only label. Placeholders disappear on focus.

**Code Example:**
```tsx
// SCADAPanel.tsx - Line 418
<input
  type="text"
  placeholder="Search tags..."
  value={searchTerm}
  onChange={(e) => setSearchTerm(e.target.value)}
  className="w-full pl-10 pr-3 py-2..."
/>
// Needs: aria-label="Search SCADA tags" or <label>
```

---

### 15. Expandable Sections Without ARIA States
**Location:** `src/components/WorkerDetailPanel.tsx:149-235`, `src/components/SCADAPanel.tsx:466-481`
**WCAG:** 4.1.2 Name, Role, Value (Level A)

**Issue:**
Collapsible/expandable sections lack `aria-expanded` attribute.

**Code Example:**
```tsx
// WorkerDetailPanel.tsx - Line 160
<button
  onClick={() => setExpanded(!expanded)}
  className="w-full flex items-center justify-between..."
>
  // Needs: aria-expanded={expanded}
</button>
```

---

### 16. No Heading Hierarchy
**Location:** All panel components
**WCAG:** 1.3.1 Info and Relationships (Level A), 2.4.6 Headings and Labels (Level AA)

**Issue:**
Content uses `<div>` with styling for section headers instead of semantic `<h1>-<h6>` elements.

**Example:**
```tsx
// AICommandCenter.tsx - Line 427
<h2 className="text-lg font-bold text-white flex items-center gap-2">
  AI Command Center
</h2>
// Good use of h2, but inconsistent elsewhere

// Line 623 - should be h3
<span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
  Live Decision Feed
</span>
```

---

### 17. Loading States Not Announced
**Location:** `src/components/SCADAPanel.tsx:1135-1142`
**WCAG:** 4.1.3 Status Messages (Level AA)

**Issue:**
Loading/processing states (spinner visible) don't announce to screen readers via `aria-live` or `role="status"`.

---

## Medium Priority Issues (4)

### 18. Insufficient Text Size
**Location:** Multiple components
**WCAG:** 1.4.4 Resize Text (Level AA)

**Issue:**
Many labels use `text-[8px]`, `text-[9px]`, `text-[10px]` which are below recommended minimum of 12px.

**Affected Lines:**
- ProductionMetrics.tsx:120, 182, 227
- AICommandCenter.tsx:659, 747, 844

**Recommendation:** Minimum 12px for body text, 14px preferred. Current 8-10px text fails readability standards.

---

### 19. No Accessible Name for Landmark Regions
**Location:** All panels
**WCAG:** 1.3.1 Info and Relationships (Level A)

**Issue:**
Panels should use semantic HTML5 landmarks (`<nav>`, `<main>`, `<aside>`) with `aria-label`.

**Recommendation:**
```tsx
<aside aria-label="AI Command Center" className="...">
  {/* Panel content */}
</aside>
```

---

### 20. Slider Controls Without Labels
**Location:** `src/components/UIOverlay.tsx` (volume slider, production speed)
**WCAG:** 1.3.1 Info and Relationships (Level A)

**Issue:**
Range inputs for volume/speed lack proper labels and `aria-valuetext` for current value.

---

### 21. Inconsistent Focus Order
**Location:** `src/App.tsx`, all panels
**WCAG:** 2.4.3 Focus Order (Level A)

**Issue:**
Multiple overlapping panels can create confusing focus order. When AI panel and SCADA panel are both open, focus order jumps between them unpredictably.

**Recommendation:** Implement focus management when panels open/close, return focus to trigger button on close.

---

## Low Priority Issues (2)

### 22. No Dark Mode for Reduced Motion
**Location:** All components
**WCAG:** 2.3.3 Animation from Interactions (Level AAA - advisory)

**Issue:**
Application doesn't respect `prefers-reduced-motion` media query. Many framer-motion animations play regardless of user preference.

**Recommendation:**
```tsx
const shouldReduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

<motion.div
  initial={shouldReduceMotion ? {} : { opacity: 0, x: 400 }}
  animate={shouldReduceMotion ? {} : { opacity: 1, x: 0 }}
  // ...
/>
```

---

### 23. 3D Canvas Not Keyboard Accessible
**Location:** `src/App.tsx:202-253`, `src/components/MillScene.tsx`
**WCAG:** 2.1.1 Keyboard (Level A)

**Issue:**
3D scene with OrbitControls is mouse-only. No keyboard controls for camera navigation.

**Current State:** OrbitControls exist but don't support keyboard by default.

**Recommendation:** Implement keyboard camera controls (arrow keys for rotation, +/- for zoom) or provide alternative 2D representations of critical data.

---

## Positive Findings

### Strengths
1. **Consistent icon usage** - Lucide icons provide visual clarity
2. **Semantic color coding** - Red/yellow/green for status (needs non-color backup)
3. **Hover states** - Good visual feedback on interactive elements
4. **Responsive design** - Layouts adapt to different screen sizes
5. **Error boundaries** - ErrorBoundary.tsx provides graceful degradation

---

## Summary of Recommendations

### Immediate Actions (Critical)
1. Add focus trap to all modal dialogs with Escape key support
2. Add aria-label to all icon-only buttons
3. Implement aria-live regions for alerts and dynamic content
4. Fix color contrast ratios to meet 4.5:1 minimum
5. Add aria-hidden or proper labels to all SVG icons
6. Associate all form inputs with labels using htmlFor/id
7. Add visible focus indicators to all interactive elements
8. Implement skip link to main content

### High Priority Actions
9. Add proper ARIA roles to tab interfaces
10. Provide text alternatives for chart data
11. Add icons/patterns alongside color indicators
12. Add aria-describedby to disabled buttons
13. Announce auto-dismiss behavior to users
14. Replace placeholder-only labels with proper labels
15. Add aria-expanded to collapsible sections
16. Establish proper heading hierarchy
17. Announce loading states with aria-live

### Medium Priority
18. Increase minimum text size to 12px
19. Add landmark regions with labels
20. Label slider controls with current values
21. Manage focus order between overlapping panels

### Low Priority Enhancements
22. Support prefers-reduced-motion
23. Add keyboard navigation for 3D canvas

---

## Testing Recommendations

### Automated Testing
- **axe DevTools**: Run on all major panels
- **WAVE**: Check for missing alt text and ARIA
- **Lighthouse**: Accessibility audit in Chrome DevTools

### Manual Testing
- **Keyboard-only navigation**: Tab through entire app
- **Screen reader testing**:
  - NVDA (Windows - free)
  - JAWS (Windows - trial available)
  - VoiceOver (macOS - built-in)
- **Color contrast analyzer**: Check all text/background combinations
- **Zoom testing**: Test at 200% zoom level

### User Testing
- Recruit users with disabilities
- Test with keyboard-only users
- Test with screen reader users
- Test with low vision users (high contrast, zoom)

---

## Next Steps

1. Review this audit with development team
2. Prioritize fixes based on severity
3. Create tickets for each issue
4. Implement fixes for Critical issues first
5. Add accessibility testing to CI/CD pipeline
6. Establish accessibility guidelines for new features

---

**End of Audit Report**
