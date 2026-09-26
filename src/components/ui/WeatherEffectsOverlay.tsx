/**
 * WeatherEffectsOverlay Component
 *
 * 2D visual overlay that shows weather effects when storm warnings are active.
 * This is a STANDALONE component that does NOT modify SkySystem.
 * It uses CSS and DOM elements for effects.
 */

import React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CloudRain, CloudLightning, Wind, Snowflake } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { useUIStore } from '../../stores';

type WeatherType = 'storm' | 'rain' | 'wind' | 'snow' | 'clear';

const seededUnit = (seed: number): number => {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
};

const RAIN_DROPS = Array.from({ length: 50 }, (_, index) => ({
  left: `${seededUnit(index * 4 + 1) * 100}%`,
  height: `${20 + seededUnit(index * 4 + 2) * 30}px`,
  duration: 0.8 + seededUnit(index * 4 + 3) * 0.4,
  delay: seededUnit(index * 4 + 4) * 2,
}));

const LIGHTNING_REPEAT_DELAY = seededUnit(211) * 5;

// Whole-word matching only: substring tests read 'Raw Grain Inventory' as rain
// and the 'Service Windows' achievement as wind.
const WEATHER_RE = /\b(storm|storms|rain|rainfall|wind|winds|snow|weather)\b/i;
const RAIN_RE = /\brain(fall)?\b/i;
const WIND_RE = /\bwinds?\b/i;
const SNOW_RE = /\bsnow\b/i;

export const WeatherEffectsOverlay: React.FC = () => {
  // Optimized selector: Derived state inside useStore + useShallow
  const weatherAlert = useUIStore(
    useShallow((state) => {
      // Find first weather-related alert
      const alert = state.alerts.find(
        (a) => !a.acknowledged && WEATHER_RE.test(`${a.title ?? ''} ${a.message ?? ''}`)
      );

      if (!alert) return null;

      // Determine weather type
      const text = `${alert.title ?? ''} ${alert.message ?? ''}`;
      let type: WeatherType = 'storm';
      if (RAIN_RE.test(text)) type = 'rain';
      else if (WIND_RE.test(text)) type = 'wind';
      else if (SNOW_RE.test(text)) type = 'snow';

      // Determine severity
      let severity: 'low' | 'medium' | 'high' = 'medium';
      if (alert.type === 'critical') severity = 'high';
      else if (alert.type === 'warning') severity = 'medium';
      else severity = 'low';

      return { type, severity };
    })
  );

  const reduceMotion = useReducedMotion();

  if (!weatherAlert) return null;

  const getWeatherIcon = () => {
    switch (weatherAlert.type) {
      case 'storm':
        return <CloudLightning className="w-8 h-8 text-amber-400" />;
      case 'rain':
        return <CloudRain className="w-8 h-8 text-blue-400" />;
      case 'wind':
        return <Wind className="w-8 h-8 text-cyan-400" />;
      case 'snow':
        return <Snowflake className="w-8 h-8 text-white" />;
      default:
        return <CloudRain className="w-8 h-8 text-slate-400" />;
    }
  };

  const getOverlayStyles = (): React.CSSProperties => {
    const baseOpacity =
      weatherAlert.severity === 'high' ? 0.15 : weatherAlert.severity === 'medium' ? 0.1 : 0.05;

    switch (weatherAlert.type) {
      case 'storm':
        return {
          background: `radial-gradient(ellipse at top, rgba(75, 85, 99, ${baseOpacity}) 0%, transparent 70%)`,
          boxShadow: 'inset 0 0 100px rgba(0,0,0,0.3)',
        };
      case 'rain':
        return {
          background: `linear-gradient(180deg, rgba(59, 130, 246, ${baseOpacity}) 0%, transparent 50%)`,
        };
      case 'wind':
        return {
          background: `linear-gradient(90deg, rgba(6, 182, 212, ${baseOpacity * 0.5}) 0%, transparent 30%, transparent 70%, rgba(6, 182, 212, ${baseOpacity * 0.5}) 100%)`,
        };
      case 'snow':
        return {
          background: `radial-gradient(ellipse at top, rgba(255, 255, 255, ${baseOpacity}) 0%, transparent 60%)`,
        };
      default:
        return {};
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 1 }}
        className="fixed inset-0 pointer-events-none z-30"
        style={getOverlayStyles()}
      >
        {/* Weather indicator badge */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-20 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-slate-900/80 backdrop-blur-sm rounded-full border border-slate-700/50"
        >
          {getWeatherIcon()}
          <div className="flex flex-col">
            <span className="text-xs font-medium text-white uppercase">
              {weatherAlert.type} Warning
            </span>
            <span
              className={`text-[10px] ${
                weatherAlert.severity === 'high'
                  ? 'text-red-400'
                  : weatherAlert.severity === 'medium'
                    ? 'text-amber-400'
                    : 'text-slate-400'
              }`}
            >
              Severity: {weatherAlert.severity}
            </span>
          </div>
        </motion.div>

        {/* Rain: transform-only so the drops stay on the compositor; skipped for reduced motion. */}
        {!reduceMotion && (weatherAlert.type === 'rain' || weatherAlert.type === 'storm') && (
          <div className="absolute inset-0 overflow-hidden">
            {RAIN_DROPS.slice(0, weatherAlert.severity === 'high' ? 50 : 25).map((drop, i) => (
              <motion.div
                key={i}
                className="absolute w-0.5 bg-gradient-to-b from-blue-400/30 to-transparent"
                style={{
                  left: drop.left,
                  height: drop.height,
                  top: 0,
                }}
                initial={{ y: '-5vh' }}
                animate={{ y: '105vh' }}
                transition={{
                  duration: drop.duration,
                  repeat: Infinity,
                  delay: drop.delay,
                  ease: 'linear',
                }}
              />
            ))}
          </div>
        )}

        {/* Lightning flash for storms */}
        {!reduceMotion && weatherAlert.type === 'storm' && weatherAlert.severity === 'high' && (
          <motion.div
            className="absolute inset-0 bg-white/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1, 0, 0, 0.5, 0, 0, 0, 0, 0, 0] }}
            transition={{
              duration: 5,
              repeat: Infinity,
              repeatDelay: LIGHTNING_REPEAT_DELAY,
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
