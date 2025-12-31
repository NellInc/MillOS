/**
 * LoadingQuote - Displays rotating wisdom quotes during loading screens
 *
 * Shows quotes from Semler, Arizmendiarrieta, Greenleaf, and bilateral alignment
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote } from 'lucide-react';
import {
  getRandomLoadingQuote,
  KnowledgeQuote,
  useKnowledgeStore,
} from '../../stores/knowledgeStore';

interface LoadingQuoteProps {
  /** How often to rotate quotes (ms). Default 8000 */
  rotationInterval?: number;
  /** Show the quote icon */
  showIcon?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function LoadingQuote({
  rotationInterval = 8000,
  showIcon = true,
  className = '',
}: LoadingQuoteProps) {
  const [quote, setQuote] = useState<KnowledgeQuote>(getRandomLoadingQuote);
  const { showLoadingQuotes } = useKnowledgeStore();

  useEffect(() => {
    if (!showLoadingQuotes) return;

    const interval = setInterval(() => {
      setQuote(getRandomLoadingQuote());
    }, rotationInterval);

    return () => clearInterval(interval);
  }, [rotationInterval, showLoadingQuotes]);

  if (!showLoadingQuotes) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={quote.text}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.5 }}
        className={`text-center ${className}`}
      >
        {showIcon && (
          <Quote className="w-6 h-6 text-amber-500/50 mx-auto mb-3" />
        )}
        <p className="text-lg text-slate-300 italic mb-2 max-w-lg mx-auto">
          "{quote.text}"
        </p>
        <p className="text-sm text-slate-500">— {quote.author}</p>
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
      <p className={`text-slate-300 italic mb-1 ${sizeClasses[size]}`}>
        "{quote.text}"
      </p>
      <p className="text-sm text-slate-500">— {quote.author}</p>
    </div>
  );
}
