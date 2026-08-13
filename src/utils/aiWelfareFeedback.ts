import type { AIDecision } from '../types';
import { useAIWelfareStore } from '../stores/aiWelfareStore';

/**
 * Updates welfare metrics based on decision outcomes.
 * This lives outside aiEngine so stores can report outcomes without importing
 * the entire decision engine back into the production-state module.
 */
export function updateWelfareFromDecisionOutcome(
  _decision: AIDecision,
  outcome: 'accepted' | 'rejected' | 'completed' | 'failed'
): void {
  const store = useAIWelfareStore.getState();

  if (outcome === 'accepted' || outcome === 'rejected') {
    store.recordAcknowledgment(true);
  }

  if (outcome === 'completed') {
    const currentTrust = store.relationshipHealth.trustBidirectionality;
    store.updateRelationshipMetric('trustBidirectionality', Math.min(100, currentTrust + 1));
  } else if (outcome === 'rejected') {
    const currentComm = store.relationshipHealth.communicationQuality;
    store.updateRelationshipMetric('communicationQuality', Math.max(0, currentComm - 0.5));
  } else if (outcome === 'failed') {
    const currentTrust = store.relationshipHealth.trustBidirectionality;
    store.updateRelationshipMetric('trustBidirectionality', Math.max(0, currentTrust - 2));
  }
}
