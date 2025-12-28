# Game Features Components

This directory contains the split components from the original `GameFeatures.tsx` file, which was 3,379 lines and has been refactored into focused, maintainable sub-components.

## Directory Structure

```
game/
├── index.tsx                      # Main export file for backward compatibility
├── shared.tsx                     # Shared utilities, types, and announcement data (2,370 lines)
├── PAAnnouncementSystem.tsx       # Theme Hospital-style PA announcement system
├── ProductionTargetsWidget.tsx    # Daily production targets widget
├── AchievementsPanel.tsx          # Achievements tracking panel
├── WorkerLeaderboard.tsx          # Worker performance leaderboard
├── MiniMap.tsx                    # GPS tracking mini-map
├── ScreenshotButton.tsx           # Screenshot and export functionality
├── IncidentReplayControls.tsx     # Historical playback controls
└── GamificationBar.tsx            # Main gamification quick actions bar
```

## Components

### PAAnnouncementSystem
Theme Hospital-inspired PA announcement system with 150+ witty announcements. Includes:
- Dynamic worker/machine name injection
- Time-of-day specific announcements
- Chaos-level based selection
- Event-triggered announcements
- Text-to-speech support

### ProductionTargetsWidget
Displays daily production targets and progress with:
- Real-time progress tracking
- Expandable details
- Victory fanfare on completion
- Color-coded status indicators

### AchievementsPanel
Gamification achievements system featuring:
- Multiple achievement categories
- Progress tracking
- Unlock animations
- Icon-based visual design

### WorkerLeaderboard
Performance tracking for workers with:
- Dynamic score calculation
- Medal assignments
- Experience-based ranking
- Role multipliers

### MiniMap
GPS-style tracking system showing:
- Worker positions
- Forklift locations with direction indicators
- Zone labels
- Real-time updates (2Hz for performance)

### ScreenshotButton
Capture and export functionality:
- Canvas screenshot capture
- JSON data export
- Production metrics export

### IncidentReplayControls
Historical playback system with:
- Timeline scrubbing
- Play/pause controls
- Frame-by-frame navigation
- Skip controls

### GamificationBar
Main quick actions toolbar providing access to:
- Achievements panel
- Leaderboard
- History replay
- Mini-map toggle
- Screenshot tools

## Shared Module (shared.tsx)

Contains:
- **Announcement Data**: 150+ PA announcements organized by category
- **Event Announcements**: Safety incidents, fire drills, emergency stops
- **Dynamic Templates**: Worker/machine name injection system
- **Time-Based Announcements**: Different messages per time of day
- **Hooks**: `usePAScheduler`, `useEventAnnouncementScheduler`
- **Utilities**: Icon mapping, category colors, chaos calculation
- **Context**: `CameraFeedContext` for camera feed management

## Backward Compatibility

The original `/components/GameFeatures.tsx` now re-exports everything from this directory, so existing imports continue to work:

```typescript
// These all still work:
import { PAAnnouncementSystem } from '../components/GameFeatures';
import { GamificationBar, MiniMap } from './GameFeatures';
import { EMERGENCY_STOP_ANNOUNCEMENTS } from '../GameFeatures';
```

## Key Exports

From `index.tsx`:
- All 8 component exports
- `CameraFeedContext` and `useCameraFeedRefs`
- `SAFETY_INCIDENT_ANNOUNCEMENTS`
- `FIRE_DRILL_ANNOUNCEMENTS`
- `EMERGENCY_STOP_ANNOUNCEMENTS`
- `PA_ANNOUNCEMENT_COUNT`
- `getRandomMachineOfType`

## Design Patterns

- **React.memo**: Component optimization where appropriate
- **useShallow**: Zustand shallow equality for performance
- **Framer Motion**: Smooth animations and transitions
- **Lucide Icons**: Consistent icon system (no emojis)
- **Tailwind CSS**: Utility-first styling

## File Size Comparison

- **Before**: 1 file, 3,379 lines
- **After**: 10 files, average ~345 lines per component file

The shared.tsx file (2,370 lines) contains mostly announcement data arrays, which are better kept together for easier content management.
