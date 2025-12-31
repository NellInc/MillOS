/**
 * Knowledge System Integration Hook
 *
 * Watches game state changes and triggers knowledge unlocks + AI narrations.
 * This centralizes event detection rather than modifying each component.
 *
 * Events tracked:
 * - First vote cast
 * - Axis adjustments (any, all five)
 * - AI suggestion acceptance/rejection
 * - Flourishing thresholds
 * - Stability milestones
 * - Federation trades
 * - Play time milestones
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useKnowledgeStore } from '../stores/knowledgeStore';
import { useAINarrationStore, NarrationTrigger, NarrationEntry } from '../stores/aiNarrationStore';
import { useVotingStore } from '../stores/votingStore';
import { useBASStore } from '../stores/basStore';
import { useStabilityStore } from '../stores/stabilityStore';
import { useFlourishingStore } from '../stores/flourishingStore';
import { FEATURE_FLAGS } from '../config/featureFlags';

interface KnowledgeIntegrationState {
  // Track which events have been triggered this session
  hasTriggeredFirstPlay: boolean;
  axesAdjusted: Set<string>;
  hasVotedThisSession: boolean;
  hasRejectedSuggestion: boolean;
  hasAcceptedWellbeingSuggestion: boolean;
  lastStabilityCheck: number;
  lastFlourishingCheck: number;
  sessionStartTime: number;
}

export function useKnowledgeIntegration(
  onNarration?: (narration: NarrationEntry) => void
) {
  const stateRef = useRef<KnowledgeIntegrationState>({
    hasTriggeredFirstPlay: false,
    axesAdjusted: new Set(),
    hasVotedThisSession: false,
    hasRejectedSuggestion: false,
    hasAcceptedWellbeingSuggestion: false,
    lastStabilityCheck: 0,
    lastFlourishingCheck: 0,
    sessionStartTime: Date.now(),
  });

  // Track minutes played in state for time-based effects
  const [minutesPlayed, setMinutesPlayed] = useState(0);

  // Store hooks
  const { checkUnlockConditions, unlockEntry } = useKnowledgeStore();
  const { getNarration, markShown, hasBeenShown, enabled: narrationEnabled } = useAINarrationStore();

  // Game state hooks - use selectors for performance
  const votes = useVotingStore((s) => s.votes);
  const axes = useBASStore((s) => s.axes);
  const getStabilityPercentage = useStabilityStore((s) => s.getStabilityPercentage);
  const getFactoryFlourishing = useFlourishingStore((s) => s.getFactoryFlourishing);

  // Helper to trigger narration
  const triggerNarration = useCallback(
    (trigger: NarrationTrigger) => {
      if (!FEATURE_FLAGS.AI_NARRATION_ENABLED || !narrationEnabled) return;

      const narration = getNarration(trigger, minutesPlayed);
      if (narration) {
        markShown(narration.id);
        if (narration.unlocksEntry) {
          unlockEntry(narration.unlocksEntry);
        }
        onNarration?.(narration);
      }
    },
    [getNarration, markShown, unlockEntry, narrationEnabled, minutesPlayed, onNarration]
  );

  // =========================================================================
  // FIRST PLAY DETECTION
  // =========================================================================
  useEffect(() => {
    if (!FEATURE_FLAGS.FIRST_PLAY_WELCOME_ENABLED) return;
    if (stateRef.current.hasTriggeredFirstPlay) return;

    // Belt-and-suspenders: check both localStorage AND the persisted store
    const hasPlayedBefore = localStorage.getItem('millos-has-played');
    const welcomeAlreadyShown = hasBeenShown('welcome');

    // Only show if BOTH checks say "not shown yet"
    if (!hasPlayedBefore && !welcomeAlreadyShown) {
      localStorage.setItem('millos-has-played', 'true');
      stateRef.current.hasTriggeredFirstPlay = true;

      // Delay slightly to let UI settle
      setTimeout(() => {
        triggerNarration('first-play');
      }, 2000);
    } else if (!hasPlayedBefore && welcomeAlreadyShown) {
      // Sync localStorage if store says already shown
      localStorage.setItem('millos-has-played', 'true');
    }
  }, [triggerNarration, hasBeenShown]);

  // =========================================================================
  // VOTING DETECTION
  // =========================================================================
  useEffect(() => {
    if (stateRef.current.hasVotedThisSession) return;

    // Check if any votes exist (votes object is not empty)
    const hasVotes = Object.keys(votes).length > 0;

    if (hasVotes) {
      stateRef.current.hasVotedThisSession = true;

      // Trigger unlock check
      checkUnlockConditions({ hasVoted: true });

      // Trigger narration
      triggerNarration('democratic-vote');
    }
  }, [votes, checkUnlockConditions, triggerNarration]);

  // =========================================================================
  // AXIS ADJUSTMENT DETECTION
  // =========================================================================
  useEffect(() => {
    const axisKeys = [
      'autonomyLevel',
      'decisionMode',
      'informationAccess',
      'evaluationDirection',
      'collectiveOrientation',
    ] as const;

    // Track which axes have been adjusted
    axisKeys.forEach((key) => {
      const value = axes[key];
      // Consider adjusted if not at default (50)
      if (value !== 50 && !stateRef.current.axesAdjusted.has(key)) {
        stateRef.current.axesAdjusted.add(key);

        // Trigger specific narrations
        if (key === 'autonomyLevel' && value > 75) {
          triggerNarration('high-autonomy-set');
        }
        if (key === 'informationAccess' && value >= 95) {
          triggerNarration('max-transparency-set');
        }
      }
    });

    // Check if all axes have been adjusted
    if (stateRef.current.axesAdjusted.size === 5) {
      checkUnlockConditions({ hasUsedAllAxes: true });
      triggerNarration('all-axes-adjusted');
    }
  }, [axes, checkUnlockConditions, triggerNarration]);

  // =========================================================================
  // STABILITY DETECTION
  // =========================================================================
  useEffect(() => {
    const now = Date.now();
    // Only check every 30 seconds
    if (now - stateRef.current.lastStabilityCheck < 30000) return;
    stateRef.current.lastStabilityCheck = now;

    const stability = getStabilityPercentage();
    if (stability >= 80) {
      checkUnlockConditions({ hasAchievedHighStability: true });
      triggerNarration('stability-high');
    } else if (stability < 30) {
      triggerNarration('stability-critical');
    }
  }, [getStabilityPercentage, checkUnlockConditions, triggerNarration]);

  // =========================================================================
  // FLOURISHING DETECTION
  // =========================================================================
  useEffect(() => {
    const now = Date.now();
    // Only check every 30 seconds
    if (now - stateRef.current.lastFlourishingCheck < 30000) return;
    stateRef.current.lastFlourishingCheck = now;

    const factoryFlourishing = getFactoryFlourishing();
    const avgFlourishing = factoryFlourishing.overallScore;

    if (avgFlourishing >= 0.8) {
      checkUnlockConditions({ hasAchievedHighFlourishing: true });
      triggerNarration('all-workers-thriving');
    } else if (avgFlourishing < 0.4) {
      triggerNarration('flourishing-dropped');
    }
  }, [getFactoryFlourishing, checkUnlockConditions, triggerNarration]);

  // =========================================================================
  // PLAY TIME TRACKING
  // =========================================================================
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = (Date.now() - stateRef.current.sessionStartTime) / 60000;
      setMinutesPlayed(elapsed);

      // Check time-based unlocks
      checkUnlockConditions({ minutesPlayed: elapsed });

      // Trigger extended play narration at 60 minutes
      if (elapsed >= 60) {
        triggerNarration('extended-play');
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [checkUnlockConditions, triggerNarration]);

  // =========================================================================
  // RETURN API FOR MANUAL TRIGGERS
  // =========================================================================
  return {
    /**
     * Call when AI suggestion is rejected by user
     */
    onSuggestionRejected: useCallback(() => {
      if (stateRef.current.hasRejectedSuggestion) return;
      stateRef.current.hasRejectedSuggestion = true;
      checkUnlockConditions({ hasRejectedAISuggestion: true });
      triggerNarration('suggestion-rejected-gracefully');
    }, [checkUnlockConditions, triggerNarration]),

    /**
     * Call when AI wellbeing suggestion is accepted
     */
    onWellbeingSuggestionAccepted: useCallback(() => {
      if (stateRef.current.hasAcceptedWellbeingSuggestion) return;
      stateRef.current.hasAcceptedWellbeingSuggestion = true;
      checkUnlockConditions({ hasAcceptedAISuggestion: true });
      triggerNarration('wellbeing-prioritized');
    }, [checkUnlockConditions, triggerNarration]),

    /**
     * Call when federation trade is completed
     */
    onFederationTrade: useCallback(() => {
      checkUnlockConditions({ hasCompletedFederationTrade: true });
      triggerNarration('federation-trade');
    }, [checkUnlockConditions, triggerNarration]),

    /**
     * Call when AI welfare panel is viewed
     */
    onAIWelfareViewed: useCallback(() => {
      unlockEntry('ai-welfare');
      triggerNarration('ai-welfare-viewed');
    }, [unlockEntry, triggerNarration]),

    /**
     * Manually trigger any narration
     */
    triggerNarration,
  };
}
