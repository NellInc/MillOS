import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, ExternalLink } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import pkg from '../../package.json';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, theme }) => {
  const bgClass = theme === 'light' ? 'bg-white' : 'bg-slate-900';
  const textClass = theme === 'light' ? 'text-slate-800' : 'text-slate-200';
  const mutedClass = theme === 'light' ? 'text-slate-500' : 'text-slate-400';
  const borderClass = theme === 'light' ? 'border-slate-200' : 'border-slate-700';

  const modalRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, onClose);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[1000] pointer-events-auto"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="about-modal-title"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-full max-w-md ${bgClass} rounded-lg shadow-xl border ${borderClass} pointer-events-auto`}
          >
            {/* Header */}
            <div className={`flex items-center justify-between p-4 border-b ${borderClass}`}>
              <div className="flex items-center gap-2">
                <Info className={`w-5 h-5 ${textClass}`} aria-hidden="true" />
                <h2 id="about-modal-title" className={`text-lg font-semibold ${textClass}`}>
                  About MillOS
                </h2>
              </div>
              <button
                onClick={onClose}
                aria-label="Close about dialog"
                className={`p-1 rounded hover:bg-slate-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${mutedClass}`}
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Content */}
            <div className={`p-4 space-y-4 ${textClass}`}>
              <p className={mutedClass}>
                MillOS is an AI-powered grain mill digital twin simulator featuring 3D visualization
                of factory operations.
              </p>

              {/* Music Credits */}
              <div>
                <h3 className="font-medium mb-2">Music</h3>
                <ul className={`text-sm space-y-2 ${mutedClass}`}>
                  <li className="flex items-start gap-2">
                    <span>
                      Music by{' '}
                      <a
                        href="https://incompetech.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                      >
                        Kevin MacLeod <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>{' '}
                      (CC BY 4.0)
                    </span>
                  </li>
                </ul>
              </div>

              {/* 3D Model Credits */}
              <div>
                <h3 className="font-medium mb-2">3D Model Credits</h3>
                <ul className={`text-sm space-y-2 ${mutedClass}`}>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">Forklift:</span>
                    <span>
                      by KolosStudios via{' '}
                      <a
                        href="https://poly.pizza/m/DTQBuenKJY"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                      >
                        Poly.pizza <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>{' '}
                      (CC-BY 3.0)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">Characters:</span>
                    <span>
                      <a
                        href="https://kenney.nl/assets/blocky-characters"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                      >
                        Kenney Blocky Characters{' '}
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>{' '}
                      (CC0)
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="shrink-0">Industrial:</span>
                    <span>
                      <a
                        href="https://kenney.nl/assets/city-kit-industrial"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                      >
                        Kenney City Kit Industrial{' '}
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>{' '}
                      (CC0)
                    </span>
                  </li>
                </ul>
              </div>

              {/* Version */}
              <div className={`text-xs ${mutedClass} pt-2 border-t ${borderClass}`}>
                <p>Version {pkg.version}</p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
