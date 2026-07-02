/**
 * Voting Store - Democratic Decision System
 *
 * Implements the democratic voting system for the Bilateral Autonomy System.
 * Based on Semler's worker self-governance and Mondragon's one-worker-one-vote.
 *
 * Workers can vote on:
 * - Policy changes
 * - AI behavior modifications
 * - Schedule changes
 * - Work method changes
 * - Axis configuration changes
 * - Recognition awards
 */

import { create } from 'zustand';
import { WORKER_ROSTER } from '../types';
import type { Vote, VoteStatus, VoteOption, VoteComment, AxisKey } from '../types/bas';
import { VOTING_RULES } from '../types/bas';
import { useBASStore } from './basStore';
import { useUIStore } from './uiStore';
import { useAchievementsStore } from './achievementsStore';

// =============================================================================
// STORE INTERFACE
// =============================================================================

interface VotingState {
  // Active and historical votes
  votes: Vote[];

  // Actions
  createVote: (
    vote: Omit<
      Vote,
      | 'id'
      | 'createdAt'
      | 'status'
      | 'result'
      | 'turnout'
      | 'discussionThread'
      | 'openedAt'
      | 'closedAt'
      | 'deadline'
      | 'quorumRequired'
      | 'approvalThreshold'
    >
  ) => Vote;
  openVote: (voteId: string) => void;
  castVote: (voteId: string, workerId: string, optionId: string) => void;
  closeVote: (voteId: string) => void;
  implementVote: (voteId: string) => void;
  addComment: (voteId: string, workerId: string, content: string, isAI?: boolean) => void;

  // Queries
  getActiveVotes: () => Vote[];
  getClosedVotes: () => Vote[];
  getPendingVotesForWorker: (workerId: string) => Vote[];
  getVoteResult: (
    voteId: string
  ) => { passed: boolean; winner: VoteOption | null; turnout: number } | null;
  hasWorkerVoted: (voteId: string, workerId: string) => boolean;

  // AI integration
  generateAIAnalysis: (voteId: string) => void;

  // Simulation
  simulateWorkerVoting: (voteId: string) => void;

  // Utilities
  createAxisChangeVote: (
    axis: AxisKey,
    currentValue: number,
    proposedValue: number,
    proposerId: string
  ) => Vote;
  createAIBehaviorVote: (
    title: string,
    description: string,
    options: { label: string; description: string }[]
  ) => Vote;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/** Worker id used for the human player's votes in the voting UI */
const PLAYER_WORKER_ID = 'worker-1';

function generateVoteId(): string {
  return `vote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateOptionId(): string {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getWorkerName(workerId: string): string {
  if (workerId === 'ai') return 'AI System';
  if (workerId === 'system') return 'System';
  const worker = WORKER_ROSTER.find((w) => w.id === workerId);
  return worker?.name || 'Unknown Worker';
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useVotingStore = create<VotingState>((set, get) => ({
  votes: [],

  createVote: (
    voteData: Omit<
      Vote,
      | 'id'
      | 'createdAt'
      | 'status'
      | 'result'
      | 'turnout'
      | 'discussionThread'
      | 'openedAt'
      | 'closedAt'
      | 'deadline'
      | 'quorumRequired'
      | 'approvalThreshold'
    >
  ) => {
    const rules = VOTING_RULES[voteData.type];
    const vote: Vote = {
      ...voteData,
      id: generateVoteId(),
      createdAt: Date.now(),
      openedAt: null,
      closedAt: null,
      deadline: null,
      quorumRequired: rules.quorum,
      approvalThreshold: rules.approval,
      status: 'draft',
      result: null,
      turnout: 0,
      discussionThread: [],
    };

    set((state) => ({ votes: [...state.votes, vote] }));
    return vote;
  },

  openVote: (voteId) => {
    set((state) => ({
      votes: state.votes.map((v) => {
        if (v.id !== voteId) return v;
        const rules = VOTING_RULES[v.type];
        return {
          ...v,
          status: 'open' as VoteStatus,
          openedAt: Date.now(),
          deadline: Date.now() + rules.hours * 60 * 60 * 1000,
        };
      }),
    }));
  },

  castVote: (voteId, workerId, optionId) => {
    // Snapshot before mutating: achievement progress counts each vote the
    // player participates in once (changing a vote is not a new participation).
    const priorVote = get().votes.find((v) => v.id === voteId);
    const alreadyVoted = priorVote?.options.some((opt) => opt.votes.includes(workerId)) ?? false;

    set((state) => ({
      votes: state.votes.map((v) => {
        if (v.id !== voteId || v.status !== 'open') return v;

        // Remove worker from all options first (change vote if already voted)
        const updatedOptions = v.options.map((opt) => ({
          ...opt,
          votes: opt.votes.filter((id) => id !== workerId),
        }));

        // Add vote to selected option
        return {
          ...v,
          options: updatedOptions.map((opt) =>
            opt.id === optionId ? { ...opt, votes: [...opt.votes, workerId] } : opt
          ),
        };
      }),
    }));

    // Achievement: the player (worker-1) participating in factory votes.
    // Simulated worker votes deliberately do not count.
    if (workerId === PLAYER_WORKER_ID && priorVote?.status === 'open' && !alreadyVoted) {
      const achievements = useAchievementsStore.getState();
      const current = achievements.getAchievement('vote-participant');
      achievements.updateAchievementProgress('vote-participant', (current?.progress ?? 0) + 1);
    }
  },

  closeVote: (voteId) => {
    const vote = get().votes.find((v) => v.id === voteId);
    if (!vote) return;

    // Guard: Empty options array - cannot close a vote with no options
    if (vote.options.length === 0) {
      return;
    }

    const totalWorkers = WORKER_ROSTER.length;
    const totalVotes = vote.options.reduce((sum, opt) => sum + opt.votes.length, 0);
    // Guard: Division by zero - handle edge case of empty worker roster
    const turnout = totalWorkers > 0 ? totalVotes / totalWorkers : 0;

    // Find winner (option with most votes)
    const sortedOptions = [...vote.options].sort((a, b) => b.votes.length - a.votes.length);
    const winner = sortedOptions[0];
    const winnerFraction = totalVotes > 0 ? winner.votes.length / totalVotes : 0;

    // Check if passed
    const quorumMet = turnout >= vote.quorumRequired;
    const approvalMet = winnerFraction >= vote.approvalThreshold;
    const passed = quorumMet && approvalMet;

    set((state) => ({
      votes: state.votes.map((v) => {
        if (v.id !== voteId) return v;
        return {
          ...v,
          status: passed ? ('closed' as VoteStatus) : ('rejected' as VoteStatus),
          closedAt: Date.now(),
          turnout,
          result: passed ? winner : null,
        };
      }),
    }));

    // Auto-implement if vote passed
    if (passed) {
      // Use setTimeout to ensure state update completes before implementation
      setTimeout(() => {
        get().implementVote(voteId);
      }, 0);
    }
  },

  implementVote: (voteId) => {
    const vote = get().votes.find((v) => v.id === voteId);
    if (!vote || vote.status !== 'closed' || !vote.result) return;

    // Helper to send notification
    const sendNotification = (
      title: string,
      message: string,
      type: 'success' | 'info' = 'success'
    ) => {
      useUIStore.getState().addAlert({
        id: `vote-impl-${Date.now()}`,
        type,
        title,
        message,
        timestamp: new Date(),
        acknowledged: false,
      });
    };

    // Phase 3: Actually apply the vote results
    if (vote.type === 'axis-change' && vote.targetAxis && vote.proposedValue !== undefined) {
      // Check if the winning option was "Accept Change" (first option)
      const acceptOptionId = vote.options[0]?.id;
      if (vote.result.id === acceptOptionId) {
        const axisLabels: Record<AxisKey, string> = {
          autonomyLevel: 'Autonomy Level',
          decisionMode: 'Decision Mode',
          informationAccess: 'Information Access',
          evaluationDirection: 'Evaluation Direction',
          collectiveOrientation: 'Collective Orientation',
        };
        const axisLabel = axisLabels[vote.targetAxis!] || vote.targetAxis;
        useBASStore.getState().setAxis(vote.targetAxis!, vote.proposedValue!);
        sendNotification(
          'Vote Implemented',
          `${axisLabel} changed to ${vote.proposedValue}% by democratic vote.`
        );
      } else {
        // "Keep Current" won - notify but don't change
        sendNotification(
          'Vote Concluded',
          `Workers voted to keep current settings for ${vote.title}.`,
          'info'
        );
      }
    } else if (vote.type === 'ai-behavior' && vote.result) {
      // Apply AI behavior change based on winning option
      const config = useBASStore.getState().aiConfig;
      const winningLabel = vote.result!.label.toLowerCase();
      let changeDescription = vote.result!.label;
      let changeApplied = false;

      // Parse common AI behavior options
      if (winningLabel.includes('suggestive') || winningLabel.includes('proactive')) {
        useBASStore.getState().updateAIConfig({
          ...config,
          suggestionFrequency: 'proactive',
        });
        changeDescription = 'AI will now provide proactive suggestions';
        changeApplied = true;
      } else if (winningLabel.includes('reactive') || winningLabel.includes('wait')) {
        useBASStore.getState().updateAIConfig({
          ...config,
          suggestionFrequency: 'reactive',
        });
        changeDescription = 'AI will now wait for issues before suggesting';
        changeApplied = true;
      } else if (winningLabel.includes('on-request') || winningLabel.includes('ask')) {
        useBASStore.getState().updateAIConfig({
          ...config,
          suggestionFrequency: 'on-request',
        });
        changeDescription = 'AI will now only respond when asked';
        changeApplied = true;
      } else if (winningLabel.includes('reasoning') || winningLabel.includes('explain')) {
        useBASStore.getState().updateAIConfig({
          ...config,
          languageStyle: {
            ...config.languageStyle,
            provideReasoning: true,
          },
        });
        changeDescription = 'AI will now explain its reasoning';
        changeApplied = true;
      } else if (winningLabel.includes('concise') || winningLabel.includes('brief')) {
        useBASStore.getState().updateAIConfig({
          ...config,
          languageStyle: {
            ...config.languageStyle,
            provideReasoning: false,
          },
        });
        changeDescription = 'AI will now provide concise responses';
        changeApplied = true;
      }

      if (changeApplied) {
        sendNotification(
          'AI Behavior Changed',
          `${changeDescription} (voted: "${vote.result!.label}").`
        );
      } else {
        // Winning label matched no known behavior pattern - no config changed,
        // so report a neutral conclusion instead of a misleading change notice.
        sendNotification(
          'Vote Concluded',
          `Workers selected "${vote.result!.label}" for ${vote.title}.`,
          'info'
        );
      }
    } else if (vote.type === 'policy') {
      // Policy votes are informational - just notify
      sendNotification(
        'Policy Vote Passed',
        `"${vote.title}" approved with ${Math.round(vote.turnout * 100)}% turnout.`
      );
    } else if (vote.type === 'schedule') {
      // Schedule votes - notify (could integrate with shift scheduling in future)
      sendNotification(
        'Schedule Change Approved',
        `"${vote.title}" - ${vote.result.label} selected by workers.`
      );
    } else if (vote.type === 'method') {
      // Method change votes
      sendNotification(
        'Work Method Changed',
        `"${vote.title}" - New method: ${vote.result.label}.`
      );
    } else if (vote.type === 'recognition') {
      // Recognition votes
      sendNotification(
        'Worker Recognized',
        `"${vote.title}" - ${vote.result.label} approved by peers.`
      );
    } else if (vote.type === 'emergency') {
      // Emergency votes
      sendNotification(
        'Emergency Decision Made',
        `"${vote.title}" - ${vote.result.label} enacted immediately.`
      );
    }

    // Mark as implemented
    set((state) => ({
      votes: state.votes.map((v) =>
        v.id === voteId ? { ...v, status: 'implemented' as VoteStatus } : v
      ),
    }));
  },

  addComment: (voteId, workerId, content, isAI = false) => {
    const comment: VoteComment = {
      id: `comment-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      workerId,
      workerName: isAI ? 'AI Assistant' : getWorkerName(workerId),
      content,
      timestamp: Date.now(),
      isAI,
    };

    set((state) => ({
      votes: state.votes.map((v) =>
        v.id === voteId ? { ...v, discussionThread: [...v.discussionThread, comment] } : v
      ),
    }));
  },

  getActiveVotes: () => {
    return get().votes.filter((v) => v.status === 'open');
  },

  getClosedVotes: () => {
    return get().votes.filter((v) => v.status === 'closed' || v.status === 'implemented');
  },

  getPendingVotesForWorker: (workerId) => {
    return get().votes.filter((v) => {
      if (v.status !== 'open') return false;
      // Check if worker hasn't voted yet
      return !v.options.some((opt) => opt.votes.includes(workerId));
    });
  },

  getVoteResult: (voteId) => {
    const vote = get().votes.find((v) => v.id === voteId);
    if (!vote || vote.status === 'open' || vote.status === 'draft') return null;
    return {
      passed: vote.status === 'closed' || vote.status === 'implemented',
      winner: vote.result,
      turnout: vote.turnout,
    };
  },

  hasWorkerVoted: (voteId, workerId) => {
    const vote = get().votes.find((v) => v.id === voteId);
    if (!vote) return false;
    return vote.options.some((opt) => opt.votes.includes(workerId));
  },

  generateAIAnalysis: (voteId) => {
    const vote = get().votes.find((v) => v.id === voteId);
    if (!vote) return;

    // Generate neutral AI analysis
    const optionSummary = vote.options.map((opt) => `"${opt.label}"`).join(', ');

    const analysis =
      `Analysis of "${vote.title}": This ${vote.type} decision has ${vote.options.length} options (${optionSummary}). ` +
      `Requires ${Math.round(vote.quorumRequired * 100)}% participation and ${Math.round(vote.approvalThreshold * 100)}% approval to pass. ` +
      `${vote.deadline ? `Voting closes in ${Math.round((vote.deadline - Date.now()) / 3600000)} hours.` : ''}`;

    set((state) => ({
      votes: state.votes.map((v) => (v.id === voteId ? { ...v, aiAnalysis: analysis } : v)),
    }));
  },

  simulateWorkerVoting: (voteId) => {
    const vote = get().votes.find((v) => v.id === voteId);
    if (!vote || vote.status !== 'open') return;

    // Simulate workers voting based on their preferences
    WORKER_ROSTER.forEach((worker) => {
      // Skip if already voted
      if (vote.options.some((opt) => opt.votes.includes(worker.id))) return;

      // Random voting with slight preference for first option (assumed recommended)
      const weights = vote.options.map((_, i) => (i === 0 ? 2 : 1));
      const totalWeight = weights.reduce((a, b) => a + b, 0);
      let random = Math.random() * totalWeight;

      for (let i = 0; i < vote.options.length; i++) {
        random -= weights[i];
        if (random <= 0) {
          get().castVote(voteId, worker.id, vote.options[i].id);
          break;
        }
      }
    });
  },

  createAxisChangeVote: (
    axis: AxisKey,
    currentValue: number,
    proposedValue: number,
    proposerId: string
  ) => {
    const axisLabels: Record<AxisKey, string> = {
      autonomyLevel: 'Autonomy Level',
      decisionMode: 'Decision Mode',
      informationAccess: 'Information Access',
      evaluationDirection: 'Evaluation Direction',
      collectiveOrientation: 'Collective Orientation',
    };

    const vote = get().createVote({
      type: 'axis-change',
      title: `Change ${axisLabels[axis]}`,
      description: `Proposal to change ${axisLabels[axis]} from ${currentValue}% to ${proposedValue}%`,
      proposedBy: proposerId,
      proposerName: getWorkerName(proposerId),
      options: [
        {
          id: generateOptionId(),
          label: 'Accept Change',
          description: `Set ${axisLabels[axis]} to ${proposedValue}%`,
          votes: [],
        },
        {
          id: generateOptionId(),
          label: 'Keep Current',
          description: `Keep ${axisLabels[axis]} at ${currentValue}%`,
          votes: [],
        },
      ],
      targetAxis: axis,
      proposedValue,
    });

    return vote;
  },

  createAIBehaviorVote: (
    title: string,
    description: string,
    options: { label: string; description: string }[]
  ) => {
    const vote = get().createVote({
      type: 'ai-behavior',
      title,
      description,
      proposedBy: 'system',
      proposerName: 'System',
      options: options.map((opt) => ({
        id: generateOptionId(),
        label: opt.label,
        description: opt.description,
        votes: [],
      })),
    });

    return vote;
  },
}));

// =============================================================================
// PERIODIC VOTE GENERATOR
// =============================================================================

/** Contextual worker-initiated votes so democratic voting occurs in normal play */
const WORKER_VOTE_TEMPLATES: {
  type: Vote['type'];
  title: string;
  description: string;
  options: { label: string; description: string }[];
}[] = [
  {
    type: 'schedule',
    title: 'Rotate Break Schedule',
    description:
      'Proposal to rotate break slots weekly so no crew is always stuck with the late slot.',
    options: [
      { label: 'Weekly rotation', description: 'Rotate break slots every week.' },
      { label: 'Keep fixed slots', description: 'Keep the current fixed break schedule.' },
    ],
  },
  {
    type: 'method',
    title: 'Pair Checks on Sifter Cleaning',
    description:
      'Proposal to do plansifter cleaning in pairs: slower per task, but fewer re-cleans and safer.',
    options: [
      { label: 'Adopt pair checks', description: 'Two workers per sifter cleaning task.' },
      { label: 'Keep solo cleaning', description: 'One worker per task, as today.' },
    ],
  },
  {
    type: 'policy',
    title: 'Open Maintenance Log',
    description:
      'Proposal to make the full maintenance log visible to all workers, not just the shift lead.',
    options: [
      { label: 'Open the log', description: 'Everyone can read the maintenance history.' },
      { label: 'Leads only', description: 'Keep access limited to shift leads.' },
    ],
  },
  {
    type: 'recognition',
    title: 'Recognize the Packing Line Crew',
    description:
      'Nomination: the packing crew covered two absences this week without missing the target.',
    options: [
      { label: 'Award recognition', description: 'Formally recognize the packing crew.' },
      { label: 'Hold for review', description: 'Wait until the monthly recognition round.' },
    ],
  },
];

let voteGeneratorInterval: ReturnType<typeof setInterval> | null = null;
let nextTemplateIndex = Math.floor(Math.random() * WORKER_VOTE_TEMPLATES.length);

/**
 * Start the low-frequency worker-vote producer. Creates and opens a contextual
 * worker-initiated vote every ~5 minutes of play, but only when no vote is
 * currently open. Returns a cleanup function; safe to call more than once.
 */
export function startVoteGenerator(intervalMs = 5 * 60 * 1000): () => void {
  if (voteGeneratorInterval !== null) {
    return stopVoteGenerator;
  }

  voteGeneratorInterval = setInterval(() => {
    const store = useVotingStore.getState();
    if (store.getActiveVotes().length > 0) return;

    const template = WORKER_VOTE_TEMPLATES[nextTemplateIndex % WORKER_VOTE_TEMPLATES.length];
    nextTemplateIndex += 1;

    const proposer = WORKER_ROSTER[Math.floor(Math.random() * WORKER_ROSTER.length)];
    const vote = store.createVote({
      type: template.type,
      title: template.title,
      description: template.description,
      proposedBy: proposer?.id ?? 'system',
      proposerName: proposer?.name ?? 'System',
      options: template.options.map((opt) => ({
        id: generateOptionId(),
        label: opt.label,
        description: opt.description,
        votes: [],
      })),
    });
    store.openVote(vote.id);
    store.generateAIAnalysis(vote.id);

    useUIStore.getState().addAlert({
      id: `vote-open-${vote.id}`,
      type: 'info',
      title: 'New Vote Opened',
      message: `${vote.proposerName} proposed: "${vote.title}". Cast your vote in the Democratic Voting panel.`,
      timestamp: new Date(),
      acknowledged: false,
    });
  }, intervalMs);

  return stopVoteGenerator;
}

export function stopVoteGenerator(): void {
  if (voteGeneratorInterval !== null) {
    clearInterval(voteGeneratorInterval);
    voteGeneratorInterval = null;
  }
}
