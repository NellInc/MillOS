/**
 * ConceptTooltip - Educational Tooltip Component
 *
 * A reusable tooltip component that shows educational content about
 * Bilateral Autonomy System concepts.
 *
 * Features:
 * - Hover to see short description
 * - Click to expand full explanation
 * - Navigate to related concepts
 * - Smooth Framer Motion animations
 * - Consistent dark theme styling
 */

import React, { useState, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Info,
  X,
  ExternalLink,
  BookOpen,
  Lightbulb,
  Scale,
  Users,
  Heart,
  Compass,
  ChevronRight,
} from 'lucide-react';
import {
  getConcept,
  getRelatedConcepts,
  type ConceptTooltipContent,
  type ConceptCategory,
} from '../../../systems/bas/educationalContent';

// =============================================================================
// TYPES
// =============================================================================

interface ConceptTooltipProps {
  /** The concept ID to display (from educationalContent.ts) */
  conceptId: string;
  /** Optional custom trigger element. Default is an info icon. */
  children?: React.ReactNode;
  /** Position of the tooltip relative to trigger */
  position?: 'top' | 'bottom' | 'left' | 'right';
  /** Additional CSS classes for the trigger */
  className?: string;
  /** Callback when a related concept is clicked */
  onNavigate?: (conceptId: string) => void;
  /** Whether to show the full explanation by default */
  defaultExpanded?: boolean;
}

// =============================================================================
// CATEGORY ICONS & COLORS
// =============================================================================

const CATEGORY_CONFIG: Record<
  ConceptCategory,
  { icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  wallace: { icon: Scale, color: 'green', label: 'Wallace Stability' },
  mondragon: { icon: Users, color: 'cyan', label: 'Mondragon Principles' },
  semler: { icon: Lightbulb, color: 'amber', label: 'Semler Practices' },
  bilateral: { icon: Heart, color: 'pink', label: 'Bilateral Alignment' },
  flourishing: { icon: Compass, color: 'purple', label: 'Flourishing' },
  bams: { icon: BookOpen, color: 'violet', label: 'BAMS System' },
};

// =============================================================================
// TOOLTIP CONTENT COMPONENT
// =============================================================================

interface TooltipContentProps {
  concept: ConceptTooltipContent;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onClose: () => void;
  onNavigate?: (conceptId: string) => void;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TooltipContent: React.FC<TooltipContentProps> = memo(
  ({ concept, isExpanded, onToggleExpand, onClose, onNavigate, position }) => {
    const categoryConfig = CATEGORY_CONFIG[concept.category];
    const CategoryIcon = categoryConfig.icon;
    const relatedConcepts = getRelatedConcepts(concept.id);

    // Position-based animation variants
    const getPositionStyles = () => {
      switch (position) {
        case 'top':
          return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
        case 'bottom':
          return 'top-full left-1/2 -translate-x-1/2 mt-2';
        case 'left':
          return 'right-full top-1/2 -translate-y-1/2 mr-2';
        case 'right':
          return 'left-full top-1/2 -translate-y-1/2 ml-2';
        default:
          return 'bottom-full left-1/2 -translate-x-1/2 mb-2';
      }
    };

    const getAnimationOrigin = () => {
      switch (position) {
        case 'top':
          return { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };
        case 'bottom':
          return { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 } };
        case 'left':
          return { initial: { opacity: 0, x: 10 }, animate: { opacity: 1, x: 0 } };
        case 'right':
          return { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 } };
        default:
          return { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 } };
      }
    };

    const animation = getAnimationOrigin();

    return (
      <motion.div
        initial={animation.initial}
        animate={animation.animate}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
        className={`absolute ${getPositionStyles()} z-50 w-80 max-w-[90vw]`}
        id={`tooltip-${concept.id}`}
        role="tooltip"
        aria-label={`Information about ${concept.title}`}
      >
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-xl overflow-hidden">
          {/* Header */}
          <div className={`p-3 border-b border-slate-700/50 bg-${categoryConfig.color}-500/10`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <CategoryIcon
                  className={`w-4 h-4 text-${categoryConfig.color}-400 flex-shrink-0`}
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate">{concept.title}</h4>
                  <span className={`text-[9px] text-${categoryConfig.color}-400`}>
                    {categoryConfig.label}
                  </span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-slate-700/50 transition-colors flex-shrink-0"
                aria-label="Close tooltip"
              >
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Short Description (always visible) */}
          <div className="p-3 border-b border-slate-700/30">
            <p className="text-[11px] text-slate-300 leading-relaxed">{concept.shortDescription}</p>
          </div>

          {/* Expand/Collapse Button */}
          <button
            onClick={onToggleExpand}
            className="w-full px-3 py-2 flex items-center justify-between text-[10px] text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
            aria-expanded={isExpanded}
            aria-controls={`concept-details-${concept.id}`}
          >
            <span>{isExpanded ? 'Show less' : 'Learn more'}</span>
            <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronRight className="w-3 h-3" />
            </motion.span>
          </button>

          {/* Expanded Content */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                id={`concept-details-${concept.id}`}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="p-3 border-t border-slate-700/30 bg-slate-800/30">
                  {/* Full Explanation */}
                  <div className="text-[10px] text-slate-400 leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto pr-1">
                    {concept.fullExplanation}
                  </div>

                  {/* Source */}
                  {concept.source && (
                    <div className="mt-3 pt-2 border-t border-slate-700/30">
                      <div className="flex items-center gap-1 text-[9px] text-slate-500">
                        <ExternalLink className="w-2.5 h-2.5" />
                        <span className="italic">{concept.source}</span>
                      </div>
                    </div>
                  )}

                  {/* Related Concepts */}
                  {relatedConcepts.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-700/30">
                      <div className="text-[9px] text-slate-500 mb-1.5">Related concepts:</div>
                      <div className="flex flex-wrap gap-1">
                        {relatedConcepts.slice(0, 4).map((related) => (
                          <button
                            key={related.id}
                            onClick={() => onNavigate?.(related.id)}
                            className={`text-[9px] px-2 py-0.5 rounded bg-${CATEGORY_CONFIG[related.category].color}-500/20 text-${CATEGORY_CONFIG[related.category].color}-300 hover:bg-${CATEGORY_CONFIG[related.category].color}-500/30 transition-colors`}
                          >
                            {related.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }
);

TooltipContent.displayName = 'TooltipContent';

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const ConceptTooltip: React.FC<ConceptTooltipProps> = memo(
  ({
    conceptId,
    children,
    position = 'top',
    className = '',
    onNavigate,
    defaultExpanded = false,
  }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const [isPinned, setIsPinned] = useState(false);
    const triggerRef = useRef<HTMLSpanElement>(null);
    const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const concept = getConcept(conceptId);

    // Handle mouse enter with delay for smoother UX
    const handleMouseEnter = useCallback(() => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      setIsVisible(true);
    }, []);

    // Handle mouse leave with delay
    const handleMouseLeave = useCallback(() => {
      if (!isPinned) {
        hideTimeoutRef.current = setTimeout(() => {
          setIsVisible(false);
          setIsExpanded(defaultExpanded);
        }, 150);
      }
    }, [isPinned, defaultExpanded]);

    // Handle click to pin/expand
    const handleClick = useCallback(() => {
      if (!isVisible) {
        setIsVisible(true);
        setIsPinned(true);
      } else if (!isPinned) {
        setIsPinned(true);
      } else {
        setIsExpanded(!isExpanded);
      }
    }, [isVisible, isPinned, isExpanded]);

    // Close tooltip
    const handleClose = useCallback(() => {
      setIsVisible(false);
      setIsPinned(false);
      setIsExpanded(defaultExpanded);
    }, [defaultExpanded]);

    // Toggle expansion
    const handleToggleExpand = useCallback(() => {
      setIsExpanded(!isExpanded);
      if (!isPinned) {
        setIsPinned(true);
      }
    }, [isExpanded, isPinned]);

    // Navigate to related concept
    const handleNavigate = useCallback(
      (targetConceptId: string) => {
        if (onNavigate) {
          onNavigate(targetConceptId);
        }
      },
      [onNavigate]
    );

    // If concept not found, don't render
    if (!concept) {
      return null;
    }

    const categoryConfig = CATEGORY_CONFIG[concept.category];

    return (
      <span className={`relative inline-flex ${className}`}>
        <span
          ref={triggerRef}
          role="button"
          tabIndex={0}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleClick();
            } else if (e.key === 'Escape' && isVisible) {
              e.preventDefault();
              handleClose();
            }
          }}
          onFocus={handleMouseEnter}
          onBlur={handleMouseLeave}
          className="inline-flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-cyan-500 rounded-full cursor-help"
          aria-describedby={isVisible ? `tooltip-${concept.id}` : undefined}
          aria-label={`Learn about ${concept.title}`}
        >
          {children || (
            <Info
              className={`w-3.5 h-3.5 text-${categoryConfig.color}-400 hover:text-${categoryConfig.color}-300 transition-colors`}
            />
          )}
        </span>

        <AnimatePresence>
          {isVisible && (
            <TooltipContent
              concept={concept}
              isExpanded={isExpanded}
              onToggleExpand={handleToggleExpand}
              onClose={handleClose}
              onNavigate={handleNavigate}
              position={position}
            />
          )}
        </AnimatePresence>
      </span>
    );
  }
);

ConceptTooltip.displayName = 'ConceptTooltip';

// =============================================================================
// INLINE CONCEPT LINK
// =============================================================================

interface ConceptLinkProps {
  conceptId: string;
  children: React.ReactNode;
  className?: string;
  onNavigate?: (conceptId: string) => void;
}

/**
 * InlineConceptLink - A text link that shows concept tooltip on hover
 * Use this for inline educational content within text.
 */
export const InlineConceptLink: React.FC<ConceptLinkProps> = memo(
  ({ conceptId, children, className = '', onNavigate }) => {
    const concept = getConcept(conceptId);

    if (!concept) {
      return <span className={className}>{children}</span>;
    }

    const categoryConfig = CATEGORY_CONFIG[concept.category];

    return (
      <ConceptTooltip conceptId={conceptId} position="bottom" onNavigate={onNavigate}>
        <span
          className={`border-b border-dashed border-${categoryConfig.color}-400/50 text-${categoryConfig.color}-400 hover:text-${categoryConfig.color}-300 cursor-help transition-colors ${className}`}
        >
          {children}
        </span>
      </ConceptTooltip>
    );
  }
);

InlineConceptLink.displayName = 'InlineConceptLink';

// =============================================================================
// EXPORTS
// =============================================================================

export default ConceptTooltip;
