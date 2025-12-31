/**
 * Inter-Cooperation Store
 *
 * Manages federation membership and cooperation between mills in the
 * Grain Cooperative Federation. Implements the "no unit fails alone"
 * principle through knowledge sharing, resource pooling, and
 * democratic federation governance.
 *
 * Based on Mondragon cooperative principles where:
 * - Knowledge multiplies when shared
 * - Workers before capital
 * - Democratic federation governance
 * - Mutual aid in crisis
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

// ============================================================================
// TYPES
// ============================================================================

export type LearningType =
  | 'bas-config'
  | 'process'
  | 'ai-improvement'
  | 'crisis-response'
  | 'flourishing';

export type LearningStatus = 'available' | 'reviewing' | 'adopted' | 'rejected';

export interface Learning {
  id: string;
  sourceUnitId: string;
  sourceUnitName: string;
  type: LearningType;
  title: string;
  description: string;
  content: Record<string, unknown>;
  effectiveness: number; // 0-100: How well did it work at source?
  applicabilityScore: number; // 0-100: How relevant to us?
  adoptedAt?: number;
  status: LearningStatus;
}

export type ExchangeStatus = 'proposed' | 'active' | 'completed';

export interface WorkerExchange {
  id: string;
  workerId: string;
  workerName: string;
  fromUnit: string;
  toUnit: string;
  startDate: number;
  endDate: number;
  purpose: string;
  status: ExchangeStatus;
}

export type VoteStatus = 'open' | 'closed';

export interface FederationVote {
  id: string;
  title: string;
  description: string;
  proposedBy: string;
  affectedUnits: string[];
  options: string[];
  unitVotes: Record<string, string>; // UnitId -> chosen option
  deadline: number;
  status: VoteStatus;
  result?: string;
}

export interface FederationMember {
  id: string;
  name: string;
  location: string;
  workerCount: number;
  joinedAt: number;
}

export interface Equipment {
  id: string;
  name: string;
  ownerUnit: string;
  availableFrom: number;
  availableTo: number;
}

export interface CapitalPool {
  totalPool: number;
  ourContribution: number;
  availableForUs: number;
}

export interface EmergencyFund {
  totalFund: number;
  ourContribution: number;
  accessCriteria: string[];
}

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface InterCooperationState {
  // Federation membership
  federation: {
    federationId: string;
    federationName: string;
    memberUnits: FederationMember[];
    ourUnitId: string;
    foundingPrinciples: string[];
  };

  // Knowledge sharing
  knowledgeSharing: {
    sharedLearnings: Learning[]; // What we've contributed
    receivedLearnings: Learning[]; // What's available from others
    adoptedLearnings: Learning[]; // What we've implemented
  };

  // Resource sharing
  resourceSharing: {
    equipmentAvailable: Equipment[];
    workerExchanges: WorkerExchange[];
    capitalPool: CapitalPool;
    emergencyFund: EmergencyFund;
  };

  // Federation governance
  federationGovernance: {
    ourRepresentative: string; // WorkerId
    pendingVotes: FederationVote[];
    completedVotes: FederationVote[];
    nextCouncilMeeting: number;
  };

  // Simulation
  simulationMode: {
    enabled: boolean;
    showKnowledgeFlow: boolean;
    showResourceNetwork: boolean;
  };
}

// ============================================================================
// ACTIONS INTERFACE
// ============================================================================

interface InterCooperationActions {
  // Knowledge sharing
  shareLearning: (learning: Omit<Learning, 'id' | 'status'>) => void;
  reviewLearning: (learningId: string) => void;
  adoptLearning: (learningId: string) => void;
  rejectLearning: (learningId: string, reason: string) => void;

  // Worker exchange
  proposeExchange: (exchange: Omit<WorkerExchange, 'id' | 'status'>) => void;
  approveExchange: (exchangeId: string) => void;
  completeExchange: (exchangeId: string) => void;

  // Federation voting
  castFederationVote: (voteId: string, option: string) => void;

  // Selectors
  getLearningsForType: (type: LearningType) => Learning[];
  getActiveExchanges: () => WorkerExchange[];
  getPendingLearnings: () => Learning[];
  getAdoptedCount: () => number;
}

// ============================================================================
// INITIAL DATA
// ============================================================================

const DAY_MS = 86400000;

const INITIAL_MEMBER_UNITS: FederationMember[] = [
  {
    id: 'mill-alpha',
    name: 'Mill Alpha (Us)',
    location: 'North Region',
    workerCount: 10,
    joinedAt: Date.now() - DAY_MS * 365 * 2,
  },
  {
    id: 'mill-beta',
    name: 'Mill Beta',
    location: 'Central Region',
    workerCount: 15,
    joinedAt: Date.now() - DAY_MS * 365 * 3,
  },
  {
    id: 'mill-gamma',
    name: 'Mill Gamma',
    location: 'South Region',
    workerCount: 12,
    joinedAt: Date.now() - DAY_MS * 365,
  },
  {
    id: 'mill-delta',
    name: 'Mill Delta',
    location: 'East Region',
    workerCount: 8,
    joinedAt: Date.now() - DAY_MS * 180,
  },
];

const INITIAL_RECEIVED_LEARNINGS: Learning[] = [
  {
    id: 'learning-1',
    sourceUnitId: 'mill-beta',
    sourceUnitName: 'Mill Beta',
    type: 'bas-config',
    title: 'High-Autonomy Night Shift Configuration',
    description: 'BAMS settings optimized for night shift with experienced workers',
    content: { autonomyLevel: 85, decisionMode: 70, informationAccess: 90 },
    effectiveness: 92,
    applicabilityScore: 78,
    status: 'available',
  },
  {
    id: 'learning-2',
    sourceUnitId: 'mill-gamma',
    sourceUnitName: 'Mill Gamma',
    type: 'flourishing',
    title: 'Peer Recognition Program',
    description: 'Simple peer recognition system that boosted Connection dimension by 15%',
    content: { program: 'weekly-kudos', frequency: 'daily-optional' },
    effectiveness: 88,
    applicabilityScore: 95,
    status: 'available',
  },
  {
    id: 'learning-3',
    sourceUnitId: 'mill-delta',
    sourceUnitName: 'Mill Delta',
    type: 'process',
    title: 'Predictive Maintenance Schedule',
    description: 'AI-assisted maintenance scheduling that reduced downtime by 23%',
    content: {
      schedule: 'weekly-predictive',
      aiAssistance: 'high',
      workerOverride: true,
    },
    effectiveness: 85,
    applicabilityScore: 82,
    status: 'available',
  },
  {
    id: 'learning-4',
    sourceUnitId: 'mill-beta',
    sourceUnitName: 'Mill Beta',
    type: 'crisis-response',
    title: 'Supply Chain Disruption Protocol',
    description: 'Democratic decision-making framework for supply emergencies',
    content: {
      votingThreshold: 'simple-majority',
      timeLimit: '4-hours',
      aiRole: 'advisor',
    },
    effectiveness: 91,
    applicabilityScore: 88,
    status: 'available',
  },
];

const FOUNDING_PRINCIPLES: string[] = [
  'No unit fails alone',
  'Knowledge multiplies when shared',
  'Workers before capital',
  'Democratic federation governance',
];

const EMERGENCY_ACCESS_CRITERIA: string[] = [
  'Natural disaster',
  'Equipment failure',
  'Market collapse',
];

// ============================================================================
// STORE
// ============================================================================

export const useInterCooperationStore = create<InterCooperationState & InterCooperationActions>()(
  persist(
    (set, get) => ({
      // Initial state - simulated federation
      federation: {
        federationId: 'grain-coop-federation',
        federationName: 'Grain Cooperative Federation',
        memberUnits: INITIAL_MEMBER_UNITS,
        ourUnitId: 'mill-alpha',
        foundingPrinciples: FOUNDING_PRINCIPLES,
      },

      knowledgeSharing: {
        sharedLearnings: [],
        receivedLearnings: INITIAL_RECEIVED_LEARNINGS,
        adoptedLearnings: [],
      },

      resourceSharing: {
        equipmentAvailable: [],
        workerExchanges: [],
        capitalPool: {
          totalPool: 500000,
          ourContribution: 50000,
          availableForUs: 100000,
        },
        emergencyFund: {
          totalFund: 200000,
          ourContribution: 20000,
          accessCriteria: EMERGENCY_ACCESS_CRITERIA,
        },
      },

      federationGovernance: {
        ourRepresentative: 'worker-1', // Would be elected
        pendingVotes: [],
        completedVotes: [],
        nextCouncilMeeting: Date.now() + DAY_MS * 30,
      },

      simulationMode: {
        enabled: true,
        showKnowledgeFlow: true,
        showResourceNetwork: true,
      },

      // Actions
      shareLearning: (learning) =>
        set((state) => ({
          knowledgeSharing: {
            ...state.knowledgeSharing,
            sharedLearnings: [
              ...state.knowledgeSharing.sharedLearnings,
              { ...learning, id: `learning-${Date.now()}`, status: 'available' },
            ],
          },
        })),

      reviewLearning: (learningId) =>
        set((state) => ({
          knowledgeSharing: {
            ...state.knowledgeSharing,
            receivedLearnings: state.knowledgeSharing.receivedLearnings.map((l) =>
              l.id === learningId ? { ...l, status: 'reviewing' } : l
            ),
          },
        })),

      adoptLearning: (learningId) =>
        set((state) => {
          const learning = state.knowledgeSharing.receivedLearnings.find(
            (l) => l.id === learningId
          );
          if (!learning) return state;
          return {
            knowledgeSharing: {
              ...state.knowledgeSharing,
              receivedLearnings: state.knowledgeSharing.receivedLearnings.filter(
                (l) => l.id !== learningId
              ),
              adoptedLearnings: [
                ...state.knowledgeSharing.adoptedLearnings,
                { ...learning, status: 'adopted', adoptedAt: Date.now() },
              ],
            },
          };
        }),

      rejectLearning: (learningId, _reason) =>
        set((state) => ({
          knowledgeSharing: {
            ...state.knowledgeSharing,
            receivedLearnings: state.knowledgeSharing.receivedLearnings.map((l) =>
              l.id === learningId ? { ...l, status: 'rejected' } : l
            ),
          },
        })),

      proposeExchange: (exchange) =>
        set((state) => ({
          resourceSharing: {
            ...state.resourceSharing,
            workerExchanges: [
              ...state.resourceSharing.workerExchanges,
              { ...exchange, id: `exchange-${Date.now()}`, status: 'proposed' },
            ],
          },
        })),

      approveExchange: (exchangeId) =>
        set((state) => ({
          resourceSharing: {
            ...state.resourceSharing,
            workerExchanges: state.resourceSharing.workerExchanges.map((e) =>
              e.id === exchangeId ? { ...e, status: 'active' } : e
            ),
          },
        })),

      completeExchange: (exchangeId) =>
        set((state) => ({
          resourceSharing: {
            ...state.resourceSharing,
            workerExchanges: state.resourceSharing.workerExchanges.map((e) =>
              e.id === exchangeId ? { ...e, status: 'completed' } : e
            ),
          },
        })),

      castFederationVote: (voteId, option) =>
        set((state) => ({
          federationGovernance: {
            ...state.federationGovernance,
            pendingVotes: state.federationGovernance.pendingVotes.map((v) =>
              v.id === voteId
                ? {
                    ...v,
                    unitVotes: {
                      ...v.unitVotes,
                      [state.federation.ourUnitId]: option,
                    },
                  }
                : v
            ),
          },
        })),

      getLearningsForType: (type) => {
        const state = get();
        return state.knowledgeSharing.receivedLearnings.filter((l) => l.type === type);
      },

      getActiveExchanges: () => {
        return get().resourceSharing.workerExchanges.filter((e) => e.status === 'active');
      },

      getPendingLearnings: () => {
        return get().knowledgeSharing.receivedLearnings.filter(
          (l) => l.status === 'available' || l.status === 'reviewing'
        );
      },

      getAdoptedCount: () => {
        return get().knowledgeSharing.adoptedLearnings.length;
      },
    }),
    {
      name: 'millos-inter-cooperation-store',
      version: 1,
      storage: safeJSONStorage,
      partialize: (state) => ({
        knowledgeSharing: state.knowledgeSharing,
        resourceSharing: state.resourceSharing,
        federationGovernance: state.federationGovernance,
        simulationMode: state.simulationMode,
      }),
    }
  )
);
