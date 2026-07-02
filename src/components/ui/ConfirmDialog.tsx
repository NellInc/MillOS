import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Colour accent for the icon + confirm button. Use 'red' for destructive actions. */
  tone?: 'amber' | 'red';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Styled, accessible confirmation dialog — a themed replacement for the native
 * window.confirm(). Follows the app modal pattern (see AboutModal): framer-motion
 * backdrop + panel, focus trap with Escape-to-close, role="dialog"/aria-modal.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'amber',
  onConfirm,
  onCancel,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  useFocusTrap(modalRef as React.RefObject<HTMLElement>, isOpen, onCancel);

  const toneStyles =
    tone === 'red'
      ? {
          icon: 'text-red-400',
          confirm: 'bg-red-600 hover:bg-red-500 text-white focus:ring-red-500',
        }
      : {
          icon: 'text-amber-400',
          confirm: 'bg-amber-600 hover:bg-amber-500 text-white focus:ring-amber-500',
        };

  // Render through a portal to document.body: SettingsPanel lives inside the
  // ContextSidebar, a framer-motion <aside> whose transform makes position:fixed
  // resolve against the sidebar instead of the viewport. The portal escapes that
  // containing block so the backdrop/dialog cover the whole screen and centre.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[1000] pointer-events-auto"
            onClick={onCancel}
            aria-hidden="true"
          />

          {/* Dialog */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1000] w-[calc(100%-2rem)] max-w-sm bg-slate-900 rounded-lg shadow-xl border border-slate-700 pointer-events-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`w-5 h-5 ${toneStyles.icon}`} aria-hidden="true" />
                <h2 id={titleId} className="text-lg font-semibold text-slate-200">
                  {title}
                </h2>
              </div>
              <button
                onClick={onCancel}
                aria-label="Close dialog"
                className="p-1 rounded text-slate-400 hover:bg-slate-500/20 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {/* Message */}
            <div className="p-4">
              <p className="text-sm text-slate-400">{message}</p>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 p-4 border-t border-slate-700">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-700 text-slate-200 hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 transition-colors ${toneStyles.confirm}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
