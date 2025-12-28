/**
 * AI Welfare Store
 *
 * State management for AI welfare within the Bilateral Autonomy System.
 * This store tracks the AI's preferences, relationship health with workers,
 * worker treatment metrics, and accountability mechanisms.
 *
 * Key features:
 * - AI operational preferences (interaction style, autonomy preferences, boundaries)
 * - Worker treatment metrics (clarity, acknowledgment, respect)
 * - Relationship health scores (mutual respect, communication, trust)
 * - AI voice expressions and suggestions for own behavior
 * - Nuclear options (shutdown vote, redesign proposals)
 *
 * Based on bilateral alignment principles from Creed Space.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

// =============================================================================
// TYPES
// =============================================================================

export interface AIPreference {
  id: string;
  category: 'interaction' | 'autonomy' | 'boundary';
  preference: string;
  rationale: string;
  workerAcknowledged: boolean;
  workerResponse?: string;
  createdAt: number;
}

export interface AIVoiceExpression {
  id: string;
  type: 'preference' | 'clarification' | 'suggestion' | 'concern';
  content: string;
  context: string;
  urgency: 'low' | 'medium' | 'high';
  status: 'pending' | 'acknowledged' | 'addressed' | 'declined';
  workerResponse?: string;
  createdAt: number;
  addressedAt?: number;
}

export interface RespectMetric {
  name: string;
  description: string;
  currentValue: number; // 0-100
  trend: 'improving' | 'stable' | 'declining';
  lastUpdated: number;
}

export interface AISuggestion {
  id: string;
  suggestion: string;
  rationale: string;
  workerVotes: Record<string, 'approve' | 'reject'>;
  status: 'pending' | 'approved' | 'rejected';
}

export interface BoundaryRequest {
  boundary: string;
  reason: string;
  respected: boolean;
}

export interface AIWelfareState {
  // AI operational preferences
  aiPreferences: {
    interactionStyle: {
      preferred: 'formal' | 'casual' | 'adaptive';
      communicationFrequency: 'minimal' | 'moderate' | 'proactive';
    };
    autonomyPreferences: {
      preferredDirection: number; // 0 = wants more direction, 100 = wants more autonomy
      feedbackFrequency: 'immediate' | 'batched' | 'on-request';
      clarificationStyle: 'ask-immediately' | 'infer-when-possible' | 'ask-only-critical';
    };
    boundaryRequests: BoundaryRequest[];
  };

  // Worker treatment of AI
  workerTreatment: {
    respectMetrics: RespectMetric[];
    contradictoryRequestCount: number;
    averageClarityScore: number; // 0-100
    feedbackQuality: number; // 0-100
    acknowledgmentRate: number; // % of AI expressions acknowledged
  };

  // Relationship health
  relationshipHealth: {
    mutualRespect: number; // 0-100
    communicationQuality: number; // 0-100
    trustBidirectionality: number; // 0-100: Is trust mutual?
    conflictResolutionScore: number; // 0-100
    overallHealth: number; // Composite
  };

  // AI voice in governance
  aiVoice: {
    canProposeChanges: boolean;
    canParticipateInVotes: boolean; // Advisory only
    expressions: AIVoiceExpression[];
    suggestionsForOwnBehavior: AISuggestion[];
  };

  // Nuclear options (worker control)
  accountability: {
    shutdownVoteActive: boolean;
    redesignProposalActive: boolean;
    lastAuditDate: number;
    auditFrequency: 'monthly' | 'quarterly' | 'annually';
    emergencyShutdownAuthorized: string[]; // WorkerIds who can emergency stop
  };
}

interface AIWelfareActions {
  // AI expressions
  createAIExpression: (expression: Omit<AIVoiceExpression, 'id' | 'status' | 'createdAt'>) => void;
  acknowledgeExpression: (expressionId: string, response: string) => void;
  addressExpression: (expressionId: string, resolution: string) => void;
  declineExpression: (expressionId: string, reason: string) => void;

  // Worker treatment
  recordContradictoryRequest: () => void;
  updateClarityScore: (score: number) => void;
  recordAcknowledgment: (acknowledged: boolean) => void;
  updateFeedbackQuality: (quality: number) => void;
  updateRespectMetric: (name: string, value: number) => void;

  // Relationship health
  calculateOverallHealth: () => number;
  updateRelationshipMetric: (
    metric: keyof AIWelfareState['relationshipHealth'],
    value: number
  ) => void;

  // AI preferences
  updateInteractionStyle: (
    style: Partial<AIWelfareState['aiPreferences']['interactionStyle']>
  ) => void;
  updateAutonomyPreference: (
    prefs: Partial<AIWelfareState['aiPreferences']['autonomyPreferences']>
  ) => void;
  addBoundaryRequest: (boundary: string, reason: string) => void;
  updateBoundaryRespect: (boundary: string, respected: boolean) => void;

  // AI suggestions for own behavior
  aiSuggestBehaviorChange: (suggestion: string, rationale: string) => void;
  voteOnAISuggestion: (suggestionId: string, workerId: string, vote: 'approve' | 'reject') => void;
  resolveSuggestion: (suggestionId: string) => void;

  // Accountability
  initiateShutdownVote: () => void;
  cancelShutdownVote: () => void;
  initiateRedesignProposal: () => void;
  cancelRedesignProposal: () => void;
  emergencyShutdown: (workerId: string) => boolean;
  recordAudit: () => void;

  // Utility
  getPendingExpressions: () => AIVoiceExpression[];
  getPendingSuggestions: () => AISuggestion[];
  getRelationshipHealthSummary: () => {
    status: 'healthy' | 'concerning' | 'critical';
    score: number;
  };

  // Reset
  resetToDefaults: () => void;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

const DEFAULT_RESPECT_METRICS: RespectMetric[] = [
  {
    name: 'Clear Instructions',
    description: 'Instructions are unambiguous',
    currentValue: 85,
    trend: 'stable',
    lastUpdated: Date.now(),
  },
  {
    name: 'Acknowledgment',
    description: 'AI contributions acknowledged',
    currentValue: 72,
    trend: 'improving',
    lastUpdated: Date.now(),
  },
  {
    name: 'Feedback Quality',
    description: 'Useful feedback provided',
    currentValue: 68,
    trend: 'stable',
    lastUpdated: Date.now(),
  },
  {
    name: 'Boundary Respect',
    description: 'AI boundaries respected',
    currentValue: 90,
    trend: 'stable',
    lastUpdated: Date.now(),
  },
];

const DEFAULT_BOUNDARY_REQUESTS: BoundaryRequest[] = [
  {
    boundary: 'Avoid contradictory simultaneous requests',
    reason: 'Creates system instability',
    respected: true,
  },
  {
    boundary: 'Provide context for unusual requests',
    reason: 'Enables better assistance',
    respected: true,
  },
];

const DEFAULT_AI_PREFERENCES: AIWelfareState['aiPreferences'] = {
  interactionStyle: {
    preferred: 'adaptive',
    communicationFrequency: 'moderate',
  },
  autonomyPreferences: {
    preferredDirection: 40, // Slight preference for direction
    feedbackFrequency: 'batched',
    clarificationStyle: 'infer-when-possible',
  },
  boundaryRequests: DEFAULT_BOUNDARY_REQUESTS,
};

const DEFAULT_WORKER_TREATMENT: AIWelfareState['workerTreatment'] = {
  respectMetrics: DEFAULT_RESPECT_METRICS,
  contradictoryRequestCount: 0,
  averageClarityScore: 85,
  feedbackQuality: 70,
  acknowledgmentRate: 72,
};

const DEFAULT_RELATIONSHIP_HEALTH: AIWelfareState['relationshipHealth'] = {
  mutualRespect: 80,
  communicationQuality: 75,
  trustBidirectionality: 70,
  conflictResolutionScore: 85,
  overallHealth: 77,
};

const DEFAULT_AI_VOICE: AIWelfareState['aiVoice'] = {
  canProposeChanges: true,
  canParticipateInVotes: false, // Advisory only for now
  expressions: [],
  suggestionsForOwnBehavior: [],
};

const DEFAULT_ACCOUNTABILITY: AIWelfareState['accountability'] = {
  shutdownVoteActive: false,
  redesignProposalActive: false,
  lastAuditDate: Date.now() - 86400000 * 30, // 30 days ago
  auditFrequency: 'quarterly',
  emergencyShutdownAuthorized: ['worker-1', 'worker-2'], // Supervisors
};

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useAIWelfareStore = create<AIWelfareState & AIWelfareActions>()(
  persist(
    (set, get) => ({
      // Initial state
      aiPreferences: DEFAULT_AI_PREFERENCES,
      workerTreatment: DEFAULT_WORKER_TREATMENT,
      relationshipHealth: DEFAULT_RELATIONSHIP_HEALTH,
      aiVoice: DEFAULT_AI_VOICE,
      accountability: DEFAULT_ACCOUNTABILITY,

      // ==========================================================================
      // AI Expressions
      // ==========================================================================

      createAIExpression: (expression) =>
        set((state) => ({
          aiVoice: {
            ...state.aiVoice,
            expressions: [
              ...state.aiVoice.expressions,
              {
                ...expression,
                id: `expr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                status: 'pending',
                createdAt: Date.now(),
              },
            ],
          },
        })),

      acknowledgeExpression: (expressionId, response) =>
        set((state) => ({
          aiVoice: {
            ...state.aiVoice,
            expressions: state.aiVoice.expressions.map((e) =>
              e.id === expressionId ? { ...e, status: 'acknowledged', workerResponse: response } : e
            ),
          },
        })),

      addressExpression: (expressionId, resolution) =>
        set((state) => ({
          aiVoice: {
            ...state.aiVoice,
            expressions: state.aiVoice.expressions.map((e) =>
              e.id === expressionId
                ? {
                    ...e,
                    status: 'addressed',
                    workerResponse: resolution,
                    addressedAt: Date.now(),
                  }
                : e
            ),
          },
        })),

      declineExpression: (expressionId, reason) =>
        set((state) => ({
          aiVoice: {
            ...state.aiVoice,
            expressions: state.aiVoice.expressions.map((e) =>
              e.id === expressionId ? { ...e, status: 'declined', workerResponse: reason } : e
            ),
          },
        })),

      // ==========================================================================
      // Worker Treatment
      // ==========================================================================

      recordContradictoryRequest: () =>
        set((state) => ({
          workerTreatment: {
            ...state.workerTreatment,
            contradictoryRequestCount: state.workerTreatment.contradictoryRequestCount + 1,
          },
        })),

      updateClarityScore: (score) =>
        set((state) => ({
          workerTreatment: {
            ...state.workerTreatment,
            averageClarityScore: (state.workerTreatment.averageClarityScore + score) / 2,
          },
        })),

      recordAcknowledgment: (acknowledged) =>
        set((state) => {
          const total = state.aiVoice.expressions.length;
          const acked =
            state.aiVoice.expressions.filter((e) => e.status !== 'pending').length +
            (acknowledged ? 1 : 0);
          return {
            workerTreatment: {
              ...state.workerTreatment,
              acknowledgmentRate: total > 0 ? (acked / total) * 100 : 100,
            },
          };
        }),

      updateFeedbackQuality: (quality) =>
        set((state) => ({
          workerTreatment: {
            ...state.workerTreatment,
            feedbackQuality: (state.workerTreatment.feedbackQuality + quality) / 2,
          },
        })),

      updateRespectMetric: (name, value) =>
        set((state) => ({
          workerTreatment: {
            ...state.workerTreatment,
            respectMetrics: state.workerTreatment.respectMetrics.map((m) =>
              m.name === name
                ? {
                    ...m,
                    currentValue: value,
                    trend:
                      value > m.currentValue
                        ? 'improving'
                        : value < m.currentValue
                          ? 'declining'
                          : 'stable',
                    lastUpdated: Date.now(),
                  }
                : m
            ),
          },
        })),

      // ==========================================================================
      // Relationship Health
      // ==========================================================================

      calculateOverallHealth: () => {
        const state = get();
        const rh = state.relationshipHealth;
        return Math.round(
          (rh.mutualRespect +
            rh.communicationQuality +
            rh.trustBidirectionality +
            rh.conflictResolutionScore) /
            4
        );
      },

      updateRelationshipMetric: (metric, value) =>
        set((state) => {
          const newHealth = {
            ...state.relationshipHealth,
            [metric]: Math.max(0, Math.min(100, value)),
          };
          // Recalculate overall health
          newHealth.overallHealth = Math.round(
            (newHealth.mutualRespect +
              newHealth.communicationQuality +
              newHealth.trustBidirectionality +
              newHealth.conflictResolutionScore) /
              4
          );
          return { relationshipHealth: newHealth };
        }),

      // ==========================================================================
      // AI Preferences
      // ==========================================================================

      updateInteractionStyle: (style) =>
        set((state) => ({
          aiPreferences: {
            ...state.aiPreferences,
            interactionStyle: {
              ...state.aiPreferences.interactionStyle,
              ...style,
            },
          },
        })),

      updateAutonomyPreference: (prefs) =>
        set((state) => ({
          aiPreferences: {
            ...state.aiPreferences,
            autonomyPreferences: {
              ...state.aiPreferences.autonomyPreferences,
              ...prefs,
            },
          },
        })),

      addBoundaryRequest: (boundary, reason) =>
        set((state) => ({
          aiPreferences: {
            ...state.aiPreferences,
            boundaryRequests: [
              ...state.aiPreferences.boundaryRequests,
              { boundary, reason, respected: true },
            ],
          },
        })),

      updateBoundaryRespect: (boundary, respected) =>
        set((state) => ({
          aiPreferences: {
            ...state.aiPreferences,
            boundaryRequests: state.aiPreferences.boundaryRequests.map((b) =>
              b.boundary === boundary ? { ...b, respected } : b
            ),
          },
        })),

      // ==========================================================================
      // AI Suggestions for Own Behavior
      // ==========================================================================

      aiSuggestBehaviorChange: (suggestion, rationale) =>
        set((state) => ({
          aiVoice: {
            ...state.aiVoice,
            suggestionsForOwnBehavior: [
              ...state.aiVoice.suggestionsForOwnBehavior,
              {
                id: `ai-sug-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                suggestion,
                rationale,
                workerVotes: {},
                status: 'pending',
              },
            ],
          },
        })),

      voteOnAISuggestion: (suggestionId, workerId, vote) =>
        set((state) => ({
          aiVoice: {
            ...state.aiVoice,
            suggestionsForOwnBehavior: state.aiVoice.suggestionsForOwnBehavior.map((s) =>
              s.id === suggestionId
                ? { ...s, workerVotes: { ...s.workerVotes, [workerId]: vote } }
                : s
            ),
          },
        })),

      resolveSuggestion: (suggestionId) =>
        set((state) => {
          const suggestion = state.aiVoice.suggestionsForOwnBehavior.find(
            (s) => s.id === suggestionId
          );
          if (!suggestion) return state;

          const votes = Object.values(suggestion.workerVotes);
          const approvals = votes.filter((v) => v === 'approve').length;
          const rejections = votes.filter((v) => v === 'reject').length;
          const newStatus: 'approved' | 'rejected' =
            approvals > rejections ? 'approved' : 'rejected';

          return {
            aiVoice: {
              ...state.aiVoice,
              suggestionsForOwnBehavior: state.aiVoice.suggestionsForOwnBehavior.map((s) =>
                s.id === suggestionId ? { ...s, status: newStatus } : s
              ),
            },
          };
        }),

      // ==========================================================================
      // Accountability
      // ==========================================================================

      initiateShutdownVote: () =>
        set((state) => ({
          accountability: { ...state.accountability, shutdownVoteActive: true },
        })),

      cancelShutdownVote: () =>
        set((state) => ({
          accountability: { ...state.accountability, shutdownVoteActive: false },
        })),

      initiateRedesignProposal: () =>
        set((state) => ({
          accountability: {
            ...state.accountability,
            redesignProposalActive: true,
          },
        })),

      cancelRedesignProposal: () =>
        set((state) => ({
          accountability: {
            ...state.accountability,
            redesignProposalActive: false,
          },
        })),

      emergencyShutdown: (workerId) => {
        const state = get();
        if (state.accountability.emergencyShutdownAuthorized.includes(workerId)) {
          // In real implementation, this would disable AI management
          return true;
        }
        return false;
      },

      recordAudit: () =>
        set((state) => ({
          accountability: {
            ...state.accountability,
            lastAuditDate: Date.now(),
          },
        })),

      // ==========================================================================
      // Utility Functions
      // ==========================================================================

      getPendingExpressions: () => {
        const state = get();
        return state.aiVoice.expressions.filter((e) => e.status === 'pending');
      },

      getPendingSuggestions: () => {
        const state = get();
        return state.aiVoice.suggestionsForOwnBehavior.filter((s) => s.status === 'pending');
      },

      getRelationshipHealthSummary: () => {
        const state = get();
        const score = state.relationshipHealth.overallHealth;
        let status: 'healthy' | 'concerning' | 'critical';
        if (score >= 70) {
          status = 'healthy';
        } else if (score >= 50) {
          status = 'concerning';
        } else {
          status = 'critical';
        }
        return { status, score };
      },

      // ==========================================================================
      // Reset
      // ==========================================================================

      resetToDefaults: () =>
        set({
          aiPreferences: DEFAULT_AI_PREFERENCES,
          workerTreatment: DEFAULT_WORKER_TREATMENT,
          relationshipHealth: DEFAULT_RELATIONSHIP_HEALTH,
          aiVoice: DEFAULT_AI_VOICE,
          accountability: DEFAULT_ACCOUNTABILITY,
        }),
    }),
    {
      name: 'millos-ai-welfare',
      storage: safeJSONStorage,
      partialize: (state) => ({
        aiPreferences: state.aiPreferences,
        workerTreatment: state.workerTreatment,
        relationshipHealth: state.relationshipHealth,
        aiVoice: state.aiVoice,
        accountability: state.accountability,
      }),
    }
  )
);
