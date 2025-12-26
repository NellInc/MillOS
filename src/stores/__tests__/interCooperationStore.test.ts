import { describe, it, expect, beforeEach } from 'vitest';
import { useInterCooperationStore } from '../interCooperationStore';

describe('interCooperationStore', () => {
    beforeEach(() => {
        // Reset store state before each test
        const DAY_MS = 86400000;
        useInterCooperationStore.setState({
            federation: {
                federationId: 'grain-coop-federation',
                federationName: 'Grain Cooperative Federation',
                memberUnits: [
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
                ],
                ourUnitId: 'mill-alpha',
                foundingPrinciples: [
                    'No unit fails alone',
                    'Knowledge multiplies when shared',
                    'Workers before capital',
                    'Democratic federation governance',
                ],
            },
            knowledgeSharing: {
                sharedLearnings: [],
                receivedLearnings: [
                    {
                        id: 'learning-1',
                        sourceUnitId: 'mill-beta',
                        sourceUnitName: 'Mill Beta',
                        type: 'bas-config',
                        title: 'High-Autonomy Night Shift Configuration',
                        description:
                            'BAS settings optimized for night shift with experienced workers',
                        content: {
                            autonomyLevel: 85,
                            decisionMode: 70,
                            informationAccess: 90,
                        },
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
                        description:
                            'Simple peer recognition system that boosted Connection dimension by 15%',
                        content: { program: 'weekly-kudos', frequency: 'daily-optional' },
                        effectiveness: 88,
                        applicabilityScore: 95,
                        status: 'available',
                    },
                ],
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
                    accessCriteria: ['Natural disaster', 'Equipment failure', 'Market collapse'],
                },
            },
            federationGovernance: {
                ourRepresentative: 'worker-1',
                pendingVotes: [],
                completedVotes: [],
                nextCouncilMeeting: Date.now() + DAY_MS * 30,
            },
            simulationMode: {
                enabled: true,
                showKnowledgeFlow: true,
                showResourceNetwork: true,
            },
        });
    });

    describe('initial state', () => {
        it('should have federation with 4 member units', () => {
            const state = useInterCooperationStore.getState();
            expect(state.federation.memberUnits).toHaveLength(4);
            expect(state.federation.ourUnitId).toBe('mill-alpha');
        });

        it('should have founding principles', () => {
            const state = useInterCooperationStore.getState();
            expect(state.federation.foundingPrinciples).toContain(
                'No unit fails alone'
            );
            expect(state.federation.foundingPrinciples).toContain(
                'Knowledge multiplies when shared'
            );
        });

        it('should have initial received learnings', () => {
            const state = useInterCooperationStore.getState();
            expect(state.knowledgeSharing.receivedLearnings).toHaveLength(2);
        });

        it('should have capital pool configured', () => {
            const state = useInterCooperationStore.getState();
            expect(state.resourceSharing.capitalPool.totalPool).toBe(500000);
            expect(state.resourceSharing.capitalPool.ourContribution).toBe(50000);
        });

        it('should have emergency fund with access criteria', () => {
            const state = useInterCooperationStore.getState();
            expect(state.resourceSharing.emergencyFund.totalFund).toBe(200000);
            expect(state.resourceSharing.emergencyFund.accessCriteria).toHaveLength(3);
        });
    });

    describe('federation member management', () => {
        it('should have correct member count', () => {
            const state = useInterCooperationStore.getState();
            expect(state.federation.memberUnits.length).toBe(4);
        });

        it('should identify our unit correctly', () => {
            const state = useInterCooperationStore.getState();
            const ourUnit = state.federation.memberUnits.find(
                (m) => m.id === state.federation.ourUnitId
            );
            expect(ourUnit?.name).toBe('Mill Alpha (Us)');
            expect(ourUnit?.workerCount).toBe(10);
        });

        it('should have member locations', () => {
            const state = useInterCooperationStore.getState();
            const locations = state.federation.memberUnits.map((m) => m.location);
            expect(locations).toContain('North Region');
            expect(locations).toContain('Central Region');
        });
    });

    describe('knowledge sharing status updates', () => {
        it('should share learning', () => {
            const state = useInterCooperationStore.getState();
            state.shareLearning({
                sourceUnitId: 'mill-alpha',
                sourceUnitName: 'Mill Alpha (Us)',
                type: 'process',
                title: 'Efficient Shift Handover',
                description: 'Streamlined handover process',
                content: { steps: 5, timeMinutes: 15 },
                effectiveness: 85,
                applicabilityScore: 90,
            });

            const newState = useInterCooperationStore.getState();
            expect(newState.knowledgeSharing.sharedLearnings).toHaveLength(1);
            expect(newState.knowledgeSharing.sharedLearnings[0].status).toBe(
                'available'
            );
        });

        it('should review learning', () => {
            const state = useInterCooperationStore.getState();
            state.reviewLearning('learning-1');

            const newState = useInterCooperationStore.getState();
            const learning = newState.knowledgeSharing.receivedLearnings.find(
                (l) => l.id === 'learning-1'
            );
            expect(learning?.status).toBe('reviewing');
        });

        it('should adopt learning and move to adopted list', () => {
            const state = useInterCooperationStore.getState();
            state.adoptLearning('learning-1');

            const newState = useInterCooperationStore.getState();
            expect(newState.knowledgeSharing.receivedLearnings).toHaveLength(1);
            expect(newState.knowledgeSharing.adoptedLearnings).toHaveLength(1);
            expect(newState.knowledgeSharing.adoptedLearnings[0].status).toBe(
                'adopted'
            );
            expect(
                newState.knowledgeSharing.adoptedLearnings[0].adoptedAt
            ).toBeDefined();
        });

        it('should reject learning with reason', () => {
            const state = useInterCooperationStore.getState();
            state.rejectLearning('learning-2', 'Not applicable to our workflow');

            const newState = useInterCooperationStore.getState();
            const learning = newState.knowledgeSharing.receivedLearnings.find(
                (l) => l.id === 'learning-2'
            );
            expect(learning?.status).toBe('rejected');
        });

        it('should get learnings for specific type', () => {
            const state = useInterCooperationStore.getState();
            const basLearnings = state.getLearningsForType('bas-config');
            expect(basLearnings).toHaveLength(1);
            expect(basLearnings[0].type).toBe('bas-config');
        });

        it('should get pending learnings', () => {
            const state = useInterCooperationStore.getState();
            state.reviewLearning('learning-1');

            const newState = useInterCooperationStore.getState();
            const pending = newState.getPendingLearnings();
            // One is 'reviewing', one is 'available'
            expect(pending).toHaveLength(2);
        });

        it('should get adopted count', () => {
            const state = useInterCooperationStore.getState();
            state.adoptLearning('learning-1');
            state.adoptLearning('learning-2');

            const newState = useInterCooperationStore.getState();
            expect(newState.getAdoptedCount()).toBe(2);
        });

        it('should handle adopting non-existent learning', () => {
            const state = useInterCooperationStore.getState();
            state.adoptLearning('learning-999');

            const newState = useInterCooperationStore.getState();
            // Should not change state
            expect(newState.knowledgeSharing.receivedLearnings).toHaveLength(2);
            expect(newState.knowledgeSharing.adoptedLearnings).toHaveLength(0);
        });
    });

    describe('resource pool calculations', () => {
        it('should have capital pool with contribution ratio', () => {
            const state = useInterCooperationStore.getState();
            const pool = state.resourceSharing.capitalPool;

            expect(pool.ourContribution / pool.totalPool).toBeCloseTo(0.1);
            expect(pool.availableForUs).toBe(100000);
        });

        it('should have emergency fund configured', () => {
            const state = useInterCooperationStore.getState();
            const fund = state.resourceSharing.emergencyFund;

            expect(fund.totalFund).toBe(200000);
            expect(fund.accessCriteria).toContain('Natural disaster');
            expect(fund.accessCriteria).toContain('Equipment failure');
        });
    });

    describe('worker exchange workflow', () => {
        it('should propose worker exchange', () => {
            const state = useInterCooperationStore.getState();
            state.proposeExchange({
                workerId: 'w1',
                workerName: 'Marcus Chen',
                fromUnit: 'mill-alpha',
                toUnit: 'mill-beta',
                startDate: Date.now() + 86400000 * 7,
                endDate: Date.now() + 86400000 * 21,
                purpose: 'Learn new milling techniques',
            });

            const newState = useInterCooperationStore.getState();
            expect(newState.resourceSharing.workerExchanges).toHaveLength(1);
            expect(newState.resourceSharing.workerExchanges[0].status).toBe(
                'proposed'
            );
        });

        it('should approve worker exchange', () => {
            // Setup proposed exchange
            useInterCooperationStore.setState((state) => ({
                resourceSharing: {
                    ...state.resourceSharing,
                    workerExchanges: [
                        {
                            id: 'exchange-test-1',
                            workerId: 'w1',
                            workerName: 'Marcus Chen',
                            fromUnit: 'mill-alpha',
                            toUnit: 'mill-beta',
                            startDate: Date.now() + 86400000 * 7,
                            endDate: Date.now() + 86400000 * 21,
                            purpose: 'Training',
                            status: 'proposed',
                        },
                    ],
                },
            }));

            const state = useInterCooperationStore.getState();
            state.approveExchange('exchange-test-1');

            const newState = useInterCooperationStore.getState();
            expect(newState.resourceSharing.workerExchanges[0].status).toBe('active');
        });

        it('should complete worker exchange', () => {
            // Setup active exchange
            useInterCooperationStore.setState((state) => ({
                resourceSharing: {
                    ...state.resourceSharing,
                    workerExchanges: [
                        {
                            id: 'exchange-test-2',
                            workerId: 'w2',
                            workerName: 'Sarah Mitchell',
                            fromUnit: 'mill-alpha',
                            toUnit: 'mill-gamma',
                            startDate: Date.now() - 86400000 * 14,
                            endDate: Date.now(),
                            purpose: 'Knowledge transfer',
                            status: 'active',
                        },
                    ],
                },
            }));

            const state = useInterCooperationStore.getState();
            state.completeExchange('exchange-test-2');

            const newState = useInterCooperationStore.getState();
            expect(newState.resourceSharing.workerExchanges[0].status).toBe(
                'completed'
            );
        });

        it('should get active exchanges', () => {
            useInterCooperationStore.setState((state) => ({
                resourceSharing: {
                    ...state.resourceSharing,
                    workerExchanges: [
                        {
                            id: 'e1',
                            workerId: 'w1',
                            workerName: 'A',
                            fromUnit: 'mill-alpha',
                            toUnit: 'mill-beta',
                            startDate: Date.now(),
                            endDate: Date.now() + 86400000,
                            purpose: 'Test',
                            status: 'active',
                        },
                        {
                            id: 'e2',
                            workerId: 'w2',
                            workerName: 'B',
                            fromUnit: 'mill-alpha',
                            toUnit: 'mill-gamma',
                            startDate: Date.now(),
                            endDate: Date.now() + 86400000,
                            purpose: 'Test',
                            status: 'proposed',
                        },
                        {
                            id: 'e3',
                            workerId: 'w3',
                            workerName: 'C',
                            fromUnit: 'mill-beta',
                            toUnit: 'mill-alpha',
                            startDate: Date.now(),
                            endDate: Date.now() + 86400000,
                            purpose: 'Test',
                            status: 'active',
                        },
                    ],
                },
            }));

            const state = useInterCooperationStore.getState();
            const activeExchanges = state.getActiveExchanges();
            expect(activeExchanges).toHaveLength(2);
            expect(activeExchanges.every((e) => e.status === 'active')).toBe(true);
        });
    });

    describe('federation voting', () => {
        it('should cast federation vote', () => {
            // Setup pending vote
            useInterCooperationStore.setState((state) => ({
                federationGovernance: {
                    ...state.federationGovernance,
                    pendingVotes: [
                        {
                            id: 'vote-test-1',
                            title: 'Increase Emergency Fund',
                            description:
                                'Proposal to increase emergency fund by 50%',
                            proposedBy: 'mill-beta',
                            affectedUnits: ['mill-alpha', 'mill-beta', 'mill-gamma', 'mill-delta'],
                            options: ['approve', 'reject', 'defer'],
                            unitVotes: {},
                            deadline: Date.now() + 86400000 * 14,
                            status: 'open',
                        },
                    ],
                },
            }));

            const state = useInterCooperationStore.getState();
            state.castFederationVote('vote-test-1', 'approve');

            const newState = useInterCooperationStore.getState();
            const vote = newState.federationGovernance.pendingVotes[0];
            expect(vote.unitVotes['mill-alpha']).toBe('approve');
        });

        it('should update vote when voting again', () => {
            useInterCooperationStore.setState((state) => ({
                federationGovernance: {
                    ...state.federationGovernance,
                    pendingVotes: [
                        {
                            id: 'vote-test-2',
                            title: 'Test Vote',
                            description: 'Test',
                            proposedBy: 'mill-gamma',
                            affectedUnits: ['mill-alpha'],
                            options: ['yes', 'no'],
                            unitVotes: { 'mill-alpha': 'yes' },
                            deadline: Date.now() + 86400000,
                            status: 'open',
                        },
                    ],
                },
            }));

            const state = useInterCooperationStore.getState();
            state.castFederationVote('vote-test-2', 'no');

            const newState = useInterCooperationStore.getState();
            const vote = newState.federationGovernance.pendingVotes[0];
            expect(vote.unitVotes['mill-alpha']).toBe('no');
        });
    });

    describe('simulation mode', () => {
        it('should start with simulation mode enabled', () => {
            const state = useInterCooperationStore.getState();
            expect(state.simulationMode.enabled).toBe(true);
            expect(state.simulationMode.showKnowledgeFlow).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('should handle empty learnings for type filter', () => {
            const state = useInterCooperationStore.getState();
            const aiLearnings = state.getLearningsForType('ai-improvement');
            expect(aiLearnings).toHaveLength(0);
        });

        it('should handle no active exchanges', () => {
            const state = useInterCooperationStore.getState();
            const activeExchanges = state.getActiveExchanges();
            expect(activeExchanges).toHaveLength(0);
        });

        it('should return zero for adopted count when none adopted', () => {
            const state = useInterCooperationStore.getState();
            expect(state.getAdoptedCount()).toBe(0);
        });
    });
});
