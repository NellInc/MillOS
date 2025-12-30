/**
 * Centralized Game Systems
 *
 * This module provides efficient, unified systems for game state management.
 *
 * ARCHITECTURE:
 * - CentralTickSystem: Single tick loop for all game updates (lazy execution)
 * - UnifiedGameTick: Zero-allocation, truth-only game state updates
 * - DisplaySmoothing: Visual variance and interpolation at display time
 * - CentralTickProvider: React integration
 *
 * PRINCIPLE: Store holds TRUTH. Display adds COSMETICS.
 *
 * USAGE:
 * 1. Mount <CentralTickProvider /> once in your scene
 * 2. Use useCentralTick() hook or centralTick.register() for custom ticks
 * 3. The unified game tick handles time + machines + metrics automatically
 * 4. Use DisplaySmoothing utilities for cosmetic variance in UI/3D
 */

export {
  centralTick,
  deterministicVariance,
  deterministicValue,
  idToSeed,
  TICK_PRIORITY,
  type TickContext,
  type CentralTickSystem,
} from './CentralTickSystem';

export {
  CentralTickProvider,
  useCentralTick,
} from './CentralTickProvider';

export {
  useUnifiedGameTick,
  unifiedGameTick,
} from './UnifiedGameTick';

export {
  // Display variance
  getDisplayVariance,
  getDisplayRpm,
  getDisplayLoad,
  getDisplayTemp,
  // Interpolation
  getInterpolatedValue,
  getSmoothedDisplayValue,
  clearInterpolationCache,
  clearAllInterpolation,
  // Hooks
  useMachineDisplayValues,
  useSmoothedGameTime,
  getSmoothedGameTime,
} from './DisplaySmoothing';
