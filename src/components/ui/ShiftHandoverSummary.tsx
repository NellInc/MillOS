/**
 * ShiftHandoverSummary Component
 * 
 * Auto-generates a summary when shift changes occur.
 * Shows accomplishments, issues, and handover notes.
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock,
    X,
    CheckCircle,
    AlertTriangle,
    ArrowRight,
    Clipboard,
    Copy,
    Check,
    EyeOff
} from 'lucide-react';
import { useGameSimulationStore } from '../../stores';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { BAG_WEIGHT_KG } from '../../types';

interface ShiftSummary {
    shift: string;
    startTime: number;
    endTime: number;
    accomplishments: string[];
    issues: string[];
    handoverNotes: string[];
}

import { useShallow } from 'zustand/react/shallow';

// ...

export const ShiftHandoverSummary: React.FC = () => {
    // 1. Game State (Simulation)
    const { currentShift, gameTime } = useGameSimulationStore(
        useShallow((state) => ({
            currentShift: state.currentShift,
            gameTime: state.gameTime
        }))
    );

    // 2. Production Metrics (Shallow to prevent re-render on *other* production changes)
    const { metrics, aiDecisions } = useProductionStore(
        useShallow((state) => ({
            metrics: state.metrics,
            aiDecisions: state.aiDecisions
        }))
    );

    // 3. UI Alerts (Only grab warnings/errors for summary count)
    const warningCount = useUIStore(useShallow((state) =>
        state.alerts.filter(a => a.type === 'warning' || a.type === 'critical').length
    ));

    // 4. Config
    const { showShiftHandover, setShowShiftHandover } = useAIConfigStore(
        useShallow((state) => ({
            showShiftHandover: state.showShiftHandover,
            setShowShiftHandover: state.setShowShiftHandover
        }))
    );

    const [previousShift, setPreviousShift] = useState<string>(currentShift);
    const [showSummary, setShowSummary] = useState(false);
    const [summary, setSummary] = useState<ShiftSummary | null>(null);
    const [copied, setCopied] = useState(false);
    const [countdown, setCountdown] = useState(5); // Auto-dismiss after 5 seconds

    // Detect shift change
    useEffect(() => {
        if (currentShift !== previousShift && showShiftHandover) {
            // Generate summary for the ending shift
            const summary: ShiftSummary = {
                shift: previousShift,
                startTime: getShiftStartTime(previousShift),
                endTime: gameTime,
                accomplishments: generateAccomplishments(),
                issues: generateIssues(),
                handoverNotes: generateHandoverNotes(),
            };
            setSummary(summary);
            setShowSummary(true);
            setCountdown(5); // Reset countdown when new summary appears
            setPreviousShift(currentShift);
        } else if (currentShift !== previousShift) {
            setPreviousShift(currentShift);
        }
    }, [currentShift, previousShift, gameTime, showShiftHandover]);

    // Auto-dismiss countdown
    useEffect(() => {
        if (!showSummary) return;

        if (countdown <= 0) {
            setShowSummary(false);
            return;
        }

        const timer = setTimeout(() => {
            setCountdown(prev => prev - 1);
        }, 1000);

        return () => clearTimeout(timer);
    }, [showSummary, countdown]);

    const getShiftStartTime = (shift: string): number => {
        const times: Record<string, number> = {
            morning: 6,
            afternoon: 14,
            night: 22,
        };
        return times[shift] || 6;
    };

    const generateAccomplishments = (): string[] => {
        const accomplishments: string[] = [];

        // High throughput: >1500 bags/hr (37.5t/hr)
        if (metrics.throughput > 1500) {
            accomplishments.push(`High throughput achieved: ${(metrics.throughput * BAG_WEIGHT_KG).toLocaleString()} kg/hr`);
        }
        if (metrics.quality >= 98) {
            accomplishments.push(`Quality target exceeded: ${metrics.quality.toFixed(1)}%`);
        }
        if (metrics.efficiency >= 95) {
            accomplishments.push(`Excellent efficiency: ${metrics.efficiency.toFixed(1)}%`);
        }

        const completedDecisions = aiDecisions.filter(d => d.status === 'completed').length;
        if (completedDecisions > 0) {
            accomplishments.push(`${completedDecisions} AI recommendations completed`);
        }

        if (accomplishments.length === 0) {
            accomplishments.push('Steady operations maintained');
        }

        return accomplishments;
    };

    const generateIssues = (): string[] => {
        const issues: string[] = [];

        // Use uptime to detect issues (100 - uptime = downtime)
        const downtime = 100 - (metrics.uptime || 100);
        if (downtime > 5) {
            issues.push(`Machine availability: ${metrics.uptime.toFixed(0)}%`);
        }

        if (warningCount > 0) {
            issues.push(`${warningCount} active alerts require attention`);
        }

        if (metrics.quality < 95) {
            issues.push(`Quality below target: ${metrics.quality.toFixed(1)}%`);
        }

        return issues;
    };

    const generateHandoverNotes = (): string[] => {
        const notes: string[] = [];

        const pendingDecisions = aiDecisions.filter(d => d.status === 'in_progress' || d.status === 'pending');
        if (pendingDecisions.length > 0) {
            notes.push(`${pendingDecisions.length} pending AI recommendations`);
        }

        if (metrics.throughput < 1500) {
            notes.push('Consider increasing production speed');
        }

        notes.push(`Current efficiency: ${metrics.efficiency.toFixed(1)}%`);

        return notes;
    };

    const handleCopy = async () => {
        if (!summary) return;
        const text = `
Shift Handover Summary: ${summary.shift.toUpperCase()}
===============================
Accomplishments:
${summary.accomplishments.map(a => `  ✓ ${a}`).join('\n')}

Issues:
${summary.issues.map(i => `  ⚠ ${i}`).join('\n') || '  None'}

Handover Notes:
${summary.handoverNotes.map(n => `  → ${n}`).join('\n')}
        `.trim();

        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleNeverShow = () => {
        setShowShiftHandover(false);
        setShowSummary(false);
    };

    return (
        <AnimatePresence>
            {showSummary && summary && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setShowSummary(false)}
                >
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0, y: 10 }}
                        animate={{
                            scale: 1,
                            opacity: 1,
                            y: 0,
                            transition: { type: "spring", stiffness: 300, damping: 25 }
                        }}
                        exit={{ scale: 0.95, opacity: 0, y: 10, transition: { duration: 0.2 } }}
                        className="bg-slate-900/95 rounded-xl border border-amber-500/30 shadow-2xl max-w-md w-full overflow-hidden" // Added overflow-hidden for border-radius clip
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-gradient-to-r from-amber-500/20 to-slate-900">
                            <div className="flex items-center gap-2">
                                <Clipboard className="w-5 h-5 text-amber-400" />
                                <span className="font-medium text-white">Shift Handover</span>
                                <span className="text-xs text-amber-400 uppercase">{summary.shift}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {/* Countdown indicator */}
                                <div className="relative w-7 h-7 flex items-center justify-center">
                                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 28 28">
                                        <circle
                                            cx="14"
                                            cy="14"
                                            r="12"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            className="text-slate-700"
                                        />
                                        <circle
                                            cx="14"
                                            cy="14"
                                            r="12"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeDasharray={75.4}
                                            strokeDashoffset={75.4 * (1 - countdown / 15)}
                                            className="text-amber-400 transition-all duration-1000 ease-linear"
                                        />
                                    </svg>
                                    <span className="text-[10px] font-mono text-amber-400">{countdown}</span>
                                </div>
                                <button
                                    onClick={handleCopy}
                                    className="p-1.5 hover:bg-slate-700/50 rounded transition-colors"
                                >
                                    {copied ? (
                                        <Check className="w-4 h-4 text-green-400" />
                                    ) : (
                                        <Copy className="w-4 h-4 text-slate-400" />
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowSummary(false)}
                                    className="p-1.5 hover:bg-slate-700/50 rounded transition-colors"
                                >
                                    <X className="w-4 h-4 text-slate-400" />
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4">
                            {/* Time range */}
                            <div className="flex items-center gap-2 text-sm text-slate-400">
                                <Clock className="w-4 h-4" />
                                <span>{summary.startTime}:00</span>
                                <ArrowRight className="w-3 h-3" />
                                <span>{summary.endTime.toFixed(0)}:00</span>
                            </div>

                            {/* Accomplishments */}
                            <div>
                                <h3 className="text-xs font-medium text-green-400 uppercase mb-2">Accomplishments</h3>
                                <div className="space-y-1">
                                    {summary.accomplishments.map((item, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                            <CheckCircle className="w-3.5 h-3.5 text-green-400 mt-0.5 flex-shrink-0" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Issues */}
                            {summary.issues.length > 0 && (
                                <div>
                                    <h3 className="text-xs font-medium text-red-400 uppercase mb-2">Issues</h3>
                                    <div className="space-y-1">
                                        {summary.issues.map((item, i) => (
                                            <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                                <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                                                <span>{item}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Handover Notes */}
                            <div>
                                <h3 className="text-xs font-medium text-amber-400 uppercase mb-2">Handover Notes</h3>
                                <div className="space-y-1">
                                    {summary.handoverNotes.map((item, i) => (
                                        <div key={i} className="flex items-start gap-2 text-sm text-slate-300">
                                            <ArrowRight className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                                            <span>{item}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-3 border-t border-slate-700/50 space-y-2">
                            <button
                                onClick={() => setShowSummary(false)}
                                className="w-full py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 rounded-lg text-sm font-medium transition-colors"
                            >
                                Acknowledge Handover
                            </button>
                            <button
                                onClick={handleNeverShow}
                                className="w-full py-1.5 flex items-center justify-center gap-2 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                            >
                                <EyeOff className="w-3 h-3" />
                                Don't show again
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

