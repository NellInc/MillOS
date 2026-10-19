import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { formatFixed, useT } from '../../i18n';
import { safetyConfigPanelMessages } from './SafetyConfigPanel.messages';

export const SafetyConfigPanel: React.FC = () => {
  const t = useT(safetyConfigPanelMessages);
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
          {t('title')}
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
            {/* Mobile-equipment detection radius */}
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className={theme === 'light' ? 'text-slate-500' : 'text-slate-400'}>
                  {t('vehicleDetection')}
                </span>
                <span className="text-green-500 font-mono font-bold">
                  {formatFixed(safetyConfig.vehicleDetectionRadius, 1)}m
                </span>
              </div>
              <input
                type="range"
                aria-label={t('vehicleDetectionAria')}
                min="1"
                max="5"
                step="0.1"
                value={safetyConfig.vehicleDetectionRadius}
                aria-valuetext={t('valueMetres', {
                  value: formatFixed(safetyConfig.vehicleDetectionRadius, 1),
                })}
                onChange={(e) =>
                  setSafetyConfig({ vehicleDetectionRadius: parseFloat(e.target.value) })
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
                  {t('forkliftSpacing')}
                </span>
                <span className="text-blue-500 font-mono font-bold">
                  {formatFixed(safetyConfig.forkliftSafetyRadius, 1)}m
                </span>
              </div>
              <input
                type="range"
                aria-label={t('forkliftSpacingAria')}
                min="2"
                max="8"
                step="0.5"
                value={safetyConfig.forkliftSafetyRadius}
                aria-valuetext={t('valueMetres', {
                  value: formatFixed(safetyConfig.forkliftSafetyRadius, 1),
                })}
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
                  {t('lookAheadDistance')}
                </span>
                <span className="text-purple-500 font-mono font-bold">
                  {formatFixed(safetyConfig.pathCheckDistance, 1)}m
                </span>
              </div>
              <input
                type="range"
                aria-label={t('lookAheadDistanceAria')}
                min="2"
                max="10"
                step="0.5"
                value={safetyConfig.pathCheckDistance}
                aria-valuetext={t('valueMetres', {
                  value: formatFixed(safetyConfig.pathCheckDistance, 1),
                })}
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
                  {t('speedZoneRate')}
                </span>
                <span className="text-amber-500 font-mono font-bold">
                  {formatFixed(safetyConfig.speedZoneSlowdown * 100, 0)}%
                </span>
              </div>
              <input
                type="range"
                aria-label={t('speedZoneRateAria')}
                min="0.2"
                max="0.8"
                step="0.1"
                value={safetyConfig.speedZoneSlowdown}
                aria-valuetext={t('valuePercent', {
                  value: formatFixed(Math.round(safetyConfig.speedZoneSlowdown * 100), 0),
                })}
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
                <span className="text-green-500">{t('vehicleDetectionLabel')}</span>{' '}
                {t('vehicleDetectionHelp')}
              </p>
              <p>
                <span className="text-blue-500">{t('forkliftSpacingLabel')}</span>{' '}
                {t('forkliftSpacingHelp')}
              </p>
              <p>
                <span className="text-purple-500">{t('lookAheadLabel')}</span> {t('lookAheadHelp')}
              </p>
              <p>
                <span className="text-amber-500">{t('speedZoneLabel')}</span> {t('speedZoneHelp')}
              </p>
              <p className="italic">{t('enforcementNote')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
