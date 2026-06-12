/**
 * MultiplayerChat - In-game chat system for multiplayer
 *
 * Features:
 * - Message input and display
 * - Auto-scroll to latest message
 * - Unread message indicator
 * - Player color-coded messages
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, X } from 'lucide-react';
import { useMultiplayerStore, useIsMultiplayerActive } from '../../stores/multiplayerStore';
import { getMultiplayerManager } from '../../multiplayer';

export const MultiplayerChat: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isActive = useIsMultiplayerActive();
  const chatMessages = useMultiplayerStore((s) => s.chatMessages);
  const unreadCount = useMultiplayerStore((s) => s.unreadChatCount);
  const markChatRead = useMultiplayerStore((s) => s.markChatRead);
  const localPlayerId = useMultiplayerStore((s) => s.localPlayerId);
  const localPlayerColor = useMultiplayerStore((s) => s.localPlayerColor);
  const remotePlayers = useMultiplayerStore((s) => s._remoteRosterArray);

  // Get player color by ID
  const getPlayerColor = useCallback(
    (playerId: string): string => {
      if (playerId === localPlayerId) return localPlayerColor;
      const player = remotePlayers.find((p) => p.id === playerId);
      return player?.color ?? '#ffffff';
    },
    [localPlayerId, localPlayerColor, remotePlayers]
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (expanded && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, expanded]);

  // Mark as read when expanded
  useEffect(() => {
    if (expanded && unreadCount > 0) {
      markChatRead();
    }
  }, [expanded, unreadCount, markChatRead]);

  // Handle send message
  const handleSend = useCallback(() => {
    if (!message.trim()) return;

    const manager = getMultiplayerManager();
    manager.sendChat(message.trim());
    setMessage('');
    inputRef.current?.focus();
  }, [message]);

  // Handle key press
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
      if (e.key === 'Escape') {
        setExpanded(false);
      }
    },
    [handleSend]
  );

  // Format timestamp
  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  if (!isActive) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-14 right-0 w-80 bg-slate-900/95 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50">
              <span className="text-xs font-medium text-slate-300">Chat</span>
              <button
                onClick={() => setExpanded(false)}
                aria-label="Close chat"
                className="p-1 hover:bg-slate-700/50 rounded transition-colors"
              >
                <X className="w-3 h-3 text-slate-400" />
              </button>
            </div>

            {/* Messages */}
            <div
              className="h-64 overflow-y-auto p-2 space-y-2"
              role="log"
              aria-live="polite"
              aria-relevant="additions"
            >
              {chatMessages.length === 0 ? (
                <div className="text-center text-slate-500 text-xs py-8">
                  No messages yet. Say hello!
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className="flex gap-2">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: getPlayerColor(msg.from) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span
                          className="text-xs font-medium"
                          style={{ color: getPlayerColor(msg.from) }}
                        >
                          {msg.fromName}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {formatTime(msg.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 break-words">{msg.message}</p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-2 border-t border-slate-700/50">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  aria-label="Chat message"
                  placeholder="Type a message..."
                  maxLength={200}
                  className="flex-1 bg-slate-800/50 border border-slate-600/50 rounded px-2 py-1.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50"
                />
                <button
                  onClick={handleSend}
                  disabled={!message.trim()}
                  className="p-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`relative p-3 rounded-full shadow-lg transition-colors ${
          expanded
            ? 'bg-blue-600 text-white'
            : 'bg-slate-800/95 hover:bg-slate-700/95 text-slate-300'
        }`}
      >
        <MessageCircle className="w-5 h-5" />

        {/* Unread badge */}
        {!expanded && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
};

MultiplayerChat.displayName = 'MultiplayerChat';
