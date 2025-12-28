/**
 * MultiplayerPanel - Embedded panel for multiplayer controls in the sidebar
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  Users,
  Copy,
  Check,
  LogOut,
  Wifi,
  WifiOff,
  UserPlus,
  UserMinus,
  Crown,
  Signal,
  MessageSquare,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  useMultiplayerStore,
  useIsMultiplayerActive,
  useIsHost,
} from '../../../stores/multiplayerStore';
import { getMultiplayerManager, destroyMultiplayerManager } from '../../../multiplayer';

export const MultiplayerPanel: React.FC = () => {
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMessage, setChatMessage] = useState('');

  const connectionState = useMultiplayerStore((s) => s.connectionState);
  const roomCode = useMultiplayerStore((s) => s.roomCode);
  const localPlayerName = useMultiplayerStore((s) => s.localPlayerName);
  const localPlayerColor = useMultiplayerStore((s) => s.localPlayerColor);
  const localPlayerId = useMultiplayerStore((s) => s.localPlayerId);
  const remotePlayers = useMultiplayerStore((s) => s._remotePlayersArray);
  const averageLatency = useMultiplayerStore((s) => s.averageLatencyMs);
  const unreadChatCount = useMultiplayerStore((s) => s.unreadChatCount);
  const chatMessages = useMultiplayerStore((s) => s.chatMessages);
  const markChatRead = useMultiplayerStore((s) => s.markChatRead);
  const setLocalPlayerName = useMultiplayerStore((s) => s.setLocalPlayerName);

  const isActive = useIsMultiplayerActive();
  const isHost = useIsHost();

  // Track player leave notifications
  const [playerLeftNotice, setPlayerLeftNotice] = useState<string | null>(null);

  // Listen for host disconnect and player leave events
  useEffect(() => {
    const handleHostDisconnected = (event: CustomEvent<{ message: string }>) => {
      setError(event.detail.message);
      destroyMultiplayerManager();
    };

    const handlePlayerLeft = (event: CustomEvent<{ id: string; name: string }>) => {
      setPlayerLeftNotice(`${event.detail.name} left the session`);
      // Auto-clear after 3 seconds
      setTimeout(() => setPlayerLeftNotice(null), 3000);
    };

    window.addEventListener(
      'multiplayer:host-disconnected',
      handleHostDisconnected as EventListener
    );
    window.addEventListener('multiplayer:player-left', handlePlayerLeft as EventListener);

    return () => {
      window.removeEventListener(
        'multiplayer:host-disconnected',
        handleHostDisconnected as EventListener
      );
      window.removeEventListener('multiplayer:player-left', handlePlayerLeft as EventListener);
    };
  }, []);

  const handleCreateRoom = useCallback(async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setError(null);
    setIsConnecting(true);

    try {
      setLocalPlayerName(playerName.trim());
      const manager = getMultiplayerManager();
      await manager.hostRoom(playerName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setIsConnecting(false);
    }
  }, [playerName, setLocalPlayerName]);

  const handleJoinRoom = useCallback(async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!joinCode.trim() || joinCode.trim().length !== 6) {
      setError('Please enter a valid 6-character room code');
      return;
    }

    setError(null);
    setIsConnecting(true);

    try {
      setLocalPlayerName(playerName.trim());
      const manager = getMultiplayerManager();
      await manager.joinRoom(joinCode.trim().toUpperCase(), playerName.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setIsConnecting(false);
    }
  }, [playerName, joinCode, setLocalPlayerName]);

  const handleLeaveRoom = useCallback(() => {
    const manager = getMultiplayerManager();
    manager.leave();
    destroyMultiplayerManager();
    setError(null);
    setShowChat(false);
  }, []);

  const handleCopyCode = useCallback(() => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Header info */}
      <div className="flex items-center gap-2 text-blue-400 mb-2">
        <Users className="w-5 h-5" />
        <span className="text-sm font-medium">
          {isActive ? `${remotePlayers.length + 1} Players Connected` : 'Join or Create a Room'}
        </span>
      </div>

      {/* Not connected - Show create/join options */}
      {!isActive && connectionState !== 'connecting' && (
        <div className="space-y-4">
          {/* Name input */}
          <div>
            <label
              htmlFor="multiplayer-name"
              className="text-xs text-slate-400 uppercase tracking-wider mb-2 block"
            >
              Your Name
            </label>
            <input
              id="multiplayer-name"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              maxLength={20}
              aria-required="true"
              className="w-full bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Create room button */}
          <button
            onClick={handleCreateRoom}
            disabled={isConnecting}
            aria-disabled={isConnecting}
            title={isConnecting ? 'Connection in progress' : undefined}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-white text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            <UserPlus className="w-4 h-4" aria-hidden="true" />
            Create Room
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-600/50"></div>
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 bg-slate-900 text-slate-400">or join existing</span>
            </div>
          </div>

          {/* Join room */}
          <div className="flex gap-2">
            <label htmlFor="room-code" className="sr-only">
              Room Code
            </label>
            <input
              id="room-code"
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              aria-label="Enter 6-character room code"
              className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-green-500/50 font-mono tracking-wider text-center"
            />
            <button
              onClick={handleJoinRoom}
              disabled={isConnecting}
              aria-disabled={isConnecting}
              title={isConnecting ? 'Connection in progress' : undefined}
              className="bg-green-600 hover:bg-green-500 disabled:bg-green-600/50 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Join
            </button>
          </div>

          {/* Error message */}
          {error && (
            <div className="text-red-400 text-xs text-center bg-red-500/10 rounded-lg p-2">
              {error}
            </div>
          )}
        </div>
      )}

      {/* Connecting state */}
      {connectionState === 'connecting' && (
        <div
          className="bg-slate-800/50 rounded-lg p-6 text-center"
          role="status"
          aria-live="polite"
        >
          <Signal
            className="w-8 h-8 text-yellow-400 animate-pulse mx-auto mb-2"
            aria-hidden="true"
          />
          <div className="text-yellow-400 text-sm">Connecting...</div>
        </div>
      )}

      {/* Connected - Show room info */}
      {isActive && (
        <div className="space-y-4">
          {/* Player left notification */}
          {playerLeftNotice && (
            <div className="flex items-center gap-2 text-yellow-400 text-xs bg-yellow-500/10 rounded-lg p-2 animate-pulse">
              <UserMinus className="w-4 h-4" />
              {playerLeftNotice}
            </div>
          )}

          {/* Room code display */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 uppercase tracking-wider">Room Code</span>
              <span className={`text-xs flex items-center gap-1 ${getConnectionStatusColor()}`}>
                {getConnectionIcon()}
                {connectionState}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-2xl text-white tracking-[0.3em] flex-1">
                {roomCode}
              </span>
              <button
                onClick={handleCopyCode}
                className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
                title="Copy room code"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-green-400" />
                ) : (
                  <Copy className="w-5 h-5 text-slate-400" />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Share this code with friends to join</p>
          </div>

          {/* Players list */}
          <div className="bg-slate-800/50 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wider mb-3">
              Players ({remotePlayers.length + 1})
            </div>
            <div className="space-y-2">
              {/* Local player */}
              <div className="flex items-center gap-3 p-2 bg-slate-700/30 rounded-lg">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: localPlayerColor }}
                />
                <span className="text-white flex-1 text-sm">{localPlayerName}</span>
                {isHost && <Crown className="w-4 h-4 text-yellow-400" />}
                <span className="text-slate-500 text-xs">(you)</span>
              </div>

              {/* Remote players */}
              {remotePlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 p-2 bg-slate-700/30 rounded-lg"
                >
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: player.color }} />
                  <span className="text-slate-300 flex-1 text-sm">{player.name}</span>
                  {getConnectionIcon()}
                </div>
              ))}
            </div>
          </div>

          {/* Latency indicator */}
          {averageLatency > 0 && (
            <div className="bg-slate-800/50 rounded-lg p-3 flex items-center justify-between">
              <span className="text-xs text-slate-400">Network Latency</span>
              <span
                className={`text-sm font-mono ${
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

          {/* Chat section */}
          <div className="bg-slate-800/50 rounded-lg overflow-hidden">
            <button
              onClick={() => {
                setShowChat(!showChat);
                if (!showChat) markChatRead();
              }}
              aria-expanded={showChat}
              aria-controls="multiplayer-chat-panel"
              className="w-full flex items-center justify-between p-3 hover:bg-slate-700/30 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm text-slate-300">
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                Chat
                {unreadChatCount > 0 && !showChat && (
                  <span
                    className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full"
                    aria-label={`${unreadChatCount} unread messages`}
                  >
                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                  </span>
                )}
              </span>
              {showChat ? (
                <ChevronUp className="w-4 h-4 text-slate-400" aria-hidden="true" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" />
              )}
            </button>

            {showChat && (
              <div id="multiplayer-chat-panel" className="border-t border-slate-700/50">
                {/* Messages */}
                <div
                  className="h-48 overflow-y-auto p-3 space-y-2"
                  role="log"
                  aria-label="Chat messages"
                  aria-live="polite"
                >
                  {chatMessages.length === 0 ? (
                    <div className="text-center text-slate-500 text-xs py-6">
                      No messages yet. Say hello!
                    </div>
                  ) : (
                    chatMessages.map((msg) => {
                      const isLocal = msg.from === localPlayerId;
                      const playerColor = isLocal
                        ? localPlayerColor
                        : (remotePlayers.find((p) => p.id === msg.from)?.color ?? '#888');
                      return (
                        <div key={msg.id} className="flex gap-2">
                          <div
                            className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                            style={{ backgroundColor: playerColor }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-medium" style={{ color: playerColor }}>
                                {msg.fromName}
                              </span>
                              <span className="text-[10px] text-slate-500">
                                {new Date(msg.timestamp).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-300 break-words">{msg.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Input */}
                <div className="p-2 border-t border-slate-700/50">
                  <div className="flex gap-2">
                    <label htmlFor="chat-message" className="sr-only">
                      Chat message
                    </label>
                    <input
                      id="chat-message"
                      type="text"
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && chatMessage.trim()) {
                          const manager = getMultiplayerManager();
                          manager.sendChat(chatMessage.trim());
                          setChatMessage('');
                        }
                      }}
                      placeholder="Type a message..."
                      maxLength={200}
                      aria-label="Type a chat message"
                      className="flex-1 bg-slate-700/50 border border-slate-600/50 rounded px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50"
                    />
                    <button
                      onClick={() => {
                        if (chatMessage.trim()) {
                          const manager = getMultiplayerManager();
                          manager.sendChat(chatMessage.trim());
                          setChatMessage('');
                        }
                      }}
                      disabled={!chatMessage.trim()}
                      aria-disabled={!chatMessage.trim()}
                      aria-label="Send message"
                      title={!chatMessage.trim() ? 'Enter a message to send' : 'Send message'}
                      className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors"
                    >
                      <Send className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Leave button */}
          <button
            onClick={handleLeaveRoom}
            className="w-full flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium py-2.5 px-4 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Leave Room
          </button>
        </div>
      )}
    </div>
  );
};
