/**
 * CostEstimationOverlay Component
 *
 * Shows estimated BYOK API cost from provider-reported token usage.
 * The provider invoice is authoritative.
 */

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Zap, Brain, TrendingUp, GripVertical } from 'lucide-react';
import { getActiveCloudPricing, useAIConfigStore } from '../../stores/aiConfigStore';

export const CostEstimationOverlay: React.FC = () => {
  const showCostOverlay = useAIConfigStore((state) => state.showCostOverlay);
  const llmBackend = useAIConfigStore((state) => state.llmBackend);
  const connectedProviders = useAIConfigStore((state) => state.connectedProviders);
  const chatgptStatus = useAIConfigStore((state) => state.chatgptStatus);
  const isConnected =
    llmBackend === 'chatgpt'
      ? Boolean(
          chatgptStatus?.accounts.some(
            (account) => account.id === chatgptStatus.activeId && account.signedIn && account.model
          )
        )
      : llmBackend !== 'webgpu' && connectedProviders[llmBackend];
  const aiMode = useAIConfigStore((state) => state.aiMode);
  const costTracking = useAIConfigStore((state) => state.costTracking);
  const spendCapUsd = useAIConfigStore((state) => state.spendCapUsd);

  const dragConstraintsRef = useRef<HTMLDivElement>(null);

  if (!showCostOverlay) return null;

  const pricing = getActiveCloudPricing();

  const {
    sessionCost,
    reservedCost,
    uncertainCost,
    totalInputTokens,
    totalOutputTokens,
    requestCount,
    lastRequestCost,
    sessionStartTime,
  } = costTracking;

  // Calculate session duration
  const sessionDurationMs = Date.now() - sessionStartTime;
  const sessionMinutes = Math.floor(sessionDurationMs / 60000);
  const sessionHours = Math.floor(sessionMinutes / 60);
  const displayDuration =
    sessionHours > 0 ? `${sessionHours}h ${sessionMinutes % 60}m` : `${sessionMinutes}m`;

  // Format cost display
  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00';
    if (cost < 0.0001) return `$${cost.toFixed(6)}`;
    if (cost < 0.01) return `$${cost.toFixed(4)}`;
    return `$${cost.toFixed(2)}`;
  };

  // Format token count
  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(2)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`;
    return tokens.toString();
  };

  return (
    <div ref={dragConstraintsRef} className="fixed inset-0 z-40 pointer-events-none">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        drag
        dragMomentum={false}
        dragElastic={0.1}
        dragConstraints={dragConstraintsRef}
        className="absolute top-20 right-4 w-56 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-cyan-500/30 shadow-xl pointer-events-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50 cursor-move select-none">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-cyan-500/20">
              <DollarSign className="w-4 h-4 text-cyan-400" />
            </div>
            <span className="text-xs font-bold text-white">BYOK API Usage</span>
          </div>
          <GripVertical className="w-3 h-3 text-slate-500" aria-hidden="true" />
        </div>

        {/* Connection Status */}
        <div className="px-3 py-2 border-b border-slate-700/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-500'}`}
              />
              <span className="text-[10px] text-slate-400">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Brain className="w-3 h-3 text-purple-400" />
              <span className="text-[10px] text-purple-300 capitalize">{aiMode}</span>
            </div>
          </div>
        </div>

        {/* Main Cost Display */}
        <div className="p-3">
          <div className="text-center mb-3">
            <div className="text-3xl font-bold text-cyan-400">{formatCost(sessionCost)}</div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Paid calls including key tests ({displayDuration})
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            {/* Request Count */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center gap-1 text-slate-400 mb-1">
                <Zap className="w-3 h-3" />
                <span>Requests</span>
              </div>
              <div className="text-sm font-bold text-white">{requestCount}</div>
            </div>

            {/* Last Request */}
            <div className="bg-slate-800/50 rounded-lg p-2">
              <div className="flex items-center gap-1 text-slate-400 mb-1">
                <TrendingUp className="w-3 h-3" />
                <span>Last Call</span>
              </div>
              <div className="text-sm font-bold text-emerald-400">
                {formatCost(lastRequestCost)}
              </div>
            </div>
          </div>

          {/* Token Breakdown */}
          <div className="mt-2 p-2 bg-slate-800/30 rounded-lg">
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-slate-400">Input Tokens</span>
              <span className="text-cyan-300 font-mono">{formatTokens(totalInputTokens)}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Output Tokens</span>
              <span className="text-purple-300 font-mono">{formatTokens(totalOutputTokens)}</span>
            </div>
          </div>

          <div className="mt-2 text-[10px] text-slate-400 text-center">
            {spendCapUsd === null ? 'No session cap' : `Cap $${spendCapUsd.toFixed(2)}`}
            {reservedCost + uncertainCost > 0
              ? ` · $${(reservedCost + uncertainCost).toFixed(4)} in flight or uncertain`
              : ''}
          </div>
        </div>

        {/* Pricing Note */}
        <div className="px-3 pb-2">
          <div className="text-[9px] text-slate-400 text-center">
            {llmBackend === 'webgpu'
              ? 'On-device inference has no API charge.'
              : llmBackend === 'chatgpt'
                ? 'ChatGPT plan usage is separate from BYOK API billing and this dollar cap.'
                : `${pricing.model}: direct-provider estimate $${pricing.input.toFixed(2)}/1M in, $${pricing.output.toFixed(2)}/1M out; OpenRouter reports account and any upstream BYOK costs. This tab's cap is an estimate, not a provider billing limit.`}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
