/**
 * Economic Democracy / Ownership Store
 *
 * Manages ownership structure, profit distribution, wage solidarity,
 * and investment decisions following Mondragon cooperative principles.
 *
 * Key features:
 * - Collective ownership (51%+ worker-owned)
 * - Wage solidarity (max ratio between highest and lowest pay)
 * - Self-set compensation with transparency
 * - Democratic investment voting
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeJSONStorage } from './storage';

// ============================================================================
// TYPES
// ============================================================================

export interface VestingRule {
  yearsOfService: number;
  percentageVested: number;
}

export interface DistributionModel {
  type: 'equal' | 'hours-weighted' | 'role-weighted' | 'tenure-weighted' | 'hybrid';
  weights?: {
    hours: number;
    role: number;
    tenure: number;
    performance: number;
  };
}

export interface PeerFeedback {
  fromWorkerId: string;
  feedback: string;
  timestamp: number;
}

export interface Compensation {
  workerId: string;
  baseAmount: number;
  proposedBy: 'self' | 'collective' | 'ai-suggested';
  rationale: string;
  effectiveDate: number;
  visibleToAll: boolean;
  peerFeedback: PeerFeedback[];
}

export interface InvestmentVote {
  workerId: string;
  vote: 'approve' | 'reject' | 'abstain';
}

export interface InvestmentProposal {
  id: string;
  title: string;
  description: string;
  amount: number;
  proposedBy: string;
  expectedReturn: string;
  riskLevel: 'low' | 'medium' | 'high';
  votingDeadline: number;
  votes: InvestmentVote[];
  status: 'pending' | 'approved' | 'rejected';
}

// ============================================================================
// STATE INTERFACE
// ============================================================================

export interface OwnershipState {
  // Ownership structure
  structure: {
    collectiveShare: number; // % held by worker collective (should be 51%+)
    individualShares: Record<string, number>; // WorkerId -> share %
    reservePool: number; // Available for new members
    vestingSchedule: VestingRule[];
  };

  // Profit distribution
  distribution: {
    currentPeriodProfit: number;
    distributionModel: DistributionModel;
    workerPayouts: Record<string, number>;
    reinvestmentPercentage: number; // Decided by vote
    communityFundPercentage: number;
    educationFundPercentage: number;
  };

  // Wage solidarity
  wageSolidarity: {
    targetRatio: number; // e.g., 6.0 (6:1)
    currentRatio: number;
    ceiling: number; // Maximum allowed ratio
    compensationTransparency: boolean;
    workerCompensation: Record<string, Compensation>;
  };

  // Capital decisions
  capitalDecisions: {
    pendingInvestments: InvestmentProposal[];
    approvedInvestments: InvestmentProposal[];
    workerVetoActive: boolean;
  };

  // Educational simulation mode
  simulationMode: {
    enabled: boolean;
    showOwnershipImpact: boolean; // Show how ownership affects friction
    showProfitFlow: boolean; // Visualize profit distribution
  };
}

// ============================================================================
// ACTIONS INTERFACE
// ============================================================================

interface OwnershipActions {
  // Ownership
  updateWorkerShare: (workerId: string, share: number) => void;
  processNewMemberBuyIn: (workerId: string, buyInAmount: number) => void;
  processExitPayout: (workerId: string) => number;

  // Compensation
  proposeCompensation: (compensation: Omit<Compensation, 'peerFeedback'>) => void;
  addCompensationFeedback: (workerId: string, fromWorkerId: string, feedback: string) => void;

  // Investment
  createInvestmentProposal: (proposal: Omit<InvestmentProposal, 'id' | 'votes' | 'status'>) => void;
  voteOnInvestment: (
    proposalId: string,
    workerId: string,
    vote: 'approve' | 'reject' | 'abstain'
  ) => void;
  finalizeInvestmentVote: (proposalId: string) => void;

  // Wage solidarity
  updateWageRatioTarget: (newTarget: number) => void;
  calculateCurrentRatio: () => number;

  // Simulation
  toggleSimulationMode: (enabled: boolean) => void;

  // Selectors
  getOwnershipPercentage: (workerId: string) => number;
  getTotalWorkerOwnership: () => number;
  getWorkerCount: () => number;
  getAverageCompensation: () => number;
}

// ============================================================================
// DEFAULT VALUES
// ============================================================================

const DEFAULT_VESTING_SCHEDULE: VestingRule[] = [
  { yearsOfService: 1, percentageVested: 20 },
  { yearsOfService: 3, percentageVested: 50 },
  { yearsOfService: 5, percentageVested: 100 },
];

const DEFAULT_DISTRIBUTION_MODEL: DistributionModel = {
  type: 'hybrid',
  weights: { hours: 0.3, role: 0.2, tenure: 0.3, performance: 0.2 },
};

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useOwnershipStore = create<OwnershipState & OwnershipActions>()(
  persist(
    (set, get) => ({
      // Initial state
      structure: {
        collectiveShare: 51,
        individualShares: {},
        reservePool: 10,
        vestingSchedule: DEFAULT_VESTING_SCHEDULE,
      },

      distribution: {
        currentPeriodProfit: 0,
        distributionModel: DEFAULT_DISTRIBUTION_MODEL,
        workerPayouts: {},
        reinvestmentPercentage: 40,
        communityFundPercentage: 10,
        educationFundPercentage: 5,
      },

      wageSolidarity: {
        targetRatio: 6.0,
        currentRatio: 4.5,
        ceiling: 9.0,
        compensationTransparency: true,
        workerCompensation: {},
      },

      capitalDecisions: {
        pendingInvestments: [],
        approvedInvestments: [],
        workerVetoActive: true,
      },

      simulationMode: {
        enabled: true,
        showOwnershipImpact: true,
        showProfitFlow: true,
      },

      // ========================================================================
      // OWNERSHIP ACTIONS
      // ========================================================================

      updateWorkerShare: (workerId, share) =>
        set((state) => ({
          structure: {
            ...state.structure,
            individualShares: {
              ...state.structure.individualShares,
              [workerId]: share,
            },
          },
        })),

      processNewMemberBuyIn: (workerId, buyInAmount) => {
        // Calculate share based on buy-in (max 5% per member)
        const sharePercentage = Math.min(buyInAmount / 10000, 5);
        get().updateWorkerShare(workerId, sharePercentage);
      },

      processExitPayout: (workerId) => {
        const state = get();
        const share = state.structure.individualShares[workerId] || 0;
        const payout = share * 1000; // Simplified calculation

        set((s) => ({
          structure: {
            ...s.structure,
            individualShares: Object.fromEntries(
              Object.entries(s.structure.individualShares).filter(([id]) => id !== workerId)
            ),
            reservePool: s.structure.reservePool + share,
          },
        }));

        return payout;
      },

      // ========================================================================
      // COMPENSATION ACTIONS
      // ========================================================================

      proposeCompensation: (compensation) =>
        set((state) => ({
          wageSolidarity: {
            ...state.wageSolidarity,
            workerCompensation: {
              ...state.wageSolidarity.workerCompensation,
              [compensation.workerId]: { ...compensation, peerFeedback: [] },
            },
          },
        })),

      addCompensationFeedback: (workerId, fromWorkerId, feedback) =>
        set((state) => {
          const existing = state.wageSolidarity.workerCompensation[workerId];
          if (!existing) return state;
          return {
            wageSolidarity: {
              ...state.wageSolidarity,
              workerCompensation: {
                ...state.wageSolidarity.workerCompensation,
                [workerId]: {
                  ...existing,
                  peerFeedback: [
                    ...existing.peerFeedback,
                    { fromWorkerId, feedback, timestamp: Date.now() },
                  ],
                },
              },
            },
          };
        }),

      // ========================================================================
      // INVESTMENT ACTIONS
      // ========================================================================

      createInvestmentProposal: (proposal) =>
        set((state) => ({
          capitalDecisions: {
            ...state.capitalDecisions,
            pendingInvestments: [
              ...state.capitalDecisions.pendingInvestments,
              {
                ...proposal,
                id: `inv-${Date.now()}`,
                votes: [],
                status: 'pending',
              },
            ],
          },
        })),

      voteOnInvestment: (proposalId, workerId, vote) =>
        set((state) => ({
          capitalDecisions: {
            ...state.capitalDecisions,
            pendingInvestments: state.capitalDecisions.pendingInvestments.map((p) => {
              if (p.id !== proposalId) return p;
              // Remove existing vote if any, then add new one
              const filteredVotes = p.votes.filter((v) => v.workerId !== workerId);
              return {
                ...p,
                votes: [...filteredVotes, { workerId, vote }],
              };
            }),
          },
        })),

      finalizeInvestmentVote: (proposalId) =>
        set((state) => {
          const proposal = state.capitalDecisions.pendingInvestments.find(
            (p) => p.id === proposalId
          );
          if (!proposal) return state;

          const votes = proposal.votes;
          const approvals = votes.filter((v) => v.vote === 'approve').length;
          const totalVotes = votes.filter((v) => v.vote !== 'abstain').length;
          const approved = totalVotes > 0 && approvals / totalVotes > 0.6; // 60% threshold

          return {
            capitalDecisions: {
              ...state.capitalDecisions,
              pendingInvestments: state.capitalDecisions.pendingInvestments.filter(
                (p) => p.id !== proposalId
              ),
              approvedInvestments: approved
                ? [
                    ...state.capitalDecisions.approvedInvestments,
                    { ...proposal, status: 'approved' as const },
                  ]
                : state.capitalDecisions.approvedInvestments,
            },
          };
        }),

      // ========================================================================
      // WAGE SOLIDARITY ACTIONS
      // ========================================================================

      updateWageRatioTarget: (newTarget) =>
        set((state) => ({
          wageSolidarity: { ...state.wageSolidarity, targetRatio: newTarget },
        })),

      calculateCurrentRatio: () => {
        const state = get();
        const compensations = Object.values(state.wageSolidarity.workerCompensation);
        if (compensations.length === 0) return 1;
        const amounts = compensations.map((c) => c.baseAmount);
        const max = Math.max(...amounts);
        const min = Math.min(...amounts);
        return min > 0 ? max / min : 1;
      },

      // ========================================================================
      // SIMULATION ACTIONS
      // ========================================================================

      toggleSimulationMode: (enabled) =>
        set((state) => ({
          simulationMode: { ...state.simulationMode, enabled },
        })),

      // ========================================================================
      // SELECTORS
      // ========================================================================

      getOwnershipPercentage: (workerId) => {
        const state = get();
        return state.structure.individualShares[workerId] || 0;
      },

      getTotalWorkerOwnership: () => {
        const state = get();
        const individualTotal = Object.values(state.structure.individualShares).reduce(
          (sum, share) => sum + share,
          0
        );
        return state.structure.collectiveShare + individualTotal;
      },

      getWorkerCount: () => {
        const state = get();
        return Object.keys(state.structure.individualShares).length;
      },

      getAverageCompensation: () => {
        const state = get();
        const compensations = Object.values(state.wageSolidarity.workerCompensation);
        if (compensations.length === 0) return 0;
        return compensations.reduce((sum, c) => sum + c.baseAmount, 0) / compensations.length;
      },
    }),
    {
      name: 'millos-ownership-store',
      storage: safeJSONStorage,
      partialize: (state) => ({
        structure: state.structure,
        distribution: state.distribution,
        wageSolidarity: state.wageSolidarity,
        capitalDecisions: state.capitalDecisions,
        simulationMode: state.simulationMode,
      }),
    }
  )
);
