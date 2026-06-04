/**
 * Host Migration Handler
 *
 * Handles the case when the host disconnects from the session.
 * For now, this is a simple implementation that notifies remaining players.
 *
 * Future enhancements could include:
 * - Automatic host migration to the player with lowest latency
 * - State transfer to new host
 * - Seamless reconnection
 */

import { useMultiplayerStore } from '../stores/multiplayerStore';

/**
 * Check if we need to handle host migration
 * Called when the host connection is lost (for guest players)
 */
export function handleHostDisconnect(): void {
  const store = useMultiplayerStore.getState();

  if (store.isHost) {
    // We are the host, nothing to migrate
    return;
  }

  // Host disconnected - reset to disconnected state

  // Clear multiplayer session state while preserving the player's name
  store.leaveRoom();

  // Dispatch event for UI notification
  window.dispatchEvent(
    new CustomEvent('multiplayer:host-disconnected', {
      detail: { message: 'The host has left the session. The session has ended.' },
    })
  );
}

/**
 * In a full implementation, this would:
 * 1. Elect a new host (lowest latency, or by join order)
 * 2. Transfer game state to new host
 * 3. Re-establish connections with new host
 * 4. Resume the session
 *
 * For the MVP, we simply end the session when the host leaves.
 */
export function attemptHostMigration(): boolean {
  // TODO(roadmap): not implemented in MVP and currently has no callers.
  // Kept as an intentional placeholder for future host-migration support.
  // Return false to indicate migration failed.
  return false;
}
