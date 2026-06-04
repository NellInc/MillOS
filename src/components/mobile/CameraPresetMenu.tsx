import React, { useState, useCallback } from 'react';
import { Camera, X, Eye, Factory, Wheat, Filter, Package, Truck, Warehouse } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCameraStore, CAMERA_PRESETS } from '../CameraController';

// Icons for each preset (matching their purpose)
const PRESET_ICONS = [
  Eye, // Overview
  Factory, // Silos
  Wheat, // Milling
  Filter, // Sifting
  Package, // Packing
  Truck, // Shipping
  Warehouse, // Receiving
];

/**
 * Compact pop-out camera preset menu for mobile.
 * Shows a small camera button that expands to show preset options.
 */
export const CameraPresetMenu: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const setPreset = useCameraStore((s) => s.setPreset);
  const activePreset = useCameraStore((s) => s.activePreset);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(15);
    }
  }, []);

  const handleSelectPreset = useCallback(
    (index: number) => {
      setPreset(index);
      setIsOpen(false);
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    },
    [setPreset]
  );

  return (
    <div
      className="pointer-events-auto"
      style={{
        marginTop: 'max(8px, env(safe-area-inset-top))',
        marginRight: 'max(8px, env(safe-area-inset-right))',
      }}
    >
      {/* Main camera button */}
      <button
        type="button"
        onClick={handleToggle}
        className={`
          w-11 h-11 rounded-full
          flex items-center justify-center
          transition-all duration-200
          touch-none select-none
          backdrop-blur-sm
          ${
            isOpen
              ? 'bg-cyan-500/80 border-cyan-400 rotate-0'
              : 'bg-slate-800/70 border-slate-600/50 hover:bg-slate-700/70'
          }
          border-2
        `}
        aria-label={isOpen ? 'Close camera menu' : 'Open camera menu'}
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <X className="w-5 h-5 text-white" />
        ) : (
          <Camera className="w-5 h-5 text-cyan-400" />
        )}
      </button>

      {/* Pop-out preset menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-14 bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl overflow-hidden min-w-[140px]"
          >
            {/* Header */}
            <div className="px-3 py-2 border-b border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                Camera View
              </span>
            </div>

            {/* Preset buttons */}
            <div className="p-1.5 space-y-0.5">
              {CAMERA_PRESETS.map((preset, index) => {
                const Icon = PRESET_ICONS[index] || Eye;
                const isActive = activePreset === index;

                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPreset(index)}
                    className={`
                      w-full flex items-center gap-2 px-2.5 py-2 rounded-lg
                      transition-colors touch-none
                      ${
                        isActive
                          ? 'bg-cyan-600/30 text-cyan-400'
                          : 'text-slate-300 hover:bg-slate-800 active:bg-slate-700'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    <div className="flex-1 text-left">
                      <div className="text-xs font-medium">{preset.name}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
