/**
 * WeatherEffectsOverlay Component
 *
 * 2D visual overlay that shows weather effects when storm warnings are active.
 * This is a STANDALONE component that does NOT modify SkySystem.
 * It uses CSS and DOM elements for effects.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CloudRain, CloudLightning, Wind, Snowflake } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

import { useUIStore } from '../../stores';

type WeatherType = 'storm' | 'rain' | 'wind' | 'snow' | 'clear';

export const WeatherEffectsOverlay: React.FC = () => {
  // Optimized selector: Derived state inside useStore + useShallow
  const weatherAlert = useUIStore(
    useShallow((state) => {
      // Find first weather-related alert
      const alert = state.alerts.find((a) => {
        const t = a.title?.toLowerCase() || '';
        const m = a.message?.toLowerCase() || '';
        const combined = t + ' ' + m;
        return (
          combined.includes('storm') ||
          combined.includes('weather') ||
          combined.includes('rain') ||
          combined.includes('wind') ||
          combined.includes('snow')
        );
      });

      if (!alert) return null;

      // Determine weather type
      const text = `${alert.title} ${alert.message}`.toLowerCase();
      let type: WeatherType = 'storm';
      if (text.includes('rain')) type = 'rain';
      else if (text.includes('wind')) type = 'wind';
      else if (text.includes('snow')) type = 'snow';

      // Determine severity
      let severity: 'low' | 'medium' | 'high' = 'medium';
      if (alert.type === 'critical') severity = 'high';
      else if (alert.type === 'warning') severity = 'medium';
      else severity = 'low';

      return { type, severity };
    })
  );

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

        {/* Rain effect - animated lines */}
        {(weatherAlert.type === 'rain' || weatherAlert.type === 'storm') && (
          <div className="absolute inset-0 overflow-hidden">
            {Array.from({ length: weatherAlert.severity === 'high' ? 50 : 25 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-0.5 bg-gradient-to-b from-blue-400/30 to-transparent"
                style={{
                  left: `${Math.random() * 100}%`,
                  height: `${20 + Math.random() * 30}px`,
                }}
                initial={{ top: '-5%' }}
                animate={{ top: '105%' }}
                transition={{
                  duration: 0.8 + Math.random() * 0.4,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                  ease: 'linear',
                }}
              />
            ))}
          </div>
        )}

        {/* Lightning flash for storms */}
        {weatherAlert.type === 'storm' && weatherAlert.severity === 'high' && (
          <motion.div
            className="absolute inset-0 bg-white/10"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1, 0, 0, 0.5, 0, 0, 0, 0, 0, 0] }}
            transition={{
              duration: 5,
              repeat: Infinity,
              repeatDelay: Math.random() * 5,
            }}
          />
        )}
      </motion.div>
    </AnimatePresence>
  );
};
