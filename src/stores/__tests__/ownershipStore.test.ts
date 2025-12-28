import { describe, it, expect, beforeEach } from 'vitest';
import { useOwnershipStore } from '../ownershipStore';

describe('ownershipStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useOwnershipStore.setState({
      structure: {
        collectiveShare: 51,
        individualShares: {},
        reservePool: 10,
        vestingSchedule: [
          { yearsOfService: 1, percentageVested: 20 },
          { yearsOfService: 3, percentageVested: 50 },
          { yearsOfService: 5, percentageVested: 100 },
        ],
      },
      distribution: {
        currentPeriodProfit: 0,
        distributionModel: {
          type: 'hybrid',
          weights: { hours: 0.3, role: 0.2, tenure: 0.3, performance: 0.2 },
        },
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
    });
  });

  describe('initial state', () => {
    it('should start with 51% collective share', () => {
      const state = useOwnershipStore.getState();
      expect(state.structure.collectiveShare).toBe(51);
    });

    it('should start with empty individual shares', () => {
      const state = useOwnershipStore.getState();
      expect(state.structure.individualShares).toEqual({});
    });

    it('should have default vesting schedule', () => {
      const state = useOwnershipStore.getState();
      expect(state.structure.vestingSchedule).toHaveLength(3);
      expect(state.structure.vestingSchedule[0].yearsOfService).toBe(1);
      expect(state.structure.vestingSchedule[2].percentageVested).toBe(100);
    });

    it('should have wage solidarity target of 6:1', () => {
      const state = useOwnershipStore.getState();
      expect(state.wageSolidarity.targetRatio).toBe(6.0);
    });
  });

  describe('ownership distribution', () => {
    it('should update worker share', () => {
      const state = useOwnershipStore.getState();
      state.updateWorkerShare('w1', 3.5);

      const newState = useOwnershipStore.getState();
      expect(newState.structure.individualShares['w1']).toBe(3.5);
    });

    it('should process new member buy-in with max 5% cap', () => {
      const state = useOwnershipStore.getState();
      // Buy-in of $50000 should cap at 5%
      state.processNewMemberBuyIn('w1', 50000);

      const newState = useOwnershipStore.getState();
      expect(newState.structure.individualShares['w1']).toBe(5);
    });

    it('should calculate proportional share for smaller buy-in', () => {
      const state = useOwnershipStore.getState();
      // $30000 / 10000 = 3%
      state.processNewMemberBuyIn('w2', 30000);

      const newState = useOwnershipStore.getState();
      expect(newState.structure.individualShares['w2']).toBe(3);
    });

    it('should process exit payout and return shares to pool', () => {
      // Setup: give worker a share
      useOwnershipStore.setState((state) => ({
        structure: {
          ...state.structure,
          individualShares: { w1: 4, w2: 3 },
        },
      }));

      const state = useOwnershipStore.getState();
      const payout = state.processExitPayout('w1');

      const newState = useOwnershipStore.getState();
      expect(payout).toBe(4000); // 4% * 1000
      expect(newState.structure.individualShares['w1']).toBeUndefined();
      expect(newState.structure.reservePool).toBe(14); // 10 + 4
    });
  });

  describe('wage solidarity ratio', () => {
    it('should update wage ratio target', () => {
      const state = useOwnershipStore.getState();
      state.updateWageRatioTarget(5.0);

      const newState = useOwnershipStore.getState();
      expect(newState.wageSolidarity.targetRatio).toBe(5.0);
    });

    it('should calculate current ratio as 1 when no compensation data', () => {
      const state = useOwnershipStore.getState();
      const ratio = state.calculateCurrentRatio();
      expect(ratio).toBe(1);
    });

    it('should calculate current ratio from compensation data', () => {
      useOwnershipStore.setState((state) => ({
        wageSolidarity: {
          ...state.wageSolidarity,
          workerCompensation: {
            w1: {
              workerId: 'w1',
              baseAmount: 60000,
              proposedBy: 'self',
              rationale: 'Test',
              effectiveDate: Date.now(),
              visibleToAll: true,
              peerFeedback: [],
            },
            w2: {
              workerId: 'w2',
              baseAmount: 30000,
              proposedBy: 'self',
              rationale: 'Test',
              effectiveDate: Date.now(),
              visibleToAll: true,
              peerFeedback: [],
            },
          },
        },
      }));

      const state = useOwnershipStore.getState();
      const ratio = state.calculateCurrentRatio();
      expect(ratio).toBe(2); // 60000 / 30000
    });

    it('should handle min wage of 0 gracefully', () => {
      useOwnershipStore.setState((state) => ({
        wageSolidarity: {
          ...state.wageSolidarity,
          workerCompensation: {
            w1: {
              workerId: 'w1',
              baseAmount: 50000,
              proposedBy: 'self',
              rationale: 'Test',
              effectiveDate: Date.now(),
              visibleToAll: true,
              peerFeedback: [],
            },
            w2: {
              workerId: 'w2',
              baseAmount: 0,
              proposedBy: 'self',
              rationale: 'Test',
              effectiveDate: Date.now(),
              visibleToAll: true,
              peerFeedback: [],
            },
          },
        },
      }));

      const state = useOwnershipStore.getState();
      const ratio = state.calculateCurrentRatio();
      expect(ratio).toBe(1); // Returns 1 when min is 0
    });
  });

  describe('vesting schedule', () => {
    it('should have 20% vesting at 1 year', () => {
      const state = useOwnershipStore.getState();
      const rule = state.structure.vestingSchedule.find((v) => v.yearsOfService === 1);
      expect(rule?.percentageVested).toBe(20);
    });

    it('should have 50% vesting at 3 years', () => {
      const state = useOwnershipStore.getState();
      const rule = state.structure.vestingSchedule.find((v) => v.yearsOfService === 3);
      expect(rule?.percentageVested).toBe(50);
    });

    it('should have 100% vesting at 5 years', () => {
      const state = useOwnershipStore.getState();
      const rule = state.structure.vestingSchedule.find((v) => v.yearsOfService === 5);
      expect(rule?.percentageVested).toBe(100);
    });
  });

  describe('investment proposal voting', () => {
    it('should create investment proposal', () => {
      const state = useOwnershipStore.getState();
      state.createInvestmentProposal({
        title: 'New Equipment',
        description: 'Purchase new milling equipment',
        amount: 50000,
        proposedBy: 'w1',
        expectedReturn: '15% efficiency gain',
        riskLevel: 'medium',
        votingDeadline: Date.now() + 86400000 * 7,
      });

      const newState = useOwnershipStore.getState();
      expect(newState.capitalDecisions.pendingInvestments).toHaveLength(1);
      expect(newState.capitalDecisions.pendingInvestments[0].title).toBe('New Equipment');
      expect(newState.capitalDecisions.pendingInvestments[0].status).toBe('pending');
    });

    it('should record vote on investment', () => {
      // Setup proposal
      useOwnershipStore.setState((state) => ({
        capitalDecisions: {
          ...state.capitalDecisions,
          pendingInvestments: [
            {
              id: 'inv-test-1',
              title: 'Test Investment',
              description: 'Test',
              amount: 10000,
              proposedBy: 'w1',
              expectedReturn: '10%',
              riskLevel: 'low',
              votingDeadline: Date.now() + 86400000,
              votes: [],
              status: 'pending',
            },
          ],
        },
      }));

      const state = useOwnershipStore.getState();
      state.voteOnInvestment('inv-test-1', 'w2', 'approve');

      const newState = useOwnershipStore.getState();
      const proposal = newState.capitalDecisions.pendingInvestments[0];
      expect(proposal.votes).toHaveLength(1);
      expect(proposal.votes[0].vote).toBe('approve');
    });

    it('should replace existing vote when voting again', () => {
      useOwnershipStore.setState((state) => ({
        capitalDecisions: {
          ...state.capitalDecisions,
          pendingInvestments: [
            {
              id: 'inv-test-2',
              title: 'Test Investment',
              description: 'Test',
              amount: 10000,
              proposedBy: 'w1',
              expectedReturn: '10%',
              riskLevel: 'low',
              votingDeadline: Date.now() + 86400000,
              votes: [{ workerId: 'w2', vote: 'approve' }],
              status: 'pending',
            },
          ],
        },
      }));

      const state = useOwnershipStore.getState();
      state.voteOnInvestment('inv-test-2', 'w2', 'reject');

      const newState = useOwnershipStore.getState();
      const proposal = newState.capitalDecisions.pendingInvestments[0];
      expect(proposal.votes).toHaveLength(1);
      expect(proposal.votes[0].vote).toBe('reject');
    });

    it('should approve investment with >60% approval', () => {
      useOwnershipStore.setState((state) => ({
        capitalDecisions: {
          ...state.capitalDecisions,
          pendingInvestments: [
            {
              id: 'inv-test-3',
              title: 'Test Investment',
              description: 'Test',
              amount: 10000,
              proposedBy: 'w1',
              expectedReturn: '10%',
              riskLevel: 'low',
              votingDeadline: Date.now() + 86400000,
              votes: [
                { workerId: 'w1', vote: 'approve' },
                { workerId: 'w2', vote: 'approve' },
                { workerId: 'w3', vote: 'approve' },
                { workerId: 'w4', vote: 'reject' },
                { workerId: 'w5', vote: 'abstain' },
              ],
              status: 'pending',
            },
          ],
        },
      }));

      const state = useOwnershipStore.getState();
      state.finalizeInvestmentVote('inv-test-3');

      const newState = useOwnershipStore.getState();
      expect(newState.capitalDecisions.pendingInvestments).toHaveLength(0);
      expect(newState.capitalDecisions.approvedInvestments).toHaveLength(1);
      expect(newState.capitalDecisions.approvedInvestments[0].status).toBe('approved');
    });

    it('should reject investment with <=60% approval', () => {
      useOwnershipStore.setState((state) => ({
        capitalDecisions: {
          ...state.capitalDecisions,
          pendingInvestments: [
            {
              id: 'inv-test-4',
              title: 'Test Investment',
              description: 'Test',
              amount: 10000,
              proposedBy: 'w1',
              expectedReturn: '10%',
              riskLevel: 'low',
              votingDeadline: Date.now() + 86400000,
              votes: [
                { workerId: 'w1', vote: 'approve' },
                { workerId: 'w2', vote: 'reject' },
                { workerId: 'w3', vote: 'reject' },
              ],
              status: 'pending',
            },
          ],
        },
      }));

      const state = useOwnershipStore.getState();
      state.finalizeInvestmentVote('inv-test-4');

      const newState = useOwnershipStore.getState();
      expect(newState.capitalDecisions.pendingInvestments).toHaveLength(0);
      // Rejected proposals are not added to approved list
      expect(newState.capitalDecisions.approvedInvestments).toHaveLength(0);
    });
  });

  describe('compensation', () => {
    it('should propose compensation', () => {
      const state = useOwnershipStore.getState();
      state.proposeCompensation({
        workerId: 'w1',
        baseAmount: 55000,
        proposedBy: 'self',
        rationale: 'Based on market rate and contributions',
        effectiveDate: Date.now(),
        visibleToAll: true,
      });

      const newState = useOwnershipStore.getState();
      expect(newState.wageSolidarity.workerCompensation['w1']).toBeDefined();
      expect(newState.wageSolidarity.workerCompensation['w1'].baseAmount).toBe(55000);
      expect(newState.wageSolidarity.workerCompensation['w1'].peerFeedback).toEqual([]);
    });

    it('should add peer feedback to compensation', () => {
      useOwnershipStore.setState((state) => ({
        wageSolidarity: {
          ...state.wageSolidarity,
          workerCompensation: {
            w1: {
              workerId: 'w1',
              baseAmount: 55000,
              proposedBy: 'self',
              rationale: 'Test',
              effectiveDate: Date.now(),
              visibleToAll: true,
              peerFeedback: [],
            },
          },
        },
      }));

      const state = useOwnershipStore.getState();
      state.addCompensationFeedback('w1', 'w2', 'Seems fair given their role');

      const newState = useOwnershipStore.getState();
      expect(newState.wageSolidarity.workerCompensation['w1'].peerFeedback).toHaveLength(1);
      expect(newState.wageSolidarity.workerCompensation['w1'].peerFeedback[0].fromWorkerId).toBe(
        'w2'
      );
    });
  });

  describe('selectors', () => {
    it('should get ownership percentage for worker', () => {
      useOwnershipStore.setState((state) => ({
        structure: {
          ...state.structure,
          individualShares: { w1: 3.5, w2: 2.0 },
        },
      }));

      const state = useOwnershipStore.getState();
      expect(state.getOwnershipPercentage('w1')).toBe(3.5);
      expect(state.getOwnershipPercentage('w2')).toBe(2.0);
      expect(state.getOwnershipPercentage('w999')).toBe(0);
    });

    it('should get total worker ownership', () => {
      useOwnershipStore.setState((state) => ({
        structure: {
          ...state.structure,
          collectiveShare: 51,
          individualShares: { w1: 3, w2: 2, w3: 4 },
        },
      }));

      const state = useOwnershipStore.getState();
      expect(state.getTotalWorkerOwnership()).toBe(60); // 51 + 3 + 2 + 4
    });

    it('should get worker count', () => {
      useOwnershipStore.setState((state) => ({
        structure: {
          ...state.structure,
          individualShares: { w1: 3, w2: 2, w3: 4, w4: 1 },
        },
      }));

      const state = useOwnershipStore.getState();
      expect(state.getWorkerCount()).toBe(4);
    });

    it('should get average compensation', () => {
      useOwnershipStore.setState((state) => ({
        wageSolidarity: {
          ...state.wageSolidarity,
          workerCompensation: {
            w1: {
              workerId: 'w1',
              baseAmount: 50000,
              proposedBy: 'self',
              rationale: 'Test',
              effectiveDate: Date.now(),
              visibleToAll: true,
              peerFeedback: [],
            },
            w2: {
              workerId: 'w2',
              baseAmount: 40000,
              proposedBy: 'self',
              rationale: 'Test',
              effectiveDate: Date.now(),
              visibleToAll: true,
              peerFeedback: [],
            },
          },
        },
      }));

      const state = useOwnershipStore.getState();
      expect(state.getAverageCompensation()).toBe(45000);
    });

    it('should return 0 average when no compensations', () => {
      const state = useOwnershipStore.getState();
      expect(state.getAverageCompensation()).toBe(0);
    });
  });

  describe('simulation mode', () => {
    it('should toggle simulation mode', () => {
      const state = useOwnershipStore.getState();
      state.toggleSimulationMode(false);

      const newState = useOwnershipStore.getState();
      expect(newState.simulationMode.enabled).toBe(false);
    });
  });
});
