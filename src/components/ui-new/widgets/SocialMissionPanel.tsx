/**
 * Social Mission Panel
 *
 * Dashboard for the Social Mission pillar of the Bilateral Autonomy System.
 * Displays community impact, environmental stewardship, knowledge sharing,
 * open admission, and stakeholder satisfaction metrics.
 *
 * Based on Mondragon's principle that cooperatives exist to serve their
 * communities, not just their members.
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Heart,
  Users,
  Leaf,
  BookOpen,
  DoorOpen,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Building2,
  Factory,
  Droplets,
  Recycle,
  Sun,
  GitBranch,
  Presentation,
  Beaker,
  Info,
  Sparkles,
} from 'lucide-react';
import { useSocialMissionStore } from '../../../stores/socialMissionStore';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// SCORE RING COMPONENT
// =============================================================================

interface ScoreRingProps {
  score: number;
  label: string;
  color: string;
  size?: 'sm' | 'md';
}

const ScoreRing: React.FC<ScoreRingProps> = ({
  score,
  label,
  color,
  size = 'sm',
}) => {
  const radius = size === 'md' ? 28 : 20;
  const strokeWidth = size === 'md' ? 4 : 3;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;

  const colorMap: Record<string, string> = {
    green: 'stroke-green-500',
    blue: 'stroke-blue-500',
    amber: 'stroke-amber-500',
    purple: 'stroke-purple-500',
    cyan: 'stroke-cyan-500',
  };

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg
          width={radius * 2 + strokeWidth * 2}
          height={radius * 2 + strokeWidth * 2}
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            className="stroke-slate-700"
          />
          {/* Progress circle */}
          <circle
            cx={radius + strokeWidth}
            cy={radius + strokeWidth}
            r={radius}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            className={colorMap[color] || 'stroke-green-500'}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`font-mono font-bold ${size === 'md' ? 'text-lg' : 'text-xs'} text-white`}
          >
            {score}
          </span>
        </div>
      </div>
      <span className="text-[8px] text-slate-400 mt-1 text-center">{label}</span>
    </div>
  );
};

// =============================================================================
// METRIC BAR COMPONENT
// =============================================================================

interface MetricBarProps {
  value: number;
  max?: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  suffix?: string;
}

const MetricBar: React.FC<MetricBarProps> = ({
  value,
  max = 100,
  label,
  icon: Icon,
  color,
  suffix = '%',
}) => {
  const percentage = (value / max) * 100;

  const colorMap: Record<string, { bar: string; text: string; icon: string }> = {
    green: {
      bar: 'bg-green-500',
      text: 'text-green-400',
      icon: 'text-green-400',
    },
    blue: { bar: 'bg-blue-500', text: 'text-blue-400', icon: 'text-blue-400' },
    amber: {
      bar: 'bg-amber-500',
      text: 'text-amber-400',
      icon: 'text-amber-400',
    },
    purple: {
      bar: 'bg-purple-500',
      text: 'text-purple-400',
      icon: 'text-purple-400',
    },
    cyan: { bar: 'bg-cyan-500', text: 'text-cyan-400', icon: 'text-cyan-400' },
  };

  const colors = colorMap[color] || colorMap.green;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Icon className={`w-3 h-3 ${colors.icon}`} />
          <span className="text-[9px] text-slate-400">{label}</span>
        </div>
        <span className={`text-[10px] font-mono ${colors.text}`}>
          {value}
          {suffix}
        </span>
      </div>
      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, percentage)}%` }}
          transition={{ duration: 0.5 }}
          className={`h-full rounded-full ${colors.bar}`}
        />
      </div>
    </div>
  );
};

// =============================================================================
// STAKEHOLDER SATISFACTION METER
// =============================================================================

interface SatisfactionMeterProps {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}

const SatisfactionMeter: React.FC<SatisfactionMeterProps> = ({
  label,
  value,
  icon: Icon,
}) => {
  const getColor = (val: number) => {
    if (val >= 80) return 'text-green-400 bg-green-500';
    if (val >= 60) return 'text-amber-400 bg-amber-500';
    return 'text-red-400 bg-red-500';
  };

  const colorClasses = getColor(value);
  const [textColor, bgColor] = colorClasses.split(' ');

  return (
    <div className="bg-slate-800/30 rounded p-1.5 text-center">
      <Icon className={`w-3 h-3 mx-auto mb-0.5 ${textColor}`} />
      <div className="text-[10px] font-mono font-bold text-white">{value}%</div>
      <div className="text-[7px] text-slate-500">{label}</div>
      <div className="h-0.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
        <div
          className={`h-full rounded-full ${bgColor}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const SocialMissionPanel: React.FC = () => {
  const [showCommunity, setShowCommunity] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const {
    communityImpact,
    environmentalStewardship,
    publicKnowledgeSharing,
    missionMetrics,
    openAdmission,
    stakeholderSatisfaction,
    calculateSocialImpactScore,
    getAcceptanceRate,
    getEnvironmentalScore,
  } = useSocialMissionStore(
    useShallow((state) => ({
      communityImpact: state.communityImpact,
      environmentalStewardship: state.environmentalStewardship,
      publicKnowledgeSharing: state.publicKnowledgeSharing,
      missionMetrics: state.missionMetrics,
      openAdmission: state.openAdmission,
      stakeholderSatisfaction: state.stakeholderSatisfaction,
      calculateSocialImpactScore: state.calculateSocialImpactScore,
      getAcceptanceRate: state.getAcceptanceRate,
      getEnvironmentalScore: state.getEnvironmentalScore,
    }))
  );

  const socialImpactScore = calculateSocialImpactScore();
  const acceptanceRate = getAcceptanceRate();
  const environmentalScore = getEnvironmentalScore();

  // Calculate carbon reduction progress
  const carbonProgress =
    environmentalStewardship.carbonReductionTarget > 0
      ? Math.round(
          (environmentalStewardship.currentReduction /
            environmentalStewardship.carbonReductionTarget) *
            100
        )
      : 0;

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
          <span className="text-sm font-bold text-white">Social Mission</span>
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded bg-pink-500/20 text-pink-300">
            Impact: {socialImpactScore}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Community, Environment, Knowledge, Openness
        </p>
      </div>

      {/* Impact Score Breakdown */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex justify-around">
          <ScoreRing
            score={missionMetrics.workerFlourishingContribution}
            label="Workers"
            color="green"
            size="sm"
          />
          <ScoreRing
            score={missionMetrics.communityWelfareContribution}
            label="Community"
            color="blue"
            size="sm"
          />
          <ScoreRing
            score={missionMetrics.environmentalContribution}
            label="Environment"
            color="amber"
            size="sm"
          />
          <ScoreRing
            score={missionMetrics.knowledgeContribution}
            label="Knowledge"
            color="purple"
            size="sm"
          />
        </div>
        <div className="text-[8px] text-center text-slate-500 mt-2">
          Social Impact = 30% Workers + 25% Community + 25% Environment + 20%
          Knowledge
        </div>
      </div>

      {/* Environmental Stewardship */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <Leaf className="w-3 h-3 text-green-400" />
          <span className="text-[10px] font-medium text-white">
            Environmental Stewardship
          </span>
          <span className="ml-auto text-[10px] text-green-400 font-mono">
            {environmentalScore}%
          </span>
        </div>
        <div className="space-y-2">
          <MetricBar
            value={carbonProgress}
            label={`Carbon Reduction (${environmentalStewardship.currentReduction}/${environmentalStewardship.carbonReductionTarget}%)`}
            icon={Factory}
            color="green"
          />
          <MetricBar
            value={environmentalStewardship.renewableEnergyPercentage}
            label="Renewable Energy"
            icon={Sun}
            color="amber"
          />
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-slate-800/30 rounded p-1.5">
              <div className="flex items-center gap-1">
                <Recycle className="w-2.5 h-2.5 text-blue-400" />
                <span className="text-[8px] text-slate-400">Waste Reduction</span>
              </div>
              <div className="text-[10px] font-mono text-blue-400">
                {environmentalStewardship.wasteReduction}%
              </div>
            </div>
            <div className="bg-slate-800/30 rounded p-1.5">
              <div className="flex items-center gap-1">
                <Droplets className="w-2.5 h-2.5 text-cyan-400" />
                <span className="text-[8px] text-slate-400">Water Recycling</span>
              </div>
              <div className="text-[10px] font-mono text-cyan-400">
                {environmentalStewardship.waterRecyclingRate}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stakeholder Satisfaction */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <TrendingUp className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-medium text-white">
            Stakeholder Satisfaction
          </span>
        </div>
        <div className="grid grid-cols-4 gap-1">
          <SatisfactionMeter
            label="Workers"
            value={stakeholderSatisfaction.workers}
            icon={Users}
          />
          <SatisfactionMeter
            label="Community"
            value={stakeholderSatisfaction.community}
            icon={Building2}
          />
          <SatisfactionMeter
            label="Customers"
            value={stakeholderSatisfaction.customers}
            icon={Heart}
          />
          <SatisfactionMeter
            label="Environment"
            value={stakeholderSatisfaction.environment}
            icon={Leaf}
          />
        </div>
      </div>

      {/* Open Admission Stats */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <DoorOpen className="w-3 h-3 text-purple-400" />
          <span className="text-[10px] font-medium text-white">
            Open Admission
          </span>
          <span className="ml-auto text-[10px] text-purple-400 font-mono">
            {acceptanceRate}% rate
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-800/30 rounded p-1.5 text-center">
            <div className="text-xs font-mono font-bold text-white">
              {openAdmission.applicationsAccepted}/{openAdmission.applicationsReceived}
            </div>
            <div className="text-[7px] text-slate-500">Accepted</div>
          </div>
          <div className="bg-slate-800/30 rounded p-1.5 text-center">
            <div className="text-xs font-mono font-bold text-white">
              {openAdmission.feeWaiversGranted}
            </div>
            <div className="text-[7px] text-slate-500">Fee Waivers</div>
          </div>
          <div className="bg-slate-800/30 rounded p-1.5 text-center">
            <div className="text-xs font-mono font-bold text-white">
              {openAdmission.averageOnboardingTime}d
            </div>
            <div className="text-[7px] text-slate-500">Avg Onboard</div>
          </div>
        </div>
        {/* Diversity Metrics */}
        <div className="mt-2 grid grid-cols-3 gap-1">
          <MetricBar
            value={openAdmission.diversityMetrics.backgroundDiversity}
            label="Background"
            icon={Sparkles}
            color="purple"
          />
          <MetricBar
            value={openAdmission.diversityMetrics.skillDiversity}
            label="Skills"
            icon={Sparkles}
            color="cyan"
          />
          <MetricBar
            value={openAdmission.diversityMetrics.perspectiveDiversity}
            label="Perspective"
            icon={Sparkles}
            color="amber"
          />
        </div>
      </div>

      {/* Expandable: Community Impact */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowCommunity(!showCommunity)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            Community Impact
          </span>
          {showCommunity ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showCommunity && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-blue-500/10 rounded p-2 text-center">
                    <div className="text-sm font-mono font-bold text-blue-300">
                      {communityImpact.localEmploymentCreated}
                    </div>
                    <div className="text-[8px] text-slate-400">Local Jobs</div>
                  </div>
                  <div className="bg-blue-500/10 rounded p-2 text-center">
                    <div className="text-sm font-mono font-bold text-blue-300">
                      {communityImpact.localSuppliersUsed}
                    </div>
                    <div className="text-[8px] text-slate-400">Local Suppliers</div>
                  </div>
                  <div className="bg-blue-500/10 rounded p-2 text-center">
                    <div className="text-sm font-mono font-bold text-blue-300">
                      {communityImpact.localSourcingPercentage}%
                    </div>
                    <div className="text-[8px] text-slate-400">Local Sourcing</div>
                  </div>
                </div>
                {/* Active Investments */}
                {communityImpact.communityInvestments.length > 0 && (
                  <div className="bg-slate-800/30 rounded p-2">
                    <div className="text-[9px] text-slate-300 font-medium mb-1">
                      Active Investments
                    </div>
                    {communityImpact.communityInvestments
                      .filter((inv) => inv.status === 'active')
                      .slice(0, 2)
                      .map((inv) => (
                        <div
                          key={inv.id}
                          className="text-[8px] text-slate-400 flex justify-between"
                        >
                          <span>{inv.name}</span>
                          <span className="text-green-400">
                            ${inv.amount.toLocaleString()}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Expandable: Knowledge Sharing */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => setShowKnowledge(!showKnowledge)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <BookOpen className="w-3 h-3" />
            Public Knowledge Sharing
          </span>
          {showKnowledge ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showKnowledge && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div className="bg-purple-500/10 rounded p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <BookOpen className="w-3 h-3 text-purple-400" />
                    <span className="text-[9px] text-purple-300">Learnings</span>
                  </div>
                  <div className="text-lg font-mono font-bold text-white">
                    {publicKnowledgeSharing.publicLearningsShared}
                  </div>
                </div>
                <div className="bg-purple-500/10 rounded p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <GitBranch className="w-3 h-3 text-green-400" />
                    <span className="text-[9px] text-green-300">Open Source</span>
                  </div>
                  <div className="text-lg font-mono font-bold text-white">
                    {publicKnowledgeSharing.openSourceContributions}
                  </div>
                </div>
                <div className="bg-purple-500/10 rounded p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Beaker className="w-3 h-3 text-cyan-400" />
                    <span className="text-[9px] text-cyan-300">Research</span>
                  </div>
                  <div className="text-lg font-mono font-bold text-white">
                    {publicKnowledgeSharing.researchCollaborations}
                  </div>
                </div>
                <div className="bg-purple-500/10 rounded p-2">
                  <div className="flex items-center gap-1 mb-1">
                    <Presentation className="w-3 h-3 text-amber-400" />
                    <span className="text-[9px] text-amber-300">Presentations</span>
                  </div>
                  <div className="text-lg font-mono font-bold text-white">
                    {publicKnowledgeSharing.industryPresentations}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* About Section */}
      <div className="p-3">
        <button
          onClick={() => setShowAbout(!showAbout)}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Info className="w-3 h-3" />
            About Social Mission
          </span>
          {showAbout ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>

        <AnimatePresence>
          {showAbout && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-2 text-[9px] text-slate-400">
                <p className="leading-relaxed">
                  <strong className="text-pink-400">Social Mission</strong> is a
                  core pillar of Mondragon-style cooperatives. Unlike traditional
                  corporations that optimize solely for shareholder value,
                  cooperatives exist to serve their communities.
                </p>
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="font-bold text-white mb-1">
                    Four Pillars of Social Mission
                  </div>
                  <ul className="space-y-0.5 text-slate-400">
                    <li>
                      <strong className="text-blue-300">Community Impact</strong> -
                      Local employment, suppliers, investments
                    </li>
                    <li>
                      <strong className="text-green-300">
                        Environmental Stewardship
                      </strong>{' '}
                      - Carbon, waste, renewables
                    </li>
                    <li>
                      <strong className="text-purple-300">Knowledge Sharing</strong>{' '}
                      - Open learnings, research, collaboration
                    </li>
                    <li>
                      <strong className="text-amber-300">Open Admission</strong> -
                      Accessible membership, diversity
                    </li>
                  </ul>
                </div>
                <p className="text-[8px] text-slate-500 italic">
                  Social mission metrics contribute to overall flourishing through
                  the meaning and connection dimensions.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default SocialMissionPanel;
