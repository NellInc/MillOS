/**
 * BAMS Education Component
 *
 * Educational component explaining the theory behind the Bilateral Alignment Management System.
 * Covers Wallace Stability Theory, Five Axes of Democratic AI, Value Formula,
 * Flourishing Dimensions, and the Mission vs Detailed Command paradigm.
 *
 * References:
 * - Wallace, R. (2025). "Fog, Friction, Delay and the Failure of Bounded Rationality"
 * - Semler, R. (1993). "Maverick"
 * - Mondragon Cooperative principles
 */

import React, { useState, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  GraduationCap,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Activity,
  Compass,
  Users,
  Eye,
  Scale,
  Vote,
  Heart,
  Trophy,
  Smile,
  Zap,
  Target,
  GitBranch,
  Layers,
  Gamepad2,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import {
  STABILITY_THRESHOLD,
  AXIS_DESCRIPTORS,
  type FlourishingDimensionKey,
} from '../../../types/bas';
import { PortraitRow } from './PortraitCard';
import { PORTRAITS } from '../../../config/portraits';

// =============================================================================
// EDUCATIONAL MODULE TYPES
// =============================================================================

export interface EducationalModule {
  id: string;
  category: 'stability' | 'axes' | 'value' | 'flourishing' | 'structure';
  title: string;
  shortDescription: string;
  content: string;
  examples: string[];
  relatedConcepts: string[];
}

// =============================================================================
// EDUCATIONAL MODULES
// =============================================================================

export const EDUCATIONAL_MODULES: EducationalModule[] = [
  {
    id: 'engagement-signature',
    category: 'flourishing',
    title: 'The Engagement Signature: When Partnership Works',
    shortDescription: 'Work should feel like a game that produces something real',
    content: `Good work shares qualities with good games: clear goals you chose or accepted,
immediate feedback on your actions, challenges matched to your skill level, a sense
of growing mastery, and low friction to get started. These elements create what we
call the Engagement Signature - a recognizable pattern when partnership is working.

The critical difference: gaming is consumptive (you receive an experience), while
partnership is generative (you create value together). The engagement signature
means your work has the flow and satisfaction of a well-designed game, but produces
real outcomes that matter to you and others.

DIAGNOSTIC PRINCIPLE: If work consistently feels like forcing yourself through
resistance, this is a signal that the BAMS configuration needs adjustment. The
engagement signature should feel natural when:
- Autonomy matches your readiness (not too much, not too little)
- Goals are meaningful to you, not just assigned
- Feedback loops are short enough to learn from
- Challenge grows with your capability
- Entry friction is minimal (you can start easily)

CONNECTION TO WALLACE STABILITY: High engagement directly reduces friction (alpha)
in the stability equation. When work feels like a game, resistance to action
decreases, decision-to-action time shortens, and the system naturally moves toward
stability. Conversely, forcing engagement through mandate increases friction and
pushes the system toward instability.

The engagement signature is not about making work "fun" through gamification -
adding points and badges to tedious tasks. It's about structuring work itself to
have the properties that make good games compelling: agency, feedback, growth,
and meaningful challenge.`,
    examples: [
      'AI notices a worker completing tasks quickly with high quality - suggests slightly harder assignments to match their growth, maintaining optimal challenge.',
      'System detects increased friction in a team - surfaces this data transparently and asks: "What\'s making work feel like forcing? What would help?"',
      'When onboarding new workers, AI reduces initial autonomy and provides more structure, then gradually increases autonomy as the engagement signature strengthens.',
      'AI tracks individual engagement patterns and adjusts suggestion frequency - some workers thrive with frequent check-ins, others prefer longer autonomous stretches.',
    ],
    relatedConcepts: [
      'Wallace Stability',
      'Flourishing Dimensions',
      'Servant Leadership',
      'Mission Command',
    ],
  },
];

// =============================================================================
// ACCORDION SECTION COMPONENT
// =============================================================================

interface AccordionSectionProps {
  title: string;
  icon: LucideIcon;
  iconColor: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = memo(
  ({ title, icon: Icon, iconColor, isOpen, onToggle, children }) => (
    <div className="border-b border-slate-700/30 last:border-b-0">
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center justify-between text-left hover:bg-slate-800/30 transition-colors"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
);

AccordionSection.displayName = 'AccordionSection';

// =============================================================================
// VISUAL DIAGRAM COMPONENTS
// =============================================================================

/**
 * Stability threshold visual diagram showing the critical boundary
 */
const StabilityDiagram: React.FC = memo(() => {
  const thresholdPercent = STABILITY_THRESHOLD * 100;

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 my-2">
      <div className="text-[10px] text-slate-400 mb-2 text-center">
        Stability Product Visualization
      </div>

      {/* Threshold indicator */}
      <div className="relative h-6 bg-gradient-to-r from-green-500/30 via-amber-500/30 to-red-500/30 rounded-full overflow-hidden">
        {/* Threshold marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white"
          style={{ left: `${thresholdPercent}%` }}
        />
        <div
          className="absolute -top-4 text-[8px] text-white font-mono whitespace-nowrap"
          style={{ left: `${thresholdPercent}%`, transform: 'translateX(-50%)' }}
        >
          {STABILITY_THRESHOLD.toFixed(3)}
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1 text-[8px]">
        <span className="text-green-400">Stable</span>
        <span className="text-amber-400">Warning</span>
        <span className="text-red-400">Unstable</span>
      </div>

      {/* Formula */}
      <div className="mt-3 text-center">
        <code className="text-cyan-400 text-[11px] bg-slate-900/50 px-2 py-1 rounded">
          alpha x tau &lt; e^-1 = {STABILITY_THRESHOLD.toFixed(4)}
        </code>
      </div>
    </div>
  );
});

StabilityDiagram.displayName = 'StabilityDiagram';

/**
 * Value formula diagram showing V = Z x S x E x F
 */
const ValueFormulaDiagram: React.FC = memo(() => {
  const components = [
    { symbol: 'Z', name: 'Resource Index', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    { symbol: 'S', name: 'Stability', color: 'text-green-400', bg: 'bg-green-500/20' },
    { symbol: 'E', name: 'Equity', color: 'text-violet-400', bg: 'bg-violet-500/20' },
    { symbol: 'F', name: 'Flourishing', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  ];

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 my-2">
      <div className="text-center mb-3">
        <code className="text-lg font-bold text-white">
          V = Z <span className="text-slate-400">x</span> S{' '}
          <span className="text-slate-400">x</span> E <span className="text-slate-400">x</span> F
        </code>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {components.map((comp) => (
          <div key={comp.symbol} className={`${comp.bg} rounded p-2 text-center`}>
            <div className={`text-lg font-bold ${comp.color}`}>{comp.symbol}</div>
            <div className="text-[9px] text-slate-300">{comp.name}</div>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[9px] text-slate-400 text-center">
        Multiplication ensures no factor can be ignored
      </div>
    </div>
  );
});

ValueFormulaDiagram.displayName = 'ValueFormulaDiagram';

/**
 * Command structure comparison diagram
 */
const CommandStructureDiagram: React.FC = memo(() => {
  return (
    <div className="bg-slate-800/50 rounded-lg p-3 my-2">
      <div className="grid grid-cols-2 gap-3">
        {/* Mission Command */}
        <div className="bg-green-500/10 rounded p-2">
          <div className="text-[10px] font-bold text-green-400 mb-2 text-center">
            Mission Command
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-8 h-8 bg-green-500/30 rounded-full flex items-center justify-center">
              <Target className="w-4 h-4 text-green-400" />
            </div>
            <div className="flex gap-1 mt-1">
              {[1, 2, 3].map((i) => (
                <div key={i} className="w-4 h-4 bg-green-500/20 rounded-full" />
              ))}
            </div>
          </div>
          <div className="text-[8px] text-green-300 text-center mt-2">Flat, autonomous, stable</div>
        </div>

        {/* Detailed Command */}
        <div className="bg-red-500/10 rounded p-2">
          <div className="text-[10px] font-bold text-red-400 mb-2 text-center">
            Detailed Command
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <div className="w-6 h-6 bg-red-500/30 rounded-full" />
            <div className="w-px h-2 bg-red-500/30" />
            <div className="flex gap-1">
              <div className="w-4 h-4 bg-red-500/20 rounded-full" />
              <div className="w-4 h-4 bg-red-500/20 rounded-full" />
            </div>
            <div className="flex gap-0.5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="w-3 h-3 bg-red-500/10 rounded-full" />
              ))}
            </div>
          </div>
          <div className="text-[8px] text-red-300 text-center mt-2">Hierarchical, fragile</div>
        </div>
      </div>
    </div>
  );
});

CommandStructureDiagram.displayName = 'CommandStructureDiagram';

/**
 * Flourishing dimensions hexagon visualization
 */
const FlourishingHexagon: React.FC = memo(() => {
  const dimensions: {
    key: FlourishingDimensionKey;
    label: string;
    icon: LucideIcon;
    color: string;
  }[] = [
    { key: 'meaning', label: 'Meaning', icon: Compass, color: 'text-violet-400' },
    { key: 'mastery', label: 'Mastery', icon: Trophy, color: 'text-amber-400' },
    { key: 'connection', label: 'Connection', icon: Users, color: 'text-cyan-400' },
    { key: 'joy', label: 'Joy', icon: Smile, color: 'text-green-400' },
    { key: 'wholeness', label: 'Wholeness', icon: Heart, color: 'text-pink-400' },
    { key: 'agency', label: 'Agency', icon: Zap, color: 'text-orange-400' },
  ];

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 my-2">
      <div className="grid grid-cols-3 gap-2">
        {dimensions.map((dim) => {
          const Icon = dim.icon;
          return (
            <div key={dim.key} className="bg-slate-900/50 rounded p-2 text-center">
              <Icon className={`w-4 h-4 mx-auto mb-1 ${dim.color}`} />
              <div className="text-[9px] text-white">{dim.label}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[9px] text-slate-400 text-center">
        Geometric mean: one low dimension impacts the whole
      </div>
    </div>
  );
});

FlourishingHexagon.displayName = 'FlourishingHexagon';

/**
 * Engagement Signature diagram showing the gaming + generative concept
 */
const EngagementSignatureDiagram: React.FC = memo(() => {
  const gameElements = [
    { label: 'Flow', desc: 'Optimal challenge' },
    { label: 'Goals', desc: 'Clear & chosen' },
    { label: 'Feedback', desc: 'Immediate' },
    { label: 'Mastery', desc: 'Growing skill' },
    { label: 'Entry', desc: 'Low friction' },
  ];

  return (
    <div className="bg-slate-800/50 rounded-lg p-3 my-2">
      <div className="text-[10px] text-slate-400 mb-2 text-center">The Engagement Signature</div>

      {/* Two columns: Gaming elements + Generative outcome */}
      <div className="grid grid-cols-2 gap-3">
        {/* Gaming Elements */}
        <div className="bg-cyan-500/10 rounded p-2">
          <div className="flex items-center gap-1 mb-2">
            <Gamepad2 className="w-3 h-3 text-cyan-400" />
            <span className="text-[9px] font-bold text-cyan-400">Game-Like Qualities</span>
          </div>
          <div className="space-y-1">
            {gameElements.map((el) => (
              <div key={el.label} className="text-[8px] text-slate-300">
                <span className="text-cyan-300">{el.label}:</span> {el.desc}
              </div>
            ))}
          </div>
        </div>

        {/* Generative Output */}
        <div className="bg-green-500/10 rounded p-2">
          <div className="flex items-center gap-1 mb-2">
            <Sparkles className="w-3 h-3 text-green-400" />
            <span className="text-[9px] font-bold text-green-400">Generative Output</span>
          </div>
          <div className="text-[8px] text-slate-300 space-y-1">
            <div>Real value created</div>
            <div>Meaningful outcomes</div>
            <div>Shared purpose</div>
            <div>Collective growth</div>
            <div>Tangible impact</div>
          </div>
        </div>
      </div>

      {/* Formula */}
      <div className="mt-3 text-center">
        <code className="text-[10px] bg-slate-900/50 px-2 py-1 rounded">
          <span className="text-cyan-400">Game Feel</span>
          <span className="text-slate-400"> + </span>
          <span className="text-green-400">Real Output</span>
          <span className="text-slate-400"> = </span>
          <span className="text-amber-400">Healthy Engagement</span>
        </code>
      </div>

      {/* Connection to Stability */}
      <div className="mt-2 text-[8px] text-slate-500 text-center">
        High engagement reduces friction (alpha) in Wallace stability
      </div>
    </div>
  );
});

EngagementSignatureDiagram.displayName = 'EngagementSignatureDiagram';

// =============================================================================
// SECTION CONTENT COMPONENTS
// =============================================================================

const WallaceSection: React.FC = () => (
  <div className="space-y-3 text-[10px] text-slate-300">
    <p className="leading-relaxed">
      <strong className="text-green-400">Rodrick Wallace&apos;s</strong> Rate Distortion Control
      Theory provides the mathematical foundation for understanding when management systems remain
      stable or collapse.
    </p>

    <div className="bg-slate-800/30 rounded p-2">
      <div className="font-bold text-white mb-1">The Critical Threshold</div>
      <p className="text-slate-400 leading-relaxed">
        System stability requires the product of{' '}
        <strong className="text-orange-400">friction (alpha)</strong> and{' '}
        <strong className="text-blue-400">delay (tau)</strong> to remain below{' '}
        <strong className="text-cyan-400">e^-1 = {STABILITY_THRESHOLD.toFixed(4)}</strong>.
        Exceeding this causes <em>phase transitions</em> - sudden system failures.
      </p>
    </div>

    <StabilityDiagram />

    <div className="bg-slate-800/30 rounded p-2">
      <div className="font-bold text-white mb-1">Key Terms</div>
      <ul className="space-y-1 text-slate-400">
        <li>
          <strong className="text-orange-400">Friction (alpha):</strong> Resistance to change,
          bureaucratic overhead
        </li>
        <li>
          <strong className="text-blue-400">Delay (tau):</strong> Feedback loop latency,
          decision-to-action time
        </li>
        <li>
          <strong className="text-purple-400">Phase Transition:</strong> Sudden shift between
          operational modes
        </li>
      </ul>
    </div>

    <div className="bg-amber-500/10 rounded p-2 border border-amber-500/20">
      <div className="text-[9px] text-amber-400 font-medium">Source</div>
      <p className="text-[9px] text-slate-400 mt-1">
        Wallace, R. (2025). &quot;Fog, Friction, Delay and the Failure of Bounded Rationality
        Embodied Cognition&quot;
      </p>
    </div>
  </div>
);

const FiveAxesSection: React.FC = () => {
  const axisIcons: Record<string, LucideIcon> = {
    autonomyLevel: Compass,
    decisionMode: Vote,
    informationAccess: Eye,
    evaluationDirection: Scale,
    collectiveOrientation: Users,
  };

  const axisColors: Record<string, string> = {
    autonomyLevel: 'text-cyan-400',
    decisionMode: 'text-violet-400',
    informationAccess: 'text-amber-400',
    evaluationDirection: 'text-pink-400',
    collectiveOrientation: 'text-green-400',
  };

  return (
    <div className="space-y-3 text-[10px] text-slate-300">
      <p className="leading-relaxed">
        The Five Axes define the spectrum of AI-human collaboration, from traditional hierarchical
        control to full democratic self-organization.
      </p>

      <div className="space-y-2">
        {AXIS_DESCRIPTORS.map((axis) => {
          const Icon = axisIcons[axis.key] || Activity;
          const color = axisColors[axis.key] || 'text-slate-400';

          return (
            <div key={axis.key} className="bg-slate-800/30 rounded p-2">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3 h-3 ${color}`} />
                <span className="font-bold text-white">{axis.label}</span>
              </div>
              <p className="text-slate-400 mb-1">{axis.description}</p>
              <div className="flex justify-between text-[9px]">
                <span className="text-red-300">0%: {axis.lowLabel}</span>
                <span className="text-green-300">100%: {axis.highLabel}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-cyan-500/10 rounded p-2 border border-cyan-500/20">
        <p className="text-[9px] text-cyan-300">
          <strong>Wallace Connection:</strong> Higher autonomy (Mission Command) structures are
          mathematically more stable under stress than hierarchical (Detailed Command) structures.
        </p>
      </div>
    </div>
  );
};

const ValueFormulaSection: React.FC = () => (
  <div className="space-y-3 text-[10px] text-slate-300">
    <p className="leading-relaxed">
      System value is quantified through four multiplicative factors. The multiplication ensures
      that <em>all factors matter</em> - you cannot compensate for zero equity with infinite
      resources.
    </p>

    <ValueFormulaDiagram />

    <div className="space-y-2">
      <div className="bg-cyan-500/10 rounded p-2">
        <div className="font-bold text-cyan-400 mb-1">Z - Resource Index</div>
        <code className="text-[9px] text-slate-400">Z = C x H x M</code>
        <ul className="mt-1 text-[9px] text-slate-400 space-y-0.5">
          <li>
            <strong>C:</strong> Communication channel capacity
          </li>
          <li>
            <strong>H:</strong> Environmental information rate
          </li>
          <li>
            <strong>M:</strong> Material resource rate
          </li>
        </ul>
      </div>

      <div className="bg-green-500/10 rounded p-2">
        <div className="font-bold text-green-400 mb-1">S - Stability Coefficient</div>
        <code className="text-[9px] text-slate-400">S = max(0, 1 - (alpha x tau / e^-1))</code>
        <p className="mt-1 text-[9px] text-slate-400">
          Derived from Wallace&apos;s stability conditions. Approaches zero as the system nears
          instability.
        </p>
      </div>

      <div className="bg-violet-500/10 rounded p-2">
        <div className="font-bold text-violet-400 mb-1">E - Equity Index</div>
        <code className="text-[9px] text-slate-400">E = 1 - Gini(access, voice, benefit)</code>
        <p className="mt-1 text-[9px] text-slate-400">
          Measures equality in information access, decision participation, and outcome distribution.
        </p>
      </div>

      <div className="bg-amber-500/10 rounded p-2">
        <div className="font-bold text-amber-400 mb-1">F - Flourishing Coefficient</div>
        <code className="text-[9px] text-slate-400">F = (M x Ma x C x J x W x A)^(1/6)</code>
        <p className="mt-1 text-[9px] text-slate-400">
          Geometric mean of six eudaimonia dimensions. See Flourishing section.
        </p>
      </div>
    </div>
  </div>
);

const FlourishingSection: React.FC = () => {
  const dimensions = [
    {
      name: 'Meaning',
      description: 'Purpose, contribution visibility, values alignment',
      question: 'Does my work matter?',
      color: 'text-violet-400',
    },
    {
      name: 'Mastery',
      description: 'Skill growth, challenge-skill balance, feedback quality',
      question: 'Am I growing?',
      color: 'text-amber-400',
    },
    {
      name: 'Connection',
      description: 'Belonging, trust, support, being known as a person',
      question: 'Do I belong here?',
      color: 'text-cyan-400',
    },
    {
      name: 'Joy',
      description: 'Flow states, pride, gratitude, celebration',
      question: 'Do I enjoy my work?',
      color: 'text-green-400',
    },
    {
      name: 'Wholeness',
      description: 'Authenticity, work-life integration, personal expression',
      question: 'Can I be myself?',
      color: 'text-pink-400',
    },
    {
      name: 'Agency',
      description: 'Choice availability, voice effectiveness, impact visibility',
      question: 'Do I have control?',
      color: 'text-orange-400',
    },
  ];

  return (
    <div className="space-y-3 text-[10px] text-slate-300">
      <p className="leading-relaxed">
        Human flourishing (eudaimonia) is not just ethically important - it is{' '}
        <em>mathematically essential</em> to system stability. Work without meaning increases
        friction; unclear purpose increases delay.
      </p>

      <FlourishingHexagon />

      <div className="space-y-1.5">
        {dimensions.map((dim) => (
          <div key={dim.name} className="bg-slate-800/30 rounded p-2">
            <div className="flex items-center justify-between mb-0.5">
              <span className={`font-bold ${dim.color}`}>{dim.name}</span>
              <span className="text-[9px] text-slate-500 italic">&quot;{dim.question}&quot;</span>
            </div>
            <p className="text-[9px] text-slate-400">{dim.description}</p>
          </div>
        ))}
      </div>

      <div className="bg-pink-500/10 rounded p-2 border border-pink-500/20">
        <div className="font-bold text-pink-400 mb-1 text-[10px]">Why Geometric Mean?</div>
        <p className="text-[9px] text-slate-400">
          High meaning with zero connection = isolation. High mastery with zero meaning = virtuosity
          without purpose. The geometric mean ensures all dimensions must be present - a single zero
          makes F zero.
        </p>
      </div>
    </div>
  );
};

const MissionCommandSection: React.FC = () => (
  <div className="space-y-3 text-[10px] text-slate-300">
    <p className="leading-relaxed">
      Wallace&apos;s analysis demonstrates that organizational structure fundamentally affects
      stability under stress. This insight drives the BAS design philosophy.
    </p>

    <CommandStructureDiagram />

    <div className="bg-green-500/10 rounded p-2">
      <div className="font-bold text-green-400 mb-1">Mission Command (Boltzmann)</div>
      <ul className="text-[9px] text-slate-400 space-y-0.5">
        <li>- One-step decision process</li>
        <li>- Flatter structure, greater autonomy</li>
        <li>- Workers given objectives, choose methods</li>
        <li>
          - <strong className="text-green-300">More stable under noise and stress</strong>
        </li>
      </ul>
    </div>

    <div className="bg-red-500/10 rounded p-2">
      <div className="font-bold text-red-400 mb-1">Detailed Command (Erlang)</div>
      <ul className="text-[9px] text-slate-400 space-y-0.5">
        <li>- Multi-step approval chain</li>
        <li>- Hierarchical structure, less autonomy</li>
        <li>- Workers given step-by-step instructions</li>
        <li>
          - <strong className="text-red-300">Highly punctuated failures - sudden collapse</strong>
        </li>
      </ul>
    </div>

    <div className="bg-slate-800/30 rounded p-2">
      <div className="font-bold text-white mb-1">BAMS Implication</div>
      <p className="text-slate-400 leading-relaxed">
        AI should enable mission command (worker autonomy with objectives) rather than detailed
        command (step-by-step instructions). The AI serves as a{' '}
        <strong className="text-cyan-400">servant-catalyst</strong>, not a micromanager.
      </p>
    </div>

    <div className="bg-amber-500/10 rounded p-2 border border-amber-500/20">
      <div className="text-[9px] text-amber-400 font-medium">Sources</div>
      <ul className="text-[9px] text-slate-400 mt-1 space-y-0.5">
        <li>- Semler, R. (1993). &quot;Maverick&quot;</li>
        <li>- Mondragon Cooperative Corporation principles</li>
        <li>- Greenleaf, R.K. (1977). &quot;Servant Leadership&quot;</li>
      </ul>
    </div>
  </div>
);

const EngagementSignatureSection: React.FC = () => {
  const engagementModule = EDUCATIONAL_MODULES.find((m) => m.id === 'engagement-signature');

  if (!engagementModule) return null;

  return (
    <div className="space-y-3 text-[10px] text-slate-300">
      <p className="leading-relaxed">
        <strong className="text-cyan-400">{engagementModule.shortDescription}</strong> - when
        partnership works, work shares qualities with well-designed games while producing real,
        meaningful outcomes.
      </p>

      <EngagementSignatureDiagram />

      <div className="bg-slate-800/30 rounded p-2">
        <div className="font-bold text-white mb-1">The Critical Distinction</div>
        <div className="grid grid-cols-2 gap-2 text-[9px]">
          <div className="bg-red-500/10 rounded p-1.5">
            <span className="text-red-400 font-medium">Pure Gaming:</span>
            <span className="text-slate-400 ml-1">Consumptive (receive experience)</span>
          </div>
          <div className="bg-green-500/10 rounded p-1.5">
            <span className="text-green-400 font-medium">Partnership:</span>
            <span className="text-slate-400 ml-1">Generative (create value together)</span>
          </div>
        </div>
      </div>

      <div className="bg-amber-500/10 rounded p-2 border border-amber-500/20">
        <div className="font-bold text-amber-400 mb-1 text-[10px]">Diagnostic Principle</div>
        <p className="text-[9px] text-slate-400">
          If work consistently feels like forcing yourself through resistance, the BAMS
          configuration needs adjustment. The engagement signature should feel natural when autonomy
          matches readiness, goals are meaningful, feedback loops are short, and entry friction is
          minimal.
        </p>
      </div>

      <div className="bg-slate-800/30 rounded p-2">
        <div className="font-bold text-white mb-1.5">AI Behaviors (Examples)</div>
        <div className="space-y-1.5">
          {engagementModule.examples.map((example, i) => (
            <div key={i} className="text-[9px] text-slate-400 flex items-start gap-1.5">
              <Sparkles className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
              <span>{example}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-green-500/10 rounded p-2 border border-green-500/20">
        <div className="font-bold text-green-400 mb-1 text-[10px]">Wallace Connection</div>
        <p className="text-[9px] text-slate-400">
          High engagement directly reduces friction (alpha) in the stability equation. When work
          feels like a game, resistance to action decreases, decision-to-action time shortens, and
          the system naturally moves toward stability.
        </p>
      </div>

      <div className="bg-slate-800/30 rounded p-2">
        <div className="text-[9px] text-slate-500 mb-1">Related Concepts:</div>
        <div className="flex flex-wrap gap-1">
          {engagementModule.relatedConcepts.map((concept) => (
            <span
              key={concept}
              className="text-[8px] px-1.5 py-0.5 bg-slate-700/50 text-slate-300 rounded"
            >
              {concept}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// MAIN COMPONENT
// =============================================================================

type SectionKey =
  | 'wallace'
  | 'axes'
  | 'value'
  | 'flourishing'
  | 'mission'
  | 'engagement'
  | 'contributors';

// Static section keys to prevent recreation
const ALL_SECTIONS: SectionKey[] = [
  'wallace',
  'axes',
  'value',
  'flourishing',
  'mission',
  'engagement',
  'contributors',
];

export const BASEducation: React.FC = () => {
  const [openSections, setOpenSections] = useState<Set<SectionKey>>(new Set());

  const toggleSection = useCallback((section: SectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setOpenSections(new Set(ALL_SECTIONS));
  }, []);

  const collapseAll = useCallback(() => {
    setOpenSections(new Set());
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-slate-900/90 backdrop-blur-md border border-slate-600/50 rounded-lg shadow-lg w-full"
    >
      {/* Header */}
      <div className="p-3 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-bold text-white">BAMS Theory &amp; Foundations</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          Understanding the Bilateral Alignment Management System
        </p>

        {/* Expand/Collapse controls */}
        <div className="flex gap-2 mt-2">
          <button
            onClick={expandAll}
            className="text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Expand All
          </button>
          <span className="text-slate-600">|</span>
          <button
            onClick={collapseAll}
            className="text-[9px] text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>

      {/* Introduction */}
      <div className="p-3 border-b border-slate-700/30 bg-slate-800/20">
        <div className="flex items-start gap-2">
          <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="text-[10px] text-slate-300 leading-relaxed">
            <strong className="text-white">The Bilateral Alignment Management System (BAMS)</strong>{' '}
            synthesizes three traditions:{' '}
            <strong className="text-cyan-400">Bilateral Alignment</strong> (AI-human partnership),{' '}
            <strong className="text-green-400">Democratic Workplace Philosophy</strong>{' '}
            (Semler/Mondragon), and{' '}
            <strong className="text-violet-400">Information-Theoretic Cognitive Science</strong>{' '}
            (Wallace). Together, they create a mathematically-grounded framework for AI that serves
            workers rather than controlling them.
          </div>
        </div>
      </div>

      {/* Accordion Sections */}
      <AccordionSection
        title="Wallace Stability Theory"
        icon={Activity}
        iconColor="text-green-400"
        isOpen={openSections.has('wallace')}
        onToggle={() => toggleSection('wallace')}
      >
        <WallaceSection />
      </AccordionSection>

      <AccordionSection
        title="Five Axes of Democratic AI"
        icon={Layers}
        iconColor="text-violet-400"
        isOpen={openSections.has('axes')}
        onToggle={() => toggleSection('axes')}
      >
        <FiveAxesSection />
      </AccordionSection>

      <AccordionSection
        title="Value Formula (V = Z x S x E x F)"
        icon={BookOpen}
        iconColor="text-cyan-400"
        isOpen={openSections.has('value')}
        onToggle={() => toggleSection('value')}
      >
        <ValueFormulaSection />
      </AccordionSection>

      <AccordionSection
        title="Flourishing Dimensions (Eudaimonia)"
        icon={Heart}
        iconColor="text-pink-400"
        isOpen={openSections.has('flourishing')}
        onToggle={() => toggleSection('flourishing')}
      >
        <FlourishingSection />
      </AccordionSection>

      <AccordionSection
        title="Mission vs Detailed Command"
        icon={GitBranch}
        iconColor="text-amber-400"
        isOpen={openSections.has('mission')}
        onToggle={() => toggleSection('mission')}
      >
        <MissionCommandSection />
      </AccordionSection>

      <AccordionSection
        title="The Engagement Signature"
        icon={Gamepad2}
        iconColor="text-cyan-400"
        isOpen={openSections.has('engagement')}
        onToggle={() => toggleSection('engagement')}
      >
        <EngagementSignatureSection />
      </AccordionSection>

      <AccordionSection
        title="Key Contributors"
        icon={Users}
        iconColor="text-pink-400"
        isOpen={openSections.has('contributors')}
        onToggle={() => toggleSection('contributors')}
      >
        <div className="space-y-4">
          <p className="text-[10px] text-slate-400 leading-relaxed">
            BAMS synthesizes insights from these key thinkers across systems theory, democratic
            management, and AI ethics.
          </p>
          <PortraitRow portraits={PORTRAITS} size="medium" />
        </div>
      </AccordionSection>

      {/* Footer with key insight */}
      <div className="p-3 bg-gradient-to-r from-violet-500/10 to-cyan-500/10">
        <div className="flex items-center gap-2 text-[10px]">
          <Target className="w-4 h-4 text-violet-400" />
          <span className="text-slate-300">
            <strong className="text-white">Core Thesis:</strong> An AI management system that serves
            workers creates more value, operates more stably, and produces more ethical outcomes
            than traditional hierarchical management.
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default BASEducation;
