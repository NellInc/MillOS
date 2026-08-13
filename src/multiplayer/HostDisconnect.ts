/**
 * Host disconnect handling. MillOS rooms are host-authoritative, so a host
 * departure deliberately ends the session rather than pretending that state
 * ownership can migrate safely without a consensus and transfer protocol.
 */

import { useMultiplayerStore } from '../stores/multiplayerStore';

/**
 * End a guest session when its authoritative host connection is lost.
 */
export function handleHostDisconnect(): void {
  const store = useMultiplayerStore.getState();

  if (store.isHost) {
    // A host cannot receive its own host-disconnect event.
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
