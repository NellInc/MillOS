import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ChevronDown, ChevronUp, Clock } from 'lucide-react';
import { incidentDescription, useSafetyStore } from '../../stores/safetyStore';
import { useUIStore } from '../../stores/uiStore';
import { formatFixed, useLocale, useT } from '../../i18n';
import { formatPlantStamp } from '../../utils/timeFormatting';
import { incidentHistoryPanelMessages } from './IncidentHistoryPanel.messages';

export const IncidentHistoryPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const safetyIncidents = useSafetyStore((state) => state.safetyIncidents);
  const clearSafetyIncidents = useSafetyStore((state) => state.clearSafetyIncidents);
  const theme = useUIStore((state) => state.theme);
  const t = useT(incidentHistoryPanelMessages);
  const locale = useLocale();
  // Each step of the clear removes the button that was pressed. Focus follows
  // to the control that replaces it, once that control has mounted.
  // Working if a keyboard user never lands on <body> during a clear.
  const toggleRef = useRef<HTMLButtonElement>(null);
  const clearRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<React.RefObject<HTMLButtonElement | null> | null>(null);
  useEffect(() => {
    if (!focusNext.current) return;
    focusNext.current.current?.focus();
    focusNext.current = null;
  });

  const handleClearClick = () => {
    if (confirmingClear) {
      clearSafetyIncidents();
      setConfirmingClear(false);
      focusNext.current = toggleRef;
    } else {
      setConfirmingClear(true);
      focusNext.current = confirmRef;
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    // pt-BR reads clock times as 24-hour.
    return date.toLocaleTimeString(locale === 'en' ? 'en-US' : 'pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getIncidentColor = (type: string) => {
    if (theme === 'light') {
      switch (type) {
        case 'emergency':
          return 'text-red-600 bg-red-100';
        case 'stop':
          return 'text-amber-600 bg-amber-100';
        case 'evasion':
          return 'text-blue-600 bg-blue-100';
        case 'near_miss':
          return 'text-orange-600 bg-orange-100';
        default:
          return 'text-slate-600 bg-slate-100';
      }
    }
    switch (type) {
      case 'emergency':
        return 'text-red-400 bg-red-500/20';
      case 'stop':
        return 'text-amber-400 bg-amber-500/20';
      case 'evasion':
        return 'text-blue-400 bg-blue-500/20';
      case 'near_miss':
        return 'text-orange-400 bg-orange-500/20';
      default:
        return 'text-slate-400 bg-slate-500/20';
    }
  };

  return (
    <div
      className={`border-t pt-2 mt-2 ${theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'}`}
    >
      <button
        ref={toggleRef}
        onClick={() => {
          setExpanded(!expanded);
          setConfirmingClear(false);
        }}
        aria-expanded={expanded}
        aria-controls="incident-log-content"
        className={`w-full flex items-center justify-between text-xs font-medium transition-colors py-1 ${
          theme === 'light'
            ? 'text-slate-600 hover:text-slate-800'
            : 'text-slate-300 hover:text-white'
        }`}
      >
        <span className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-500" />
          {t('incidentLog', { count: formatFixed(safetyIncidents.length, 0) })}
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id="incident-log-content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1 pt-2 overflow-hidden"
          >
            {safetyIncidents.length === 0 ? (
              <div
                className={`text-center text-xs py-2 ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
              >
                {t('noIncidents')}
              </div>
            ) : (
              <>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {safetyIncidents.slice(0, 20).map((incident) => {
                    // Read now, so a language switch after the incident applies;
                    // an entry without a plant clock keeps its wall time.
                    const description = incidentDescription(incident);
                    return (
                      <div
                        key={incident.id}
                        className={`flex items-start gap-2 p-1.5 rounded text-[10px] ${getIncidentColor(incident.type)}`}
                      >
                        <Clock className="w-3 h-3 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {formatPlantStamp(incident.gameClock) ?? formatTime(incident.timestamp)}
                          </div>
                          <div
                            title={description}
                            className={`truncate ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}
                          >
                            {description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {safetyIncidents.length > 20 && (
                  <div
                    className={`text-center text-[9px] ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}
                  >
                    {t('showingLatest', { total: formatFixed(safetyIncidents.length, 0) })}
                  </div>
                )}
                {safetyIncidents.length > 0 &&
                  (confirmingClear ? (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        ref={confirmRef}
                        onClick={handleClearClick}
                        className={`flex-1 text-[10px] font-medium transition-colors py-1 rounded ${
                          theme === 'light'
                            ? 'text-red-600 bg-red-100 hover:bg-red-200'
                            : 'text-red-400 bg-red-500/20 hover:bg-red-500/30'
                        }`}
                      >
                        {t('confirmClear')}
                      </button>
                      <button
                        onClick={() => {
                          setConfirmingClear(false);
                          focusNext.current = clearRef;
                        }}
                        className={`flex-1 text-[10px] transition-colors py-1 rounded ${
                          theme === 'light'
                            ? 'text-slate-600 bg-slate-100 hover:bg-slate-200'
                            : 'text-slate-300 bg-slate-500/20 hover:bg-slate-500/30'
                        }`}
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      ref={clearRef}
                      onClick={handleClearClick}
                      className={`w-full text-[10px] transition-colors py-1 ${
                        theme === 'light'
                          ? 'text-slate-400 hover:text-red-500'
                          : 'text-slate-500 hover:text-red-400'
                      }`}
                    >
                      {t('clearHistory')}
                    </button>
                  ))}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
