/**
 * useMultiplayerSync - Hook to wire up multiplayer state synchronization
 *
 * This hook:
 * - Provides game state to MultiplayerManager for broadcasting
 * - Handles incoming state diffs from host
 * - Processes machine control intents
 */

import { useEffect, useCallback, useRef } from 'react';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { getMultiplayerManager } from '../MultiplayerManager';
import { FullGameState, GameStateDiff, MachineIntent } from '../types';

type WeatherType = 'clear' | 'cloudy' | 'rain' | 'storm';
const VALID_WEATHER: readonly WeatherType[] = ['clear', 'cloudy', 'rain', 'storm'];

/** Validates a wire-sourced weather string against the allowed union before applying. */
function isValidWeather(value: string): value is WeatherType {
  return (VALID_WEATHER as readonly string[]).includes(value);
}

/**
 * Hook to synchronize game state with multiplayer system
 * Should be called once in App.tsx when multiplayer is active
 */
export function useMultiplayerSync(): void {
  const isConnected = useMultiplayerStore((s) => s.connectionState === 'connected');
  const isHost = useMultiplayerStore((s) => s.isHost);
  const initialized = useRef(false);

  // Get current game state for broadcasting (host only)
  const getFullGameState = useCallback((): FullGameState => {
    const prodStore = useProductionStore.getState();
    const gameStore = useGameSimulationStore.getState();
    const mpStore = useMultiplayerStore.getState();

    return {
      gameTime: gameStore.gameTime,
      weather: gameStore.weather,
      emergencyActive: gameStore.emergencyActive,
      machines: prodStore.machines.map((m) => ({
        id: m.id,
        status: m.status,
        metrics: {
          rpm: m.metrics.rpm,
          temperature: m.metrics.temperature,
          vibration: m.metrics.vibration,
          load: m.metrics.load,
        },
      })),
      machineLocks: Object.fromEntries(mpStore.machineLocks),
    };
  }, []);

  // Handle machine control intent (host validates and applies)
  const handleMachineIntent = useCallback(
    (intent: MachineIntent): { success: boolean; error?: string } => {
      const mpStore = useMultiplayerStore.getState();
      const prodStore = useProductionStore.getState();

      // Check if machine is locked by another player
      const lockHolder = mpStore.machineLocks.get(intent.machineId);
      if (lockHolder && lockHolder !== intent.playerId) {
        return {
          success: false,
          error: `Machine is being controlled by another player`,
        };
      }

      // Find the machine
      const machine = prodStore.machines.find((m) => m.id === intent.machineId);
      if (!machine) {
        return { success: false, error: 'Machine not found' };
      }

      // Process the intent
      try {
        switch (intent.type) {
          case 'START':
            if (machine.status === 'running') {
              return { success: true }; // Already running, no-op
            }
            prodStore.updateMachineStatus(intent.machineId, 'running');
            break;

          case 'STOP':
            if (machine.status === 'idle') {
              return { success: true }; // Already stopped, no-op
            }
            prodStore.updateMachineStatus(intent.machineId, 'idle');
            break;

          case 'ADJUST':
            // Handle lock/unlock requests
            if (intent.parameters?.action === 'lock') {
              mpStore.setMachineLock(intent.machineId, intent.playerId);
            } else if (intent.parameters?.action === 'unlock') {
              mpStore.setMachineLock(intent.machineId, null);
            }
            break;
        }

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
    []
  );

  // Apply state diff from host (client only)
  const applyStateDiff = useCallback((diff: GameStateDiff) => {
    const prodStore = useProductionStore.getState();
    const gameStore = useGameSimulationStore.getState();

    // Apply machine updates
    if (diff.machines) {
      for (const machineUpdate of diff.machines) {
        if (machineUpdate.status) {
          prodStore.updateMachineStatus(machineUpdate.id, machineUpdate.status);
        }
        if (machineUpdate.metrics) {
          prodStore.updateMachineMetrics(machineUpdate.id, machineUpdate.metrics);
        }
      }
    }

    // Apply game time (with small tolerance to prevent jitter)
    if (diff.gameTime !== undefined) {
      const currentTime = gameStore.gameTime;
      const timeDiff = Math.abs(diff.gameTime - currentTime);
      // Only sync if difference is significant (> 0.1 hour = 6 minutes)
      if (timeDiff > 0.1) {
        gameStore.setGameTime(diff.gameTime);
      }
    }

    // Apply weather (validate against allowed set before applying)
    if (diff.weather !== undefined && isValidWeather(diff.weather)) {
      if (gameStore.weather !== diff.weather) {
        gameStore.setWeather(diff.weather);
      }
    }

    // Apply emergency state
    if (diff.emergencyActive !== undefined) {
      if (diff.emergencyActive && !gameStore.emergencyActive) {
        // Trigger emergency (simplified - just set the flag)
        // In a full implementation, this would trigger the full emergency sequence
      }
    }
  }, []);

  // Apply full state from host (client only, on initial join)
  const applyFullState = useCallback((state: FullGameState) => {
    const prodStore = useProductionStore.getState();
    const gameStore = useGameSimulationStore.getState();
    const mpStore = useMultiplayerStore.getState();

    // Apply all machine states
    for (const machineState of state.machines) {
      prodStore.updateMachineStatus(machineState.id, machineState.status);
      prodStore.updateMachineMetrics(machineState.id, machineState.metrics);
    }

    // Apply game state
    gameStore.setGameTime(state.gameTime);
    if (isValidWeather(state.weather)) {
      gameStore.setWeather(state.weather);
    }

    // Apply machine locks
    for (const [machineId, playerId] of Object.entries(state.machineLocks)) {
      mpStore.setMachineLock(machineId, playerId);
    }
  }, []);

  // Set up event listeners for state sync
  useEffect(() => {
    if (!isConnected) return;

    const handleStateDiff = (event: CustomEvent<GameStateDiff>) => {
      if (!isHost) {
        applyStateDiff(event.detail);
      }
    };

    const handleFullState = (event: CustomEvent<FullGameState>) => {
      if (!isHost) {
        applyFullState(event.detail);
      }
    };

    window.addEventListener('multiplayer:state-diff', handleStateDiff as EventListener);
    window.addEventListener('multiplayer:full-state', handleFullState as EventListener);

    return () => {
      window.removeEventListener('multiplayer:state-diff', handleStateDiff as EventListener);
      window.removeEventListener('multiplayer:full-state', handleFullState as EventListener);
    };
  }, [isConnected, isHost, applyStateDiff, applyFullState]);

  // Initialize MultiplayerManager with state providers (once when connected)
  useEffect(() => {
    if (!isConnected || initialized.current) return;

    const manager = getMultiplayerManager();
    manager.setGameStateProvider(getFullGameState);
    manager.setIntentHandler(handleMachineIntent);
    initialized.current = true;

    return () => {
      initialized.current = false;
    };
  }, [isConnected, getFullGameState, handleMachineIntent]);
}

/**
 * Hook to check if a machine is locked by another player
 */
export function useMachineLockedByOther(machineId: string): boolean {
  const localPlayerId = useMultiplayerStore((s) => s.localPlayerId);
  const lockHolder = useMultiplayerStore((s) => s.machineLocks.get(machineId));
  return lockHolder !== undefined && lockHolder !== localPlayerId;
}

/**
 * Hook to get the name of the player locking a machine
 */
export function useMachineLockHolder(machineId: string): string | null {
  const lockHolder = useMultiplayerStore((s) => s.machineLocks.get(machineId));
  const remotePlayers = useMultiplayerStore((s) => s._remotePlayersArray);
  const localPlayerId = useMultiplayerStore((s) => s.localPlayerId);
  const localPlayerName = useMultiplayerStore((s) => s.localPlayerName);

  if (!lockHolder) return null;
  if (lockHolder === localPlayerId) return localPlayerName;

  const player = remotePlayers.find((p) => p.id === lockHolder);
  return player?.name ?? 'Unknown Player';
}
