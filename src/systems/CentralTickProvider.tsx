/**
 * CentralTickProvider - SINGLE SOURCE OF TRUTH for All Game Ticks
 *
 * This is the centralized tick driver that replaces the old scattered tick sources:
 * - CoreGameTimeSystem (deprecated) - used to call tickGameTime via gameTimeRegistry
 * - Various setInterval calls throughout the codebase
 * - Multiple independent useFrame loops calling tick functions
 *
 * ARCHITECTURE:
 * 1. CentralTickProvider (this file) - React component that drives ticks via useFrame
 * 2. CentralTickSystem - Core tick engine with priority-based callback execution
 * 3. UnifiedGameTick - Critical tick callback that advances game time and updates machines
 *
 * Mount this ONCE in your scene to enable the central tick system.
 * All tick callbacks registered with centralTick.register() will be
 * executed at the configured interval (default 0.5s).
 *
 * USAGE:
 * In MillScene.tsx:
 *   <CentralTickProvider />
 *   useUnifiedGameTick(); // Registers the game time advancement callback
 *
 * To add a new tick callback:
 *   useEffect(() => {
 *     centralTick.register('my-system', (ctx) => {
 *       // Called every tick with ctx.deltaSeconds, ctx.gameTime, etc.
 *     }, TICK_PRIORITY.NORMAL);
 *     return () => centralTick.unregister('my-system');
 *   }, []);
 */

import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { centralTick } from './CentralTickSystem';

export const CentralTickProvider: React.FC = () => {
  // Get store values via getState() to avoid subscriptions
  useFrame((state) => {
    const { gameTime, gameSpeed, isTabVisible } = useGameSimulationStore.getState();

    // Skip if tab not visible
    if (!isTabVisible) return;

    // Run central tick (queues non-critical callbacks for lazy execution)
    centralTick.tick(state.clock.elapsedTime, gameTime, gameSpeed);

    // Process lazy queue every frame - spreads CPU load instead of spiking
    // This processes 1-2 queued callbacks per frame
    centralTick.processLazyQueue();
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      centralTick.reset();
    };
  }, []);

  return null;
};

/**
 * Hook to register a tick callback
 * Automatically handles registration and cleanup
 */
export function useCentralTick(
  id: string,
  callback: (ctx: import('./CentralTickSystem').TickContext) => void,
  priority: number = 50,
  deps: React.DependencyList = []
): void {
  useEffect(() => {
    centralTick.register(id, callback, priority);
    return () => centralTick.unregister(id);
  }, [id, callback, priority, ...deps]);
}

export default CentralTickProvider;
