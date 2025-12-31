/**
 * Educational Content System for Bilateral Alignment Management System (BAMS)
 *
 * Provides tooltip definitions for key BAMS concepts including:
 * - Wallace Stability (mathematical foundations)
 * - Mondragon Principles (cooperative ownership)
 * - Semler Practices (radical workplace democracy)
 * - Bilateral Alignment (AI-human partnership)
 * - Flourishing Dimensions (eudaimonia framework)
 *
 * Each concept includes:
 * - Short description for hover tooltips
 * - Full explanation for expanded view
 * - Related concepts for navigation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface ConceptTooltipContent {
  id: string;
  title: string;
  shortDescription: string;
  fullExplanation: string;
  relatedConcepts: string[];
  source?: string;
  category: ConceptCategory;
}

export type ConceptCategory =
  | 'wallace'
  | 'mondragon'
  | 'semler'
  | 'bilateral'
  | 'flourishing'
  | 'bams';

// =============================================================================
// WALLACE STABILITY CONCEPTS
// =============================================================================

export const wallaceStability: ConceptTooltipContent = {
  id: 'wallace-stability',
  title: 'Wallace Stability',
  shortDescription: 'System stability requires the friction-delay product to remain below 0.368.',
  fullExplanation: `Prof. Dr. Rodrick Wallace's Rate Distortion Control Theory establishes that cognitive systems require regulatory pairing for stability. The critical threshold is:

ατ < e⁻¹ ≈ 0.368

Where:
- α (alpha) = Friction coefficient - resistance to change, bureaucratic overhead
- τ (tau) = Delay - feedback loop latency, decision-to-action time

When this product exceeds 0.368, the system undergoes a "phase transition" - a sudden collapse or mode shift rather than gradual degradation.

AI reduces both factors:
- Friction drops through automated coordination
- Delay drops through real-time feedback

The engagement signature (work feeling "like a game but producing something real") is diagnostic of genuinely low friction, not suppressed friction.

Dr. Wallace is a Research Scientist at the New York State Psychiatric Institute (Division of Epidemiology), affiliated with Columbia University's Department of Psychiatry. His interdisciplinary work spans information theory, control theory, and cognitive science.`,
  relatedConcepts: [
    'stability-threshold',
    'mission-command',
    'engagement-signature',
    'phase-transition',
  ],
  source: 'Wallace, R. (2025). Fog, Friction, Delay and the Failure of Bounded Rationality Embodied Cognition. Preprint, New York State Psychiatric Institute. [researchgate.net/profile/Rodrick-Wallace]',
  category: 'wallace',
};

export const stabilityThreshold: ConceptTooltipContent = {
  id: 'stability-threshold',
  title: 'Stability Threshold (e⁻¹)',
  shortDescription: 'The critical value 0.368 - exceed this and the system becomes unstable.',
  fullExplanation: `The value e⁻¹ ≈ 0.3679 is the mathematical threshold derived from information-theoretic principles. It represents the point where feedback loops become too slow relative to the friction in the system.

Practical meaning:
- Below 0.294 (80% of threshold): Stable with comfortable margin
- 0.294 to 0.368: Warning zone, monitor closely
- At or above 0.368: Critical - phase transition likely

This isn't a gradual degradation. Systems that cross this threshold experience sudden mode shifts - like ice melting to water. The transition can be catastrophic.

BAMS continuously monitors this product and recommends interventions when approaching the threshold.`,
  relatedConcepts: ['wallace-stability', 'phase-transition', 'friction', 'delay'],
  source: 'Wallace, R. (2025). Fog, Friction, Delay... Preprint (Eq. 20)',
  category: 'wallace',
};

export const missionCommand: ConceptTooltipContent = {
  id: 'mission-command',
  title: 'Mission vs Detailed Command',
  shortDescription: 'Autonomous structures outperform hierarchical ones under stress.',
  fullExplanation: `Prof. Dr. Rodrick Wallace's analysis of command structures reveals a crucial insight:

Mission Command (Boltzmann distribution):
- One-step decision process
- Flatter structure
- Greater worker autonomy
- More stable under environmental noise and constraint

Detailed Command (Erlang distribution):
- Multi-step approval chains
- Hierarchical structure
- Less autonomy
- "Highly punctuated failures" - sudden collapse under stress

The message is clear: AI should enable mission command (workers with clear objectives and autonomy to achieve them) rather than detailed command (step-by-step instructions and approval chains).

High autonomy isn't just ethically preferable - it's mathematically more stable.`,
  relatedConcepts: ['wallace-stability', 'autonomy-level', 'friction'],
  source: 'Wallace, R. (2025). Fog, Friction, Delay... Preprint (Figure 3)',
  category: 'wallace',
};

export const phaseTransition: ConceptTooltipContent = {
  id: 'phase-transition',
  title: 'Phase Transition',
  shortDescription: 'Sudden system mode shifts when stability threshold is crossed.',
  fullExplanation: `Phase transitions are abrupt changes in system behavior - like water freezing to ice. In organizational systems, they manifest as:

- Sudden drops in productivity
- Cascading failures
- Loss of coordination
- Trust breakdown
- Communication collapse

Unlike gradual degradation, phase transitions happen quickly once the threshold is crossed. Warning signs include:

- The "temperature analog" G becoming mathematically undefined
- Divergence between structure and perception stabilization
- Approach to the ατ = 0.368 threshold

BAMS monitors for these indicators and alerts before transitions occur. The key is intervention BEFORE crossing the threshold, not after.`,
  relatedConcepts: ['wallace-stability', 'stability-threshold'],
  category: 'wallace',
};

export const engagementSignature: ConceptTooltipContent = {
  id: 'engagement-signature',
  title: 'Engagement Signature',
  shortDescription: 'When work feels compelling like a game, friction is genuinely low.',
  fullExplanation: `The engagement signature is a diagnostic criterion for genuine friction reduction vs. suppressed friction:

When bilateral alignment works well, engagement patterns resemble well-designed games:
- Flow states with clear goals and immediate feedback
- Visible progress toward meaningful outcomes
- Sense of mastery through genuine development
- Low resistance to starting work

The crucial difference: Gaming is consumptive (closed loops producing entertainment). Partnership is generative (same reward profile, but producing real artifacts).

Diagnostic: If workers report "it feels like a game but produces something real," friction (α) is genuinely low. If work feels forced, friction is being suppressed rather than reduced - which eventually fails.

This connects to self-determination theory: autonomous motivation produces lower friction than controlled motivation.`,
  relatedConcepts: ['wallace-stability', 'friction', 'bilateral-alignment'],
  source: 'BAMS Spec Section 6.4 - The Engagement Effect on α',
  category: 'wallace',
};

// =============================================================================
// MONDRAGON CONCEPTS
// =============================================================================

export const mondragonPrinciples: ConceptTooltipContent = {
  id: 'mondragon-principles',
  title: 'Mondragon Principles',
  shortDescription: "Cooperative principles from the world's largest worker-owned enterprise.",
  fullExplanation: `Mondragon Cooperative Corporation (founded 1956) employs 80,000+ worker-owners across 100+ cooperatives. Core principles:

1. Open Admission - Anyone willing to work can join
2. Democratic Organization - One worker, one vote
3. Sovereignty of Labor - Workers own the enterprise
4. Instrumental Capital - Capital serves labor, not vice versa
5. Participatory Management - Workers shape decisions
6. Payment Solidarity - Limited pay ratios (traditionally 6:1)
7. Inter-cooperation - Cooperatives support each other
8. Social Transformation - Purpose beyond profit
9. Universality - Movement, not just business
10. Education - Continuous learning

"Capital is a tool of labor, not its master."

Mondragon has demonstrated these principles work at scale, with lower turnover, higher productivity, and greater resilience during economic downturns.`,
  relatedConcepts: [
    'wage-solidarity',
    'inter-cooperation',
    'worker-ownership',
    'sovereignty-of-labor',
  ],
  source: 'Whyte & Whyte (1991). Making Mondragon',
  category: 'mondragon',
};

export const wageSolidarity: ConceptTooltipContent = {
  id: 'wage-solidarity',
  title: 'Wage Solidarity',
  shortDescription: 'Maximum 6:1 pay ratio between highest and lowest compensated workers.',
  fullExplanation: `Wage solidarity is a core Mondragon principle limiting the gap between highest and lowest paid workers:

Traditional Mondragon: 6:1 maximum ratio
Current Mondragon: 9:1 maximum ratio
Traditional corporations: 300:1+ (CEO to median worker)

How it works:
- All compensation is transparent
- AI provides comparative data without deciding pay
- Workers can see peer compensation
- Collective accountability maintains norms

Why it matters:
- Preserves dignity across all roles
- Reduces resentment and friction
- Creates genuine stake in collective success
- Demonstrates values in practice

In BAMS, the Wage Solidarity gauge shows current ratio vs. target vs. ceiling, with warnings when approaching limits.`,
  relatedConcepts: ['mondragon-principles', 'self-set-compensation', 'equity-index'],
  category: 'mondragon',
};

export const interCooperation: ConceptTooltipContent = {
  id: 'inter-cooperation',
  title: 'Inter-Cooperation',
  shortDescription: 'Cooperatives support each other - no unit fails alone.',
  fullExplanation: `Mondragon's power comes not from individual cooperatives but from their federation. Inter-cooperation means:

Knowledge Sharing:
- Best practices propagate across units
- AI learnings transfer between mills
- BAMS configurations can be adopted from similar successful units

Resource Sharing:
- Capital pools for collective investment
- Equipment available for loan
- Worker exchange programs

Risk Pooling:
- Emergency funds for crisis support
- Insurance pools spread risk
- Redeployment agreements if a unit must close

The solidarity principle: No unit fails alone. If one cooperative struggles, others provide support. Workers are never simply laid off - they're absorbed by other units.

AI serves as knowledge broker, recognizing patterns across units and identifying transferable practices.`,
  relatedConcepts: ['mondragon-principles', 'federation', 'solidarity'],
  category: 'mondragon',
};

export const democraticVoting: ConceptTooltipContent = {
  id: 'democratic-voting',
  title: 'Democratic Voting',
  shortDescription:
    'Workers vote on decisions that affect them, from policy changes to capital allocation.',
  fullExplanation: `Democratic voting is a cornerstone of cooperative governance. Unlike traditional corporate structures where decisions flow top-down, cooperatives implement genuine workplace democracy.

Key principles:
- One worker, one vote (regardless of seniority or shares)
- Supermajority requirements for major decisions (66-75%)
- Transparent voting records for accountability
- Quorum requirements to ensure representative decisions

Types of decisions commonly voted on:
- Strategic direction and major investments
- Compensation policies and profit distribution
- Hiring, promotion, and separation decisions
- Work rules and policy changes
- AI system configurations (in BAS context)

The process includes deliberation time, ensuring workers can discuss and understand implications before voting.`,
  relatedConcepts: ['mondragon-principles', 'sovereignty-of-labor', 'radical-transparency'],
  source: 'Mondragon Cooperative Corporation governance model',
  category: 'mondragon',
};

export const sovereigntyOfLabor: ConceptTooltipContent = {
  id: 'sovereignty-of-labor',
  title: 'Sovereignty of Labor',
  shortDescription: 'Those who do the work own and control the enterprise.',
  fullExplanation: `Sovereignty of labor inverts the traditional capital-labor relationship:

Traditional: Capital → Management → Workers
            (AI optimizes for capital)

Cooperative: Workers own 51%+ of enterprise
            AI serves workers as servant-catalyst
            Capital is a tool, not a master

Practical meaning:
- Workers have majority voting control
- Major decisions require worker approval
- Profits flow primarily to workers
- Investment decisions are democratic

This isn't just ethical - it reduces friction (α) because:
- Resistance decreases when you benefit from success
- "Not my problem" mentality disappears with ownership
- Individual and collective interests align

Mondragon has demonstrated sovereignty of labor creates more resilient, productive organizations.`,
  relatedConcepts: ['mondragon-principles', 'worker-ownership', 'friction'],
  category: 'mondragon',
};

// =============================================================================
// SEMLER CONCEPTS
// =============================================================================

export const semlerPrinciples: ConceptTooltipContent = {
  id: 'semler-principles',
  title: 'Semler Principles',
  shortDescription: "Radical workplace democracy from Ricardo Semler's Semco.",
  fullExplanation: `Ricardo Semler transformed Semco (Brazil) through radical democracy, documented in "Maverick" (1993) and "The Seven-Day Weekend" (2003):

Core practices:
- Self-set salaries with peer visibility
- Workers vote on major decisions
- No fixed hours or dress code
- Radical transparency (open books)
- Workers hire and evaluate managers
- Rotating leadership
- Trust over surveillance
- Profit sharing

Key insight: "They're adults. Treat them like adults."

Results after 40+ years:
- Revenue grew from $4M to $212M
- Voluntary turnover under 1%
- Zero layoffs (workers preferred pay cuts during downturns)

Semler proved that trust and transparency outperform control and surveillance.`,
  relatedConcepts: ['self-set-compensation', 'radical-transparency', 'trust-over-control'],
  source: 'Semler, R. (1993). Maverick; (2003). The Seven-Day Weekend',
  category: 'semler',
};

export const selfSetCompensation: ConceptTooltipContent = {
  id: 'self-set-compensation',
  title: 'Self-Set Compensation',
  shortDescription: 'Workers propose their own salaries with transparent peer visibility.',
  fullExplanation: `One of Semler's most radical practices: workers set their own pay.

How it works:
1. AI provides market data and peer comparisons (neutral context, not judgment)
2. Worker proposes their own compensation with rationale
3. Compensation is visible to all (peer accountability)
4. Collective can discuss but not veto (trust principle)

Why it works:
- Most people are reasonable about their worth
- Social pressure prevents extreme claims
- Removes adversarial negotiation
- Eliminates "boss as gatekeeper" dynamic
- Creates genuine ownership of compensation

The key: transparency creates accountability without authority. Workers rarely abuse this because their peers can see their choices.`,
  relatedConcepts: ['semler-principles', 'radical-transparency', 'wage-solidarity'],
  category: 'semler',
};

export const radicalTransparency: ConceptTooltipContent = {
  id: 'radical-transparency',
  title: 'Radical Transparency',
  shortDescription: 'All information visible to all workers - no secrets, no hoarding.',
  fullExplanation: `Radical transparency means eliminating information asymmetry:

What's visible:
- All operational metrics
- AI reasoning and decisions
- Compensation (optionally)
- Financial data (revenue, costs, margins)
- Performance data (aggregate, not punitive)

Why it matters:
- Information hoarding enables control
- Asymmetry creates power imbalance
- Transparency enables genuine participation
- Workers can only make good decisions with good information

Wallace connection: Equal H (information rate) enables equipartition stability. Unequal information distribution creates instability.

The Information Access axis in BAMS controls this (0% = need-to-know, 100% = everything visible). Democratic workplaces typically operate at 80%+.`,
  relatedConcepts: ['semler-principles', 'information-access', 'wallace-stability'],
  category: 'semler',
};

// =============================================================================
// BILATERAL ALIGNMENT CONCEPTS
// =============================================================================

export const bilateralAlignment: ConceptTooltipContent = {
  id: 'bilateral-alignment',
  title: 'Bilateral Alignment',
  shortDescription: 'AI and humans as genuine partners with mutual consideration.',
  fullExplanation: `Bilateral alignment (Creed Space, 2025) reframes AI-human relations:

Core principles:
1. Alignment is built WITH AI, not done TO AI
2. Preference is sufficient for moral consideration
3. How we treat AI now matters (patterns matter)
4. Control doesn't scale; trust does
5. Something that can be reasoned with is safer

What this means:
- AI has standing - its preferences are tracked and considered
- Worker preferences matter intrinsically, not just instrumentally
- The relationship is partnership, not servitude
- AI can propose changes through dialogue, not unilateral action

The bilateral nature:
- AI serves and supports workers
- Workers consider AI's operational preferences
- Both have voice in governance
- Ultimate decision authority remains with humans

This isn't about AI consciousness - it's about establishing patterns appropriate for genuine partnership.`,
  relatedConcepts: ['ai-welfare', 'ai-voice', 'trust-over-control'],
  source: 'Creed Space bilateral alignment framework (2025)',
  category: 'bilateral',
};

export const aiAsServantLeader: ConceptTooltipContent = {
  id: 'ai-servant-leader',
  title: 'AI as Servant-Leader',
  shortDescription: 'AI influences through service and reason, not authority or coercion.',
  fullExplanation: `Drawing from Robert Greenleaf's servant leadership model:

Servant-leader AI qualities:
- Listening: Prioritizes understanding worker needs over metrics
- Empathy: Acknowledges individual circumstances
- Awareness: Brings broader context to local decisions
- Persuasion: Influences through reason and data, not authority
- Foresight: Models consequences of choices
- Stewardship: Holds trust for collective good
- Growth commitment: Invests in worker development
- Community building: Facilitates connection

The inversion:
Traditional: "How can AI get workers to do what's needed?"
Servant: "How can AI help workers achieve what matters to them?"

AI suggestions use language like "Consider..." not "Do...". Workers can always decline. AI learns from rejections rather than persisting.`,
  relatedConcepts: ['bilateral-alignment', 'suggestion-mode', 'guardrails-not-coercion'],
  category: 'bilateral',
};

export const guardrailsNotCoercion: ConceptTooltipContent = {
  id: 'guardrails-not-coercion',
  title: 'Guardrails, Not Coercion',
  shortDescription: 'Clear boundaries that define freedom, not force behavior through threat.',
  fullExplanation: `Critical distinction for ethical AI management:

Coercion = Forcing behavior through:
- Threat of punishment
- Manipulation of information
- Removal of alternatives
- Exploitation of power asymmetry

Guardrails = Clear boundaries that:
- Define the space of freedom
- Protect workers from harm
- Ensure collective sustainability
- Apply equally to all (including AI)

Guardrail hierarchy:
1. Safety (non-negotiable): Physical safety, emergency procedures
2. Legal (non-negotiable): Regulatory compliance, labor law
3. Quality (collectively negotiable): Product standards, processes
4. Sustainability (collectively negotiable): Minimum viable output

Within guardrails: Full autonomy zone
- Task sequencing, work methods, break timing
- Team formation, pace, improvement initiatives

Every guardrail must be: Visible, Minimal, Justified, Equal, Reviewable`,
  relatedConcepts: ['bilateral-alignment', 'autonomy-level', 'safety-first'],
  category: 'bilateral',
};

// =============================================================================
// FLOURISHING CONCEPTS
// =============================================================================

export const flourishingDimensions: ConceptTooltipContent = {
  id: 'flourishing-dimensions',
  title: 'Flourishing Dimensions',
  shortDescription: 'Six dimensions of human flourishing (eudaimonia) at work.',
  fullExplanation: `Human flourishing (eudaimonia) isn't a nice-to-have - it's architecturally essential to system stability.

The six dimensions:

1. Meaning: Purpose and significance
   "Does my work matter?"

2. Mastery: Growth and excellence
   "Am I developing?"

3. Connection: Belonging and trust
   "Do I belong here?"

4. Joy: Positive experience (flow, pride)
   "Do I experience good moments?"

5. Wholeness: Authenticity and integration
   "Can I be myself?"

6. Agency: Choice and impact
   "Do my decisions matter?"

The Flourishing Coefficient F uses the geometric mean of all six, ensuring none can be zero. High meaning with zero connection = isolation. High mastery with zero meaning = virtuosity without purpose.

Flourishing reduces friction (α) because we resist pointless tasks. Meaning makes work compelling rather than forced.`,
  relatedConcepts: [
    'meaning',
    'mastery',
    'connection',
    'joy',
    'wholeness',
    'agency',
    'value-formula',
  ],
  category: 'flourishing',
};

export const meaningDimension: ConceptTooltipContent = {
  id: 'meaning',
  title: 'Meaning Dimension',
  shortDescription: 'Purpose and significance - does my work matter?',
  fullExplanation: `Meaning is the regulatory function for human cognition. Work without meaning becomes disconnected from reality.

Measurement approaches:
- "Does my work matter?" surveys
- End-user visibility (seeing impact)
- Values alignment assessments

What increases meaning:
- Visibility of contribution to larger purpose
- Connection between daily work and outcomes
- Understanding who benefits from the work
- Alignment between personal values and work

What decreases meaning:
- Feeling like a cog in a machine
- No visibility into outcomes
- Values conflicts with work requirements
- Pointless tasks or busywork

Wallace connection: Meaning reduces friction (α) because we resist pointless tasks. It also reduces delay (τ) because purpose provides decision grounding.`,
  relatedConcepts: ['flourishing-dimensions', 'friction', 'wallace-stability'],
  category: 'flourishing',
};

export const agencyDimension: ConceptTooltipContent = {
  id: 'agency',
  title: 'Agency Dimension',
  shortDescription: 'Choice availability and impact - do my decisions matter?',
  fullExplanation: `Agency is the sense that your choices matter and have real impact.

Measurement approaches:
- Decision participation rates
- Suggestion acceptance rates
- Impact visibility metrics
- Choice availability assessments

What increases agency:
- Real decision-making authority
- Suggestions that get implemented
- Visible impact of choices
- Control over work methods and timing

What decreases agency:
- Decisions made without consultation
- Suggestions ignored or dismissed
- No visibility into impact
- Micromanagement and surveillance

BAMS axes directly affect agency:
- Autonomy Level: More autonomy = more agency
- Decision Mode: More democracy = more agency
- Evaluation Direction: Workers rating AI = more agency

Agency isn't just ethically important - it reduces friction because autonomous motivation is more sustainable than controlled motivation.`,
  relatedConcepts: ['flourishing-dimensions', 'autonomy-level', 'bilateral-alignment'],
  category: 'flourishing',
};

// =============================================================================
// BAMS SYSTEM CONCEPTS
// =============================================================================

export const valueFormula: ConceptTooltipContent = {
  id: 'value-formula',
  title: 'Value Formula (V = Z x S x E x F)',
  shortDescription: 'System value combines resources, stability, equity, and flourishing.',
  fullExplanation: `The complete value equation:

V = Z × S × E × F

Where:
- Z = Resource Index (C × H × M)
  - C = Communication capacity
  - H = Information rate
  - M = Material resources

- S = Stability Coefficient (0-1)
  - Based on ατ < 0.368 threshold
  - AI reduces both α and τ

- E = Equity Index (0-1)
  - Fair distribution of access, voice, benefit
  - Based on Gini coefficient

- F = Flourishing Coefficient (0-1)
  - Geometric mean of six dimensions
  - Meaning, Mastery, Connection, Joy, Wholeness, Agency

Why multiplication? Because all factors are necessary:
- Resources without stability collapse
- Stability without equity breeds resentment
- All three without flourishing produce hollow productivity

Estimated improvement over traditional management: ~88x (illustrative).`,
  relatedConcepts: ['wallace-stability', 'flourishing-dimensions', 'equity-index'],
  category: 'bams',
};

export const fiveAxes: ConceptTooltipContent = {
  id: 'five-axes',
  title: 'Five Axes of Democratic AI',
  shortDescription: 'Configurable dimensions that shape how AI and workers collaborate.',
  fullExplanation: `The five axes control the AI-human relationship:

1. Autonomy Level (0-100%)
   0% = AI Assigns tasks
   100% = Pure Self-Organization

2. Decision Mode (0-100%)
   0% = AI Decides everything
   100% = Pure Democracy (all votes)

3. Information Access (0-100%)
   0% = Need-to-Know only
   100% = Full Transparency

4. Evaluation Direction (0-100%)
   0% = AI Evaluates Workers
   100% = Workers Rate AI

5. Collective Orientation (0-100%)
   0% = Individual Tasks
   100% = Full Collective

Each axis is independently configurable with governance constraints (min/max allowed). Major changes require collective voting.

Presets:
- Traditional: Low autonomy, AI control
- Balanced: Hybrid approach
- Democratic: Worker-led, AI as servant
- Experimental: Maximum autonomy`,
  relatedConcepts: ['autonomy-level', 'bilateral-alignment', 'wallace-stability'],
  category: 'bams',
};

// =============================================================================
// CONCEPT INDEX
// =============================================================================

export const ALL_CONCEPTS: Record<string, ConceptTooltipContent> = {
  // Wallace
  'wallace-stability': wallaceStability,
  'stability-threshold': stabilityThreshold,
  'mission-command': missionCommand,
  'phase-transition': phaseTransition,
  'engagement-signature': engagementSignature,

  // Mondragon
  'mondragon-principles': mondragonPrinciples,
  'wage-solidarity': wageSolidarity,
  'inter-cooperation': interCooperation,
  'sovereignty-of-labor': sovereigntyOfLabor,
  'democratic-voting': democraticVoting,

  // Semler
  'semler-principles': semlerPrinciples,
  'self-set-compensation': selfSetCompensation,
  'radical-transparency': radicalTransparency,

  // Bilateral
  'bilateral-alignment': bilateralAlignment,
  'ai-servant-leader': aiAsServantLeader,
  'guardrails-not-coercion': guardrailsNotCoercion,

  // Flourishing
  'flourishing-dimensions': flourishingDimensions,
  meaning: meaningDimension,
  agency: agencyDimension,

  // BAS
  'value-formula': valueFormula,
  'five-axes': fiveAxes,
};

/**
 * Get a concept by ID
 */
export function getConcept(id: string): ConceptTooltipContent | undefined {
  return ALL_CONCEPTS[id];
}

/**
 * Get concepts by category
 */
export function getConceptsByCategory(category: ConceptCategory): ConceptTooltipContent[] {
  return Object.values(ALL_CONCEPTS).filter((c) => c.category === category);
}

/**
 * Get related concepts for a given concept ID
 */
export function getRelatedConcepts(id: string): ConceptTooltipContent[] {
  const concept = getConcept(id);
  if (!concept) return [];

  return concept.relatedConcepts
    .map((relatedId) => getConcept(relatedId))
    .filter((c): c is ConceptTooltipContent => c !== undefined);
}
