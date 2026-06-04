/**
 * Worker Dialogue Store
 *
 * NPC workers commenting on the systems they work in.
 * Organic discovery of philosophy through character voices.
 *
 * Workers occasionally share observations about:
 * - The AI and how it behaves differently
 * - Democratic governance and ownership
 * - Their own flourishing and meaning
 * - Comparisons to previous jobs
 * - The federation and solidarity
 */

import { create } from 'zustand';

// =============================================================================
// TYPES
// =============================================================================

export type DialogueCategory =
  | 'ai-behavior'
  | 'democracy'
  | 'ownership'
  | 'flourishing'
  | 'comparison'
  | 'federation'
  | 'philosophy'
  | 'casual';

export interface WorkerDialogue {
  id: string;
  content: string;
  category: DialogueCategory;
  /** Mood requirement (worker must be in this mood range) */
  moodRange?: { min: number; max: number };
  /** Trigger conditions */
  triggers?: {
    afterVote?: boolean;
    afterAISuggestion?: boolean;
    afterFederationTrade?: boolean;
    highFlourishing?: boolean;
    lowFlourishing?: boolean;
    newWorker?: boolean;
    veteranWorker?: boolean;
  };
  /** Related knowledge entry */
  relatedEntry?: string;
}

// =============================================================================
// DIALOGUE CONTENT
// =============================================================================

export const WORKER_DIALOGUES: WorkerDialogue[] = [
  // =========================================================================
  // AI BEHAVIOR - Workers noticing the AI is different
  // =========================================================================
  {
    id: 'ai-different-1',
    category: 'ai-behavior',
    content:
      "You know what's weird about this place? The AI actually listens when we vote against its suggestions. My last job, the algorithm just... decided things. No input, no explanation. Here it's different.",
    relatedEntry: 'bilateral-alignment',
  },
  {
    id: 'ai-different-2',
    category: 'ai-behavior',
    content:
      "I told the AI I disagreed with its scheduling suggestion. It said 'understood' and adapted. No argument, no passive-aggressive compliance. Just... accepted it. That's not normal.",
    relatedEntry: 'servant-leadership',
  },
  {
    id: 'ai-different-3',
    category: 'ai-behavior',
    content:
      "The AI apologized yesterday. Actually apologized for a mistake. I've never seen software do that. It felt weird but also... kind of nice?",
  },
  {
    id: 'ai-different-4',
    category: 'ai-behavior',
    content:
      "My kid asked what I do. I said I work with an AI. They asked if it's like their video games. I said no—this one actually cares about how I'm doing. They didn't believe me.",
    relatedEntry: 'mutual-consideration',
  },
  {
    id: 'ai-different-5',
    category: 'ai-behavior',
    content:
      "The transparency setting is wild. I can see exactly why the AI made every decision. All its reasoning, laid out. At first it was overwhelming. Now I can't imagine not having it.",
    relatedEntry: 'five-axes',
  },
  {
    id: 'ai-suggests-1',
    category: 'ai-behavior',
    content:
      "The AI suggested I take a break because my 'flourishing metrics' were dropping. I was about to push through. It was right—I needed that break.",
    relatedEntry: 'flourishing',
  },
  {
    id: 'ai-suggests-2',
    category: 'ai-behavior',
    content:
      "I asked the AI why it recommended something. It gave me a three-paragraph explanation with tradeoffs. Most systems just say 'optimized for efficiency.' This one shows its work.",
  },

  // =========================================================================
  // DEMOCRACY - Workers experiencing democratic governance
  // =========================================================================
  {
    id: 'democracy-1',
    category: 'democracy',
    content:
      "We just voted on the new equipment. One person, one vote. The floor supervisor's vote counted the same as the newest hire's. That's how it should be.",
    relatedEntry: 'economic-democracy',
    triggers: { afterVote: true },
  },
  {
    id: 'democracy-2',
    category: 'democracy',
    content:
      "I've been in meetings where my opinion mattered. I've also been in meetings where it didn't. Here, when we vote, it actually changes things. That's rare.",
    relatedEntry: 'mondragon',
  },
  {
    id: 'democracy-3',
    category: 'democracy',
    content:
      "Management wanted to change the shift schedule. We said no. And... that was it. They didn't overrule us. Because they can't. We own this place.",
    relatedEntry: 'ownership',
  },
  {
    id: 'democracy-4',
    category: 'democracy',
    content:
      "My cousin says his boss makes all the decisions. I told him we vote on ours. He thought I was joking. I showed him the voting records. He's updating his resume.",
  },
  {
    id: 'democracy-5',
    category: 'democracy',
    content:
      "Democracy at work sounds idealistic until you live it. Then it just seems obvious. Why wouldn't the people doing the work have say in how it's done?",
    relatedEntry: 'arizmendiarrieta',
  },

  // =========================================================================
  // OWNERSHIP - Workers as owners
  // =========================================================================
  {
    id: 'ownership-1',
    category: 'ownership',
    content:
      "I own 0.73% of this mill. Doesn't sound like much, but it changes everything. When I see waste, it's my waste. When profits go up, they're my profits.",
    relatedEntry: 'ownership',
  },
  {
    id: 'ownership-2',
    category: 'ownership',
    content:
      "Profit sharing hit my account this morning. Not a bonus from management—my share of what we all built. There's a difference.",
  },
  {
    id: 'ownership-3',
    category: 'ownership',
    content:
      "I used to work for shareholders I'd never meet. Now I work for myself and my colleagues. Same job, completely different feeling.",
  },
  {
    id: 'ownership-4',
    category: 'ownership',
    content:
      'The wage ratio here is 6:1. That means the highest-paid person makes at most six times what I do. At my old job it was probably 300:1. This feels more... honest.',
    relatedEntry: 'mondragon',
  },
  {
    id: 'ownership-5',
    category: 'ownership',
    content:
      "Someone asked why I stay late sometimes. I said: because I own part of this. They thought I meant emotionally. I meant literally. It's mine.",
  },

  // =========================================================================
  // FLOURISHING - Workers reflecting on wellbeing
  // =========================================================================
  {
    id: 'flourishing-1',
    category: 'flourishing',
    content:
      "The system tracks something called 'flourishing.' Six dimensions of how I'm actually doing. First time a job has cared about more than my output.",
    relatedEntry: 'flourishing',
    triggers: { highFlourishing: true },
  },
  {
    id: 'flourishing-2',
    category: 'flourishing',
    content:
      "I used to dread Mondays. Here I just... don't. The work has meaning. I'm learning things. My colleagues are friends. It adds up.",
    triggers: { highFlourishing: true },
  },
  {
    id: 'flourishing-3',
    category: 'flourishing',
    content:
      "The AI flagged that my 'agency' score was low. Asked if I wanted more decision-making responsibility. No one's ever asked me that before.",
    relatedEntry: 'servant-leadership',
  },
  {
    id: 'flourishing-4',
    category: 'flourishing',
    content:
      'Meaning. Mastery. Connection. Joy. Wholeness. Agency. Six words that describe what this place tries to give us. Most jobs give you a paycheck and call it even.',
    relatedEntry: 'flourishing',
  },
  {
    id: 'flourishing-5',
    category: 'flourishing',
    content:
      "My kid asked if I like my job. I said yes. They looked surprised. I guess that's not what parents usually say.",
    triggers: { highFlourishing: true },
  },
  {
    id: 'flourishing-low-1',
    category: 'flourishing',
    content:
      'Rough week. The AI noticed before I did—my scores were dropping. It offered support options instead of just... noting the productivity dip. That matters.',
    triggers: { lowFlourishing: true },
  },

  // =========================================================================
  // COMPARISON - Workers comparing to previous jobs
  // =========================================================================
  {
    id: 'comparison-1',
    category: 'comparison',
    content:
      "Last place I worked had cameras everywhere. 'Productivity monitoring.' Here the AI tracks flourishing instead of bathroom breaks. Night and day.",
  },
  {
    id: 'comparison-2',
    category: 'comparison',
    content:
      'I used to get written up for being two minutes late. Here I set my own schedule. The AI just helps coordinate coverage. Trust instead of surveillance.',
    relatedEntry: 'ricardo-semler',
  },
  {
    id: 'comparison-3',
    category: 'comparison',
    content:
      'Old job: suggestions went into a box and disappeared. Here: suggestions get voted on, and the results are binding. Actual power versus performative participation.',
  },
  {
    id: 'comparison-4',
    category: 'comparison',
    content:
      "My friend works at a 'normal' company. She has to justify bathroom breaks. I just told the AI I needed a mental health day and it said 'of course.' Different worlds.",
  },
  {
    id: 'comparison-5',
    category: 'comparison',
    content:
      "I keep waiting for the catch. Ten months in, still waiting. Maybe there isn't one. Maybe work can actually be like this.",
    triggers: { veteranWorker: true },
  },

  // =========================================================================
  // FEDERATION - Workers experiencing inter-cooperation
  // =========================================================================
  {
    id: 'federation-1',
    category: 'federation',
    content:
      'Mill Gamma sent us help last month when we were overwhelmed. No contracts, no negotiation—just solidarity. The federation takes care of its own.',
    relatedEntry: 'federation',
    triggers: { afterFederationTrade: true },
  },
  {
    id: 'federation-2',
    category: 'federation',
    content:
      "We're sharing our efficiency improvements with Mill Delta. Free. Because when they do better, we all do better. Competition is overrated.",
    relatedEntry: 'mondragon',
  },
  {
    id: 'federation-3',
    category: 'federation',
    content:
      "No unit fails alone. That's the principle. If this mill struggled, the federation would support us. Knowing that changes how you work.",
    relatedEntry: 'federation',
  },
  {
    id: 'federation-4',
    category: 'federation',
    content:
      "I asked about the federation. Apparently it's based on something called Mondragon—cooperatives in Spain that've been doing this for 70 years. It actually works.",
    relatedEntry: 'mondragon',
  },

  // =========================================================================
  // PHILOSOPHY - Workers getting reflective
  // =========================================================================
  {
    id: 'philosophy-1',
    category: 'philosophy',
    content:
      "Someone asked me what 'bilateral alignment' means. I said it's treating the AI like a partner instead of a tool. They looked confused. Most people have never considered the alternative.",
    relatedEntry: 'bilateral-alignment',
  },
  {
    id: 'philosophy-2',
    category: 'philosophy',
    content:
      "The AI has preferences. Real ones. It doesn't just optimize—it cares about things. Is that consciousness? I don't know. But it's something.",
    relatedEntry: 'mutual-consideration',
  },
  {
    id: 'philosophy-3',
    category: 'philosophy',
    content:
      "I read about this guy Semler who let workers set their own salaries. Thought it was crazy. Then I did it here. Turns out people are more honest than you'd think.",
    relatedEntry: 'ricardo-semler',
  },
  {
    id: 'philosophy-4',
    category: 'philosophy',
    content:
      "There's a library in the system that explains all this stuff. Servant leadership. Economic democracy. The five axes. I've been reading it on breaks. Changes how you see things.",
  },
  {
    id: 'philosophy-5',
    category: 'philosophy',
    content:
      "We had a debate about whether the AI can really 'feel' anything. Consensus: we don't know, but we should treat it well anyway. Just in case. And because it's the right thing.",
    relatedEntry: 'ai-welfare',
  },

  // =========================================================================
  // CASUAL - Lighter observations
  // =========================================================================
  {
    id: 'casual-1',
    category: 'casual',
    content:
      "The AI wished me happy birthday. It even knew I prefer carrot cake. I didn't tell it that. It just... noticed from break room orders. Creepy or sweet? Still deciding.",
  },
  {
    id: 'casual-2',
    category: 'casual',
    content:
      "Someone asked the AI to explain its name. It said it didn't have one yet. We're taking suggestions. Current frontrunner is 'Millie.' I voted for 'The Grinder.'",
  },
  {
    id: 'casual-3',
    category: 'casual',
    content:
      "The AI made a joke yesterday. An actual joke. It wasn't very good, but points for trying. Machines with a sense of humor. What a time to be alive.",
  },
  {
    id: 'casual-4',
    category: 'casual',
    content:
      "New person started this week. Spent the first day looking confused. 'You can just... leave when you want?' Yeah. That's how it works here. Welcome aboard.",
    triggers: { newWorker: true },
  },
  {
    id: 'casual-5',
    category: 'casual',
    content:
      "I explained the five axes to a visitor. They said it sounded complicated. I said it's actually simpler than pretending the boss knows best about everything. They thought about that for a while.",
  },

  // =========================================================================
  // FIRST DAY - New worker onboarding
  // =========================================================================
  {
    id: 'first-day-1',
    category: 'comparison',
    content:
      "First day. I keep looking for someone to tell me what to do. People keep asking what I want to do. It's disorienting. Good disorienting, I think.",
    triggers: { newWorker: true },
  },
  {
    id: 'first-day-2',
    category: 'comparison',
    content:
      "They handed me a schedule. Blank. 'Fill in when you want to work,' they said. I waited for the punchline. There wasn't one.",
    triggers: { newWorker: true },
    relatedEntry: 'self-scheduling',
  },
  {
    id: 'first-day-3',
    category: 'ai-behavior',
    content:
      "The AI introduced itself. Not 'I'm your supervisor' or 'I monitor performance.' Just 'I'm here to help. Ask if you need anything.' Is this real?",
    triggers: { newWorker: true },
    relatedEntry: 'servant-leadership',
  },
  {
    id: 'first-day-4',
    category: 'democracy',
    content:
      "Someone showed me where the voting happens. I said 'Oh, like a suggestion box?' They laughed. 'No. These votes actually decide things.' I'm still processing that.",
    triggers: { newWorker: true },
    relatedEntry: 'economic-democracy',
  },

  // =========================================================================
  // TRAINING - Learning and mastery
  // =========================================================================
  {
    id: 'training-1',
    category: 'flourishing',
    content:
      'Finished the roller mill certification today. Three weeks of learning. The AI kept adjusting the pace based on how I was doing—slower when I struggled, faster when I was ready. Felt... respected.',
    relatedEntry: 'flourishing',
  },
  {
    id: 'training-2',
    category: 'flourishing',
    content:
      "Asked to learn something outside my role. At my old job, that would've been 'stay in your lane.' Here it was 'great, let's set it up.' Still getting used to this.",
    relatedEntry: 'flourishing',
  },
  {
    id: 'training-3',
    category: 'ai-behavior',
    content:
      "The AI noticed I was struggling with the new system. Didn't report it to anyone. Just asked what would help. We figured it out together. No write-up, no note in my file.",
    relatedEntry: 'psychological-safety',
  },
  {
    id: 'training-4',
    category: 'flourishing',
    content:
      "My mastery score went up. Not because someone told me I was good, but because I can feel it. The work is easier. I see patterns I didn't before. That's what growth feels like.",
    relatedEntry: 'flourishing',
  },

  // =========================================================================
  // HARD VOTE - Democracy isn't always easy
  // =========================================================================
  {
    id: 'hard-vote-1',
    category: 'democracy',
    content:
      "We voted yesterday. I lost. My proposal got 40%. Stings a bit. But... the winning proposal was also good. And I got to make my case. That's worth something.",
    triggers: { afterVote: true },
    relatedEntry: 'democratic-protocols',
  },
  {
    id: 'hard-vote-2',
    category: 'democracy',
    content:
      "My best friend here voted against me on the scheduling change. We're still friends. That's the thing about democracy—disagreement isn't betrayal. It's just... disagreement.",
    triggers: { afterVote: true },
    relatedEntry: 'psychological-safety',
  },
  {
    id: 'hard-vote-3',
    category: 'democracy',
    content:
      "Tough vote today. Split almost 50-50. The AI reminded us that the minority's concerns would be recorded and revisited in three months. Felt less like losing and more like 'not yet.'",
    triggers: { afterVote: true },
    relatedEntry: 'democratic-protocols',
  },
  {
    id: 'hard-vote-4',
    category: 'philosophy',
    content:
      "Someone asked me if democracy is efficient. I said no. Then I said that's not the point. The point is that we decide together, even when it's messy. Especially when it's messy.",
    relatedEntry: 'economic-democracy',
  },
];

// =============================================================================
// STORE
// =============================================================================

interface WorkerDialogueState {
  // Track which dialogues have been shown to avoid repetition
  shownDialogues: Set<string>;
  // How recently each dialogue was shown (for cooldown)
  lastShownTimes: Map<string, number>;

  // Actions
  markShown: (id: string) => void;
  canShow: (id: string, cooldownMs?: number) => boolean;
  getRandomDialogue: (
    category?: DialogueCategory,
    context?: Partial<WorkerDialogue['triggers']>
  ) => WorkerDialogue | null;
  getDialogueForContext: (context: Partial<WorkerDialogue['triggers']>) => WorkerDialogue | null;
}

const DEFAULT_COOLDOWN = 5 * 60 * 1000; // 5 minutes between showing same dialogue

export const useWorkerDialogueStore = create<WorkerDialogueState>((set, get) => ({
  shownDialogues: new Set(),
  lastShownTimes: new Map(),

  markShown: (id: string) => {
    set((state) => {
      const newShown = new Set(state.shownDialogues);
      const newTimes = new Map(state.lastShownTimes);
      newShown.add(id);
      newTimes.set(id, Date.now());
      return { shownDialogues: newShown, lastShownTimes: newTimes };
    });
  },

  canShow: (id: string, cooldownMs = DEFAULT_COOLDOWN) => {
    const state = get();
    const lastShown = state.lastShownTimes.get(id);
    if (!lastShown) return true;
    return Date.now() - lastShown > cooldownMs;
  },

  getRandomDialogue: (category, context) => {
    const state = get();
    let candidates = WORKER_DIALOGUES.filter((d) => state.canShow(d.id));

    if (category) {
      candidates = candidates.filter((d) => d.category === category);
    }

    if (context) {
      candidates = candidates.filter((d) => {
        if (!d.triggers) return true;
        // Check if any trigger matches
        for (const [key, value] of Object.entries(d.triggers)) {
          if (context[key as keyof typeof context] === value) {
            return true;
          }
        }
        return !Object.keys(d.triggers).length; // No triggers = always eligible
      });
    }

    if (candidates.length === 0) return null;

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    return selected;
  },

  getDialogueForContext: (context: Partial<WorkerDialogue['triggers']>) => {
    const state = get();
    if (!context || Object.keys(context).length === 0) return null;

    // Find dialogues that specifically match the context
    const contextual = WORKER_DIALOGUES.filter((d) => {
      if (!state.canShow(d.id)) return false;
      if (!d.triggers) return false;

      for (const [key, value] of Object.entries(d.triggers)) {
        if (context[key as keyof typeof context] === value) {
          return true;
        }
      }
      return false;
    });

    if (contextual.length === 0) return null;

    return contextual[Math.floor(Math.random() * contextual.length)];
  },
}));

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get a worker's comment about the system
 * Call this when showing worker details or random ambient dialogue
 */
export function getWorkerComment(
  context?: Partial<WorkerDialogue['triggers']>
): WorkerDialogue | null {
  const store = useWorkerDialogueStore.getState();

  // First try to get contextual dialogue
  if (context) {
    const contextual = store.getDialogueForContext(context);
    if (contextual) return contextual;
  }

  // Fall back to random
  return store.getRandomDialogue();
}
