/**
 * MultiplayerLobby - UI for creating/joining multiplayer rooms
 *
 * Features:
 * - Create new room (generates room code)
 * - Join existing room via code
 * - Player name input
 * - Connected players list
 * - Connection status
 */

import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Copy,
  Check,
  LogOut,
  Wifi,
  WifiOff,
  ChevronDown,
  ChevronUp,
  UserPlus,
  Crown,
  Signal,
} from 'lucide-react';
import {
  useMultiplayerStore,
  useIsMultiplayerActive,
  useIsHost,
} from '../../stores/multiplayerStore';
import { getMultiplayerManager, destroyMultiplayerManager } from '../../multiplayer';
import { sanitizePlayerName, sanitizeRoomCode } from '../../utils/sanitize';

export const MultiplayerLobby: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const connectionState = useMultiplayerStore((s) => s.connectionState);
  const roomCode = useMultiplayerStore((s) => s.roomCode);
  const localPlayerName = useMultiplayerStore((s) => s.localPlayerName);
  const localPlayerColor = useMultiplayerStore((s) => s.localPlayerColor);
  const remotePlayers = useMultiplayerStore((s) => s._remoteRosterArray);
  const averageLatency = useMultiplayerStore((s) => s.averageLatencyMs);
  const setLocalPlayerName = useMultiplayerStore((s) => s.setLocalPlayerName);

  const isActive = useIsMultiplayerActive();
  const isHost = useIsHost();

  // Listen for host disconnect so a guest is informed (not silently dumped to the join form)
  useEffect(() => {
    const handleHostDisconnected = (event: CustomEvent<{ message: string }>) => {
      setError(event.detail?.message ?? 'The host has left the session.');
      destroyMultiplayerManager();
    };

    window.addEventListener(
      'multiplayer:host-disconnected',
      handleHostDisconnected as EventListener
    );

    return () => {
      window.removeEventListener(
        'multiplayer:host-disconnected',
        handleHostDisconnected as EventListener
      );
    };
  }, []);

  const handleCreateRoom = useCallback(async () => {
    const name = sanitizePlayerName(playerName);
    if (!name) {
      setError('Please enter your name');
      return;
    }

    setError(null);
    setIsConnecting(true);

    try {
      setLocalPlayerName(name);
      const manager = getMultiplayerManager();
      await manager.hostRoom(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsConnecting(false);
    }
  }, [playerName, setLocalPlayerName]);

  const handleJoinRoom = useCallback(async () => {
    const name = sanitizePlayerName(playerName);
    if (!name) {
      setError('Please enter your name');
      return;
    }
    const code = sanitizeRoomCode(joinCode);
    if (!code) {
      setError('Please enter a valid 6-character room code');
      return;
    }

    setError(null);
    setIsConnecting(true);

    try {
      setLocalPlayerName(name);
      const manager = getMultiplayerManager();
      await manager.joinRoom(code, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setIsConnecting(false);
    }
  }, [playerName, joinCode, setLocalPlayerName]);

  const handleLeaveRoom = useCallback(() => {
    // Destructive action: require a second tap to confirm before tearing down the
    // session. As host this ends the room for every guest, so guard against
    // accidental clicks.
    if (!confirmingLeave) {
      setConfirmingLeave(true);
      return;
    }
    const manager = getMultiplayerManager();
    manager.leave();
    destroyMultiplayerManager();
    setConfirmingLeave(false);
    setError(null);
  }, [confirmingLeave]);

  const handleCancelLeave = useCallback(() => {
    setConfirmingLeave(false);
  }, []);

  // Auto-disarm the leave confirmation so it does not stay armed indefinitely.
  useEffect(() => {
    if (!confirmingLeave) return;
    const timer = setTimeout(() => setConfirmingLeave(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmingLeave]);

  // Reset the confirm state whenever the session ends (e.g. host disconnect).
  useEffect(() => {
    if (!isActive && confirmingLeave) {
      setConfirmingLeave(false);
    }
  }, [isActive, confirmingLeave]);

  const handleCopyCode = useCallback(() => {
    if (roomCode) {
      // navigator.clipboard is undefined in insecure (non-HTTPS/localhost)
      // contexts; guard + catch so a copy attempt can't throw.
      navigator.clipboard
        ?.writeText(roomCode)
        .then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
        .catch(() => {
          /* clipboard unavailable - silently ignore */
        });
    }
  }, [roomCode]);

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'connected':
        return 'text-green-400';
      case 'connecting':
      case 'reconnecting':
        return 'text-yellow-400';
      default:
        return 'text-slate-400';
    }
  };

  const getConnectionIcon = () => {
    switch (connectionState) {
      case 'connected':
        return <Wifi className="w-4 h-4 text-green-400" />;
      case 'connecting':
      case 'reconnecting':
        return <Signal className="w-4 h-4 text-yellow-400 animate-pulse" />;
      default:
        return <WifiOff className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="border-t border-slate-700/50 pt-2 mt-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-xs font-medium text-slate-300 hover:text-white transition-colors py-1"
      >
        <span className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-400" />
          Multiplayer
          {isActive && (
            <span className="bg-green-500/20 text-green-400 text-[10px] px-1.5 py-0.5 rounded">
              {remotePlayers.length + 1} player{remotePlayers.length + 1 !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            {/* Not connected - Show create/join options */}
            {!isActive && connectionState !== 'connecting' && (
              <div className="bg-slate-800/50 rounded-lg p-3 space-y-3">
                {/* Name input */}
                <div>
                  <label
                    htmlFor="lobby-player-name"
                    className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 block"
                  >
                    Your Name
                  </label>
                  <input
                    id="lobby-player-name"
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Enter your name"
                    maxLength={20}
                    className="w-full bg-slate-700/50 border border-slate-600/50 rounded px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Visible to other players in the room. A nickname is fine.
                  </p>
                </div>

                {/* Create room button */}
                <button
                  onClick={handleCreateRoom}
                  disabled={isConnecting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-xs font-medium py-2 px-3 rounded transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Create Room
                </button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-600/50"></div>
                  </div>
                  <div className="relative flex justify-center text-[10px]">
                    <span className="px-2 bg-slate-800/50 text-slate-400">or join existing</span>
                  </div>
                </div>

                {/* Join room */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ROOM CODE"
                    aria-label="Enter 6-character room code"
                    maxLength={6}
                    className="flex-1 bg-slate-700/50 border border-slate-600/50 rounded px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-green-500/50 font-mono tracking-wider text-center"
                  />
                  <button
                    onClick={handleJoinRoom}
                    disabled={isConnecting}
                    className="bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors"
                  >
                    Join
                  </button>
                </div>

                {/* Error message */}
                {error && (
                  <div role="alert" className="text-red-400 text-[10px] text-center">
                    {error}
                  </div>
                )}
              </div>
            )}

            {/* Connecting state */}
            {connectionState === 'connecting' && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-center">
                <div className="flex items-center justify-center gap-2 text-yellow-400 text-xs">
                  <Signal className="w-4 h-4 animate-pulse" />
                  Connecting...
                </div>
              </div>
            )}

            {/* Connected - Show room info */}
            {isActive && (
              <div className="space-y-2">
                {/* Room code display */}
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                      Room Code
                    </span>
                    <span className={`text-[10px] ${getConnectionStatusColor()}`}>
                      {connectionState}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-lg text-white tracking-[0.3em] flex-1">
                      {roomCode}
                    </span>
                    <button
                      onClick={handleCopyCode}
                      className="p-1.5 hover:bg-slate-700/50 rounded transition-colors"
                      title="Copy room code"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Players list */}
                <div className="bg-slate-800/50 rounded-lg p-3">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">
                    Players ({remotePlayers.length + 1})
                  </div>
                  <div className="space-y-1.5">
                    {/* Local player */}
                    <div className="flex items-center gap-2 text-xs">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: localPlayerColor }}
                      />
                      <span className="text-white flex-1">{localPlayerName}</span>
                      {isHost && <Crown className="w-3 h-3 text-yellow-400" />}
                      <span className="text-slate-500 text-[10px]">(you)</span>
                    </div>

                    {/* Remote players */}
                    {remotePlayers.map((player) => (
                      <div key={player.id} className="flex items-center gap-2 text-xs">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: player.color }}
                        />
                        <span className="text-slate-300 flex-1">{player.name}</span>
                        {getConnectionIcon()}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Latency indicator */}
                {averageLatency > 0 && (
                  <div className="bg-slate-800/50 rounded-lg p-2 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Latency</span>
                    <span
                      className={`text-xs font-mono ${
                        averageLatency < 50
                          ? 'text-green-400'
                          : averageLatency < 100
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      }`}
                    >
                      {averageLatency}ms
                    </span>
                  </div>
                )}

                {/* Leave button - requires confirmation to avoid accidental teardown */}
                {confirmingLeave ? (
                  <div className="space-y-2">
                    <p
                      role="alert"
                      className="text-[10px] text-red-300 text-center leading-relaxed"
                    >
                      {isHost
                        ? 'Leaving ends the session for everyone. Are you sure?'
                        : 'Leave this room? Are you sure?'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCancelLeave}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-700/50 hover:bg-slate-700/70 text-slate-300 text-xs font-medium py-2 px-3 rounded transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleLeaveRoom}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white text-xs font-medium py-2 px-3 rounded transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Confirm Leave
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={handleLeaveRoom}
                    className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-medium py-2 px-3 rounded transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Leave Room
                  </button>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

MultiplayerLobby.displayName = 'MultiplayerLobby';
