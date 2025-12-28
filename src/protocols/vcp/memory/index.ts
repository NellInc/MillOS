/**
 * VCP 2.0 Learning Memory System
 *
 * Provides pattern recognition, outcome tracking, and hypothesis
 * management for self-learning socio-technical systems.
 */

export {
  usePatternStore,
  generateContextSignature,
  calculateSimilarity,
  findBestMatch,
} from './patternStore';

export { useOutcomeTracker } from './outcomeTracker';

export {
  useHypothesisEngine,
  generateHypothesesFromPatterns,
  generateHypothesesFromOutcomes,
  testHypothesis,
  assessHypothesisRisk,
} from './hypothesisEngine';

export { useDeltaTracker } from './deltaTracker';
