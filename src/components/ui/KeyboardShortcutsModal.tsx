import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const theme = useUIStore((state) => state.theme);

  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, onClose);

  if (!isOpen) return null;

  const shortcuts = [
    {
      category: 'Camera Movement',
      items: [
        { key: 'W / ↑', description: 'Move forward' },
        { key: 'S / ↓', description: 'Move backward' },
        { key: 'A / ←', description: 'Strafe left' },
        { key: 'D / →', description: 'Strafe right' },
        { key: 'Q', description: 'Move down (orbit mode)' },
        { key: 'E', description: 'Move up (orbit mode)' },
        { key: 'Drag', description: 'Rotate camera' },
        { key: 'Scroll', description: 'Zoom in/out' },
        { key: '1-5', description: 'Camera presets' },
        { key: '0', description: 'Reset camera view' },
        { key: 'V', description: 'First-person mode' },
        { key: 'Shift', description: 'Sprint (FPS mode)' },
      ],
    },
    {
      category: 'Controls',
      items: [
        { key: 'P', description: 'Pause/Resume simulation' },
        { key: 'I', description: 'Toggle AI Command Center' },
        { key: 'O', description: 'Toggle SCADA panel' },
        { key: 'Z', description: 'Toggle safety zones' },
        { key: 'H', description: 'Toggle heat map' },
        { key: 'K', description: 'Toggle cascade visualization' },
        { key: 'J', description: 'Toggle strategic overlay' },
        { key: 'T', description: 'Toggle production target' },
        { key: 'U', description: 'Toggle energy dashboard' },
        { key: 'Y', description: 'Toggle multi-objective dashboard' },
        { key: '$', description: 'Toggle cost estimation overlay' },
        { key: 'M', description: 'Minimize/Expand panel' },
        { key: 'F', description: 'Toggle fullscreen' },
        { key: 'G', description: 'Toggle GPS mini-map' },
        { key: 'C', description: 'Toggle camera auto-rotation' },
        { key: 'Ctrl+B', description: 'Blueprint mode (see-through walls)' },
        { key: '+/-', description: 'Adjust production speed' },
        { key: 'ESC', description: 'Close panels' },
        { key: 'Click', description: 'Select machine/worker' },
      ],
    },
    {
      category: 'Graphics Quality',
      items: [
        { key: 'F1', description: 'Low quality' },
        { key: 'F2', description: 'Medium quality' },
        { key: 'F3', description: 'High quality' },
        { key: 'F4', description: 'Ultra quality' },
      ],
    },
    { category: 'Safety', items: [{ key: 'SPACE', description: 'Emergency Stop (toggle)' }] },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[1000] flex items-center justify-center pointer-events-auto"
      onClick={onClose}
    >
      <div
        className={`absolute inset-0 backdrop-blur-sm ${theme === 'light' ? 'bg-black/40' : 'bg-black/60'}`}
      />
      <motion.div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kbd-shortcuts-title"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className={`relative backdrop-blur-xl rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden ${
          theme === 'light'
            ? 'bg-white/95 border border-slate-200'
            : 'bg-slate-900/95 border border-slate-700/50'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-cyan-500" />
            <h2
              id="kbd-shortcuts-title"
              className={`text-lg font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}
            >
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close keyboard shortcuts"
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              theme === 'light'
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white'
            }`}
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3
                className={`text-[10px] font-bold uppercase tracking-wider mb-2 ${
                  theme === 'light' ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {section.category}
              </h3>
              <div className="space-y-1">
                {section.items.map((item) => (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between py-1.5 px-2 rounded-lg ${
                      theme === 'light' ? 'bg-slate-100' : 'bg-slate-800/50'
                    }`}
                  >
                    <span
                      className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-slate-300'}`}
                    >
                      {item.description}
                    </span>
                    <kbd
                      className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded border ${
                        theme === 'light'
                          ? 'bg-white text-slate-700 border-slate-300'
                          : 'bg-slate-700 text-slate-200 border-slate-600'
                      }`}
                    >
                      {item.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div
          className={`p-3 border-t text-center ${
            theme === 'light' ? 'border-slate-200' : 'border-slate-700/50'
          }`}
        >
          <p className={`text-[10px] ${theme === 'light' ? 'text-slate-400' : 'text-slate-500'}`}>
            Press{' '}
            <kbd
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'
              }`}
            >
              ?
            </kbd>{' '}
            to toggle this panel
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};
