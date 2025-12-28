import React, { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';

export const EmergencyControlPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);

  const {
    emergencyActive,
    emergencyDrillMode,
    startEmergencyDrill,
    endEmergencyDrill,
    shiftChangeActive,
    currentShift,
    triggerShiftChange,
  } = useGameSimulationStore(
    useShallow((state) => ({
      emergencyActive: state.emergencyActive,
      emergencyDrillMode: state.emergencyDrillMode,
      startEmergencyDrill: state.startEmergencyDrill,
      endEmergencyDrill: state.endEmergencyDrill,
      shiftChangeActive: state.shiftChangeActive,
      currentShift: state.currentShift,
      triggerShiftChange: state.triggerShiftChange,
    }))
  );

  const workerCount = useProductionStore((state) => state.workers.length);
  const theme = useUIStore((state) => state.theme);

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-400" />
          Emergency & Shift Controls
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            {/* Emergency Drill Button */}
            <div
              className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
            >
              <div
                className={`text-[10px] uppercase tracking-wider mb-2 ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Emergency Drill
              </div>
              <button
                onClick={() =>
                  emergencyDrillMode ? endEmergencyDrill() : startEmergencyDrill(workerCount)
                }
                className={`w-full py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  emergencyDrillMode
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse'
                    : emergencyActive
                      ? 'bg-orange-600 text-white cursor-not-allowed'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                }`}
                disabled={emergencyActive && !emergencyDrillMode}
              >
                {emergencyDrillMode
                  ? 'END DRILL'
                  : emergencyActive
                    ? 'EMERGENCY ACTIVE'
                    : 'START DRILL'}
              </button>
              <p
                className={`text-[9px] mt-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
              >
                {emergencyDrillMode
                  ? 'Workers responding to drill...'
                  : 'Test emergency response procedures'}
              </p>
            </div>

            {/* Shift Change Button */}
            <div
              className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
            >
              <div
                className={`text-[10px] uppercase tracking-wider mb-2 ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Shift Change
                <span className="ml-2 text-blue-400 capitalize">({currentShift})</span>
              </div>
              <button
                onClick={() => triggerShiftChange()}
                className={`w-full py-2 px-3 rounded-lg font-bold text-sm transition-all ${
                  shiftChangeActive
                    ? 'bg-blue-600 text-white animate-pulse cursor-not-allowed'
                    : emergencyActive
                      ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
                disabled={shiftChangeActive || emergencyActive}
              >
                {shiftChangeActive ? 'SHIFT CHANGE IN PROGRESS...' : 'TRIGGER SHIFT CHANGE'}
              </button>
              <p
                className={`text-[9px] mt-1 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
              >
                {shiftChangeActive
                  ? 'Workers leaving and new shift arriving...'
                  : 'Workers will leave and return refreshed'}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
