/**
 * LoadingScreen - Displays loading progress while 3D assets load
 *
 * Uses drei's useProgress hook to track asset loading state
 * and shows an animated overlay until the scene is ready.
 */

import React, { useState, useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import { AnimatePresence, motion } from 'framer-motion';

interface LoadingScreenProps {
  /** Minimum time to show loading screen (prevents flash) */
  minimumLoadTimeMs?: number;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  minimumLoadTimeMs = 3000, // 3 seconds to match user preference
}) => {
  const { progress, active } = useProgress();
  const [showLoading, setShowLoading] = useState(true);
  const [minimumTimePassed, setMinimumTimePassed] = useState(false);

  // Minimum load time to prevent flash
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinimumTimePassed(true);
    }, minimumLoadTimeMs);
    return () => clearTimeout(timer);
  }, [minimumLoadTimeMs]);

  // Hide loading screen when assets are loaded AND minimum time has passed
  useEffect(() => {
    if (!active && minimumTimePassed && progress === 100) {
      // Small delay for final render to complete
      const hideTimer = setTimeout(() => {
        setShowLoading(false);
      }, 300);
      return () => clearTimeout(hideTimer);
    }
  }, [active, minimumTimePassed, progress]);

  return (
    <AnimatePresence>
      {showLoading && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
          style={{ backgroundColor: '#0a0f1a' }}
          aria-label="Loading"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          {/* Mill logo - scaled to match HTML visual appearance */}
          <div style={{ fontSize: '60px', marginBottom: '16px' }}>🏭</div>

          {/* Title - scaled to match HTML visual appearance */}
          <div
            style={{
              color: '#64748b',
              fontFamily: "'Inter', sans-serif",
              fontSize: '18px',
              letterSpacing: '0.1em',
            }}
          >
            INITIALIZING DIGITAL TWIN
          </div>

          {/* Progress bar - 200px width, 24px margin as requested */}
          <div
            style={{
              width: '200px',
              height: '2px',
              background: '#1e293b',
              marginTop: '24px',
              borderRadius: '1px',
              overflow: 'hidden',
            }}
          >
            {/* Sliding bar - matches HTML @keyframes loading exactly */}
            <motion.div
              style={{
                width: '50%',
                height: '100%',
                background: 'linear-gradient(90deg, #f97316, #3b82f6)',
              }}
              animate={{
                x: ['-100%', '300%'],
              }}
              transition={{
                duration: 1.5,
                ease: 'easeInOut',
                repeat: Infinity,
              }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default LoadingScreen;
