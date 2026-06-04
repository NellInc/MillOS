import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';

export const SafetyConfigPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const safetyConfig = useSafetyStore((state) => state.safetyConfig);
  const setSafetyConfig = useSafetyStore((state) => state.setSafetyConfig);
  const theme = useUIStore((state) => state.theme);

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-500" />
          Safety Configuration
        </span>
        {expanded ? (
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3 pt-2 overflow-hidden"
          >
            {/* Worker Detection Radius */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                  Worker Detection
                </span>
                <span className="text-green-500 font-mono font-bold">
                  {safetyConfig.workerDetectionRadius.toFixed(1)}m
                </span>
              </div>
              <input
                type="range"
                aria-label="Worker detection radius (meters)"
                min="1"
                max="5"
                step="0.5"
                value={safetyConfig.workerDetectionRadius}
                onChange={(e) =>
                  setSafetyConfig({ workerDetectionRadius: parseFloat(e.target.value) })
                }
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-green-500 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                }`}
              />
            </div>

            {/* Forklift Safety Radius */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                  Forklift Spacing
                </span>
                <span className="text-blue-500 font-mono font-bold">
                  {safetyConfig.forkliftSafetyRadius.toFixed(1)}m
                </span>
              </div>
              <input
                type="range"
                aria-label="Forklift spacing (meters)"
                min="2"
                max="8"
                step="0.5"
                value={safetyConfig.forkliftSafetyRadius}
                onChange={(e) =>
                  setSafetyConfig({ forkliftSafetyRadius: parseFloat(e.target.value) })
                }
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-blue-500 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                }`}
              />
            </div>

            {/* Path Check Distance */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                  Look-ahead Distance
                </span>
                <span className="text-purple-500 font-mono font-bold">
                  {safetyConfig.pathCheckDistance.toFixed(1)}m
                </span>
              </div>
              <input
                type="range"
                aria-label="Look-ahead distance (meters)"
                min="2"
                max="10"
                step="0.5"
                value={safetyConfig.pathCheckDistance}
                onChange={(e) => setSafetyConfig({ pathCheckDistance: parseFloat(e.target.value) })}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-purple-500 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                }`}
              />
            </div>

            {/* Speed Zone Slowdown */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                  Speed Zone Rate
                </span>
                <span className="text-amber-500 font-mono font-bold">
                  {(safetyConfig.speedZoneSlowdown * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                aria-label="Speed zone rate (percent)"
                min="0.2"
                max="0.8"
                step="0.1"
                value={safetyConfig.speedZoneSlowdown}
                onChange={(e) => setSafetyConfig({ speedZoneSlowdown: parseFloat(e.target.value) })}
                className={`w-full h-2 rounded-lg appearance-none cursor-pointer accent-amber-500 ${
                  theme === 'light' ? 'bg-slate-200' : 'bg-slate-800'
                }`}
              />
            </div>

            {/* Descriptions */}
            <div
              className={`text-[9px] space-y-1 pt-1 border-t ${
                theme === 'light'
                  ? 'text-slate-400 border-slate-200'
                  : 'text-slate-500 border-slate-800'
              }`}
            >
              <p>
                <span className="text-green-500">Worker Detection:</span> How close workers can be
              </p>
              <p>
                <span className="text-blue-500">Forklift Spacing:</span> Min distance between
                forklifts
              </p>
              <p>
                <span className="text-purple-500">Look-ahead:</span> How far ahead to check path
              </p>
              <p>
                <span className="text-amber-500">Speed Zone:</span> Speed % in slow zones
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
