/**
 * AIDecisionVoting - Collaborative voting on AI decisions in multiplayer
 *
 * When a new AI decision is proposed, all players can vote to approve or reject.
 * Majority vote determines the outcome.
 */

import React, { useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ThumbsUp, ThumbsDown, Bot, Users, Check, X } from 'lucide-react';
import {
  useMultiplayerStore,
  useIsMultiplayerActive,
  useIsHost,
} from '../../stores/multiplayerStore';
import { useProductionStore } from '../../stores/productionStore';
import { getMultiplayerManager } from '../../multiplayer/MultiplayerManager';
import { AIDecision } from '../../types';
import { AIVote } from '../../multiplayer/types';

interface AIDecisionVotingProps {
  decision: AIDecision;
  onClose?: () => void;
}

/**
 * Single decision voting card
 */
export const AIDecisionVotingCard: React.FC<AIDecisionVotingProps> = ({ decision, onClose }) => {
  const isActive = useIsMultiplayerActive();
  // isHost will be used for host-specific voting controls
  useIsHost();
  const localPlayerId = useMultiplayerStore((s) => s.localPlayerId);
  const remotePlayers = useMultiplayerStore((s) => s._remotePlayersArray);

  // For now, voting is stored in local state
  // In a full implementation, this would sync via the multiplayer system
  const [votes, setVotes] = React.useState<Map<string, boolean>>(new Map());
  const [hasVoted, setHasVoted] = React.useState(false);

  const totalPlayers = remotePlayers.length + 1;
  const approveCount = useMemo(() => Array.from(votes.values()).filter((v) => v).length, [votes]);
  const rejectCount = useMemo(() => Array.from(votes.values()).filter((v) => !v).length, [votes]);

  // Listen for incoming votes from other players
  useEffect(() => {
    if (!isActive) return;

    const handleVoteReceived = (event: CustomEvent<AIVote>) => {
      const vote = event.detail;
      // Only process votes for this decision
      if (vote.decisionId !== decision.id) return;

      setVotes((prev) => {
        const newVotes = new Map(prev);
        newVotes.set(vote.playerId, vote.approve);
        return newVotes;
      });
    };

    window.addEventListener('multiplayer:ai-vote', handleVoteReceived as EventListener);
    return () => {
      window.removeEventListener('multiplayer:ai-vote', handleVoteReceived as EventListener);
    };
  }, [isActive, decision.id]);

  const handleVote = (approve: boolean) => {
    if (hasVoted) return;

    const newVotes = new Map(votes);
    newVotes.set(localPlayerId, approve);
    setVotes(newVotes);
    setHasVoted(true);

    // In multiplayer, broadcast the vote to all peers
    if (isActive) {
      const manager = getMultiplayerManager();
      const votePayload: AIVote = {
        decisionId: decision.id,
        playerId: localPlayerId,
        approve,
        timestamp: Date.now(),
      };
      manager.broadcast({
        type: 'AI_VOTE',
        payload: votePayload,
      });
    }
  };

  // Determine vote result
  const voteThreshold = Math.ceil(totalPlayers / 2);
  const isApproved = approveCount >= voteThreshold;
  const isRejected = rejectCount >= voteThreshold;
  const votingComplete = approveCount + rejectCount >= totalPlayers || isApproved || isRejected;

  // Get confidence color
  const confidenceColor =
    decision.confidence >= 0.8
      ? 'text-green-400'
      : decision.confidence >= 0.6
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-slate-800/95 backdrop-blur-sm rounded-lg border border-slate-700/50 p-4 max-w-md"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-400" />
          <span className="text-sm font-medium text-white">AI Recommendation</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-slate-700/50 rounded transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        )}
      </div>

      {/* Decision details */}
      <div className="space-y-2 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 uppercase tracking-wider">{decision.type}</span>
          <span className={`text-xs ${confidenceColor}`}>
            {Math.round(decision.confidence * 100)}% confident
          </span>
        </div>

        <p className="text-sm text-white">{decision.action}</p>

        <p className="text-xs text-slate-400">{decision.reasoning}</p>

        {decision.impact && (
          <div className="text-xs text-slate-500">
            <span className="text-slate-400">Expected impact:</span> {decision.impact}
          </div>
        )}
      </div>

      {/* Multiplayer voting section */}
      {isActive && !votingComplete && (
        <div className="border-t border-slate-700/50 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Users className="w-3 h-3" />
              {approveCount + rejectCount} / {totalPlayers} voted
            </span>
          </div>

          {!hasVoted ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleVote(true)}
                className="flex-1 flex items-center justify-center gap-2 bg-green-600/20 hover:bg-green-600/30 text-green-400 py-2 rounded transition-colors"
              >
                <ThumbsUp className="w-4 h-4" />
                <span className="text-xs">Approve</span>
              </button>
              <button
                onClick={() => handleVote(false)}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600/20 hover:bg-red-600/30 text-red-400 py-2 rounded transition-colors"
              >
                <ThumbsDown className="w-4 h-4" />
                <span className="text-xs">Reject</span>
              </button>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-400 py-2">
              Waiting for other players to vote...
            </div>
          )}

          {/* Vote progress bar */}
          <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden flex">
            <div
              className="bg-green-500 transition-all duration-300"
              style={{ width: `${(approveCount / totalPlayers) * 100}%` }}
            />
            <div
              className="bg-red-500 transition-all duration-300"
              style={{ width: `${(rejectCount / totalPlayers) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Vote result */}
      {votingComplete && (
        <div className="border-t border-slate-700/50 pt-3">
          <div
            className={`flex items-center justify-center gap-2 py-2 rounded ${
              isApproved ? 'bg-green-600/20 text-green-400' : 'bg-red-600/20 text-red-400'
            }`}
          >
            {isApproved ? (
              <>
                <Check className="w-4 h-4" />
                <span className="text-sm font-medium">Approved by team</span>
              </>
            ) : (
              <>
                <X className="w-4 h-4" />
                <span className="text-sm font-medium">Rejected by team</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Single player - show action buttons */}
      {!isActive && (
        <div className="border-t border-slate-700/50 pt-3 flex gap-2">
          <button
            className="flex-1 bg-green-600 hover:bg-green-500 text-white py-2 rounded text-sm font-medium transition-colors"
            onClick={() => {
              useProductionStore
                .getState()
                .updateDecisionStatus(decision.id, 'completed', 'Applied by player');
              onClose?.();
            }}
          >
            Apply
          </button>
          <button
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded text-sm font-medium transition-colors"
            onClick={() => {
              useProductionStore
                .getState()
                .updateDecisionStatus(decision.id, 'superseded', 'Dismissed by player');
              onClose?.();
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </motion.div>
  );
};

AIDecisionVotingCard.displayName = 'AIDecisionVotingCard';

/**
 * Container for pending AI decisions that need voting
 */
export const AIDecisionVotingPanel: React.FC = () => {
  const isActive = useIsMultiplayerActive();
  const aiDecisions = useProductionStore((s) => s.aiDecisions);

  // Filter to pending decisions only
  const pendingDecisions = useMemo(
    () => aiDecisions.filter((d) => d.status === 'pending'),
    [aiDecisions]
  );

  if (!isActive || pendingDecisions.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-20 right-4 z-40 space-y-2">
      <AnimatePresence>
        {pendingDecisions.slice(0, 3).map((decision) => (
          <AIDecisionVotingCard key={decision.id} decision={decision} />
        ))}
      </AnimatePresence>
    </div>
  );
};

AIDecisionVotingPanel.displayName = 'AIDecisionVotingPanel';
