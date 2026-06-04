import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, ChevronDown, ChevronUp } from 'lucide-react';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';
import { useProductionStore } from '../../stores/productionStore';
import { useUIStore } from '../../stores/uiStore';
import { useGraphicsStore } from '../../stores/graphicsStore';

export const WeatherControlPanel: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const weather = useGameSimulationStore((state) => state.weather);
  const setWeather = useGameSimulationStore((state) => state.setWeather);
  const showHeatMap = useProductionStore((state) => state.showHeatMap);
  const setShowHeatMap = useProductionStore((state) => state.setShowHeatMap);
  const clearHeatMap = useProductionStore((state) => state.clearHeatMap);
  const theme = useUIStore((state) => state.theme);
  const enableFloorPuddles = useGraphicsStore((state) => state.graphics.enableFloorPuddles);
  const setGraphicsSetting = useGraphicsStore((state) => state.setGraphicsSetting);

  const weatherOptions: Array<{
    value: 'clear' | 'cloudy' | 'rain' | 'storm';
    label: string;
  }> = [
    { value: 'clear', label: 'Clear' },
    { value: 'cloudy', label: 'Cloudy' },
    { value: 'rain', label: 'Rain' },
    { value: 'storm', label: 'Storm' },
  ];

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
          <Wind className="w-4 h-4 text-blue-400" aria-hidden="true" />
          Weather & Heat Map
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
            {/* Weather Control */}
            <div
              className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
            >
              <div
                className={`text-[10px] uppercase tracking-wider mb-2 ${
                  theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Weather
              </div>
              <div className="grid grid-cols-4 gap-1">
                {weatherOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setWeather(opt.value)}
                    aria-pressed={weather === opt.value}
                    aria-label={`${opt.label} weather`}
                    className={`py-1.5 px-2 rounded text-[10px] font-medium transition-all ${
                      weather === opt.value
                        ? 'bg-blue-600 text-white'
                        : theme === 'light'
                          ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Heat Map Toggle */}
            <div
              className={`rounded-lg p-2 ${theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div
                    className={`text-[10px] uppercase tracking-wider ${
                      theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    Floor Puddles
                  </div>
                  <p
                    className={`text-[9px] ${
                      theme === 'light' ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Enable wet-floor reflections during rain
                  </p>
                </div>
                <button
                  onClick={() => setGraphicsSetting('enableFloorPuddles', !enableFloorPuddles)}
                  aria-pressed={enableFloorPuddles}
                  aria-label="Floor puddles"
                  className={`py-1 px-3 rounded text-[10px] font-medium transition-all ${
                    enableFloorPuddles
                      ? 'bg-blue-600 text-white'
                      : theme === 'light'
                        ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  {enableFloorPuddles ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div
                    className={`text-[10px] uppercase tracking-wider ${
                      theme === 'light' ? 'text-slate-500' : 'text-slate-400'
                    }`}
                  >
                    Worker Heat Map
                  </div>
                  <p
                    className={`text-[9px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Shows high-traffic areas
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowHeatMap(!showHeatMap)}
                    aria-pressed={showHeatMap}
                    aria-label="Worker heat map"
                    className={`py-1 px-3 rounded text-[10px] font-medium transition-all ${
                      showHeatMap
                        ? 'bg-green-600 text-white'
                        : theme === 'light'
                          ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {showHeatMap ? 'ON' : 'OFF'}
                  </button>
                  <button
                    onClick={() => clearHeatMap()}
                    className={`py-1 px-2 rounded text-[10px] font-medium transition-all ${
                      theme === 'light'
                        ? 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
