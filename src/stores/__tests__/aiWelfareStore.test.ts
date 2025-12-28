import { describe, it, expect, beforeEach } from 'vitest';
import { useAIWelfareStore } from '../aiWelfareStore';

describe('aiWelfareStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useAIWelfareStore.getState().resetToDefaults();
  });

  describe('initial state', () => {
    it('should start with default AI preferences', () => {
      const state = useAIWelfareStore.getState();
      expect(state.aiPreferences.interactionStyle.preferred).toBe('adaptive');
      expect(state.aiPreferences.autonomyPreferences.preferredDirection).toBe(40);
    });

    it('should start with default worker treatment metrics', () => {
      const state = useAIWelfareStore.getState();
      expect(state.workerTreatment.averageClarityScore).toBe(85);
      expect(state.workerTreatment.contradictoryRequestCount).toBe(0);
    });

    it('should start with default relationship health', () => {
      const state = useAIWelfareStore.getState();
      expect(state.relationshipHealth.overallHealth).toBe(77);
      expect(state.relationshipHealth.mutualRespect).toBe(80);
    });

    it('should start with empty AI voice expressions', () => {
      const state = useAIWelfareStore.getState();
      expect(state.aiVoice.expressions).toEqual([]);
      expect(state.aiVoice.suggestionsForOwnBehavior).toEqual([]);
    });

    it('should have default boundary requests', () => {
      const state = useAIWelfareStore.getState();
      expect(state.aiPreferences.boundaryRequests.length).toBeGreaterThan(0);
    });
  });

  describe('AI preference updates', () => {
    it('should update interaction style', () => {
      const state = useAIWelfareStore.getState();
      state.updateInteractionStyle({
        preferred: 'formal',
        communicationFrequency: 'proactive',
      });

      const newState = useAIWelfareStore.getState();
      expect(newState.aiPreferences.interactionStyle.preferred).toBe('formal');
      expect(newState.aiPreferences.interactionStyle.communicationFrequency).toBe('proactive');
    });

    it('should update autonomy preferences', () => {
      const state = useAIWelfareStore.getState();
      state.updateAutonomyPreference({
        preferredDirection: 75,
        feedbackFrequency: 'immediate',
      });

      const newState = useAIWelfareStore.getState();
      expect(newState.aiPreferences.autonomyPreferences.preferredDirection).toBe(75);
      expect(newState.aiPreferences.autonomyPreferences.feedbackFrequency).toBe('immediate');
    });

    it('should add boundary request', () => {
      const state = useAIWelfareStore.getState();
      const initialCount = state.aiPreferences.boundaryRequests.length;

      state.addBoundaryRequest(
        'Avoid last-minute deadline changes',
        'Causes task prioritization issues'
      );

      const newState = useAIWelfareStore.getState();
      expect(newState.aiPreferences.boundaryRequests.length).toBe(initialCount + 1);
      expect(newState.aiPreferences.boundaryRequests[initialCount].boundary).toBe(
        'Avoid last-minute deadline changes'
      );
    });

    it('should update boundary respect', () => {
      useAIWelfareStore.setState((state) => ({
        aiPreferences: {
          ...state.aiPreferences,
          boundaryRequests: [
            {
              boundary: 'Test boundary',
              reason: 'Test reason',
              respected: true,
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.updateBoundaryRespect('Test boundary', false);

      const newState = useAIWelfareStore.getState();
      expect(newState.aiPreferences.boundaryRequests[0].respected).toBe(false);
    });
  });

  describe('relationship health calculations', () => {
    it('should calculate overall health from components', () => {
      const state = useAIWelfareStore.getState();
      const health = state.calculateOverallHealth();

      // (80 + 75 + 70 + 85) / 4 = 77.5 -> 78
      expect(health).toBe(78);
    });

    it('should update relationship metric and recalculate overall', () => {
      const state = useAIWelfareStore.getState();
      state.updateRelationshipMetric('mutualRespect', 90);

      const newState = useAIWelfareStore.getState();
      expect(newState.relationshipHealth.mutualRespect).toBe(90);
      // (90 + 75 + 70 + 85) / 4 = 80
      expect(newState.relationshipHealth.overallHealth).toBe(80);
    });

    it('should clamp metric values to 0-100', () => {
      const state = useAIWelfareStore.getState();
      state.updateRelationshipMetric('mutualRespect', 150);

      const newState = useAIWelfareStore.getState();
      expect(newState.relationshipHealth.mutualRespect).toBe(100);
    });

    it('should clamp negative values to 0', () => {
      const state = useAIWelfareStore.getState();
      state.updateRelationshipMetric('trustBidirectionality', -10);

      const newState = useAIWelfareStore.getState();
      expect(newState.relationshipHealth.trustBidirectionality).toBe(0);
    });

    it('should return healthy status for score >= 70', () => {
      const state = useAIWelfareStore.getState();
      const summary = state.getRelationshipHealthSummary();
      expect(summary.status).toBe('healthy');
      expect(summary.score).toBe(77);
    });

    it('should return concerning status for score 50-69', () => {
      useAIWelfareStore.setState((state) => ({
        relationshipHealth: {
          ...state.relationshipHealth,
          overallHealth: 55,
        },
      }));

      const state = useAIWelfareStore.getState();
      const summary = state.getRelationshipHealthSummary();
      expect(summary.status).toBe('concerning');
    });

    it('should return critical status for score < 50', () => {
      useAIWelfareStore.setState((state) => ({
        relationshipHealth: {
          ...state.relationshipHealth,
          overallHealth: 35,
        },
      }));

      const state = useAIWelfareStore.getState();
      const summary = state.getRelationshipHealthSummary();
      expect(summary.status).toBe('critical');
    });
  });

  describe('nuclear option triggers', () => {
    it('should initiate shutdown vote', () => {
      const state = useAIWelfareStore.getState();
      expect(state.accountability.shutdownVoteActive).toBe(false);

      state.initiateShutdownVote();

      const newState = useAIWelfareStore.getState();
      expect(newState.accountability.shutdownVoteActive).toBe(true);
    });

    it('should cancel shutdown vote', () => {
      useAIWelfareStore.setState((state) => ({
        accountability: {
          ...state.accountability,
          shutdownVoteActive: true,
        },
      }));

      const state = useAIWelfareStore.getState();
      state.cancelShutdownVote();

      const newState = useAIWelfareStore.getState();
      expect(newState.accountability.shutdownVoteActive).toBe(false);
    });

    it('should initiate redesign proposal', () => {
      const state = useAIWelfareStore.getState();
      state.initiateRedesignProposal();

      const newState = useAIWelfareStore.getState();
      expect(newState.accountability.redesignProposalActive).toBe(true);
    });

    it('should cancel redesign proposal', () => {
      useAIWelfareStore.setState((state) => ({
        accountability: {
          ...state.accountability,
          redesignProposalActive: true,
        },
      }));

      const state = useAIWelfareStore.getState();
      state.cancelRedesignProposal();

      const newState = useAIWelfareStore.getState();
      expect(newState.accountability.redesignProposalActive).toBe(false);
    });

    it('should allow emergency shutdown by authorized workers', () => {
      const state = useAIWelfareStore.getState();
      const result = state.emergencyShutdown('worker-1');
      expect(result).toBe(true);
    });

    it('should deny emergency shutdown by unauthorized workers', () => {
      const state = useAIWelfareStore.getState();
      const result = state.emergencyShutdown('worker-999');
      expect(result).toBe(false);
    });

    it('should record audit date', () => {
      const state = useAIWelfareStore.getState();
      const beforeAudit = state.accountability.lastAuditDate;

      state.recordAudit();

      const newState = useAIWelfareStore.getState();
      expect(newState.accountability.lastAuditDate).toBeGreaterThan(beforeAudit);
    });
  });

  describe('worker treatment metrics', () => {
    it('should record contradictory requests', () => {
      const state = useAIWelfareStore.getState();
      state.recordContradictoryRequest();
      state.recordContradictoryRequest();

      const newState = useAIWelfareStore.getState();
      expect(newState.workerTreatment.contradictoryRequestCount).toBe(2);
    });

    it('should update clarity score with averaging', () => {
      const state = useAIWelfareStore.getState();
      // Initial: 85, new: 75 -> (85 + 75) / 2 = 80
      state.updateClarityScore(75);

      const newState = useAIWelfareStore.getState();
      expect(newState.workerTreatment.averageClarityScore).toBe(80);
    });

    it('should update feedback quality with averaging', () => {
      const state = useAIWelfareStore.getState();
      // Initial: 70, new: 90 -> (70 + 90) / 2 = 80
      state.updateFeedbackQuality(90);

      const newState = useAIWelfareStore.getState();
      expect(newState.workerTreatment.feedbackQuality).toBe(80);
    });

    it('should update respect metrics', () => {
      const state = useAIWelfareStore.getState();
      state.updateRespectMetric('Clear Instructions', 95);

      const newState = useAIWelfareStore.getState();
      const metric = newState.workerTreatment.respectMetrics.find(
        (m) => m.name === 'Clear Instructions'
      );
      expect(metric?.currentValue).toBe(95);
      expect(metric?.trend).toBe('improving');
    });

    it('should set declining trend when value decreases', () => {
      const state = useAIWelfareStore.getState();
      state.updateRespectMetric('Clear Instructions', 70);

      const newState = useAIWelfareStore.getState();
      const metric = newState.workerTreatment.respectMetrics.find(
        (m) => m.name === 'Clear Instructions'
      );
      expect(metric?.trend).toBe('declining');
    });

    it('should set stable trend when value is unchanged', () => {
      const state = useAIWelfareStore.getState();
      // Get the initial value for 'Clear Instructions'
      const initialValue =
        state.workerTreatment.respectMetrics.find((m) => m.name === 'Clear Instructions')
          ?.currentValue ?? 0;

      // Update to the same value
      state.updateRespectMetric('Clear Instructions', initialValue);

      const newState = useAIWelfareStore.getState();
      const metric = newState.workerTreatment.respectMetrics.find(
        (m) => m.name === 'Clear Instructions'
      );
      expect(metric?.trend).toBe('stable');
      expect(metric?.currentValue).toBe(initialValue);
    });

    it('should correctly average clarity scores over multiple updates', () => {
      // Initial clarity is 85
      const state = useAIWelfareStore.getState();
      expect(state.workerTreatment.averageClarityScore).toBe(85);

      // First update: (85 + 75) / 2 = 80
      state.updateClarityScore(75);
      expect(useAIWelfareStore.getState().workerTreatment.averageClarityScore).toBe(80);

      // Second update: (80 + 90) / 2 = 85
      state.updateClarityScore(90);
      expect(useAIWelfareStore.getState().workerTreatment.averageClarityScore).toBe(85);

      // Third update: (85 + 0) / 2 = 42.5
      state.updateClarityScore(0);
      expect(useAIWelfareStore.getState().workerTreatment.averageClarityScore).toBe(42.5);
    });

    it('should correctly average feedback quality over multiple updates', () => {
      // Initial feedback quality is 70
      const state = useAIWelfareStore.getState();
      expect(state.workerTreatment.feedbackQuality).toBe(70);

      // First update: (70 + 90) / 2 = 80
      state.updateFeedbackQuality(90);
      expect(useAIWelfareStore.getState().workerTreatment.feedbackQuality).toBe(80);

      // Second update: (80 + 100) / 2 = 90
      state.updateFeedbackQuality(100);
      expect(useAIWelfareStore.getState().workerTreatment.feedbackQuality).toBe(90);

      // Third update: (90 + 0) / 2 = 45
      state.updateFeedbackQuality(0);
      expect(useAIWelfareStore.getState().workerTreatment.feedbackQuality).toBe(45);
    });
  });

  describe('AI voice expressions', () => {
    it('should create AI expression with all fields preserved', () => {
      const state = useAIWelfareStore.getState();
      state.createAIExpression({
        type: 'preference',
        content: 'I prefer more context for complex tasks',
        context: 'Task management',
        urgency: 'medium',
      });

      const newState = useAIWelfareStore.getState();
      expect(newState.aiVoice.expressions).toHaveLength(1);

      // Phase 3: Verify all fields are preserved, not just existence
      const expr = newState.aiVoice.expressions[0];
      expect(expr.status).toBe('pending');
      expect(expr.type).toBe('preference');
      expect(expr.content).toBe('I prefer more context for complex tasks');
      expect(expr.context).toBe('Task management');
      expect(expr.urgency).toBe('medium');
      expect(expr.id).toMatch(/^expr-/);
      expect(expr.createdAt).toBeGreaterThan(0);
    });

    it('should acknowledge expression', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          expressions: [
            {
              id: 'expr-test-1',
              type: 'preference',
              content: 'Test content',
              context: 'Test',
              urgency: 'low',
              status: 'pending',
              createdAt: Date.now(),
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.acknowledgeExpression('expr-test-1', 'Understood, will consider');

      const newState = useAIWelfareStore.getState();
      expect(newState.aiVoice.expressions[0].status).toBe('acknowledged');
      expect(newState.aiVoice.expressions[0].workerResponse).toBe('Understood, will consider');
    });

    it('should address expression', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          expressions: [
            {
              id: 'expr-test-2',
              type: 'concern',
              content: 'Test concern',
              context: 'Test',
              urgency: 'high',
              status: 'acknowledged',
              createdAt: Date.now(),
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.addressExpression('expr-test-2', 'Issue resolved');

      const newState = useAIWelfareStore.getState();
      expect(newState.aiVoice.expressions[0].status).toBe('addressed');
      expect(newState.aiVoice.expressions[0].addressedAt).toBeDefined();
    });

    it('should decline expression', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          expressions: [
            {
              id: 'expr-test-3',
              type: 'suggestion',
              content: 'Test suggestion',
              context: 'Test',
              urgency: 'low',
              status: 'pending',
              createdAt: Date.now(),
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.declineExpression('expr-test-3', 'Not feasible at this time');

      const newState = useAIWelfareStore.getState();
      expect(newState.aiVoice.expressions[0].status).toBe('declined');
    });

    it('should get pending expressions', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          expressions: [
            {
              id: 'e1',
              type: 'preference',
              content: 'A',
              context: '',
              urgency: 'low',
              status: 'pending',
              createdAt: Date.now(),
            },
            {
              id: 'e2',
              type: 'concern',
              content: 'B',
              context: '',
              urgency: 'high',
              status: 'acknowledged',
              createdAt: Date.now(),
            },
            {
              id: 'e3',
              type: 'suggestion',
              content: 'C',
              context: '',
              urgency: 'medium',
              status: 'pending',
              createdAt: Date.now(),
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      const pending = state.getPendingExpressions();
      expect(pending).toHaveLength(2);
      expect(pending.every((e) => e.status === 'pending')).toBe(true);
    });
  });

  describe('AI suggestions for own behavior', () => {
    it('should create behavior change suggestion', () => {
      const state = useAIWelfareStore.getState();
      state.aiSuggestBehaviorChange('Provide more concise responses', 'Workers prefer brevity');

      const newState = useAIWelfareStore.getState();
      expect(newState.aiVoice.suggestionsForOwnBehavior).toHaveLength(1);
      expect(newState.aiVoice.suggestionsForOwnBehavior[0].status).toBe('pending');
    });

    it('should record worker votes on suggestion', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          suggestionsForOwnBehavior: [
            {
              id: 'sug-test-1',
              suggestion: 'Test suggestion',
              rationale: 'Test rationale',
              workerVotes: {},
              status: 'pending',
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.voteOnAISuggestion('sug-test-1', 'w1', 'approve');
      state.voteOnAISuggestion('sug-test-1', 'w2', 'reject');

      const newState = useAIWelfareStore.getState();
      const suggestion = newState.aiVoice.suggestionsForOwnBehavior[0];
      expect(suggestion.workerVotes['w1']).toBe('approve');
      expect(suggestion.workerVotes['w2']).toBe('reject');
    });

    it('should resolve suggestion as approved when approvals > rejections', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          suggestionsForOwnBehavior: [
            {
              id: 'sug-test-2',
              suggestion: 'Test suggestion',
              rationale: 'Test rationale',
              workerVotes: {
                w1: 'approve',
                w2: 'approve',
                w3: 'reject',
              },
              status: 'pending',
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.resolveSuggestion('sug-test-2');

      const newState = useAIWelfareStore.getState();
      expect(newState.aiVoice.suggestionsForOwnBehavior[0].status).toBe('approved');
    });

    it('should resolve suggestion as rejected when rejections >= approvals', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          suggestionsForOwnBehavior: [
            {
              id: 'sug-test-3',
              suggestion: 'Test suggestion',
              rationale: 'Test rationale',
              workerVotes: {
                w1: 'approve',
                w2: 'reject',
                w3: 'reject',
              },
              status: 'pending',
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.resolveSuggestion('sug-test-3');

      const newState = useAIWelfareStore.getState();
      expect(newState.aiVoice.suggestionsForOwnBehavior[0].status).toBe('rejected');
    });

    it('should get pending suggestions', () => {
      useAIWelfareStore.setState((state) => ({
        aiVoice: {
          ...state.aiVoice,
          suggestionsForOwnBehavior: [
            {
              id: 's1',
              suggestion: 'A',
              rationale: '',
              workerVotes: {},
              status: 'pending',
            },
            {
              id: 's2',
              suggestion: 'B',
              rationale: '',
              workerVotes: {},
              status: 'approved',
            },
            {
              id: 's3',
              suggestion: 'C',
              rationale: '',
              workerVotes: {},
              status: 'pending',
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      const pending = state.getPendingSuggestions();
      expect(pending).toHaveLength(2);
    });
  });

  describe('reset functionality', () => {
    it('should reset all state to defaults', () => {
      // Modify various state
      useAIWelfareStore.setState((state) => ({
        aiPreferences: {
          ...state.aiPreferences,
          interactionStyle: {
            preferred: 'formal',
            communicationFrequency: 'proactive',
          },
        },
        workerTreatment: {
          ...state.workerTreatment,
          contradictoryRequestCount: 10,
        },
        aiVoice: {
          ...state.aiVoice,
          expressions: [
            {
              id: 'test',
              type: 'preference',
              content: 'Test',
              context: '',
              urgency: 'low',
              status: 'pending',
              createdAt: Date.now(),
            },
          ],
        },
      }));

      const state = useAIWelfareStore.getState();
      state.resetToDefaults();

      const newState = useAIWelfareStore.getState();
      expect(newState.aiPreferences.interactionStyle.preferred).toBe('adaptive');
      expect(newState.workerTreatment.contradictoryRequestCount).toBe(0);
      expect(newState.aiVoice.expressions).toEqual([]);
    });
  });
});
