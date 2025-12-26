/**
 * Utils Barrel Export
 *
 * Central export point for all utility modules in the MillOS application.
 * Includes AI engine, audio management, materials, and helper functions.
 */

// === AI Engine ===
export {
  generateContextAwareDecision,
  reactToAlert,
  applyDecisionEffects,
  getPredictedEvents,
  getCongestionHotspots,
  getMetricTrends,
  getAIMemoryState,
  getImpactStats,
  getProductionTargets,
  resetShiftStats,
  getConfidenceAdjustments,
  getCrossMachinePatterns,
  getAnomalyHistory,
  getSparklineData,
  trackDecisionOutcome,
  shouldTriggerAudioCue,
  initializeShiftObserver,
  initializeDecisionOutcomeTracking,
  initializeAIEngine,
  getConfidenceAdjustmentForType,
} from './aiEngine';

// === Audio Manager ===
export { audioManager } from './audioManager';

// === Frame Throttle ===
export {
  incrementGlobalFrame,
  shouldRunThisFrame,
  getGlobalFrameCount,
  getThrottleLevel,
} from './frameThrottle';

// === Logger ===
export { logger, Logger } from './logger';
export type { LogLevel, LoggerConfig } from './logger';

// === Model Loader ===
export {
  MODEL_PATHS,
  WORKER_VARIANTS,
  checkModelExists,
  useModelAvailable,
  useAvailableWorkerVariants,
  getWorkerVariantPath,
  preloadAvailableModels,
  getModelStatus,
} from './modelLoader';
export type { WorkerVariant, ModelType } from './modelLoader';

// === Position Registry ===
export { positionRegistry } from './positionRegistry';
export type { EntityPosition, Obstacle } from './positionRegistry';

// === Shared Materials ===
export {
  METAL_MATERIALS,
  RUBBER_MATERIALS,
  SAFETY_MATERIALS,
  PIPE_MATERIALS,
  WORKER_MATERIALS,
  MACHINE_MATERIALS,
  BASIC_MATERIALS,
  SHARED_GEOMETRIES,
  getMaterialForQuality,
  getSkinMaterial,
  getHairMaterial,
} from './sharedMaterials';

// === Status Colors ===
export { getForkliftWarningColor, getStatusColor } from './statusColors';

// === Type Guards ===
export {
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  isDefined,
  isNull,
  isUndefined,
  isNullOrUndefined,
  isFunction,
  hasProperty,
  isRecord,
  toString,
} from './typeGuards';

// === Input Sanitization (Security) ===
export {
  encodeHtmlEntities,
  decodeHtmlEntities,
  sanitizeString,
  sanitizePlayerName,
  sanitizeChatMessage,
  sanitizeRoomCode,
  sanitizeWorkerName,
  sanitizeUrl,
  isUrlSafe,
  safeJsonParse,
  sanitizeNumber,
  validateObject,
  createStringValidator,
  createNumberValidator,
} from './sanitize';
export type {
  SanitizeStringOptions,
  ParseJsonOptions,
  SanitizeNumberOptions,
  ValidationResult,
} from './sanitize';

// === API Security ===
export {
  checkRateLimit,
  rateLimiters,
  debounce,
  throttle,
  decodeTokenPayload,
  isTokenExpired,
  getTokenExpiresIn,
  generateCsrfToken,
  getOrCreateCsrfToken,
  clearCsrfToken,
  validateRequest,
  secureFetch,
  maskSensitiveData,
  clearSensitiveFields,
} from './apiSecurity';
export type {
  RateLimitConfig,
  TokenPayload,
  RequestValidationOptions,
  RequestValidationResult,
  SecureFetchOptions,
  AllowedHttpMethod,
} from './apiSecurity';
