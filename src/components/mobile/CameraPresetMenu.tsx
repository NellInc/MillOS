import React, { useState, useCallback, useEffect, useRef, useId } from 'react';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);
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
      closeMenu();
      // Haptic feedback
      if (navigator.vibrate) {
        navigator.vibrate(10);
      }
    },
    [setPreset, closeMenu]
  );

  // Dismiss on Escape (keyboard/desktop completeness)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closeMenu]);

  return (
    <div
      className="pointer-events-auto relative z-10"
      style={{
        marginTop: 'max(8px, env(safe-area-inset-top))',
        marginRight: 'max(8px, env(safe-area-inset-right))',
      }}
    >
      {/* Outside-tap backdrop: dismisses the menu when tapping elsewhere.
          Sits below the button/menu (z-0) so it catches taps outside only. */}
      {isOpen && (
        <div
          className="fixed inset-0 z-0 pointer-events-auto"
          onClick={closeMenu}
          aria-hidden="true"
        />
      )}

      {/* Main camera button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        className={`
          relative z-10
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
        aria-controls={isOpen ? menuId : undefined}
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
            id={menuId}
            role="group"
            aria-label="Camera views"
            style={{
              // Preserve both the top trigger and bottom navigation in short
              // landscape viewports; the options scroll within this envelope.
              maxHeight:
                'calc(100dvh - 12rem - max(8px, env(safe-area-inset-top)) - env(safe-area-inset-bottom))',
            }}
            className="absolute right-0 top-14 z-10 flex flex-col bg-slate-900/95 backdrop-blur-xl rounded-xl border border-slate-700/50 shadow-2xl overflow-hidden min-w-[140px]"
          >
            {/* Header */}
            <div className="shrink-0 px-3 py-2 border-b border-slate-700/50">
              <span className="text-[10px] text-slate-400 uppercase tracking-wider">
                Camera View
              </span>
            </div>

            {/* Preset buttons */}
            <div className="min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-1.5 space-y-0.5">
              {CAMERA_PRESETS.map((preset, index) => {
                const Icon = PRESET_ICONS[index] || Eye;
                const isActive = activePreset === index;

                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPreset(index)}
                    aria-pressed={isActive}
                    className={`
                      w-full min-h-11 flex items-center gap-2 px-2.5 py-2 rounded-lg
                      transition-colors touch-pan-y
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
