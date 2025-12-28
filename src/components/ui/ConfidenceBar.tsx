/**
 * ConfidenceBar Component
 *
 * Horizontal progress bar showing AI confidence levels.
 * Color-coded: green (80+), yellow (60-79), red (<60)
 */

import React from 'react';
import { motion } from 'framer-motion';

interface ConfidenceBarProps {
  confidence: number; // 0-100
  label?: string;
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ConfidenceBar: React.FC<ConfidenceBarProps> = ({
  confidence,
  label,
  showPercentage = true,
  size = 'md',
  className = '',
}) => {
  const clampedConfidence = Math.max(0, Math.min(100, confidence));

  // Color coding based on confidence level
  const getColor = () => {
    if (clampedConfidence >= 80) return { bg: 'bg-green-500', text: 'text-green-400' };
    if (clampedConfidence >= 60) return { bg: 'bg-amber-500', text: 'text-amber-400' };
    return { bg: 'bg-red-500', text: 'text-red-400' };
  };

  const colors = getColor();

  const heights = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div className={`${className}`}>
      {(label || showPercentage) && (
        <div className="flex items-center justify-between mb-1">
          {label && (
            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</span>
          )}
          {showPercentage && (
            <span className={`text-[10px] font-mono ${colors.text}`}>
              {clampedConfidence.toFixed(0)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full ${heights[size]} bg-slate-700/50 rounded-full overflow-hidden`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedConfidence}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className={`h-full ${colors.bg} rounded-full`}
        />
      </div>
    </div>
  );
};
