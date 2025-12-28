/**
 * VotingPanel - Democratic Voting UI
 *
 * Displays and manages democratic voting for the Bilateral Autonomy System.
 * Workers can view active votes, cast votes, and see results.
 *
 * Features:
 * - Active votes with countdown timer
 * - Vote type indicators (policy, AI behavior, axis change, etc.)
 * - Current tally visualization
 * - Quorum progress bar
 * - AI analysis section
 * - Results history
 *
 * Based on Semler's worker self-governance and Mondragon's one-worker-one-vote.
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import {
  Vote as VoteIcon,
  CheckCircle,
  XCircle,
  Clock,
  Users,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Zap,
  Settings,
  Sliders,
  Calendar,
  Wrench,
  Award,
  Bot,
  Play,
  BarChart2,
} from 'lucide-react';
import { useVotingStore } from '../../../stores/votingStore';
import { WORKER_ROSTER } from '../../../types';
import { ConceptTooltip } from './ConceptTooltip';
import type { Vote as VoteInterface, VoteType, VoteOption, VoteStatus } from '../../../types/bas';

// =============================================================================
// CONSTANTS
// =============================================================================

const VOTE_TYPE_CONFIG: Record<VoteType, { icon: LucideIcon; label: string; color: string }> = {
  policy: { icon: Settings, label: 'Policy', color: 'text-blue-400' },
  'ai-behavior': { icon: Bot, label: 'AI Behavior', color: 'text-purple-400' },
  schedule: { icon: Calendar, label: 'Schedule', color: 'text-amber-400' },
  method: { icon: Wrench, label: 'Method', color: 'text-green-400' },
  'axis-change': { icon: Sliders, label: 'Axis Change', color: 'text-cyan-400' },
  emergency: { icon: Zap, label: 'Emergency', color: 'text-red-400' },
  recognition: { icon: Award, label: 'Recognition', color: 'text-yellow-400' },
};

const STATUS_CONFIG: Record<VoteStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Draft', color: 'text-slate-400', bgColor: 'bg-slate-600/30' },
  open: { label: 'Voting', color: 'text-green-400', bgColor: 'bg-green-600/30' },
  closed: { label: 'Passed', color: 'text-cyan-400', bgColor: 'bg-cyan-600/30' },
  implemented: { label: 'Applied', color: 'text-emerald-400', bgColor: 'bg-emerald-600/30' },
  rejected: { label: 'Rejected', color: 'text-red-400', bgColor: 'bg-red-600/30' },
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface CountdownTimerProps {
  deadline: number | null;
}

const CountdownTimer: React.FC<CountdownTimerProps> = ({ deadline }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    if (!deadline) {
      setTimeLeft('No deadline');
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = deadline - now;

      if (diff <= 0) {
        setTimeLeft('Ended');
        return;
      }

      const hours = Math.floor(diff / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setTimeLeft(`${days}d ${hours % 24}h`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`);
      } else {
        setTimeLeft(`${minutes}m`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, [deadline]);

  const isUrgent = deadline && deadline - Date.now() < 3600000; // < 1 hour

  return (
    <div
      className={`flex items-center gap-1 text-[10px] ${isUrgent ? 'text-red-400' : 'text-slate-400'}`}
    >
      <Clock className="w-3 h-3" />
      <span>{timeLeft}</span>
    </div>
  );
};

interface VoteTallyBarProps {
  options: VoteOption[];
  quorumRequired: number;
}

const VoteTallyBar: React.FC<VoteTallyBarProps> = ({ options, quorumRequired }) => {
  const totalVotes = options.reduce((sum, opt) => sum + opt.votes.length, 0);
  const totalWorkers = WORKER_ROSTER.length;
  const turnout = totalWorkers > 0 ? totalVotes / totalWorkers : 0;
  const quorumMet = turnout >= quorumRequired;

  const colors = ['bg-green-500', 'bg-amber-500', 'bg-blue-500', 'bg-purple-500'];

  return (
    <div className="space-y-1">
      {/* Tally bar */}
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden flex">
        {options.map((opt, idx) =>
          opt.votes.length > 0 ? (
            <motion.div
              key={opt.id}
              initial={{ width: 0 }}
              animate={{
                width: `${totalVotes > 0 ? (opt.votes.length / totalVotes) * 100 : 0}%`,
              }}
              transition={{ duration: 0.3 }}
              className={`${colors[idx % colors.length]} h-full`}
              title={`${opt.label}: ${opt.votes.length} votes`}
            />
          ) : null
        )}
      </div>

      {/* Quorum indicator */}
      <div className="flex items-center justify-between text-[9px]">
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3 text-slate-500" />
          <span className="text-slate-400">
            {totalVotes}/{totalWorkers} voted
          </span>
        </div>
        <div
          className={`flex items-center gap-1 ${quorumMet ? 'text-green-400' : 'text-amber-400'}`}
        >
          {quorumMet ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          <span>
            {Math.round(turnout * 100)}% / {Math.round(quorumRequired * 100)}% quorum
          </span>
        </div>
      </div>
    </div>
  );
};

interface VoteCardProps {
  vote: VoteInterface;
  onCastVote: (voteId: string, optionId: string) => void;
  onSimulate: (voteId: string) => void;
  currentWorkerId?: string;
}

const VoteCard: React.FC<VoteCardProps> = ({
  vote,
  onCastVote,
  onSimulate,
  currentWorkerId = 'worker-1',
}) => {
  const [expanded, setExpanded] = useState(false);
  const typeConfig = VOTE_TYPE_CONFIG[vote.type];
  const statusConfig = STATUS_CONFIG[vote.status];
  const TypeIcon = typeConfig.icon;

  const hasVoted = vote.options.some((opt) => opt.votes.includes(currentWorkerId));
  const votedOption = vote.options.find((opt) => opt.votes.includes(currentWorkerId));

  return (
    <motion.div
      layout
      className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden"
    >
      {/* Header */}
      <div
        className="p-2 cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-2">
          {/* Type icon */}
          <div className={`mt-0.5 ${typeConfig.color}`}>
            <TypeIcon className="w-4 h-4" />
          </div>

          {/* Title and meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-white truncate">{vote.title}</span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}
              >
                {statusConfig.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[9px] text-slate-500">by {vote.proposerName}</span>
              {vote.status === 'open' && <CountdownTimer deadline={vote.deadline} />}
            </div>
          </div>

          {/* Expand toggle */}
          <div className="text-slate-500">
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </div>

        {/* Tally bar for open votes */}
        {vote.status === 'open' && (
          <div className="mt-2">
            <VoteTallyBar options={vote.options} quorumRequired={vote.quorumRequired} />
          </div>
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-700/50"
          >
            <div className="p-2 space-y-2">
              {/* Description */}
              <p className="text-[10px] text-slate-400">{vote.description}</p>

              {/* AI Analysis */}
              {vote.aiAnalysis && (
                <div className="bg-slate-900/50 rounded p-2 border border-purple-500/20">
                  <div className="flex items-center gap-1 text-[9px] text-purple-400 mb-1">
                    <Bot className="w-3 h-3" />
                    <span>AI Analysis</span>
                  </div>
                  <p className="text-[9px] text-slate-300">{vote.aiAnalysis}</p>
                </div>
              )}

              {/* Options */}
              <div className="space-y-1">
                {vote.options.map((option, idx) => {
                  const totalVotes = vote.options.reduce((sum, o) => sum + o.votes.length, 0);
                  const percentage =
                    totalVotes > 0 ? Math.round((option.votes.length / totalVotes) * 100) : 0;
                  const isSelected = option.id === votedOption?.id;
                  const colors = [
                    'border-green-500 bg-green-500/10',
                    'border-amber-500 bg-amber-500/10',
                    'border-blue-500 bg-blue-500/10',
                    'border-purple-500 bg-purple-500/10',
                  ];

                  return (
                    <div
                      key={option.id}
                      className={`rounded border p-1.5 ${
                        isSelected
                          ? colors[idx % colors.length]
                          : 'border-slate-600/50 bg-slate-700/30'
                      } ${
                        vote.status === 'open' && !isSelected
                          ? 'cursor-pointer hover:bg-slate-700/50'
                          : ''
                      }`}
                      onClick={() => {
                        if (vote.status === 'open' && !isSelected) {
                          onCastVote(vote.id, option.id);
                        }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isSelected && <CheckCircle className="w-3 h-3 text-green-400" />}
                          <span className="text-[10px] font-medium text-white">{option.label}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] text-slate-400">
                            {option.votes.length} votes
                          </span>
                          <span className="text-[9px] font-mono text-cyan-400">{percentage}%</span>
                        </div>
                      </div>
                      {option.description && (
                        <p className="text-[9px] text-slate-500 mt-0.5 ml-5">
                          {option.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Vote status message */}
              {vote.status === 'open' && hasVoted && (
                <div className="flex items-center gap-1 text-[9px] text-green-400">
                  <CheckCircle className="w-3 h-3" />
                  <span>You voted for "{votedOption?.label}"</span>
                </div>
              )}

              {/* Simulation button (dev/demo only) */}
              {vote.status === 'open' && (
                <button
                  onClick={() => onSimulate(vote.id)}
                  className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <Play className="w-3 h-3" />
                  <span>Simulate worker voting</span>
                </button>
              )}

              {/* Result for closed votes (passed, awaiting implementation) */}
              {vote.status === 'closed' && vote.result && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded p-2">
                  <div className="flex items-center gap-1 text-[10px] text-cyan-400">
                    <CheckCircle className="w-3 h-3" />
                    <span>
                      Passed: "{vote.result.label}" with {Math.round(vote.turnout * 100)}% turnout
                    </span>
                  </div>
                  <div className="text-[9px] text-cyan-400/70 mt-1 ml-4">
                    Implementing changes...
                  </div>
                </div>
              )}

              {/* Result for implemented votes (applied to system) */}
              {vote.status === 'implemented' && vote.result && (
                <div className="bg-emerald-500/10 border border-emerald-500/30 rounded p-2">
                  <div className="flex items-center gap-1 text-[10px] text-emerald-400">
                    <CheckCircle className="w-3 h-3" />
                    <span>
                      Applied: "{vote.result.label}" with {Math.round(vote.turnout * 100)}% turnout
                    </span>
                  </div>
                  {vote.type === 'axis-change' && vote.targetAxis && vote.proposedValue !== undefined && (
                    <div className="text-[9px] text-emerald-400/70 mt-1 ml-4">
                      {vote.result.label === 'Accept Change'
                        ? `${vote.targetAxis.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())} set to ${vote.proposedValue}%`
                        : 'Current setting retained'}
                    </div>
                  )}
                  {vote.type === 'ai-behavior' && (
                    <div className="text-[9px] text-emerald-400/70 mt-1 ml-4">
                      AI behavior updated
                    </div>
                  )}
                  {vote.type === 'policy' && (
                    <div className="text-[9px] text-emerald-400/70 mt-1 ml-4">
                      Policy now in effect
                    </div>
                  )}
                  {vote.type === 'schedule' && (
                    <div className="text-[9px] text-emerald-400/70 mt-1 ml-4">
                      Schedule change applied
                    </div>
                  )}
                  {vote.type === 'method' && (
                    <div className="text-[9px] text-emerald-400/70 mt-1 ml-4">
                      Work method updated
                    </div>
                  )}
                  {vote.type === 'recognition' && (
                    <div className="text-[9px] text-emerald-400/70 mt-1 ml-4">
                      Recognition awarded
                    </div>
                  )}
                  {vote.type === 'emergency' && (
                    <div className="text-[9px] text-emerald-400/70 mt-1 ml-4">
                      Emergency action executed
                    </div>
                  )}
                </div>
              )}

              {vote.status === 'rejected' && (
                <div className="bg-red-500/10 border border-red-500/30 rounded p-2">
                  <div className="flex items-center gap-1 text-[10px] text-red-400">
                    <XCircle className="w-3 h-3" />
                    <span>
                      Rejected - {Math.round(vote.turnout * 100)}% turnout (needed{' '}
                      {Math.round(vote.quorumRequired * 100)}%)
                    </span>
                  </div>
                </div>
              )}

              {/* Discussion thread preview */}
              {vote.discussionThread.length > 0 && (
                <div className="border-t border-slate-700/50 pt-2 mt-2">
                  <div className="flex items-center gap-1 text-[9px] text-slate-500 mb-1">
                    <MessageSquare className="w-3 h-3" />
                    <span>{vote.discussionThread.length} comments</span>
                  </div>
                  <div className="text-[9px] text-slate-400 italic">
                    "{vote.discussionThread[vote.discussionThread.length - 1].content}"
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

interface VotingPanelProps {
  defaultExpanded?: boolean;
}

export const VotingPanel: React.FC<VotingPanelProps> = ({ defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');

  const { votes, castVote, simulateWorkerVoting, getActiveVotes, getClosedVotes, closeVote } =
    useVotingStore();

  const activeVotes = useMemo(() => getActiveVotes(), [votes]);
  const closedVotes = useMemo(() => getClosedVotes().slice(0, 5), [votes]); // Last 5

  // Stats
  const pendingCount = votes.filter((v) => v.status === 'draft').length;
  const openCount = activeVotes.length;
  const passedCount = votes.filter(
    (v) => v.status === 'closed' || v.status === 'implemented'
  ).length;

  const handleCastVote = (voteId: string, optionId: string) => {
    castVote(voteId, 'worker-1', optionId);
  };

  const handleSimulate = (voteId: string) => {
    simulateWorkerVoting(voteId);
    // Auto-close if all workers have voted
    const vote = votes.find((v) => v.id === voteId);
    if (vote) {
      const totalVotes = vote.options.reduce((sum, opt) => sum + opt.votes.length, 0);
      if (totalVotes >= WORKER_ROSTER.length * 0.8) {
        closeVote(voteId);
      }
    }
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between p-2 cursor-pointer hover:bg-slate-700/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <VoteIcon className="w-4 h-4 text-green-400" />
          <span className="text-xs font-medium text-white">Democratic Voting</span>
          <ConceptTooltip conceptId="democratic-voting" position="right" />
        </div>
        <div className="flex items-center gap-2">
          {openCount > 0 && (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-600/30 text-green-400">
              {openCount} active
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </div>
      </div>

      {/* Content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-slate-700/50"
          >
            <div className="p-2 space-y-2">
              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-700/30 rounded p-1.5 text-center">
                  <div className="text-lg font-bold text-cyan-400">{openCount}</div>
                  <div className="text-[9px] text-slate-500">Active</div>
                </div>
                <div className="bg-slate-700/30 rounded p-1.5 text-center">
                  <div className="text-lg font-bold text-amber-400">{pendingCount}</div>
                  <div className="text-[9px] text-slate-500">Pending</div>
                </div>
                <div className="bg-slate-700/30 rounded p-1.5 text-center">
                  <div className="text-lg font-bold text-green-400">{passedCount}</div>
                  <div className="text-[9px] text-slate-500">Passed</div>
                </div>
              </div>

              {/* Tab toggle */}
              <div className="flex rounded bg-slate-700/30 p-0.5">
                <button
                  className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                    activeTab === 'active'
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  onClick={() => setActiveTab('active')}
                >
                  Active ({openCount})
                </button>
                <button
                  className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                    activeTab === 'history'
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  onClick={() => setActiveTab('history')}
                >
                  History ({closedVotes.length})
                </button>
              </div>

              {/* Vote list */}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {activeTab === 'active' ? (
                  activeVotes.length > 0 ? (
                    activeVotes.map((vote) => (
                      <VoteCard
                        key={vote.id}
                        vote={vote}
                        onCastVote={handleCastVote}
                        onSimulate={handleSimulate}
                      />
                    ))
                  ) : (
                    <div className="text-center py-4 text-slate-500">
                      <VoteIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
                      <p className="text-[10px]">No active votes</p>
                      <p className="text-[9px] text-slate-600">
                        Votes can be proposed through axis changes or scenarios
                      </p>
                    </div>
                  )
                ) : closedVotes.length > 0 ? (
                  closedVotes.map((vote) => (
                    <VoteCard
                      key={vote.id}
                      vote={vote}
                      onCastVote={handleCastVote}
                      onSimulate={handleSimulate}
                    />
                  ))
                ) : (
                  <div className="text-center py-4 text-slate-500">
                    <BarChart2 className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p className="text-[10px]">No vote history yet</p>
                  </div>
                )}
              </div>

              {/* Info footer */}
              <div className="flex items-start gap-1 pt-2 border-t border-slate-700/50">
                <Info className="w-3 h-3 text-slate-500 mt-0.5 flex-shrink-0" />
                <p className="text-[9px] text-slate-500">
                  Democratic voting follows one-worker-one-vote principles. Most decisions require
                  50% quorum and simple majority.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
