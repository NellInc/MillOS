/**
 * Management Style Panel
 *
 * Bilateral Alignment Control Center for observing and adjusting
 * AI-human partnership dynamics in the digital twin.
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Sliders,
    Heart,
    TrendingUp,
    Activity,
    Users,
    Zap,
    MessageCircle,
    ChevronDown,
    ChevronUp,
    Sparkles,
    Scale,
    Package,
    AlertCircle,
    CheckCircle
} from 'lucide-react';
import { useAIConfigStore } from '../../../stores/aiConfigStore';
import { useWorkerMoodStore } from '../../../stores/workerMoodStore';
import { useProductionStore } from '../../../stores/productionStore';
import { useShallow } from 'zustand/react/shallow';
import { audioManager } from '../../../utils/audioManager';
import { WORKER_ROSTER } from '../../../types';

// Management presets
const MANAGEMENT_PRESETS = [
    { name: 'Strict', value: 10, color: 'bg-red-500/20 text-red-300 border-red-500/30' },
    { name: 'Balanced', value: 50, color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
    { name: 'Kind', value: 75, color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
    { name: 'Generous', value: 95, color: 'bg-green-500/20 text-green-300 border-green-500/30' },
];

// Get worker name from roster by ID
const getWorkerName = (workerId: string): string => {
    const worker = WORKER_ROSTER.find(w => w.id === workerId);
    return worker?.name || 'Unknown';
};

/**
 * Management Style Control & AI Decision Display
 */
export const ManagementStylePanel: React.FC = () => {
    const [showWorkers, setShowWorkers] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const lastTrustRef = useRef<number>(50);

    const {
        managementGenerosity,
        setManagementGenerosity,
        getGrantRate,
    } = useAIConfigStore(
        useShallow((state) => ({
            managementGenerosity: state.managementGenerosity,
            setManagementGenerosity: state.setManagementGenerosity,
            getGrantRate: state.getGrantRate,
        }))
    );

    // Production stats for impact visualization
    const baseProductionRate = useProductionStore((state) => state.metrics.throughput);

    // Calculate aggregate alignment stats
    const {
        averageTrust,
        averageInitiative,
        pendingCount,
        productivityMultiplier,
        workerCount,
        highTrustWorkers,
        lowTrustWorkers
    } = useWorkerMoodStore(
        useShallow((state) => {
            const moods = Object.values(state.workerMoods);
            const withPrefs = moods.filter(m => m?.preferences);
            const avgTrust = withPrefs.length > 0
                ? withPrefs.reduce((sum, m) => sum + (m?.preferences?.managementTrust || 0), 0) / withPrefs.length
                : 50;
            const avgInit = withPrefs.length > 0
                ? withPrefs.reduce((sum, m) => sum + (m?.preferences?.initiative || 0), 0) / withPrefs.length
                : 50;
            const pending = state.getWorkersWithPendingRequests().length;
            const prodMult = state.getWorkforceProductivityMultiplier();

            // Get actual worker details for spotlight
            const highTrust = withPrefs
                .filter(m => (m?.preferences?.managementTrust || 0) >= 70)
                .map(m => ({ id: m?.workerId || '', name: getWorkerName(m?.workerId || ''), trust: m?.preferences?.managementTrust || 0 }));
            const lowTrust = withPrefs
                .filter(m => (m?.preferences?.managementTrust || 0) < 40)
                .map(m => ({ id: m?.workerId || '', name: getWorkerName(m?.workerId || ''), trust: m?.preferences?.managementTrust || 0 }));

            return {
                averageTrust: avgTrust,
                averageInitiative: avgInit,
                pendingCount: pending,
                productivityMultiplier: prodMult,
                workerCount: withPrefs.length,
                highTrustWorkers: highTrust,
                lowTrustWorkers: lowTrust
            };
        })
    );

    // Audio feedback for trust threshold crossings
    useEffect(() => {
        const prevTrust = lastTrustRef.current;
        const threshold = 50;

        // Crossed from low to high trust
        if (prevTrust < threshold && averageTrust >= threshold) {
            audioManager.playAISuccess?.();
        }
        // Crossed from high to low trust
        else if (prevTrust >= threshold && averageTrust < threshold) {
            audioManager.playAICriticalAlert?.();
        }

        lastTrustRef.current = averageTrust;
    }, [averageTrust]);

    // Handle preset selection
    const handlePresetClick = (value: number) => {
        setManagementGenerosity(value);
        audioManager.playClick();
    };

    const grantRate = getGrantRate();

    // Style label
    const styleConfig = managementGenerosity >= 80 ? { label: 'Generous', color: 'text-green-300', bg: 'bg-green-500/20' } :
        managementGenerosity >= 60 ? { label: 'Kind', color: 'text-emerald-300', bg: 'bg-emerald-500/20' } :
            managementGenerosity >= 40 ? { label: 'Balanced', color: 'text-blue-300', bg: 'bg-blue-500/20' } :
                managementGenerosity >= 20 ? { label: 'Firm', color: 'text-amber-300', bg: 'bg-amber-500/20' } :
                    { label: 'Strict', color: 'text-red-300', bg: 'bg-red-500/20' };

    // Calculate production impact
    const baseRate = baseProductionRate || 100;
    const actualRate = baseRate * productivityMultiplier;
    const rateChange = actualRate - baseRate;
    const productivityLabel = productivityMultiplier >= 1.15 ? 'Exceptional' :
        productivityMultiplier >= 1.10 ? 'High' :
            productivityMultiplier >= 1.0 ? 'Normal' :
                productivityMultiplier >= 0.9 ? 'Reduced' : 'Poor';

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
        >
            {/* Header */}
            <div className="p-3 border-b border-slate-700/50">
                <div className="flex items-center gap-2">
                    <Scale className="w-4 h-4 text-pink-400" aria-hidden="true" />
                    <span className="text-sm font-bold text-white">Bilateral Alignment</span>
                    <span className={`ml-auto text-xs font-bold px-2 py-0.5 rounded ${styleConfig.bg} ${styleConfig.color}`}>
                        {styleConfig.label}
                    </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                    Press <kbd className="px-1 py-0.5 bg-slate-700 rounded text-[9px]">B</kbd> to toggle - AI evaluates every 10s
                </p>
            </div>

            {/* Preset Buttons */}
            <div className="p-3 border-b border-slate-700/30">
                <div className="flex items-center gap-1 mb-2">
                    <Sparkles className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                    <span className="text-xs font-medium text-white">Quick Presets</span>
                </div>
                <div className="grid grid-cols-4 gap-1" role="group" aria-label="Management style presets">
                    {MANAGEMENT_PRESETS.map((preset) => (
                        <button
                            key={preset.name}
                            onClick={() => handlePresetClick(preset.value)}
                            aria-pressed={Math.abs(managementGenerosity - preset.value) < 10}
                            className={`px-2 py-1.5 rounded text-[10px] font-medium border transition-all hover:scale-105 ${Math.abs(managementGenerosity - preset.value) < 10
                                ? preset.color + ' ring-1 ring-white/30'
                                : 'bg-slate-800/50 text-slate-300 border-slate-700/30 hover:bg-slate-700/50'
                                }`}
                        >
                            {preset.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Control - Generosity Slider */}
            <div className="p-3 border-b border-slate-700/30">
                <div className="flex items-center gap-2 mb-2">
                    <Sliders className="w-3 h-3 text-cyan-400" aria-hidden="true" />
                    <label htmlFor="management-generosity-slider" className="text-xs font-medium text-white">Fine-tune</label>
                    <span className="ml-auto text-xs font-mono text-cyan-400" aria-live="polite">{managementGenerosity}%</span>
                </div>
                <input
                    id="management-generosity-slider"
                    type="range"
                    min="0"
                    max="100"
                    value={managementGenerosity}
                    onChange={(e) => setManagementGenerosity(parseInt(e.target.value))}
                    className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-cyan-500 bg-gradient-to-r from-red-600 via-amber-500 via-blue-500 to-green-500"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={managementGenerosity}
                    aria-valuetext={`${managementGenerosity} percent, ${styleConfig.label} style`}
                />
            </div>

            {/* Key Metrics Row */}
            <div className="p-3 border-b border-slate-700/30">
                <div className="grid grid-cols-4 gap-2">
                    <div className="bg-slate-800/50 rounded p-2 text-center">
                        <MessageCircle className="w-3 h-3 mx-auto mb-1 text-cyan-400" aria-hidden="true" />
                        <div className="text-sm font-bold text-white">{(grantRate * 100).toFixed(0)}%</div>
                        <div className="text-[9px] text-slate-400">Grant Rate</div>
                    </div>
                    <div className="bg-slate-800/50 rounded p-2 text-center">
                        <Heart className={`w-3 h-3 mx-auto mb-1 ${averageTrust >= 70 ? 'text-green-400' : averageTrust >= 50 ? 'text-amber-400' : 'text-red-400'}`} aria-hidden="true" />
                        <div className="text-sm font-bold text-white">{averageTrust.toFixed(0)}%</div>
                        <div className="text-[9px] text-slate-400">Avg Trust</div>
                    </div>
                    <div className="bg-slate-800/50 rounded p-2 text-center">
                        <TrendingUp className={`w-3 h-3 mx-auto mb-1 ${averageInitiative >= 70 ? 'text-cyan-400' : averageInitiative >= 50 ? 'text-amber-400' : 'text-red-400'}`} aria-hidden="true" />
                        <div className="text-sm font-bold text-white">{averageInitiative.toFixed(0)}%</div>
                        <div className="text-[9px] text-slate-400">Initiative</div>
                    </div>
                    <div className="bg-slate-800/50 rounded p-2 text-center">
                        <Activity className={`w-3 h-3 mx-auto mb-1 ${pendingCount === 0 ? 'text-green-400' : 'text-amber-400'}`} aria-hidden="true" />
                        <div className="text-sm font-bold text-white">{pendingCount}</div>
                        <div className="text-[9px] text-slate-400">Pending</div>
                    </div>
                </div>
            </div>

            {/* Production Impact VCP */}
            <div className="p-3 border-b border-slate-700/30">
                <div className="flex items-center gap-2 mb-2">
                    <Package className="w-3 h-3 text-yellow-400" aria-hidden="true" />
                    <span className="text-xs font-medium text-white">Production Impact</span>
                    <span className={`ml-auto text-[10px] font-bold ${rateChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {rateChange >= 0 ? '+' : ''}{rateChange.toFixed(1)} bags/hr
                    </span>
                </div>

                {/* Productivity Bar */}
                <div className="relative h-4 bg-slate-800 rounded-full overflow-hidden mb-1" role="progressbar" aria-valuenow={productivityMultiplier * 100} aria-valuemin={0} aria-valuemax={120} aria-label="Productivity multiplier">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (productivityMultiplier / 1.2) * 100)}%` }}
                        transition={{ duration: 0.5 }}
                        className={`h-full rounded-full ${productivityMultiplier >= 1.1 ? 'bg-gradient-to-r from-green-500 to-emerald-400' :
                            productivityMultiplier >= 1.0 ? 'bg-gradient-to-r from-blue-500 to-cyan-400' :
                                'bg-gradient-to-r from-amber-500 to-red-400'
                            }`}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-white drop-shadow">
                            {(productivityMultiplier * 100).toFixed(0)}% - {productivityLabel}
                        </span>
                    </div>
                </div>
            </div>

            {/* Worker Spotlight (Expandable) */}
            <div className="p-3 border-b border-slate-700/30">
                <button
                    onClick={() => setShowWorkers(!showWorkers)}
                    aria-expanded={showWorkers}
                    aria-controls="worker-spotlight-content"
                    className="w-full flex items-center justify-between text-xs text-slate-300 hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" aria-hidden="true" />
                        Worker Spotlight ({workerCount} total)
                    </span>
                    {showWorkers ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
                </button>

                <AnimatePresence>
                    {showWorkers && (
                        <motion.div
                            id="worker-spotlight-content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-2 space-y-2">
                                {/* High Trust Workers */}
                                <div className="bg-green-500/10 rounded p-2">
                                    <div className="flex items-center gap-1 text-[10px] text-green-400 mb-1">
                                        <CheckCircle className="w-3 h-3" aria-hidden="true" />
                                        High Trust ({highTrustWorkers.length})
                                    </div>
                                    {highTrustWorkers.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {highTrustWorkers.slice(0, 5).map(w => (
                                                <span key={w.id} className="px-1.5 py-0.5 bg-green-500/20 text-green-300 rounded text-[9px]">
                                                    {w.name.split(' ')[0]} ({w.trust.toFixed(0)}%)
                                                </span>
                                            ))}
                                            {highTrustWorkers.length > 5 && (
                                                <span className="text-[9px] text-green-400">+{highTrustWorkers.length - 5} more</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-[9px] text-slate-400 italic">No workers above 70% trust yet</span>
                                    )}
                                </div>

                                {/* Low Trust Workers */}
                                <div className="bg-red-500/10 rounded p-2">
                                    <div className="flex items-center gap-1 text-[10px] text-red-400 mb-1">
                                        <AlertCircle className="w-3 h-3" aria-hidden="true" />
                                        Low Trust ({lowTrustWorkers.length})
                                    </div>
                                    {lowTrustWorkers.length > 0 ? (
                                        <div className="flex flex-wrap gap-1">
                                            {lowTrustWorkers.slice(0, 5).map(w => (
                                                <span key={w.id} className="px-1.5 py-0.5 bg-red-500/20 text-red-300 rounded text-[9px]">
                                                    {w.name.split(' ')[0]} ({w.trust.toFixed(0)}%)
                                                </span>
                                            ))}
                                            {lowTrustWorkers.length > 5 && (
                                                <span className="text-[9px] text-red-400">+{lowTrustWorkers.length - 5} more</span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-[9px] text-slate-400 italic">No workers below 40% trust</span>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* About Section (Expandable) */}
            <div className="p-3">
                <button
                    onClick={() => setShowDetails(!showDetails)}
                    aria-expanded={showDetails}
                    aria-controls="about-bilateral-content"
                    className="w-full flex items-center justify-between text-xs text-slate-300 hover:text-white transition-colors"
                >
                    <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3" aria-hidden="true" />
                        About Bilateral Alignment
                    </span>
                    {showDetails ? <ChevronUp className="w-3 h-3" aria-hidden="true" /> : <ChevronDown className="w-3 h-3" aria-hidden="true" />}
                </button>

                <AnimatePresence>
                    {showDetails && (
                        <motion.div
                            id="about-bilateral-content"
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 space-y-2 text-[10px] text-slate-300">
                                <p className="leading-relaxed">
                                    <strong className="text-cyan-400">Bilateral Alignment</strong> is a philosophy where
                                    AI-human partnerships are built on mutual respect. Workers have preferences;
                                    how you handle them affects trust, initiative, and ultimately productivity.
                                </p>
                                <div className="bg-slate-800/30 rounded p-2">
                                    <div className="font-bold text-white mb-1">Trust Dividend:</div>
                                    <ul className="space-y-0.5 text-slate-300">
                                        <li>- 91-100% trust: 1.15x productivity</li>
                                        <li>- 71-90% trust: 1.10x productivity</li>
                                        <li>- 41-70% trust: 1.00x baseline</li>
                                        <li>- 0-40% trust: 0.85x productivity</li>
                                    </ul>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

export default ManagementStylePanel;
