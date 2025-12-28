/**
 * Federation Panel - Inter-Cooperation UI
 *
 * Compact dashboard for the Grain Cooperative Federation:
 * - Member mills in the federation
 * - Available learnings from other units (with adopt/reject)
 * - Resource pool summary (capital, emergency fund)
 * - Active worker exchanges
 *
 * Based on Mondragon cooperative principles:
 * "No unit fails alone" - mutual support across federation
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Network,
  Building2,
  Lightbulb,
  BookOpen,
  Users,
  Wallet,
  Shield,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  ArrowLeftRight,
  Star,
  MapPin,
  Clock,
  TrendingUp,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useInterCooperationStore } from '../../../stores/interCooperationStore';
import type { Learning, LearningType } from '../../../stores/interCooperationStore';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';
import { ConceptTooltip } from './ConceptTooltip';

// ============================================================================
// CONSTANTS
// ============================================================================

const LEARNING_TYPE_CONFIG: Record<
  LearningType,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  'bas-config': { label: 'BAS Config', color: 'cyan', icon: RefreshCw },
  process: { label: 'Process', color: 'blue', icon: TrendingUp },
  'ai-improvement': { label: 'AI Improvement', color: 'violet', icon: Lightbulb },
  'crisis-response': { label: 'Crisis Response', color: 'orange', icon: AlertCircle },
  flourishing: { label: 'Flourishing', color: 'green', icon: Star },
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface LearningCardProps {
  learning: Learning;
  onAdopt: () => void;
  onReject: () => void;
}

const LearningCard: React.FC<LearningCardProps> = ({ learning, onAdopt, onReject }) => {
  const config = LEARNING_TYPE_CONFIG[learning.type];
  const Icon = config.icon;

  return (
    <div className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50">
      <div className="flex items-start gap-2">
        <div className={`p-1.5 rounded bg-${config.color}-500/20 flex-shrink-0`}>
          <Icon className={`w-3 h-3 text-${config.color}-400`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-medium text-white truncate">{learning.title}</span>
            <span
              className={`text-[8px] px-1 py-0.5 rounded bg-${config.color}-500/20 text-${config.color}-300 flex-shrink-0`}
            >
              {config.label}
            </span>
          </div>
          <p className="text-[9px] text-slate-400 line-clamp-2 mb-1.5">{learning.description}</p>
          <div className="flex items-center gap-2 text-[8px]">
            <span className="text-slate-500">
              From: <span className="text-slate-400">{learning.sourceUnitName}</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-green-400">{learning.effectiveness}% effective</span>
            <span className="text-slate-600">|</span>
            <span className="text-amber-400">{learning.applicabilityScore}% applicable</span>
          </div>
        </div>
      </div>

      {learning.status === 'available' && (
        <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-700/50">
          <button
            onClick={() => {
              onAdopt();
              audioManager.playClick?.();
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-green-500/20 text-green-300 text-[9px] font-medium hover:bg-green-500/30 transition-colors"
          >
            <Check className="w-3 h-3" />
            Adopt
          </button>
          <button
            onClick={() => {
              onReject();
              audioManager.playClick?.();
            }}
            className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded bg-red-500/20 text-red-300 text-[9px] font-medium hover:bg-red-500/30 transition-colors"
          >
            <X className="w-3 h-3" />
            Reject
          </button>
        </div>
      )}

      {learning.status === 'reviewing' && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <span className="text-[9px] text-amber-400 flex items-center gap-1">
            <RefreshCw className="w-3 h-3 animate-spin" />
            Under review...
          </span>
        </div>
      )}

      {learning.status === 'adopted' && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <span className="text-[9px] text-green-400 flex items-center gap-1">
            <Check className="w-3 h-3" />
            Adopted
          </span>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const FederationPanel: React.FC = () => {
  const [showMembers, setShowMembers] = useState(false);
  const [showResources, setShowResources] = useState(false);

  // Store state
  const { federation, knowledgeSharing, resourceSharing, adoptLearning, rejectLearning } =
    useInterCooperationStore(
      useShallow((state) => ({
        federation: state.federation,
        knowledgeSharing: state.knowledgeSharing,
        resourceSharing: state.resourceSharing,
        adoptLearning: state.adoptLearning,
        rejectLearning: state.rejectLearning,
      }))
    );

  // Filter for available learnings only
  const availableLearnings = knowledgeSharing.receivedLearnings.filter(
    (l) => l.status === 'available' || l.status === 'reviewing'
  );
  const adoptedCount = knowledgeSharing.adoptedLearnings.length;
  const activeExchanges = resourceSharing.workerExchanges.filter((e) => e.status === 'active');

  // Format currency
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
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
          <Network className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-bold text-white">{federation.federationName}</span>
          <ConceptTooltip conceptId="inter-cooperation" position="bottom" />
          <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded bg-violet-500/20 text-violet-300">
            {federation.memberUnits.length} Mills
          </span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1 italic">
          &quot;{federation.foundingPrinciples[0]}&quot;
        </p>
      </div>

      {/* Quick Stats */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <Building2 className="w-3 h-3 mx-auto mb-0.5 text-violet-400" />
            <div className="text-[10px] font-bold text-white">{federation.memberUnits.length}</div>
            <div className="text-[7px] text-slate-500">Members</div>
          </div>
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <Lightbulb className="w-3 h-3 mx-auto mb-0.5 text-amber-400" />
            <div className="text-[10px] font-bold text-white">{availableLearnings.length}</div>
            <div className="text-[7px] text-slate-500">Learnings</div>
          </div>
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <Check className="w-3 h-3 mx-auto mb-0.5 text-green-400" />
            <div className="text-[10px] font-bold text-white">{adoptedCount}</div>
            <div className="text-[7px] text-slate-500">Adopted</div>
          </div>
          <div className="bg-slate-800/50 rounded p-1.5 text-center">
            <ArrowLeftRight className="w-3 h-3 mx-auto mb-0.5 text-cyan-400" />
            <div className="text-[10px] font-bold text-white">{activeExchanges.length}</div>
            <div className="text-[7px] text-slate-500">Exchanges</div>
          </div>
        </div>
      </div>

      {/* Available Learnings Section */}
      <div className="p-3 border-b border-slate-700/30">
        <div className="flex items-center gap-1 mb-2">
          <BookOpen className="w-3 h-3 text-amber-400" />
          <span className="text-[10px] font-medium text-white">Available Learnings</span>
          <ConceptTooltip conceptId="inter-cooperation" position="right" />
          {availableLearnings.length > 0 && (
            <span className="ml-auto text-[9px] text-amber-400">
              {availableLearnings.length} new
            </span>
          )}
        </div>

        {availableLearnings.length === 0 ? (
          <div className="text-center py-3 text-[9px] text-slate-500">
            No new learnings available from federation
          </div>
        ) : (
          <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
            {availableLearnings.map((learning) => (
              <LearningCard
                key={learning.id}
                learning={learning}
                onAdopt={() => adoptLearning(learning.id)}
                onReject={() => rejectLearning(learning.id, 'Not applicable')}
              />
            ))}
          </div>
        )}
      </div>

      {/* Member Units Expandable */}
      <div className="p-3 border-b border-slate-700/30">
        <button
          onClick={() => {
            setShowMembers(!showMembers);
            audioManager.playClick?.();
          }}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Building2 className="w-3 h-3" />
            Federation Members
            <ConceptTooltip conceptId="mondragon-principles" position="right" />
          </span>
          {showMembers ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {showMembers && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-2 space-y-1.5">
                {federation.memberUnits.map((unit) => (
                  <div
                    key={unit.id}
                    className={`flex items-center gap-2 p-2 rounded ${
                      unit.id === federation.ourUnitId
                        ? 'bg-violet-500/20 border border-violet-500/30'
                        : 'bg-slate-800/30'
                    }`}
                  >
                    <Building2
                      className={`w-3 h-3 flex-shrink-0 ${
                        unit.id === federation.ourUnitId ? 'text-violet-400' : 'text-slate-500'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] font-medium text-white truncate">
                          {unit.name}
                        </span>
                        {unit.id === federation.ourUnitId && (
                          <span className="text-[8px] px-1 py-0.5 rounded bg-violet-500/30 text-violet-300">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[8px] text-slate-500">
                        <span className="flex items-center gap-0.5">
                          <MapPin className="w-2 h-2" />
                          {unit.location}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Users className="w-2 h-2" />
                          {unit.workerCount}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Resource Pools Expandable */}
      <div className="p-3">
        <button
          onClick={() => {
            setShowResources(!showResources);
            audioManager.playClick?.();
          }}
          className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-white transition-colors"
        >
          <span className="flex items-center gap-1">
            <Wallet className="w-3 h-3" />
            Resource Pools
          </span>
          {showResources ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        <AnimatePresence>
          {showResources && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3">
                {/* Capital Pool */}
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="flex items-center gap-1 mb-2">
                    <Wallet className="w-3 h-3 text-green-400" />
                    <span className="text-[10px] font-medium text-white">Capital Pool</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <div className="text-[8px] text-slate-500">Total</div>
                      <div className="text-[10px] font-bold text-green-400">
                        {formatCurrency(resourceSharing.capitalPool.totalPool)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] text-slate-500">Our Share</div>
                      <div className="text-[10px] font-bold text-white">
                        {formatCurrency(resourceSharing.capitalPool.ourContribution)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] text-slate-500">Available</div>
                      <div className="text-[10px] font-bold text-cyan-400">
                        {formatCurrency(resourceSharing.capitalPool.availableForUs)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Emergency Fund */}
                <div className="bg-slate-800/30 rounded p-2">
                  <div className="flex items-center gap-1 mb-2">
                    <Shield className="w-3 h-3 text-orange-400" />
                    <span className="text-[10px] font-medium text-white">Emergency Fund</span>
                    <ConceptTooltip conceptId="inter-cooperation" position="right" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <div className="text-[8px] text-slate-500">Total Fund</div>
                      <div className="text-[10px] font-bold text-orange-400">
                        {formatCurrency(resourceSharing.emergencyFund.totalFund)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[8px] text-slate-500">Our Share</div>
                      <div className="text-[10px] font-bold text-white">
                        {formatCurrency(resourceSharing.emergencyFund.ourContribution)}
                      </div>
                    </div>
                  </div>
                  <div className="text-[8px] text-slate-500">
                    Access criteria:{' '}
                    <span className="text-slate-400">
                      {resourceSharing.emergencyFund.accessCriteria.join(', ')}
                    </span>
                  </div>
                </div>

                {/* Solidarity Principle */}
                <div className="bg-violet-500/10 rounded p-2 border border-violet-500/20">
                  <div className="flex items-center gap-1 text-[9px] text-violet-400 font-medium">
                    <Users className="w-3 h-3" />
                    Solidarity Principle
                  </div>
                  <p className="text-[8px] text-slate-400 mt-1 italic">
                    &quot;No unit fails alone.&quot; Struggling cooperatives receive support from
                    the federation.
                  </p>
                </div>

                {/* Active Worker Exchanges */}
                {activeExchanges.length > 0 && (
                  <div className="bg-slate-800/30 rounded p-2">
                    <div className="flex items-center gap-1 mb-2">
                      <ArrowLeftRight className="w-3 h-3 text-cyan-400" />
                      <span className="text-[10px] font-medium text-white">Active Exchanges</span>
                    </div>
                    <div className="space-y-1.5">
                      {activeExchanges.map((exchange) => (
                        <div
                          key={exchange.id}
                          className="flex items-center gap-2 p-1.5 bg-slate-700/30 rounded"
                        >
                          <Users className="w-3 h-3 text-cyan-400 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="text-[9px] font-medium text-white truncate">
                              {exchange.workerName}
                            </div>
                            <div className="text-[8px] text-slate-500">
                              {exchange.fromUnit} → {exchange.toUnit}
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 text-[8px] text-slate-500">
                            <Clock className="w-2 h-2" />
                            Active
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default FederationPanel;
