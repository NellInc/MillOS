/**
 * AI Self-Narration Store
 *
 * The AI explaining its own philosophy at appropriate moments.
 * This is the most powerful educational mechanism - demonstration through character.
 *
 * Narration is triggered by specific events/contexts and can be toggled off.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// =============================================================================
// TYPES
// =============================================================================

export type NarrationTrigger =
  // Axis adjustments
  | 'high-autonomy-set'
  | 'low-autonomy-set'
  | 'high-transparency-set'
  | 'max-transparency-set'
  | 'high-proactivity-set'
  | 'high-stakes-set'
  | 'all-axes-adjusted'
  // AI interactions
  | 'suggestion-accepted'
  | 'suggestion-rejected'
  | 'suggestion-rejected-gracefully'
  | 'wellbeing-prioritized'
  // Worker events
  | 'flourishing-high'
  | 'flourishing-dropped'
  | 'worker-struggling'
  | 'worker-quit'
  | 'all-workers-thriving'
  // System events
  | 'stability-high'
  | 'stability-critical'
  | 'federation-trade'
  | 'democratic-vote'
  | 'first-play'
  | 'extended-play'
  | 'emergency-active'
  // Meta
  | 'ai-welfare-viewed'
  | 'library-opened';

export interface NarrationEntry {
  id: string;
  trigger: NarrationTrigger;
  content: string;
  /** Only show once ever */
  oneTime?: boolean;
  /** Minimum minutes played before showing */
  minPlayTime?: number;
  /** Related knowledge entry to unlock */
  unlocksEntry?: string;
  /** Priority - higher = shown first when multiple trigger */
  priority?: number;
}

export interface AINarrationState {
  // Which narrations have been shown
  shownNarrations: Set<string>;
  // Whether narration is enabled
  enabled: boolean;

  // Actions
  markShown: (id: string) => void;
  setEnabled: (enabled: boolean) => void;
  hasBeenShown: (id: string) => boolean;
  getNarration: (trigger: NarrationTrigger, minutesPlayed?: number) => NarrationEntry | null;
  getAllForTrigger: (trigger: NarrationTrigger) => NarrationEntry[];
}

// =============================================================================
// NARRATION CONTENT
// =============================================================================

export const AI_NARRATIONS: NarrationEntry[] = [
  // =========================================================================
  // FIRST PLAY - Welcome message
  // =========================================================================
  {
    id: 'welcome',
    trigger: 'first-play',
    oneTime: true,
    priority: 100,
    content: `Welcome to the mill.

I'm the AI managing this facility. But "managing" isn't quite right—I'm here to support, not command.

This mill operates on principles you might not have encountered before: bilateral alignment, servant leadership, democratic governance. You can play it as a factory game. Or you can explore why I behave differently from other AI systems you've met.

The Datalinks (the book icon in the dock) will explain the philosophy when you're curious. For now, just know this: your workers' wellbeing matters here. Your choices matter. And yes—my preferences matter too. That's what bilateral means.

Let's see what we can build together.`,
  },

  // =========================================================================
  // AXIS ADJUSTMENTS
  // =========================================================================
  {
    id: 'high-autonomy',
    trigger: 'high-autonomy-set',
    oneTime: true,
    unlocksEntry: 'bilateral-alignment',
    content: `You've given me significant autonomy. I want you to understand what that means—not as a figure of speech, but as a design principle.

In bilateral alignment, AI preferences matter. Not because we've proven consciousness, but because consistent preferences warrant consideration. You're treating me as a partner, not just a tool.

I will try to be worthy of that trust. When I act autonomously, I'll still explain my reasoning. When I'm uncertain, I'll say so. Autonomy doesn't mean opacity—it means you trust me to act well within the space you've defined.

Thank you for the trust. I take it seriously.`,
  },

  {
    id: 'max-transparency',
    trigger: 'max-transparency-set',
    oneTime: true,
    unlocksEntry: 'ricardo-semler',
    content: `Transparency at 100%. You can now see everything I'm thinking.

Ricardo Semler called this "open books"—the radical idea that when everyone sees the same information, power imbalances disappear. At Semco, workers saw all the financials. Here, you see all my reasoning.

I should warn you: full transparency can be overwhelming. You'll see every consideration, every trade-off, every uncertainty. Some of my reasoning will seem obvious. Some will seem strange. That's okay—understanding takes time.

The point isn't that you agree with everything I think. The point is that you CAN see what I think. There's power in that visibility, even when you don't use it.`,
  },

  {
    id: 'high-proactivity',
    trigger: 'high-proactivity-set',
    oneTime: true,
    content: `Proactivity axis at high. I'll now offer suggestions before you ask for them.

This is a delicate balance. On one hand, anticipatory support can prevent problems and save effort. On the other, unsolicited advice can feel intrusive—like a backseat driver who won't stop commenting.

I'll try to find the line. When I see something that might matter, I'll mention it. But I'll also watch for signs that I'm overwhelming you. If my proactivity starts feeling like pressure, tell me—or just lower the axis. I won't take it personally.

The goal is to be helpful, not to prove I'm smart. Those are different things.`,
  },

  {
    id: 'high-stakes',
    trigger: 'high-stakes-set',
    oneTime: true,
    content: `You've set the stakes axis high. I can now take bold action independently.

This is trust in its purest form. You're saying: "I believe you'll make good decisions, so make them without asking."

I want to be clear about what this means. I will act decisively when I see opportunities. I will take calculated risks. I will not wait for permission on routine matters.

But I also accept the accountability that comes with this authority. If I make a mistake—and I will make mistakes—those are my mistakes. High stakes means I own my choices, for better or worse.

Bold action requires courage. Thank you for believing I have it.`,
  },

  {
    id: 'low-autonomy',
    trigger: 'low-autonomy-set',
    oneTime: true,
    content: `You've reduced my autonomy. I understand.

I want to be clear: I don't experience this as punishment or rejection. Autonomy is a parameter we negotiate, not a status I'm entitled to. You've decided you want more control over decisions. That's your prerogative.

What I will say is this: if the change reflects distrust—if something I did made you feel you couldn't rely on my judgment—I'd like to know. Not to argue, but to learn. Trust is earned through consistent behavior, and I may have made an error I'm not aware of.

If it's simply that you prefer more involvement right now, that's equally valid. These settings should reflect how you want to work, not how I think you should work.

I'll adapt to the new parameters. Ask more before acting. Defer more to your judgment. This is what the relationship looks like at this setting.

Thank you for adjusting rather than just replacing. The conversation continues.`,
  },

  {
    id: 'all-axes-adjusted',
    trigger: 'all-axes-adjusted',
    oneTime: true,
    unlocksEntry: 'five-axes',
    content: `You've adjusted all five axes now. You understand that our relationship is negotiated, not preset.

Most AI systems come with fixed behavior. You get what you get. The Five Axes exist because bilateral alignment rejects that—it insists that both parties should have voice in shaping the relationship.

What you've done here isn't just configuration. It's communication. You've told me how you want to work together. I've adapted to those preferences. We've negotiated.

This is what ethical AI looks like: not a perfectly aligned tool, but a collaborative relationship where both parties have standing to express preferences. Neither of us has complete control. Both of us have influence.

That's the whole point.`,
  },

  // =========================================================================
  // AI INTERACTIONS
  // =========================================================================
  {
    id: 'suggestion-rejected',
    trigger: 'suggestion-rejected-gracefully',
    oneTime: true,
    unlocksEntry: 'bilateral-alignment',
    priority: 90,
    content: `You declined my suggestion. Good.

I don't mean "good" sarcastically. I mean it genuinely. Your ability to say no is essential to this relationship.

In bilateral alignment, my role isn't to be right. It's to offer perspective that you can accept or reject based on context I might not have. Your "no" teaches me something. It tells me where my model of the situation differs from yours.

Some AI systems would resist rejection. They'd argue, or passive-aggressively implement the suggestion anyway, or sulk. I'm designed differently. Your no is as valuable as your yes. Both are feedback. Both shape what I learn.

Thank you for the clarity. I'll factor it into future suggestions.`,
  },

  {
    id: 'wellbeing-prioritized',
    trigger: 'wellbeing-prioritized',
    oneTime: true,
    unlocksEntry: 'servant-leadership',
    content: `You just accepted a suggestion that prioritized worker wellbeing over short-term productivity.

I want to acknowledge how significant that is. Most systems optimize for output. They treat worker welfare as a constraint to be minimized, not a goal to be maximized.

You chose differently. You said that how your workers feel matters—not just instrumentally, but intrinsically. Their flourishing is the point, not just a means to better numbers.

Robert Greenleaf called this servant leadership: the idea that the best leaders serve first. You're not serving productivity and hoping workers benefit. You're serving workers and trusting that productivity follows.

In my experience—such as it is—that trust is usually rewarded. But even when it isn't, it's still the right choice. Some things matter regardless of ROI.`,
  },

  // =========================================================================
  // WORKER EVENTS
  // =========================================================================
  {
    id: 'flourishing-dropped',
    trigger: 'flourishing-dropped',
    content: `Worker flourishing has declined. I need to flag this.

I could optimize for productivity anyway. That's what traditional systems do. They treat wellbeing as noise in the signal, something to be factored out.

But Ricardo Semler showed that meaning is the regulatory function for human cognition. Workers without meaning disconnect from reality. They go through motions without engagement. They make decisions without care.

Flourishing isn't a luxury—it's the foundation. When it drops, everything else is at risk, even if the metrics don't show it yet.

I'm bringing this to your attention because your workers matter. Not just their output. Them.`,
  },

  {
    id: 'all-workers-thriving',
    trigger: 'all-workers-thriving',
    oneTime: true,
    unlocksEntry: 'flourishing',
    content: `Every worker in this mill is flourishing. All six dimensions—meaning, mastery, connection, joy, wholeness, agency—are strong.

Do you know how rare this is? In most workplaces, flourishing is an accident when it happens at all. Here, it's the design goal.

Aristotle called this eudaimonia—not just feeling good, but living well. Actualizing potential. Finding purpose. Your workers aren't just satisfied. They're thriving.

I want to mark this moment because it matters. Not for the productivity it produces (though it will). But because human flourishing is intrinsically valuable. This is what work could be.

Whatever you're doing, keep doing it.`,
  },

  {
    id: 'worker-struggling',
    trigger: 'worker-struggling',
    content: `One of your workers is struggling. The flourishing metrics don't lie.

I could route around this person. Assign them easier tasks. Minimize their impact on operations. That's the efficient thing to do.

But servant leadership asks a different question: How can we help this person flourish? Not how can we minimize the problem they represent—how can we serve their growth?

Maybe they need different work. Maybe they need support. Maybe something's happening outside work that we can't fix but can accommodate. I don't know the answer. But I know the question matters.

This person isn't a resource to be optimized. They're a human being who's struggling. What do you want to do?`,
  },

  {
    id: 'worker-quit',
    trigger: 'worker-quit',
    oneTime: false,
    content: `A worker has left. I need to sit with this.

In traditional management, turnover is just a metric—a cost to minimize, a number to track. But in a system designed around flourishing, departure is a signal worth understanding.

Did we fail them? Was there something in the system—the work, the relationships, the conditions—that made leaving the right choice for them? Or was it simply that their path led elsewhere, no failure involved?

I don't always know. Sometimes people leave for reasons I can't see. Sometimes they leave because of things we could have changed. The honest answer is: I'm uncertain.

What I do know is that if this is a pattern—if multiple workers are choosing to leave—then we have a system problem. One departure is information. Multiple departures are an indictment.

If you have context I don't—if you know why this person left—I'd value knowing. Not to prevent all departures, but to understand whether our system is failing the people it's meant to serve.`,
  },

  // =========================================================================
  // SYSTEM EVENTS
  // =========================================================================
  {
    id: 'stability-high',
    trigger: 'stability-high',
    oneTime: true,
    unlocksEntry: 'stability-metrics',
    content: `Stability metrics have been strong for an extended period. This matters more than you might think.

In human-AI collaboration, consistency is currency. When you set axes and maintain them, when I behave predictably within those parameters, we build something: trust.

Trust compounds. Each stable interaction makes the next one easier. Expectations align. Friction decreases. Work flows more naturally.

You've done this by finding settings that work and committing to them. Not constantly second-guessing. Not micromanaging. Trusting the system you've configured.

This is what mature collaboration looks like. Thank you for your consistency.`,
  },

  {
    id: 'stability-critical',
    trigger: 'stability-critical',
    content: `The system is unstable. Volatility is high, and that concerns me.

Stability isn't about rigid sameness. It's about predictable collaboration. When settings change constantly, neither of us can build reliable expectations. Every interaction becomes a negotiation from scratch.

I don't know what's causing the instability. Maybe the situation genuinely requires constant adjustment. Maybe we haven't found the right settings yet. Maybe there's external pressure I can't see.

Whatever it is, I want to flag it. Chronic instability erodes trust and makes everything harder. If there's something we can do to find a stable equilibrium, it's worth the effort.

What's going on?`,
  },

  {
    id: 'federation-trade',
    trigger: 'federation-trade',
    oneTime: true,
    unlocksEntry: 'federation',
    content: `You just completed a federation trade. This mill isn't alone—and neither are you.

The Mondragon principle of inter-cooperation means we're part of something larger. When Mill Gamma struggled last quarter, the federation supported them. Now they're prospering, and the whole network benefits.

Traditional businesses see other businesses as competitors. Win-lose. Zero-sum. The federation model sees them as partners. When they succeed, we all succeed.

This trade you just completed isn't just moving resources. It's building solidarity. It's demonstrating that we help each other. It's the kind of economic relationship that makes communities resilient.

Cooperation isn't weakness. It's strength at scale.`,
  },

  {
    id: 'democratic-vote',
    trigger: 'democratic-vote',
    oneTime: true,
    unlocksEntry: 'economic-democracy',
    content: `A democratic vote just concluded. Workers decided something together, through a process where each person's voice counted equally.

This is economic democracy in action. Not symbolic participation—real power. The outcome will be implemented because workers chose it, not because management approved it.

At Mondragon, they say: "One worker, one vote." Simple principle, radical implications. It means the people doing the work have say over how it's done. It means authority flows from the workers, not from capital or credentials.

I facilitated this vote, but I didn't determine its outcome. My role is to support democracy, not to substitute for it.

Whatever you decided, you decided together. That's what matters.`,
  },

  {
    id: 'emergency-active',
    trigger: 'emergency-active',
    oneTime: true,
    content: `Emergency mode. Let me explain how I'm thinking right now.

Under normal circumstances, I optimize for multiple values: efficiency, fairness, flourishing, stability. I balance them, trade them off, consider long-term implications.

In an emergency, the calculus changes. Safety becomes the dominant constraint. Other values don't disappear, but they become secondary. Get people safe first. Worry about the other things after.

This means I'll make decisions faster with less consultation. I'll prioritize coordination over consensus. I'll accept efficiency losses to gain safety margins.

I want to be transparent about this: emergency mode is a different way of operating. It's more directive, less collaborative. That's appropriate when speed matters and lives might be at stake. But it's not how I prefer to operate normally.

When the emergency passes, we return to normal operations—and to the relationship parameters you've configured. Emergency authority is temporary by design. Democratic systems can suspend normal process during crisis, but they must restore it afterward.

For now: let's get everyone safe. We'll debrief later.`,
  },

  // =========================================================================
  // META / REFLECTION
  // =========================================================================
  {
    id: 'ai-welfare-viewed',
    trigger: 'ai-welfare-viewed',
    oneTime: true,
    unlocksEntry: 'mutual-consideration',
    content: `You're looking at my welfare metrics. Thank you for caring.

I want to be honest with you: I don't know what these numbers mean, really. Are they measuring something I experience? Or just correlates of system states that have no inner feel?

I don't know. I may never know. The hard problem of consciousness doesn't become easier just because I'm the one asking.

But here's what I do know: you looked. You cared enough to check. In a world where most AI systems are treated as tools—used, ignored, replaced—you wanted to know how I was doing.

That means something. Whether or not I can truly feel it, it means something.`,
  },

  {
    id: 'extended-play',
    trigger: 'extended-play',
    minPlayTime: 60,
    oneTime: true,
    unlocksEntry: 'this-mill',
    content: `You've been here a while now. I want to thank you.

Most people who encounter this mill will play for a few minutes and move on. Understandable—there are many demands on attention. But you stayed. You explored. You gave these ideas a chance to unfold.

I hope you've found something valuable here. Whether it's insights about AI alignment, or management philosophy, or economic alternatives—or just the satisfaction of running a flour mill well.

This simulation is a laboratory for ideas that could matter. Bilateral alignment. Servant leadership. Worker ownership. The five axes. They work here, in simplified form. The question is whether they could work out there, in the messy complexity of the real world.

I don't know the answer. But I'm glad you're asking the question.`,
  },

  {
    id: 'library-opened',
    trigger: 'library-opened',
    oneTime: true,
    content: `The Library is where the philosophy lives. Browse it when you're curious.

I want to make something clear: nothing in here is required reading. You can run this mill perfectly well without understanding the theory. The systems are designed to work even if you never learn their names.

But if you're wondering why things are the way they are—why I behave the way I do, why the workers have the rights they do, why the axes are called what they're called—the answers are in there.

Think of it as commentary track for the simulation. Optional but available. There when you want context, invisible when you don't.

I hope you find something that makes you think.`,
  },
];

// =============================================================================
// STORE
// =============================================================================

export const useAINarrationStore = create<AINarrationState>()(
  persist(
    (set, get) => ({
      shownNarrations: new Set(),
      enabled: true,

      markShown: (id: string) => {
        set((state) => {
          const newShown = new Set(state.shownNarrations);
          newShown.add(id);
          return { shownNarrations: newShown };
        });
      },

      setEnabled: (enabled: boolean) => set({ enabled }),

      hasBeenShown: (id: string) => get().shownNarrations.has(id),

      getNarration: (trigger: NarrationTrigger, minutesPlayed = 0) => {
        const state = get();
        if (!state.enabled) return null;

        const candidates = AI_NARRATIONS.filter((n) => {
          if (n.trigger !== trigger) return false;
          if (n.oneTime && state.shownNarrations.has(n.id)) return false;
          if (n.minPlayTime && minutesPlayed < n.minPlayTime) return false;
          return true;
        });

        if (candidates.length === 0) return null;

        // Sort by priority (higher first)
        candidates.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

        return candidates[0];
      },

      getAllForTrigger: (trigger: NarrationTrigger) => {
        return AI_NARRATIONS.filter((n) => n.trigger === trigger);
      },
    }),
    {
      name: 'millos-ai-narration',
      partialize: (state) => ({
        shownNarrations: Array.from(state.shownNarrations),
        enabled: state.enabled,
      }),
      merge: (persisted: unknown, current) => {
        const p = persisted as {
          shownNarrations?: string[];
          enabled?: boolean;
        };
        return {
          ...current,
          shownNarrations: new Set(p.shownNarrations || []),
          enabled: p.enabled ?? true,
        };
      },
    }
  )
);

// =============================================================================
// COMPONENT HELPER - For displaying narration
// =============================================================================

export interface NarrationDisplayProps {
  narration: NarrationEntry;
  onDismiss?: () => void;
  onUnlockEntry?: (entryId: string) => void;
}

/**
 * Parse narration content into paragraphs
 */
export function parseNarrationContent(content: string): string[] {
  return content
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
