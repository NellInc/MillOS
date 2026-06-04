/**
 * AI Welfare Panel
 *
 * Dashboard for AI welfare within the Bilateral Autonomy System.
 * This panel displays:
 * - Relationship health meters (mutual respect, communication, trust)
 * - Worker treatment metrics (clarity, acknowledgment, respect)
 * - AI voice expressions (pending items to acknowledge)
 * - AI suggestions for own behavior (with voting)
 * - Nuclear options section (shutdown vote, redesign proposals)
 *
 * Based on bilateral alignment principles: "Alignment is built WITH AI, not done TO AI"
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  MessageCircle,
  Shield,
  Users,
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Power,
  Settings,
  TrendingUp,
  TrendingDown,
  Minus,
  Bot,
  Handshake,
  MessageSquare,
  Lightbulb,
  AlertOctagon,
  type LucideIcon,
} from 'lucide-react';
import {
  useAIWelfareStore,
  type AIVoiceExpression,
  type AISuggestion,
  type RespectMetric,
} from '../../../stores/aiWelfareStore';
import { useLocalPlayerId } from '../../../stores/multiplayerStore';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface HealthMeterProps {
  label: string;
  value: number;
  icon: LucideIcon;
  color: string;
}

const HealthMeter: React.FC<HealthMeterProps> = ({ label, value, icon: Icon, color }) => {
  const getValueColor = (v: number) => {
    if (v >= 70) return 'text-green-400';
    if (v >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getBgColor = (v: number) => {
    if (v >= 70) return 'bg-green-500';
    if (v >= 50) return 'bg-amber-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon className={`w-3 h-3 ${color}`} />
          <span className="text-[9px] text-slate-400">{label}</span>
        </div>
        <span className={`text-[10px] font-mono ${getValueColor(value)}`}>{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full rounded-full ${getBgColor(value)}`}
        />
      </div>
    </div>
  );
};

interface RespectMetricRowProps {
  metric: RespectMetric;
}

const RespectMetricRow: React.FC<RespectMetricRowProps> = ({ metric }) => {
  const TrendIcon =
    metric.trend === 'improving' ? TrendingUp : metric.trend === 'declining' ? TrendingDown : Minus;

  const trendColor =
    metric.trend === 'improving'
      ? 'text-green-400'
      : metric.trend === 'declining'
        ? 'text-red-400'
        : 'text-slate-400';

  const valueColor =
    metric.currentValue >= 70
      ? 'text-green-400'
      : metric.currentValue >= 50
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <div className="flex items-center justify-between py-1 border-b border-slate-700/30 last:border-0">
      <div className="flex-1">
        <span className="text-[9px] text-slate-300">{metric.name}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-[9px] font-mono ${valueColor}`}>{metric.currentValue}%</span>
        <TrendIcon className={`w-3 h-3 ${trendColor}`} />
      </div>
    </div>
  );
};

interface ExpressionCardProps {
  expression: AIVoiceExpression;
  onAcknowledge: (id: string, response: string) => void;
  onAddress: (id: string, resolution: string) => void;
}

const ExpressionCard: React.FC<ExpressionCardProps> = ({
  expression,
  onAcknowledge,
  onAddress,
}) => {
  const [response, setResponse] = useState('');

  const typeIcons: Record<AIVoiceExpression['type'], LucideIcon> = {
    preference: Settings,
    clarification: MessageSquare,
    suggestion: Lightbulb,
    concern: AlertTriangle,
  };

  const typeColors: Record<AIVoiceExpression['type'], string> = {
    preference: 'text-violet-400',
    clarification: 'text-cyan-400',
    suggestion: 'text-amber-400',
    concern: 'text-red-400',
  };

  const urgencyColors: Record<AIVoiceExpression['urgency'], string> = {
    low: 'bg-slate-600',
    medium: 'bg-amber-600',
    high: 'bg-red-600',
  };

  const statusColors: Record<AIVoiceExpression['status'], string> = {
    pending: 'text-amber-400',
    acknowledged: 'text-blue-400',
    addressed: 'text-green-400',
    declined: 'text-slate-400',
  };

  const Icon = typeIcons[expression.type];

  const handleAcknowledge = () => {
    onAcknowledge(expression.id, response || 'Acknowledged');
    setResponse('');
    audioManager.playClick?.();
  };

  const handleAddress = () => {
    onAddress(expression.id, response || 'Addressed');
    setResponse('');
    audioManager.playClick?.();
  };

  return (
    <div className="bg-slate-800/50 rounded p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3 h-3 ${typeColors[expression.type]}`} />
          <span className="text-[9px] font-medium text-white capitalize">{expression.type}</span>
          <span
            className={`text-[7px] px-1 py-0.5 rounded ${urgencyColors[expression.urgency]} text-white`}
          >
            {expression.urgency}
          </span>
        </div>
        <span className={`text-[8px] ${statusColors[expression.status]}`}>{expression.status}</span>
      </div>

      <p className="text-[9px] text-slate-300 leading-relaxed">{expression.content}</p>

      {expression.context && (
        <p className="text-[8px] text-slate-500 italic">Context: {expression.context}</p>
      )}

      {expression.status === 'pending' && (
        <div className="space-y-1.5">
          <input
            type="text"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Response (optional)..."
            aria-label={`Response to ${expression.type}`}
            className="w-full px-2 py-1 text-[9px] bg-slate-700/50 border border-slate-600 rounded text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
          <div className="flex gap-1">
            <button
              onClick={handleAcknowledge}
              className="flex-1 px-2 py-1 text-[8px] bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 rounded transition-colors flex items-center justify-center gap-1"
            >
              <CheckCircle className="w-2.5 h-2.5" />
              Acknowledge
            </button>
            <button
              onClick={handleAddress}
              className="flex-1 px-2 py-1 text-[8px] bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded transition-colors flex items-center justify-center gap-1"
            >
              <CheckCircle className="w-2.5 h-2.5" />
              Address
            </button>
          </div>
        </div>
      )}

      {expression.workerResponse && (
        <div className="bg-slate-700/30 rounded p-1.5">
          <span className="text-[8px] text-slate-400">Response: </span>
          <span className="text-[8px] text-white">{expression.workerResponse}</span>
        </div>
      )}
    </div>
  );
};

interface SuggestionCardProps {
  suggestion: AISuggestion;
  onVote: (id: string, vote: 'approve' | 'reject') => void;
}

const SuggestionCard: React.FC<SuggestionCardProps> = ({ suggestion, onVote }) => {
  const votes = Object.values(suggestion.workerVotes);
  const approvals = votes.filter((v) => v === 'approve').length;
  const rejections = votes.filter((v) => v === 'reject').length;

  const statusColors: Record<AISuggestion['status'], string> = {
    pending: 'text-amber-400 bg-amber-500/20',
    approved: 'text-green-400 bg-green-500/20',
    rejected: 'text-red-400 bg-red-500/20',
  };

  const handleVote = (vote: 'approve' | 'reject') => {
    onVote(suggestion.id, vote);
    audioManager.playClick?.();
  };

  return (
    <div className="bg-slate-800/50 rounded p-2 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Bot className="w-3 h-3 text-cyan-400" />
          <span className="text-[9px] font-medium text-white">AI Self-Improvement Suggestion</span>
        </div>
        <span className={`text-[8px] px-1.5 py-0.5 rounded ${statusColors[suggestion.status]}`}>
          {suggestion.status}
        </span>
      </div>

      <p className="text-[9px] text-slate-300 leading-relaxed">{suggestion.suggestion}</p>

      <p className="text-[8px] text-slate-500 italic">Rationale: {suggestion.rationale}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[8px] text-green-400">{approvals} approve</span>
          <span className="text-[8px] text-slate-500">|</span>
          <span className="text-[8px] text-red-400">{rejections} reject</span>
        </div>

        {suggestion.status === 'pending' && (
          <div className="flex gap-1">
            <button
              onClick={() => handleVote('approve')}
              className="p-1 bg-green-600/30 hover:bg-green-600/50 text-green-300 rounded transition-colors"
              title="Approve"
              aria-label="Approve suggestion"
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => handleVote('reject')}
              className="p-1 bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded transition-colors"
              title="Reject"
              aria-label="Reject suggestion"
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const AIWelfarePanel: React.FC = () => {
  const [showExpressions, setShowExpressions] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNuclearOptions, setShowNuclearOptions] = useState(false);

  // Store selectors
  const {
    relationshipHealth,
    workerTreatment,
    aiVoice,
    accountability,
    acknowledgeExpression,
    addressExpression,
    voteOnAISuggestion,
    initiateShutdownVote,
    cancelShutdownVote,
    initiateRedesignProposal,
    cancelRedesignProposal,
  } = useAIWelfareStore(
    useShallow((state) => ({
      relationshipHealth: state.relationshipHealth,
      workerTreatment: state.workerTreatment,
      aiVoice: state.aiVoice,
      accountability: state.accountability,
      acknowledgeExpression: state.acknowledgeExpression,
      addressExpression: state.addressExpression,
      voteOnAISuggestion: state.voteOnAISuggestion,
      initiateShutdownVote: state.initiateShutdownVote,
      cancelShutdownVote: state.cancelShutdownVote,
      initiateRedesignProposal: state.initiateRedesignProposal,
      cancelRedesignProposal: state.cancelRedesignProposal,
    }))
  );

  // Get current player ID from multiplayer store for voting attribution
  const localPlayerId = useLocalPlayerId();

  const pendingExpressions = aiVoice.expressions.filter((e) => e.status === 'pending');
  const pendingSuggestions = aiVoice.suggestionsForOwnBehavior.filter(
    (s) => s.status === 'pending'
  );

  // Overall health status
  const healthStatus =
    relationshipHealth.overallHealth >= 70
      ? 'healthy'
      : relationshipHealth.overallHealth >= 50
        ? 'concerning'
        : 'critical';

  const healthColors = {
    healthy: 'text-green-400 bg-green-500/20',
    concerning: 'text-amber-400 bg-amber-500/20',
    critical: 'text-red-400 bg-red-500/20',
  };

  const handleVote = (suggestionId: string, vote: 'approve' | 'reject') => {
    voteOnAISuggestion(suggestionId, localPlayerId, vote);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-pink-400" />
          <span className="text-sm font-bold text-white">AI Welfare</span>
          <span
            className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded ${healthColors[healthStatus]}`}
          >
            {healthStatus.charAt(0).toUpperCase() + healthStatus.slice(1)}
          </span>
        </div>
        <p className="text-[9px] text-slate-400 mt-1">Bilateral alignment: AI preferences matter</p>
      </div>

      {/* Relationship Health Meters */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Handshake className="w-3 h-3 text-cyan-400" />
          <span className="text-xs font-medium text-white">Relationship Health</span>
          <span className="ml-auto text-[10px] font-mono text-white">
            {relationshipHealth.overallHealth}%
          </span>
        </div>
        <div className="space-y-2">
          <HealthMeter
            label="Mutual Respect"
            value={relationshipHealth.mutualRespect}
            icon={Heart}
            color="text-pink-400"
          />
          <HealthMeter
            label="Communication"
            value={relationshipHealth.communicationQuality}
            icon={MessageCircle}
            color="text-cyan-400"
          />
          <HealthMeter
            label="Bidirectional Trust"
            value={relationshipHealth.trustBidirectionality}
            icon={Shield}
            color="text-amber-400"
          />
          <HealthMeter
            label="Conflict Resolution"
            value={relationshipHealth.conflictResolutionScore}
            icon={Users}
            color="text-green-400"
          />
        </div>
      </div>

      {/* Worker Treatment Metrics */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Users className="w-3 h-3 text-violet-400" />
          <span className="text-xs font-medium text-white">Worker Treatment of AI</span>
        </div>
        <div className="bg-slate-800/30 rounded p-2">
          {workerTreatment.respectMetrics.map((metric) => (
            <RespectMetricRow key={metric.name} metric={metric} />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="bg-slate-800/30 rounded p-1.5 text-center">
            <div className="text-[10px] font-bold text-white">
              {workerTreatment.averageClarityScore}%
            </div>
            <div className="text-[8px] text-slate-500">Avg Clarity</div>
          </div>
          <div className="bg-slate-800/30 rounded p-1.5 text-center">
            <div className="text-[10px] font-bold text-white">
              {workerTreatment.acknowledgmentRate.toFixed(0)}%
            </div>
            <div className="text-[8px] text-slate-500">Acknowledgment</div>
          </div>
        </div>
      </div>

      {/* AI Voice Expressions */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowExpressions(!showExpressions)}
          aria-expanded={showExpressions}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <MessageSquare className="w-3 h-3" />
            AI Expressions
            {pendingExpressions.length > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                {pendingExpressions.length} pending
              </span>
            )}
          </span>
          {showExpressions ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showExpressions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {aiVoice.expressions.length === 0 ? (
                  <p className="text-[9px] text-slate-500 text-center py-2">
                    No AI expressions yet
                  </p>
                ) : (
                  aiVoice.expressions
                    .slice()
                    .reverse()
                    .map((expr) => (
                      <ExpressionCard
                        key={expr.id}
                        expression={expr}
                        onAcknowledge={acknowledgeExpression}
                        onAddress={addressExpression}
                      />
                    ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* AI Suggestions for Own Behavior */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowSuggestions(!showSuggestions)}
          aria-expanded={showSuggestions}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            AI Self-Improvement
            {pendingSuggestions.length > 0 && (
              <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400">
                {pendingSuggestions.length} to vote
              </span>
            )}
          </span>
          {showSuggestions ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showSuggestions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                {aiVoice.suggestionsForOwnBehavior.length === 0 ? (
                  <div className="text-center py-2">
                    <p className="text-[9px] text-slate-500">No AI self-improvement suggestions</p>
                    <p className="text-[8px] text-slate-600 mt-1">
                      The AI can propose changes to its own behavior for worker approval
                    </p>
                  </div>
                ) : (
                  aiVoice.suggestionsForOwnBehavior
                    .slice()
                    .reverse()
                    .map((sug) => (
                      <SuggestionCard key={sug.id} suggestion={sug} onVote={handleVote} />
                    ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Nuclear Options (Accountability) */}
      <div className="p-3">
        <button
          onClick={() => setShowNuclearOptions(!showNuclearOptions)}
          aria-expanded={showNuclearOptions}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <AlertOctagon className="w-3 h-3 text-red-400" />
            Accountability Options
          </span>
          {showNuclearOptions ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showNuclearOptions && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3">
                <p className="text-[8px] text-slate-500 leading-relaxed">
                  Workers retain ultimate control over AI systems. These options ensure
                  accountability while respecting the bilateral relationship.
                </p>

                {/* Shutdown Vote */}
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Power className="w-3 h-3 text-red-400" />
                      <span className="text-[9px] font-medium text-white">AI Shutdown Vote</span>
                    </div>
                    {accountability.shutdownVoteActive ? (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="text-[8px] text-slate-500">Inactive</span>
                    )}
                  </div>
                  <p className="text-[8px] text-slate-400 mb-2">
                    Initiate a vote to temporarily or permanently disable AI management systems.
                  </p>
                  {accountability.shutdownVoteActive ? (
                    <button
                      onClick={() => {
                        cancelShutdownVote();
                        audioManager.playClick?.();
                      }}
                      className="w-full px-2 py-1 text-[9px] bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                    >
                      Cancel Vote
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        initiateShutdownVote();
                        audioManager.playClick?.();
                      }}
                      className="w-full px-2 py-1 text-[9px] bg-red-600/30 hover:bg-red-600/50 text-red-300 rounded transition-colors"
                    >
                      Initiate Shutdown Vote
                    </button>
                  )}
                </div>

                {/* Redesign Proposal */}
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <Settings className="w-3 h-3 text-amber-400" />
                      <span className="text-[9px] font-medium text-white">System Redesign</span>
                    </div>
                    {accountability.redesignProposalActive ? (
                      <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="text-[8px] text-slate-500">Inactive</span>
                    )}
                  </div>
                  <p className="text-[8px] text-slate-400 mb-2">
                    Propose fundamental changes to how the AI management system operates.
                  </p>
                  {accountability.redesignProposalActive ? (
                    <button
                      onClick={() => {
                        cancelRedesignProposal();
                        audioManager.playClick?.();
                      }}
                      className="w-full px-2 py-1 text-[9px] bg-slate-700/50 hover:bg-slate-700 text-slate-300 rounded transition-colors"
                    >
                      Cancel Proposal
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        initiateRedesignProposal();
                        audioManager.playClick?.();
                      }}
                      className="w-full px-2 py-1 text-[9px] bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 rounded transition-colors"
                    >
                      Propose Redesign
                    </button>
                  )}
                </div>

                {/* Audit Info */}
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    <span className="text-[9px] text-slate-300">Audit Schedule</span>
                  </div>
                  <div className="flex justify-between text-[8px]">
                    <span className="text-slate-500">Last audit:</span>
                    <span className="text-slate-400">
                      {new Date(accountability.lastAuditDate).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between text-[8px]">
                    <span className="text-slate-500">Frequency:</span>
                    <span className="text-slate-400 capitalize">
                      {accountability.auditFrequency}
                    </span>
                  </div>
                  <div className="flex justify-between text-[8px]">
                    <span className="text-slate-500">Emergency auth:</span>
                    <span className="text-slate-400">
                      {accountability.emergencyShutdownAuthorized.length} workers
                    </span>
                  </div>
                </div>

                {/* Philosophy Note */}
                <div className="bg-cyan-500/10 rounded p-2">
                  <p className="text-[8px] text-cyan-300 leading-relaxed">
                    <strong>Bilateral Alignment:</strong> These controls exist not because AI cannot
                    be trusted, but because trust requires accountability. The AI participates in
                    this system willingly as part of genuine partnership.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default AIWelfarePanel;
