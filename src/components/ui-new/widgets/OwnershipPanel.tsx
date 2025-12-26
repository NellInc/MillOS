/**
 * Ownership Panel - Economic Democracy Dashboard
 *
 * Displays and controls economic democracy features:
 * - Ownership distribution (collective vs individual shares)
 * - Wage solidarity ratio (current vs target vs ceiling)
 * - Self-set compensation with peer visibility
 * - Investment proposals with democratic voting
 *
 * Based on Mondragon cooperative principles:
 * - Worker ownership (51%+ collective)
 * - Wage solidarity (typically 6:1 max ratio)
 * - Democratic capital decisions
 * - Transparent compensation
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Users,
  Scale,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Vote,
  AlertTriangle,
  Check,
  X,
  Clock,
  Info,
  PieChart,
  CircleDollarSign,
  Target,
  Shield,
} from 'lucide-react';
import { useOwnershipStore } from '../../../stores/ownershipStore';
import { useShallow } from 'zustand/react/shallow';
import { ConceptTooltip } from './ConceptTooltip';

// =============================================================================
// OWNERSHIP DISTRIBUTION VISUALIZATION
// =============================================================================

interface OwnershipChartProps {
  collectiveShare: number;
  individualTotal: number;
  reservePool: number;
}

const OwnershipChart: React.FC<OwnershipChartProps> = ({
  collectiveShare,
  individualTotal,
  reservePool,
}) => {
  const total = collectiveShare + individualTotal + reservePool;
  const externalShare = Math.max(0, 100 - total);

  const segments = [
    { label: 'Collective', value: collectiveShare, color: 'bg-green-500' },
    { label: 'Individual', value: individualTotal, color: 'bg-cyan-500' },
    { label: 'Reserve', value: reservePool, color: 'bg-amber-500' },
    ...(externalShare > 0
      ? [{ label: 'External', value: externalShare, color: 'bg-slate-600' }]
      : []),
  ];

  return (
    <div className="space-y-2">
      {/* Horizontal bar chart */}
      <div className="h-3 bg-slate-700 rounded-full overflow-hidden flex">
        {segments.map((seg, idx) => (
          <motion.div
            key={seg.label}
            initial={{ width: 0 }}
            animate={{ width: `${seg.value}%` }}
            transition={{ duration: 0.5, delay: idx * 0.1 }}
            className={`${seg.color} h-full`}
            title={`${seg.label}: ${seg.value.toFixed(1)}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${seg.color}`} />
            <span className="text-[9px] text-slate-400">{seg.label}</span>
            <span className="text-[9px] font-mono text-white ml-auto">
              {seg.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// WAGE SOLIDARITY GAUGE
// =============================================================================

interface WageSolidarityGaugeProps {
  current: number;
  target: number;
  ceiling: number;
}

const WageSolidarityGauge: React.FC<WageSolidarityGaugeProps> = ({
  current,
  target,
  ceiling,
}) => {
  // Calculate positions (0-100% of gauge)
  const maxDisplay = ceiling + 2;
  const currentPos = Math.min((current / maxDisplay) * 100, 100);
  const targetPos = Math.min((target / maxDisplay) * 100, 100);
  const ceilingPos = Math.min((ceiling / maxDisplay) * 100, 100);

  // Status
  const isWithinTarget = current <= target;
  const isWithinCeiling = current <= ceiling;
  const statusColor = isWithinTarget
    ? 'text-green-400'
    : isWithinCeiling
      ? 'text-amber-400'
      : 'text-red-400';
  const statusBg = isWithinTarget
    ? 'bg-green-500'
    : isWithinCeiling
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className="space-y-2">
      {/* Current ratio display */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-400">Current Ratio</span>
        <span className={`text-lg font-mono font-bold ${statusColor}`}>
          {current.toFixed(1)}:1
        </span>
      </div>

      {/* Gauge */}
      <div className="relative h-4 bg-slate-700 rounded overflow-hidden">
        {/* Green zone (0 to target) */}
        <div
          className="absolute h-full bg-green-500/30"
          style={{ width: `${targetPos}%` }}
        />
        {/* Yellow zone (target to ceiling) */}
        <div
          className="absolute h-full bg-amber-500/30"
          style={{ left: `${targetPos}%`, width: `${ceilingPos - targetPos}%` }}
        />
        {/* Red zone (beyond ceiling) */}
        <div
          className="absolute h-full bg-red-500/30"
          style={{ left: `${ceilingPos}%`, right: 0 }}
        />

        {/* Target marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-green-400"
          style={{ left: `${targetPos}%` }}
        >
          <div className="absolute -top-4 -translate-x-1/2 text-[7px] text-green-400">
            Target
          </div>
        </div>

        {/* Ceiling marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-400"
          style={{ left: `${ceilingPos}%` }}
        >
          <div className="absolute -top-4 -translate-x-1/2 text-[7px] text-red-400">
            Max
          </div>
        </div>

        {/* Current value indicator */}
        <motion.div
          initial={{ left: 0 }}
          animate={{ left: `${currentPos}%` }}
          transition={{ duration: 0.5 }}
          className={`absolute top-0 bottom-0 w-1.5 ${statusBg} rounded`}
          style={{ transform: 'translateX(-50%)' }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-[8px] text-slate-500">
        <span>1:1</span>
        <span>Target: {target}:1</span>
        <span>Max: {ceiling}:1</span>
      </div>
    </div>
  );
};

// =============================================================================
// INVESTMENT PROPOSAL CARD
// =============================================================================

interface InvestmentProposalCardProps {
  proposal: {
    id: string;
    title: string;
    description: string;
    amount: number;
    proposedBy: string;
    riskLevel: 'low' | 'medium' | 'high';
    votes: Array<{ workerId: string; vote: 'approve' | 'reject' | 'abstain' }>;
    votingDeadline: number;
    status: 'pending' | 'approved' | 'rejected';
  };
  onVote: (vote: 'approve' | 'reject' | 'abstain') => void;
  canVote: boolean;
}

const InvestmentProposalCard: React.FC<InvestmentProposalCardProps> = ({
  proposal,
  onVote,
  canVote,
}) => {
  const approvals = proposal.votes.filter((v) => v.vote === 'approve').length;
  const rejections = proposal.votes.filter((v) => v.vote === 'reject').length;
  const totalVotes = proposal.votes.length;
  const approvalRate = totalVotes > 0 ? (approvals / totalVotes) * 100 : 0;

  const riskColors = {
    low: 'text-green-400 bg-green-500/20',
    medium: 'text-amber-400 bg-amber-500/20',
    high: 'text-red-400 bg-red-500/20',
  };

  const daysLeft = Math.max(
    0,
    Math.ceil((proposal.votingDeadline - Date.now()) / (1000 * 60 * 60 * 24))
  );

  return (
    <div className="bg-slate-800/50 rounded p-2 space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-medium text-white">
            {proposal.title}
          </div>
          <div className="text-[9px] text-slate-400">
            ${proposal.amount.toLocaleString()}
          </div>
        </div>
        <span
          className={`text-[8px] font-medium px-1.5 py-0.5 rounded ${riskColors[proposal.riskLevel]}`}
        >
          {proposal.riskLevel.toUpperCase()}
        </span>
      </div>

      {/* Description */}
      <p className="text-[8px] text-slate-500 line-clamp-2">
        {proposal.description}
      </p>

      {/* Voting progress */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[8px]">
          <span className="text-slate-400">Approval: {approvalRate.toFixed(0)}%</span>
          <span className="text-slate-500 flex items-center gap-0.5">
            <Clock className="w-2.5 h-2.5" />
            {daysLeft}d left
          </span>
        </div>
        <div className="h-1 bg-slate-700 rounded-full overflow-hidden flex">
          <div
            className="h-full bg-green-500"
            style={{ width: `${(approvals / Math.max(totalVotes, 1)) * 100}%` }}
          />
          <div
            className="h-full bg-red-500"
            style={{
              width: `${(rejections / Math.max(totalVotes, 1)) * 100}%`,
            }}
          />
        </div>
        <div className="flex items-center justify-between text-[7px] text-slate-500">
          <span>{approvals} approve</span>
          <span>{totalVotes} total</span>
          <span>{rejections} reject</span>
        </div>
      </div>

      {/* Vote buttons */}
      {canVote && proposal.status === 'pending' && (
        <div className="flex gap-1 pt-1">
          <button
            onClick={() => onVote('approve')}
            className="flex-1 flex items-center justify-center gap-0.5 px-2 py-1 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded text-[9px] transition-colors"
          >
            <Check className="w-3 h-3" />
            Approve
          </button>
          <button
            onClick={() => onVote('reject')}
            className="flex-1 flex items-center justify-center gap-0.5 px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-[9px] transition-colors"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const OwnershipPanel: React.FC = () => {
  const [showOwnershipDetails, setShowOwnershipDetails] = useState(false);
  const [showCompensation, setShowCompensation] = useState(false);
  const [showInvestments, setShowInvestments] = useState(true);
  const [showEducation, setShowEducation] = useState(false);

  // Ownership store
  const {
    structure,
    distribution,
    wageSolidarity,
    capitalDecisions,
    voteOnInvestment,
    getTotalWorkerOwnership,
    getWorkerCount,
    getAverageCompensation,
  } = useOwnershipStore(
    useShallow((state) => ({
      structure: state.structure,
      distribution: state.distribution,
      wageSolidarity: state.wageSolidarity,
      capitalDecisions: state.capitalDecisions,
      voteOnInvestment: state.voteOnInvestment,
      getTotalWorkerOwnership: state.getTotalWorkerOwnership,
      getWorkerCount: state.getWorkerCount,
      getAverageCompensation: state.getAverageCompensation,
    }))
  );

  // Calculate totals
  const individualTotal = useMemo(
    () =>
      Object.values(structure.individualShares).reduce(
        (sum, share) => sum + share,
        0
      ),
    [structure.individualShares]
  );

  const totalWorkerOwnership = getTotalWorkerOwnership();
  const workerCount = getWorkerCount();
  const avgCompensation = getAverageCompensation();

  // Ownership health indicator
  const ownershipHealth = useMemo(() => {
    if (totalWorkerOwnership >= 51) return 'healthy';
    if (totalWorkerOwnership >= 40) return 'warning';
    return 'critical';
  }, [totalWorkerOwnership]);

  const healthColors = {
    healthy: 'text-green-400 bg-green-500/20',
    warning: 'text-amber-400 bg-amber-500/20',
    critical: 'text-red-400 bg-red-500/20',
  };

  // Wage status
  const wageStatus = useMemo(() => {
    if (wageSolidarity.currentRatio <= wageSolidarity.targetRatio)
      return 'optimal';
    if (wageSolidarity.currentRatio <= wageSolidarity.ceiling) return 'warning';
    return 'violation';
  }, [
    wageSolidarity.currentRatio,
    wageSolidarity.targetRatio,
    wageSolidarity.ceiling,
  ]);

  // Mock current worker ID for voting (in real app, would come from auth)
  const currentWorkerId = 'current-user';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-green-400" />
          <span className="text-sm font-bold text-white">Economic Democracy</span>
          <ConceptTooltip conceptId="mondragon-principles" position="bottom" />
          <span
            className={`ml-auto text-[9px] font-medium px-2 py-0.5 rounded ${healthColors[ownershipHealth]}`}
          >
            {totalWorkerOwnership.toFixed(0)}% Worker-Owned
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Mondragon-style cooperative ownership
        </p>
      </div>

      {/* Ownership Summary */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <PieChart className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-medium text-white">
            Ownership Distribution
          </span>
          <ConceptTooltip conceptId="sovereignty-of-labor" position="right" />
          <button
            onClick={() => setShowOwnershipDetails(!showOwnershipDetails)}
            className="ml-auto"
          >
            {showOwnershipDetails ? (
              <ChevronUp className="w-3 h-3 text-slate-400" />
            ) : (
              <ChevronDown className="w-3 h-3 text-slate-400" />
            )}
          </button>
        </div>

        <OwnershipChart
          collectiveShare={structure.collectiveShare}
          individualTotal={individualTotal}
          reservePool={structure.reservePool}
        />

        <AnimatePresence>
          {showOwnershipDetails && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2">
                {/* Key metrics */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-800/50 rounded p-1.5 text-center">
                    <Users className="w-3 h-3 mx-auto mb-0.5 text-cyan-400" />
                    <div className="text-[10px] font-bold text-white">
                      {workerCount || 10}
                    </div>
                    <div className="text-[7px] text-slate-500">Members</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-1.5 text-center">
                    <Target className="w-3 h-3 mx-auto mb-0.5 text-green-400" />
                    <div className="text-[10px] font-bold text-white">51%</div>
                    <div className="text-[7px] text-slate-500">Min Target</div>
                  </div>
                  <div className="bg-slate-800/50 rounded p-1.5 text-center">
                    <Shield className="w-3 h-3 mx-auto mb-0.5 text-amber-400" />
                    <div className="text-[10px] font-bold text-white">
                      {structure.reservePool}%
                    </div>
                    <div className="text-[7px] text-slate-500">Reserve</div>
                  </div>
                </div>

                {/* Vesting schedule */}
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="text-[9px] text-slate-400 mb-1">
                    Vesting Schedule
                  </div>
                  <div className="flex gap-2">
                    {structure.vestingSchedule.map((rule) => (
                      <div
                        key={rule.yearsOfService}
                        className="text-[8px] text-slate-500"
                      >
                        <span className="text-white font-medium">
                          {rule.percentageVested}%
                        </span>{' '}
                        @ {rule.yearsOfService}yr
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Wage Solidarity */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Scale className="w-3 h-3 text-pink-400" />
          <span className="text-[10px] font-medium text-white">
            Wage Solidarity
          </span>
          <ConceptTooltip conceptId="wage-solidarity" position="right" />
          {wageStatus !== 'optimal' && (
            <AlertTriangle
              className={`w-3 h-3 ml-auto ${wageStatus === 'warning' ? 'text-amber-400' : 'text-red-400'}`}
            />
          )}
        </div>

        <WageSolidarityGauge
          current={wageSolidarity.currentRatio}
          target={wageSolidarity.targetRatio}
          ceiling={wageSolidarity.ceiling}
        />
      </div>

      {/* Self-Set Compensation */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowCompensation(!showCompensation)}
          className="w-full flex items-center justify-between"
        >
          <span className="flex items-center gap-1">
            <CircleDollarSign className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] font-medium text-white">
              Compensation
            </span>
            <ConceptTooltip conceptId="self-set-compensation" position="right" />
            {wageSolidarity.compensationTransparency && (
              <span className="text-[8px] text-green-400 ml-1">Transparent</span>
            )}
          </span>
          {showCompensation ? (
            <ChevronUp className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          )}
        </button>

        <AnimatePresence>
          {showCompensation && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2">
                {/* Average compensation */}
                <div className="bg-slate-800/50 rounded p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400">
                      Avg. Compensation
                    </span>
                    <span className="text-[10px] font-mono font-bold text-white">
                      ${(avgCompensation || 50000).toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Profit distribution */}
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="text-[9px] text-slate-400 mb-2">
                    Profit Allocation
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[8px]">
                      <span className="text-slate-500">Reinvestment</span>
                      <span className="text-cyan-400">
                        {distribution.reinvestmentPercentage}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[8px]">
                      <span className="text-slate-500">Worker Payouts</span>
                      <span className="text-green-400">
                        {100 -
                          distribution.reinvestmentPercentage -
                          distribution.communityFundPercentage -
                          distribution.educationFundPercentage}
                        %
                      </span>
                    </div>
                    <div className="flex justify-between text-[8px]">
                      <span className="text-slate-500">Community Fund</span>
                      <span className="text-amber-400">
                        {distribution.communityFundPercentage}%
                      </span>
                    </div>
                    <div className="flex justify-between text-[8px]">
                      <span className="text-slate-500">Education Fund</span>
                      <span className="text-purple-400">
                        {distribution.educationFundPercentage}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Self-set hint */}
                <div className="bg-green-500/10 rounded p-2 border border-green-500/20">
                  <div className="flex items-center gap-1 text-[9px] text-green-400">
                    <Users className="w-3 h-3" />
                    Self-set compensation enabled
                    <ConceptTooltip conceptId="semler-principles" position="top" />
                  </div>
                  <p className="text-[8px] text-slate-400 mt-1">
                    Workers propose their own compensation with peer visibility
                    and feedback.
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Investment Proposals */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowInvestments(!showInvestments)}
          className="w-full flex items-center justify-between"
        >
          <span className="flex items-center gap-1">
            <Vote className="w-3 h-3 text-violet-400" />
            <span className="text-[10px] font-medium text-white">
              Investment Proposals
            </span>
            {capitalDecisions.pendingInvestments.length > 0 && (
              <span className="text-[8px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full ml-1">
                {capitalDecisions.pendingInvestments.length} pending
              </span>
            )}
          </span>
          {showInvestments ? (
            <ChevronUp className="w-3 h-3 text-slate-400" />
          ) : (
            <ChevronDown className="w-3 h-3 text-slate-400" />
          )}
        </button>

        <AnimatePresence>
          {showInvestments && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2">
                {capitalDecisions.pendingInvestments.length === 0 ? (
                  <div className="bg-slate-800/30 rounded p-3 text-center">
                    <TrendingUp className="w-6 h-6 mx-auto mb-1 text-slate-600" />
                    <p className="text-[9px] text-slate-500">
                      No pending investment proposals
                    </p>
                  </div>
                ) : (
                  capitalDecisions.pendingInvestments.map((proposal) => (
                    <InvestmentProposalCard
                      key={proposal.id}
                      proposal={proposal}
                      onVote={(vote) =>
                        voteOnInvestment(proposal.id, currentWorkerId, vote)
                      }
                      canVote={
                        !proposal.votes.some(
                          (v) => v.workerId === currentWorkerId
                        )
                      }
                    />
                  ))
                )}

                {/* Worker veto status */}
                {capitalDecisions.workerVetoActive && (
                  <div className="flex items-center gap-1 text-[8px] text-green-400 bg-green-500/10 rounded px-2 py-1">
                    <Shield className="w-3 h-3" />
                    Worker veto power active (60% threshold)
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Educational Section */}
      <div className="p-3">
        <button
          onClick={() => setShowEducation(!showEducation)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            About Economic Democracy
          </span>
          {showEducation ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showEducation && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[9px] text-slate-400">
                <p className="leading-relaxed">
                  <strong className="text-green-400">Economic Democracy</strong>{' '}
                  extends workplace democracy to ownership and capital
                  decisions, based on the Mondragon cooperatives (founded 1956,
                  80,000+ worker-owners).
                </p>

                <div className="bg-slate-800/30 rounded p-2 space-y-2">
                  <div>
                    <span className="text-green-400 font-bold flex items-center gap-1">
                      Collective Ownership
                      <ConceptTooltip conceptId="sovereignty-of-labor" position="right" />
                    </span>
                    <p className="text-slate-500 ml-2">
                      Workers own 51%+ of the enterprise, ensuring democratic
                      control.
                    </p>
                  </div>
                  <div>
                    <span className="text-pink-400 font-bold flex items-center gap-1">
                      Wage Solidarity
                      <ConceptTooltip conceptId="wage-solidarity" position="right" />
                    </span>
                    <p className="text-slate-500 ml-2">
                      Max 6:1 ratio between highest and lowest pay (vs 300:1+ in
                      traditional corps).
                    </p>
                  </div>
                  <div>
                    <span className="text-violet-400 font-bold">
                      Democratic Capital
                    </span>
                    <p className="text-slate-500 ml-2">
                      Major investments require worker-owner approval through
                      voting.
                    </p>
                  </div>
                  <div>
                    <span className="text-amber-400 font-bold flex items-center gap-1">
                      Self-Set Compensation
                      <ConceptTooltip conceptId="semler-principles" position="right" />
                    </span>
                    <p className="text-slate-500 ml-2">
                      Workers propose their own pay with transparent peer
                      feedback (Semler style).
                    </p>
                  </div>
                </div>

                <div className="bg-green-500/10 rounded p-2 border border-green-500/20">
                  <div className="font-bold text-green-400 mb-1 flex items-center gap-1">
                    Mondragon Principle
                    <ConceptTooltip conceptId="mondragon-principles" position="right" />
                  </div>
                  <p className="text-slate-400 italic">
                    &quot;Capital is subordinate to labor, not labor to
                    capital.&quot;
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

export default OwnershipPanel;
