import React from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, AlertTriangle } from 'lucide-react';
import { useProductionStore, useGameSimulationStore } from '../../../store';
import { MillClockDisplay } from '../../ui/MillClockDisplay';

export const MissionControl: React.FC = () => {
  const efficiency = useProductionStore((state) => state.metrics.efficiency) ?? 0;
  const activeAlerts = useGameSimulationStore((state) => state.shiftData.shiftIncidents);
  const priorities = useGameSimulationStore((state) => state.shiftData.priorities);

  return (
    <motion.div
      initial={{ x: -50, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className="fixed top-4 left-4 bottom-24 w-64 flex flex-col gap-3 pointer-events-none z-40"
    >
      {/* Brand / Clock Widget */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg pointer-events-auto">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center text-white font-bold">
            M
          </div>
          <div>
            <h1 className="text-white font-bold leading-none tracking-tight">MillOS</h1>
            <div className="text-[10px] text-cyan-400 font-mono">ONLINE</div>
          </div>
        </div>
        <div className="pt-2 border-t border-white/5">
          <MillClockDisplay theme="dark" />
        </div>
      </div>

      {/* Objectives Widget */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg pointer-events-auto flex-1 max-h-60 overflow-hidden">
        <div className="flex items-center gap-2 text-orange-400 mb-3">
          <Target size={14} />
          <h2 className="text-xs font-bold uppercase tracking-wider">Objectives</h2>
        </div>
        <ul className="space-y-3">
          {priorities.map((text: string, idx: number) => (
            <ObjectiveItem key={idx} text={text} status="active" />
          ))}
          {activeAlerts.length > 0 &&
            activeAlerts
              .slice(0, 2)
              .map((alert, idx) => (
                <ObjectiveItem key={`alert-${idx}`} text={alert.description} status="warning" />
              ))}
        </ul>
      </div>

      {/* Quick Stats Widget */}
      <div className="bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-lg pointer-events-auto">
        <div className="flex items-center gap-2 text-cyan-400 mb-2">
          <TrendingUp size={14} />
          <h2 className="text-xs font-bold uppercase tracking-wider">Efficiency</h2>
        </div>
        <div className="text-2xl font-bold text-white font-mono">{efficiency.toFixed(1)}%</div>
        <div className="w-full h-1 bg-slate-700 rounded-full mt-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-1000 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, efficiency))}%` }}
          ></div>
        </div>
      </div>
    </motion.div>
  );
};

const ObjectiveItem: React.FC<{ text: string; status: 'active' | 'warning' | 'pending' }> = ({
  text,
  status,
}) => {
  const colors = {
    active: 'border-l-2 border-green-500',
    warning: 'border-l-2 border-orange-500 bg-orange-500/10',
    pending: 'border-l-2 border-slate-600 opacity-60',
  };

  return (
    <li className={`pl-2 py-1 text-xs text-slate-300 ${colors[status]}`}>
      {status === 'warning' && <AlertTriangle size={10} className="inline mr-1 text-orange-500" />}
      {text}
    </li>
  );
};
