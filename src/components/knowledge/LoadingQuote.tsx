/**
 * LoadingQuote - a rotating one-line milling fact on the slow-load cover
 *
 * D14: it showed invented slogans; it shows LOADING_FACTS, each from a source
 * in millingSources.ts, with the body that published it. The component name
 * and the persisted showLoadingQuotes switch are kept so saves and imports hold.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote } from 'lucide-react';
import {
  getRandomLoadingFact,
  KnowledgeQuote,
  LoadingFact,
  useKnowledgeStore,
} from '../../stores/knowledgeStore';

interface LoadingQuoteProps {
  /** How often to rotate facts (ms). Default 8000 */
  rotationInterval?: number;
  /** Additional CSS classes */
  className?: string;
}

export function LoadingQuote({ rotationInterval = 8000, className = '' }: LoadingQuoteProps) {
  const [fact, setFact] = useState<LoadingFact>(getRandomLoadingFact);
  const { showLoadingQuotes } = useKnowledgeStore();

  useEffect(() => {
    if (!showLoadingQuotes) return;

    const interval = setInterval(() => {
      // Re-draw a repeat: the motion key is the text, so the same fact twice
      // shows no transition and the rotation looks stalled.
      setFact((prev) => {
        let next = getRandomLoadingFact();
        for (let i = 0; next.text === prev.text && i < 4; i++) next = getRandomLoadingFact();
        return next;
      });
    }, rotationInterval);

    return () => clearInterval(interval);
  }, [rotationInterval, showLoadingQuotes]);

  if (!showLoadingQuotes) {
    return null;
  }

  // initial={false}: the first fact mounts with the slow-load recovery
  // controls, so a fade-in would be what that state is read and scanned at
  // (0.46 opacity measured 3.57:1). It appears at its resting colours; only
  // rotations crossfade. A fact is not a quotation: no marks, no italics.
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={fact.text}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
        className={`text-center ${className}`}
      >
        <p className="text-base text-slate-300 mb-2 max-w-lg mx-auto">{fact.text}</p>
        {/* slate-400: slate-500 measured 4.02:1 on the loading backdrop (WCAG AA needs 4.5). */}
        <p className="text-sm text-slate-400">{fact.publisher}</p>
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * Static quote display for specific quotes
 */
interface StaticQuoteProps {
  quote: KnowledgeQuote;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StaticQuote({ quote, size = 'md', className = '' }: StaticQuoteProps) {
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
  };

  return (
    <div className={`${className}`}>
      <Quote className="w-5 h-5 text-amber-500/50 mb-2" />
      <p className={`text-slate-300 italic mb-1 ${sizeClasses[size]}`}>"{quote.text}"</p>
      <p className="text-sm text-slate-400">— {quote.author}</p>
    </div>
  );
}
