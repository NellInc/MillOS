import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { Keyboard, X } from 'lucide-react';
import { useUIStore } from '../../stores/uiStore';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useT } from '../../i18n';
import { keyboardShortcutsModalMessages } from './KeyboardShortcutsModal.messages';

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
  const t = useT(keyboardShortcutsModalMessages);

  if (!isOpen) return null;

  const shortcuts = [
    {
      category: t('categoryCamera'),
      items: [
        { key: 'W / ↑', description: t('moveForward') },
        { key: 'S / ↓', description: t('moveBackward') },
        { key: 'A / ←', description: t('strafeLeft') },
        { key: 'D / →', description: t('strafeRight') },
        { key: 'Q', description: t('moveDown') },
        { key: 'E', description: t('moveUp') },
        { key: t('keyDrag'), description: t('rotateCamera') },
        { key: t('keyScroll'), description: t('zoom') },
        { key: '1-7', description: t('cameraPresets') },
        { key: '0', description: t('resetCamera') },
        { key: 'V', description: t('firstPerson') },
        { key: 'Shift', description: t('sprint') },
      ],
    },
    {
      category: t('categoryControls'),
      items: [
        { key: 'P', description: t('pause') },
        { key: 'I', description: t('toggleAI') },
        { key: 'O', description: t('toggleSCADA') },
        { key: 'Z', description: t('toggleSafetyZones') },
        { key: 'H', description: t('toggleHeatMap') },
        { key: 'K', description: t('toggleCascade') },
        { key: 'J', description: t('toggleStrategic') },
        { key: 'T', description: t('toggleTarget') },
        { key: 'U', description: t('toggleEnergy') },
        { key: 'Y', description: t('toggleMultiObjective') },
        { key: '$', description: t('toggleCost') },
        { key: 'M', description: t('minimizePanel') },
        { key: 'F', description: t('toggleFullscreen') },
        { key: 'G', description: t('toggleMiniMap') },
        { key: 'C', description: t('toggleAutoRotate') },
        { key: 'Ctrl+B', description: t('blueprint') },
        { key: '+/-', description: t('speed') },
        { key: 'ESC', description: t('closePanels') },
        { key: t('keyClick'), description: t('select') },
      ],
    },
    {
      category: t('categoryGraphics'),
      items: [
        { key: 'F1', description: t('lowQuality') },
        { key: 'F2', description: t('mediumQuality') },
        { key: 'F3', description: t('highQuality') },
        { key: 'F4', description: t('ultraQuality') },
      ],
    },
    {
      category: t('categorySafety'),
      items: [{ key: t('keySpace'), description: t('forkliftStop') }],
    },
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
        onKeyDown={(event) => {
          if (event.key === '?') {
            event.preventDefault();
            onClose();
          }
        }}
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
              {t('title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
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
                  theme === 'light' ? 'text-slate-600' : 'text-slate-400'
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
          <p className={`text-[10px] ${theme === 'light' ? 'text-slate-600' : 'text-slate-400'}`}>
            {t('pressBefore')}{' '}
            <kbd
              className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                theme === 'light' ? 'bg-slate-200 text-slate-600' : 'bg-slate-700 text-slate-300'
              }`}
            >
              ?
            </kbd>{' '}
            {t('pressAfter')}
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
};
