import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Info, ExternalLink } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import pkg from '../../package.json';
import musicCredits from '../../music-credits.json';
import modelCredits from '../../model-credits.json';

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: 'dark' | 'light';
}

const currentMusic = musicCredits.tracks.filter((track) => track.currentRole !== null);
const modelLicenseUrls: Record<string, string> = {
  'CC-BY-4.0': 'https://creativecommons.org/licenses/by/4.0/',
  'CC0-1.0': 'https://creativecommons.org/publicdomain/zero/1.0/',
};

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose, theme }) => {
  const bgClass = theme === 'light' ? 'bg-white' : 'bg-slate-900';
  const textClass = theme === 'light' ? 'text-slate-800' : 'text-slate-200';
  const mutedClass = theme === 'light' ? 'text-slate-500' : 'text-slate-400';
  const borderClass = theme === 'light' ? 'border-slate-200' : 'border-slate-700';

  const modalRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const appRoot = document.getElementById('root');
    if (!appRoot) return;

    const previousAriaHidden = appRoot.getAttribute('aria-hidden');
    const wasInert = appRoot.hasAttribute('inert');
    appRoot.setAttribute('inert', '');
    appRoot.setAttribute('aria-hidden', 'true');

    return () => {
      if (!wasInert) appRoot.removeAttribute('inert');
      if (previousAriaHidden === null) {
        appRoot.removeAttribute('aria-hidden');
      } else {
        appRoot.setAttribute('aria-hidden', previousAriaHidden);
      }
    };
  }, [isOpen]);

  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, onClose);

  const modal = (
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
            className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-[calc(100%-2rem)] max-w-2xl max-h-[90vh] overflow-hidden ${bgClass} rounded-lg shadow-xl border ${borderClass} pointer-events-auto`}
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
            <div className={`p-4 space-y-4 overflow-y-auto max-h-[calc(90vh-4rem)] ${textClass}`}>
              <p className={mutedClass}>
                MillOS is an AI-powered grain mill digital twin simulator featuring 3D visualization
                of factory operations.
              </p>

              {/* Music Credits */}
              <div>
                <h3 className="font-medium mb-2">Music</h3>
                <p className={`text-sm mb-2 ${mutedClass}`}>
                  Current soundtrack from the{' '}
                  <a
                    href={musicCredits.sourceCatalog}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                  >
                    Incompetech catalog
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                  , licensed under{' '}
                  <a
                    href={musicCredits.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                  >
                    CC BY 4.0
                  </a>
                  .
                </p>
                <ul className={`text-sm space-y-1.5 ${mutedClass}`}>
                  {currentMusic.map((track) => (
                    <li key={track.id}>
                      <span className={textClass}>{track.title}</span>
                      <span> by {track.artist}</span>
                    </li>
                  ))}
                </ul>
                <a
                  href={`${import.meta.env.BASE_URL}MUSIC_CREDITS.txt`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 text-xs text-blue-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                >
                  Complete 26-track credits and ISRCs
                  <ExternalLink className="w-3 h-3" aria-hidden="true" />
                </a>
              </div>

              {/* 3D Model Credits */}
              <div>
                <h3 className="font-medium mb-2">3D Model Credits</h3>
                <ul className={`text-sm space-y-2 ${mutedClass}`}>
                  {modelCredits.assets.map((asset) => (
                    <li key={asset.id}>
                      <a
                        href={asset.source}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                      >
                        {asset.attribution}
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>{' '}
                      (
                      <a
                        href={modelLicenseUrls[asset.license]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline focus:outline-none focus:ring-2 focus:ring-cyan-500 rounded"
                      >
                        {asset.license}
                      </a>
                      )
                    </li>
                  ))}
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

  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
};
