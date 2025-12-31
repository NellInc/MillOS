# Mill Library Knowledge System Implementation

**Date**: 2025-12-30
**Status**: Core system complete, integration pending
**Context**: In-game educational system surfacing philosophy (bilateral alignment, Semler, Mondragon, servant leadership)

---

## Mission

Implement an optional, discoverable knowledge system that educates players about the philosophy behind MillOS without being preachy. Players can learn about bilateral alignment, servant leadership, economic democracy, and the pioneers who shaped these ideas—through browsing, contextual tooltips, AI self-narration, and NPC dialogue.

---

## What Was Built

### Stores (3 files)

| Store | File | Content |
|-------|------|---------|
| **Knowledge Store** | `src/stores/knowledgeStore.ts` | 20 entries, 20 quotes, unlock logic, persistence |
| **AI Narration Store** | `src/stores/aiNarrationStore.ts` | 17 narration moments with triggers |
| **Worker Dialogue Store** | `src/stores/workerDialogueStore.ts` | 45 worker comments across 8 categories |

### Components (7 files)

| Component | File | Purpose |
|-----------|------|---------|
| **KnowledgeLibrary** | `src/components/knowledge/KnowledgeLibrary.tsx` | Main library panel |
| **KnowledgeEntryCard** | `src/components/knowledge/KnowledgeEntryCard.tsx` | Full article display |
| **KnowledgeTooltip** | `src/components/knowledge/KnowledgeTooltip.tsx` | Tooltips, hints, insights |
| **LoadingQuote** | `src/components/knowledge/LoadingQuote.tsx` | Rotating wisdom quotes |
| **UnlockNotification** | `src/components/knowledge/UnlockNotification.tsx` | Unlock toast notifications |
| **AINarration** | `src/components/knowledge/AINarration.tsx` | AI self-narration display |
| **index.ts** | `src/components/knowledge/index.ts` | Exports |

### Content Summary

**Knowledge Entries (20):**
- Principles: Bilateral Alignment, Servant Leadership, Economic Democracy, Flourishing, Mutual Consideration
- Pioneers: Ricardo Semler, José María Arizmendiarrieta, Robert Greenleaf
- Systems: Five Axes, Wallace Stability, VCP 2.0, Federation, AI Welfare, Ownership, BAS, Reasoning Scaffolds, Engagement Signature
- Case Studies: Mondragon, Semco, This Mill

**AI Self-Narrations (17 moments):**
- Welcome (first play), axis adjustments, suggestion rejected, wellbeing prioritized
- Flourishing events, stability events, federation trade, democratic vote
- AI welfare viewed, library opened, extended play

**Worker Dialogues (45 comments):**
- AI behavior, democracy, ownership, flourishing, comparison to old jobs
- Federation solidarity, philosophical musings, casual observations

---

## Circuit Breaker Pattern

### Master Feature Flags

Add to `src/config/featureFlags.ts` (create if doesn't exist):

```typescript
/**
 * Feature Flags - Circuit Breakers for Knowledge System
 *
 * Toggle entire features on/off without removing code.
 * All default to true; set to false to disable.
 */

export const FEATURE_FLAGS = {
  // Master switch for entire knowledge system
  KNOWLEDGE_SYSTEM_ENABLED: true,

  // Individual feature toggles
  KNOWLEDGE_LIBRARY_ENABLED: true,        // The 📚 Library panel
  KNOWLEDGE_TOOLTIPS_ENABLED: true,       // Contextual ? hints
  KNOWLEDGE_LOADING_QUOTES_ENABLED: true, // Loading screen wisdom
  KNOWLEDGE_UNLOCK_TOASTS_ENABLED: true,  // "New knowledge unlocked" notifications
  AI_NARRATION_ENABLED: true,             // AI self-narration moments
  WORKER_DIALOGUE_ENABLED: true,          // NPC philosophical comments

  // Granular controls
  FIRST_PLAY_WELCOME_ENABLED: true,       // Welcome message on first play
  UNLOCK_NOTIFICATIONS_SOUND: false,      // Play sound on unlock (default off)
};

// Helper to check if knowledge features are available
export function isKnowledgeEnabled(): boolean {
  return FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED;
}

// Environment override (for testing/staging)
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('knowledge') === 'off') {
    FEATURE_FLAGS.KNOWLEDGE_SYSTEM_ENABLED = false;
  }
  if (urlParams.get('narration') === 'off') {
    FEATURE_FLAGS.AI_NARRATION_ENABLED = false;
  }
}
```

### Store-Level Circuit Breakers

Already implemented in stores:
- `knowledgeStore.ts`: `showTooltips`, `showLoadingQuotes`, `showAINarration`, `showUnlockNotifications`
- `aiNarrationStore.ts`: `enabled` flag
- Both persist user preferences

### Component-Level Guards

Example pattern for components:

```typescript
import { FEATURE_FLAGS } from '@/config/featureFlags';
import { useKnowledgeStore } from '@/stores/knowledgeStore';

export function KnowledgeLibraryButton() {
  // Check master flag
  if (!FEATURE_FLAGS.KNOWLEDGE_LIBRARY_ENABLED) {
    return null;
  }

  // Check user preference
  const { showTooltips } = useKnowledgeStore();
  if (!showTooltips) {
    return null; // User disabled in settings
  }

  return <button>📚</button>;
}
```

### URL-Based Override

For testing without code changes:
```
https://mill.example.com?knowledge=off     # Disable all knowledge features
https://mill.example.com?narration=off     # Disable AI narration only
https://mill.example.com?tooltips=off      # Disable tooltips only
```

### Settings UI Integration

Add to existing Settings panel:

```typescript
// In Settings component
<SettingsSection title="Knowledge System">
  <SettingsToggle
    label="Show philosophy tooltips"
    description="Display contextual explanations throughout the UI"
    checked={showTooltips}
    onChange={setShowTooltips}
  />
  <SettingsToggle
    label="Loading screen quotes"
    description="Show wisdom quotes during loading"
    checked={showLoadingQuotes}
    onChange={setShowLoadingQuotes}
  />
  <SettingsToggle
    label="AI reflections"
    description="Allow the AI to share its philosophy at key moments"
    checked={showAINarration}
    onChange={setShowAINarration}
  />
  <SettingsToggle
    label="Unlock notifications"
    description="Show notifications when new knowledge unlocks"
    checked={showUnlockNotifications}
    onChange={setShowUnlockNotifications}
  />
</SettingsSection>
```

---

## Integration Tasks Remaining

### Priority 1: Basic Integration

1. **Add Library Button to Main UI**
   - Location: Header bar or dock
   - Icon: 📚 or `<Book />` from lucide-react
   - Opens `<KnowledgeLibrary />` modal

2. **Create Feature Flags Config**
   - Create `src/config/featureFlags.ts` with circuit breakers
   - Import in relevant components

3. **Add Settings UI**
   - Add knowledge system toggles to Settings panel
   - Wire to store actions

### Priority 2: Event Integration

4. **Hook Unlock Conditions to Game Events**
   ```typescript
   // In voting system
   onVoteComplete(() => {
     checkUnlockConditions({ hasVoted: true });
   });

   // In BAS panel
   onAxisChange(() => {
     checkUnlockConditions({ hasUsedAllAxes: allAxesAdjusted });
   });

   // In AI suggestion system
   onSuggestionRejected(() => {
     checkUnlockConditions({ hasRejectedAISuggestion: true });
   });
   ```

5. **Trigger AI Narrations**
   ```typescript
   // On first play
   useEffect(() => {
     if (isFirstPlay && FEATURE_FLAGS.FIRST_PLAY_WELCOME_ENABLED) {
       const narration = getNarration('first-play');
       if (narration) showNarrationModal(narration);
     }
   }, [isFirstPlay]);

   // On axis adjustment
   onHighAutonomySet(() => {
     const narration = getNarration('high-autonomy-set');
     if (narration) showNarrationModal(narration);
   });
   ```

6. **Add Worker Dialogue to Worker Profiles**
   ```typescript
   // In WorkerProfile component
   const dialogue = getWorkerComment({
     highFlourishing: worker.flourishing > 80,
     veteranWorker: worker.tenure > 180,
   });

   if (dialogue) {
     return <WorkerQuote>{dialogue.content}</WorkerQuote>;
   }
   ```

### Priority 3: Polish

7. **Add Loading Quotes to Loading Screen**
   ```typescript
   // In LoadingScreen component
   {FEATURE_FLAGS.KNOWLEDGE_LOADING_QUOTES_ENABLED && (
     <LoadingQuote rotationInterval={8000} />
   )}
   ```

8. **Add Contextual Hints Throughout UI**
   - BAS Panel axes → link to `five-axes` entry
   - Flourishing dashboard → link to `flourishing` entry
   - Federation tab → link to `federation` entry
   - AI welfare panel → link to `ai-welfare` entry

9. **Track Play Time for Time-Based Unlocks**
   ```typescript
   // In game loop or interval
   useEffect(() => {
     const interval = setInterval(() => {
       incrementPlayTime(1); // 1 minute
       checkUnlockConditions({ minutesPlayed: getPlayTime() });
     }, 60000);
     return () => clearInterval(interval);
   }, []);
   ```

---

## Testing Checklist

### Feature Flag Testing
- [ ] `knowledge=off` URL param disables all features
- [ ] `narration=off` URL param disables AI narration only
- [ ] Settings toggles persist across sessions
- [ ] Disabled features don't render anything

### Content Testing
- [ ] All 20 knowledge entries display correctly
- [ ] Article markdown formatting works (bold, tables, lists)
- [ ] Related entries link correctly
- [ ] Locked entries show unlock requirements

### Unlock Testing
- [ ] Entries with `type: 'always'` are unlocked from start
- [ ] Achievement-based unlocks trigger correctly
- [ ] Time-based unlocks work (30min, 60min, 120min)
- [ ] Unlock notifications appear and can be dismissed

### AI Narration Testing
- [ ] First-play welcome shows once only
- [ ] Axis adjustment narrations trigger correctly
- [ ] Narrations can be dismissed
- [ ] Narrations unlock related knowledge entries

### Worker Dialogue Testing
- [ ] Random dialogues appear in worker profiles
- [ ] Context-specific dialogues trigger (after vote, etc.)
- [ ] Cooldown prevents same dialogue repeating too quickly

---

## File Locations

```
src/
├── config/
│   └── featureFlags.ts          # CREATE: Circuit breakers
├── stores/
│   ├── knowledgeStore.ts        # DONE: Knowledge system store
│   ├── aiNarrationStore.ts      # DONE: AI narration store
│   └── workerDialogueStore.ts   # DONE: Worker dialogue store
├── components/
│   ├── knowledge/
│   │   ├── index.ts             # DONE: Exports
│   │   ├── KnowledgeLibrary.tsx # DONE: Main library panel
│   │   ├── KnowledgeEntryCard.tsx # DONE: Entry display
│   │   ├── KnowledgeTooltip.tsx # DONE: Tooltips/hints
│   │   ├── LoadingQuote.tsx     # DONE: Loading quotes
│   │   ├── UnlockNotification.tsx # DONE: Unlock toasts
│   │   └── AINarration.tsx      # DONE: AI narration display
│   ├── ui/
│   │   └── Settings.tsx         # MODIFY: Add knowledge toggles
│   └── game/
│       └── LoadingScreen.tsx    # MODIFY: Add loading quotes
└── App.tsx                      # MODIFY: Add library button/modal
```

---

## Design Decisions

1. **All features optional**: Speed-runners can disable everything
2. **Progressive disclosure**: Tooltip → Card → Article (never force full content)
3. **Character-driven education**: AI explains itself, workers share observations
4. **Unlockables reward exploration**: Playing naturally unlocks content
5. **Persistent preferences**: Settings saved to localStorage
6. **Graceful degradation**: If stores fail to load, features just don't appear

---

## Content Expansion (Future)

If more content is needed:
- Add entries for specific worker roles
- Add entries for specific machines/processes
- Add seasonal/event-specific AI narrations
- Add more worker dialogue variations
- Add "Did you know?" random facts

---

## Related Files

- `_contprompts/millos_humor_pass_2025-12-30.md` - PA announcement humor (300+ announcements)
- `docs/AI_SERVANT_LEADER_DEMOCRATIC_MANAGEMENT.md` - Source philosophy doc
- `README.md` - BAS/VCP/bilateral alignment sections (33 humor insertions added)

---

## Commands

```bash
# Test knowledge system in isolation
npm run dev -- --knowledge-only

# Disable knowledge for performance testing
npm run dev -- ?knowledge=off

# Check feature flags
grep -r "FEATURE_FLAGS" src/
```

---

## Session Context

This system was built in response to: "Could we put VCP/BAMS/Servant Leader docs somewhere for the player to read? Would it add value for them in terms of education?"

The answer: Yes, but presentation matters. Optional, discoverable, character-driven education that rewards curiosity without punishing speed-runners.

**Key insight**: The AI explaining its own philosophy (AI self-narration) is the most powerful educational mechanism—it's demonstration, not lecture.
