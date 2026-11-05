/**
 * Comprehensive Tests for AICommandCenter Component
 *
 * Tests cover:
 * - Component rendering and initial state
 * - Decision management (generation, intervals, cleanup)
 * - System status calculations (CPU, memory, success rate)
 * - UI interactions (tab switching, expand/collapse)
 * - Memory management (cleanup on unmount)
 * - Alert reactions
 * - Predictions and impact stats
 * - Decision feed display
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AIDecision, AlertData, MachineData } from '../../types';

let AICommandCenter: (typeof import('../AICommandCenter'))['AICommandCenter'];

const staticAIConfigState = {
  aiMode: 'heuristic' as const,
  llmBackend: 'haiku' as const,
  connectedProviders: { haiku: false, luna: false },
  webgpuModelReady: false,
  getFormattedCost: () => '$0.00',
  costTracking: { requestCount: 0, sessionCost: 0 },
  isTacticalThinking: false,
  systemStatus: {
    cpu: 45,
    memory: 62,
    decisions: 0,
    successRate: 95,
  },
};

const aiEngineMock = {
  generateContextAwareDecision: vi.fn(),
  applyDecisionEffects: vi.fn(),
  reactToAlert: vi.fn(),
  getPredictedEvents: vi.fn(() => [] as any[]),
  getImpactStats: vi.fn(() => null as any),
  getSparklineData: vi.fn(() => [0.2, 0.4, 0.6, 0.5, 0.7]),
  shouldTriggerAudioCue: vi.fn(() => false),
  getConfidenceAdjustmentForType: vi.fn(() => 0),
  isTacticalLayerActive: vi.fn(() => true),
  isDeferralReturned: vi.fn((_id: string) => false),
  // The stored text: AICommandCenter.language.gameplay.test.tsx covers the keyed copy.
  decisionCardText: (decision: AIDecision) => ({
    action: decision.action,
    reasoning: decision.reasoning,
    impact: decision.impact,
    note: decision.response?.note,
    outcome: decision.outcome,
  }),
  isStrategicLayerActive: vi.fn(() => false),
  isGeminiModeActive: vi.fn(() => false),
};

// AICommandCenter plays no sounds; the mock only keeps the real Web Audio
// manager from loading in jsdom.
const audioManagerMock = {};

// Mock lucide-react to avoid importing thousands of icon components in unit tests.
vi.mock('lucide-react', () => ({
  __esModule: true,
  Bot: () => null,
  Brain: () => null,
  Shield: () => null,
  User: () => null,
  Users: () => null,
  Network: () => null,
  Wrench: () => null,
  Zap: () => null,
  Eye: () => null,
  CheckCircle: () => null,
  Clock: () => null,
  AlertTriangle: () => null,
  Activity: () => null,
  TrendingUp: () => null,
  Target: () => null,
  Settings: () => null,
  CheckCircle2: () => null,
  Clock3: () => null,
  XCircle: () => null,
}));

// Mock Framer Motion to avoid animation complications in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock the Zustand stores
const mockProductionStore = vi.fn();
const mockUIStore = vi.fn();
const mockGameSimulationStore = vi.fn();

vi.mock('../../stores/productionStore', () => ({
  useProductionStore: (selector: any) => mockProductionStore(selector),
}));

vi.mock('../../stores/uiStore', () => ({
  useUIStore: (selector: any) => mockUIStore(selector),
}));

vi.mock('../../stores/gameSimulationStore', () => ({
  useGameSimulationStore: (selector: any) => mockGameSimulationStore(selector),
}));

// Mock large UI subcomponents imported by AICommandCenter to avoid pulling the
// entire UI layer (charts, overlays, etc.) into this unit test.
vi.mock('../AISettingsModal', () => ({
  AISettingsModal: () => null,
}));
vi.mock('../ui/ActionPlanTimeline', () => ({
  ActionPlanTimeline: () => <div data-testid="action-plan-timeline" />,
}));
vi.mock('../ui/DecisionHistoryPanel', () => ({
  DecisionHistoryPanel: () => <div data-testid="decision-history-panel" />,
}));
vi.mock('../ui/StrategicPriorityCards', () => ({
  StrategicPriorityCards: () => <div data-testid="strategic-priority-cards" />,
}));
vi.mock('../ui/VCLDebugPanel', () => ({
  VCLDebugPanel: () => <div data-testid="vcl-debug-panel" />,
}));
vi.mock('../ui/VCLDiffPanel', () => ({
  VCLDiffPanel: () => <div data-testid="vcl-diff-panel" />,
}));

// Mock aiConfigStore - CRITICAL: must return static values to prevent re-render loops
vi.mock('../../stores/aiConfigStore', () => ({
  useAIConfigStore: (selector?: any) => {
    if (selector) return selector(staticAIConfigState);
    return staticAIConfigState;
  },
}));

// Mock zustand/react/shallow
vi.mock('zustand/react/shallow', () => ({
  useShallow: (fn: any) => fn,
}));

// Mock AI Engine utilities
vi.mock('../../utils/aiEngine', () => ({ ...aiEngineMock }));

// Mock Audio Manager
vi.mock('../../utils/audioManager', () => ({
  audioManager: audioManagerMock,
}));

// The advisory's network call; the panel itself is real.
const jevRequestMock = vi.hoisted(() => vi.fn());
vi.mock('../../utils/jevClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/jevClient')>()),
  requestJevAdvice: jevRequestMock,
}));

describe('AICommandCenter', () => {
  beforeAll(async () => {
    ({ AICommandCenter } = await import('../AICommandCenter'));
  }, 30000);

  // Default mock store states - split by store
  const mockProductionState = {
    aiDecisions: [] as AIDecision[],
    machines: [] as MachineData[],
    metrics: {
      throughput: 1240,
      efficiency: 87.5,
      quality: 94.2,
      uptime: 98.1,
    },
    recordDecisionResponse: vi.fn(),
  };

  const mockUIState = {
    alerts: [] as AlertData[],
  };

  const mockGameState = {
    weather: 'sunny',
    currentShift: 'day',
    gameTime: 8.5,
    emergencyDrillMode: false,
  };

  // Helper to setup all store mocks
  const setupStoreMocks = (productionOverrides = {}, uiOverrides = {}, gameOverrides = {}) => {
    const productionState = { ...mockProductionState, ...productionOverrides };
    const uiState = { ...mockUIState, ...uiOverrides };
    const gameState = { ...mockGameState, ...gameOverrides };

    mockProductionStore.mockImplementation((selector: any) => selector(productionState));
    mockUIStore.mockImplementation((selector: any) => selector(uiState));
    mockGameSimulationStore.mockImplementation((selector: any) => selector(gameState));
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default store mocks
    setupStoreMocks();

    // Mock timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Rendering', () => {
    // Switching tabs unmounted the advisory: the typed incident, the consent and
    // the key were dropped, and a request in flight was aborted (and may still
    // have been billed). Working if a tab switch keeps all of it, in page memory.
    it('keeps the advisory, its typed incident and a request in flight across a tab switch', () => {
      jevRequestMock.mockImplementation(() => new Promise(() => {}));
      const key = `sk-or-v1-${'test-only-'.repeat(5)}`;
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      fireEvent.click(screen.getByRole('tab', { name: 'Advisory' }));
      expect(screen.getByRole('tabpanel', { name: 'Advisory' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Jev advisory' })).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Your OpenRouter API key'), {
        target: { value: key },
      });
      fireEvent.change(screen.getByLabelText('Incident text'), {
        target: { value: 'The pump is broken.' },
      });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: 'Send to Jev' }));
      const signal = jevRequestMock.mock.calls[0][0].signal as AbortSignal;

      fireEvent.click(screen.getByRole('tab', { name: 'Strategic' }));
      // Out of sight while another tab shows.
      expect(screen.queryByRole('region', { name: 'Jev advisory' })).not.toBeInTheDocument();
      expect(screen.getByTestId('strategic-priority-cards')).toBeInTheDocument();
      expect(signal.aborted).toBe(false);

      fireEvent.click(screen.getByRole('tab', { name: 'Advisory' }));
      expect(screen.getByLabelText('Incident text')).toHaveValue('The pump is broken.');
      expect(screen.getByLabelText('Your OpenRouter API key')).toHaveValue(key);
      expect(screen.getByRole('checkbox')).toBeChecked();
      expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
      expect(signal.aborted).toBe(false);
      expect(jevRequestMock).toHaveBeenCalledTimes(1);
      expect(aiEngineMock.applyDecisionEffects).not.toHaveBeenCalled();
    });

    it('shows the session estimate once a paid advisory has billed, whatever strategy runs on', () => {
      // Rules-only strategy: nothing billed reads as no API cost.
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      expect(screen.getByText('NO API COST')).toBeInTheDocument();
      cleanup();
      const original = { ...staticAIConfigState };
      Object.assign(staticAIConfigState, {
        costTracking: { requestCount: 1, sessionCost: 0.000014 },
        getFormattedCost: () => '$0.000014',
      });
      try {
        render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
        expect(screen.queryByText('NO API COST')).not.toBeInTheDocument();
        expect(screen.getByText('$0.000014 est.')).toBeInTheDocument();
      } finally {
        Object.assign(staticAIConfigState, original);
      }
    });

    it('should not render when isOpen is false', () => {
      const { container } = render(<AICommandCenter isOpen={false} onClose={vi.fn()} embedded />);

      expect(container.firstChild).toBeNull();
    });

    it('should show emergency drill banner when drill mode is active', () => {
      setupStoreMocks({}, {}, { emergencyDrillMode: true });

      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      expect(screen.getByText('EGRESS DRILL IN PROGRESS')).toBeInTheDocument();
    });
  });

  // Note: Decision generation logic was moved from this component to aiEngine.ts
  // The AICommandCenter now only visualizes decisions from the store.
  // Tests for decision generation should be in aiEngine.test.ts or the store tests.

  describe('Memory Management and Cleanup', () => {
    // Reactions moved to the engine (aiEngine.alertReactions.gameplay.test.ts),
    // so the panel schedules nothing: opening it cannot double-react, and
    // closing it cannot cancel a reaction that is due.
    it('schedules no alert reaction of its own while open, so none can double up', async () => {
      const mockAlert: AlertData = {
        id: 'alert-cleanup',
        type: 'warning',
        title: 'Test Alert',
        message: 'Cleanup test',
        machineId: 'RM-101',
        timestamp: new Date(),
        acknowledged: false,
      };

      const { rerender, unmount } = render(
        <AICommandCenter isOpen={true} onClose={vi.fn()} embedded />
      );
      setupStoreMocks({}, { alerts: [mockAlert] });
      rerender(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      await act(async () => {});
      expect(vi.getTimerCount()).toBe(0);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(aiEngineMock.reactToAlert).not.toHaveBeenCalled();
      expect(aiEngineMock.applyDecisionEffects).not.toHaveBeenCalled();

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  // Note: Embedded mode doesn't have a close button - onClose is not used.
  // The component is always embedded in ContextSidebar.

  it('should switch between decisions and strategic tabs', () => {
    render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

    // Initially on decisions tab - check for the decisions tab showing selected state
    // (tabs now expose role="tab" inside the role="tablist" group for WCAG conformance)
    const decisionsButton = screen.getByRole('tab', { name: /decisions/i });
    expect(decisionsButton).toHaveClass('bg-cyan-500/20');

    // Click strategic tab
    const strategicButton = screen.getByRole('tab', { name: /strategic/i });
    fireEvent.click(strategicButton);

    // Strategic tab should now be selected
    expect(strategicButton).toHaveClass('bg-amber-500/20');
    expect(decisionsButton).not.toHaveClass('bg-cyan-500/20');

    // Click back to decisions tab
    fireEvent.click(decisionsButton);

    // Decisions tab should be selected again
    expect(decisionsButton).toHaveClass('bg-cyan-500/20');
  });

  describe('Decision Display', () => {
    it('should display AI decisions from store', () => {
      const mockDecisions: AIDecision[] = [
        {
          id: 'display-1',
          timestamp: new Date(),
          type: 'optimization',
          action: 'Optimize Line 1',
          reasoning: 'Low efficiency detected',
          confidence: 85,
          impact: 'Increase throughput by 10%',
          status: 'in_progress',
          priority: 'high',
          machineId: 'RM-101',
        },
        {
          id: 'display-2',
          timestamp: new Date(),
          type: 'maintenance',
          action: 'Schedule maintenance for Silo A',
          reasoning: 'Preventive care window',
          confidence: 92,
          impact: 'Prevent downtime',
          status: 'completed',
          priority: 'medium',
        },
      ];

      setupStoreMocks({ aiDecisions: mockDecisions });

      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      expect(screen.getByText('Optimize Line 1')).toBeInTheDocument();
      expect(screen.getByText('Schedule maintenance for Silo A')).toBeInTheDocument();
      expect(screen.getByText('Low efficiency detected')).toBeInTheDocument();
    });

    it('should render status-specific cards and actions', () => {
      const mockDecisions: AIDecision[] = [
        {
          id: 'status-pending',
          timestamp: new Date(),
          type: 'coordination',
          action: 'Pending task',
          reasoning: 'Test',
          confidence: 75,
          impact: 'Test',
          status: 'pending',
          priority: 'low',
        },
        {
          id: 'status-progress',
          timestamp: new Date(),
          type: 'coordination',
          action: 'In progress task',
          reasoning: 'Test',
          confidence: 75,
          impact: 'Test',
          status: 'in_progress',
          priority: 'medium',
        },
        {
          id: 'status-completed',
          timestamp: new Date(),
          type: 'coordination',
          action: 'Completed task',
          reasoning: 'Test',
          confidence: 75,
          impact: 'Test',
          status: 'completed',
          priority: 'high',
        },
      ];

      setupStoreMocks({ aiDecisions: mockDecisions });

      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      const pendingCard = screen.getByText('Pending task').closest('.border');
      const progressCard = screen.getByText('In progress task').closest('.border');
      const completedCard = screen.getByText('Completed task').closest('.border');

      expect(pendingCard).toHaveClass('border-slate-700/50');
      expect(progressCard).toHaveClass('border-blue-500/30');
      expect(completedCard).toHaveClass('border-green-500/20');
      expect(pendingCard).toHaveTextContent('Accept');
      expect(pendingCard).toHaveTextContent('Defer');
      expect(pendingCard).toHaveTextContent('Reject');
      expect(progressCard).not.toHaveTextContent('Accept');
      expect(completedCard).not.toHaveTextContent('Accept');
    });

    it('should show empty state when no decisions exist', () => {
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      expect(screen.getByText(/No recommendations have been recorded/i)).toBeInTheDocument();
    });

    it('renders exactly the first 15 decision cards and their actions', () => {
      const mockDecisions: AIDecision[] = Array.from({ length: 30 }, (_, i) => ({
        id: `decision-${i}`,
        timestamp: new Date(),
        type: 'optimization',
        action: `Action ${i}`,
        reasoning: `Reasoning ${i}`,
        confidence: 75,
        impact: `Impact ${i}`,
        status: 'pending' as const,
        priority: 'low' as const,
      }));

      setupStoreMocks({ aiDecisions: mockDecisions });

      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      const inspectButtons = screen.getAllByRole('button', { name: 'Inspect evidence' });
      expect(inspectButtons).toHaveLength(15);

      const decisionCards = inspectButtons.map((button) => button.closest('.border'));
      expect(decisionCards.every((card) => card !== null)).toBe(true);
      expect(new Set(decisionCards).size).toBe(15);
      expect(decisionCards.map((card) => card?.querySelector('p.text-white')?.textContent)).toEqual(
        Array.from({ length: 15 }, (_, index) => `Action ${index}`)
      );

      expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(15);
      expect(screen.getAllByRole('button', { name: 'Defer' })).toHaveLength(15);
      expect(screen.getAllByRole('button', { name: 'Reject' })).toHaveLength(15);
      expect(screen.queryByText('Action 15')).not.toBeInTheDocument();
    });

    // Accept and Reject end a card's pending state and remove the button that
    // was pressed. Focus then fell to the page body, so a keyboard player lost
    // their place in the feed after every answer.
    it.each([
      ['Accept', 'completed'],
      ['Reject', 'superseded'],
    ] as const)('keeps focus on the card after %s removes its buttons', (name, status) => {
      const pending: AIDecision = {
        id: 'focus-decision',
        timestamp: new Date(),
        type: 'coordination',
        action: 'Rebalance the packers',
        reasoning: 'Test',
        confidence: 75,
        impact: 'Test',
        status: 'pending',
        priority: 'low',
      };
      setupStoreMocks({ aiDecisions: [pending] });
      const view = render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      const button = screen.getByRole('button', { name });
      button.focus();
      fireEvent.click(button);
      // The store answers the response; the card re-renders without its buttons.
      setupStoreMocks({ aiDecisions: [{ ...pending, status }] });
      view.rerender(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inspect evidence' }));
    });

    // A deferred card stayed pending with Defer still offered, and once 15 newer
    // cards arrived it fell off the list while still holding its place in the
    // unresolved queue. The engine now returns it once after a plant hour.
    // Working if a deferred card offers Accept and Reject but no second Defer,
    // and a returned one is listed first however many cards came after it.
    it('takes Defer away once used, keeping focus on the card', () => {
      const pending: AIDecision = {
        id: 'defer-once',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Plan a bearing check',
        reasoning: 'Test',
        confidence: 80,
        impact: 'Test',
        status: 'pending',
        priority: 'high',
      };
      setupStoreMocks({ aiDecisions: [pending] });
      const view = render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      const defer = screen.getByRole('button', { name: 'Defer' });
      defer.focus();
      fireEvent.click(defer);
      setupStoreMocks({
        aiDecisions: [{ ...pending, response: { disposition: 'deferred', recordedAt: 1 } }],
      });
      view.rerender(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      expect(screen.queryByRole('button', { name: 'Defer' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Accept' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inspect evidence' }));
    });

    it('lists a returned deferral first, with its note, however many cards came after it', () => {
      const decisions: AIDecision[] = Array.from({ length: 20 }, (_, i) => ({
        id: `decision-${i}`,
        timestamp: new Date(),
        type: 'optimization' as const,
        action: `Action ${i}`,
        reasoning: `Reasoning ${i}`,
        confidence: 75,
        impact: `Impact ${i}`,
        status: 'completed' as const,
        priority: 'low' as const,
      }));
      decisions[18] = {
        ...decisions[18],
        status: 'pending',
        response: {
          disposition: 'deferred',
          recordedAt: 1,
          note: 'Back for a decision after 1 plant hour deferred.',
        },
      };
      aiEngineMock.isDeferralReturned.mockImplementation((id: string) => id === 'decision-18');
      try {
        setupStoreMocks({ aiDecisions: decisions });
        render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
        const cards = screen
          .getAllByRole('button', { name: 'Inspect evidence' })
          .map((button) => button.closest('.border'));
        expect(cards).toHaveLength(15);
        expect(cards[0]).toHaveTextContent('Action 18');
        expect(cards[0]).toHaveTextContent('Back for a decision after 1 plant hour deferred.');
        expect(cards[0]).toHaveTextContent('Accept');
        expect(cards[0]).not.toHaveTextContent('Defer');
      } finally {
        aiEngineMock.isDeferralReturned.mockImplementation(() => false);
      }
    });

    // Only the 15 newest cards were listed, and nothing else offers an answer.
    // Once newer cards were answered, older pending ones sat below the cut with
    // no Accept, Defer or Reject anywhere, still counting toward the engine's
    // unresolved limit and blocking new cards for their machines. Working if
    // every card still waiting for an answer is listed before settled ones, as
    // on the phone sheet.
    it('lists every pending card ahead of newer settled ones', () => {
      const decisions: AIDecision[] = Array.from({ length: 20 }, (_, i) => ({
        id: `decision-${i}`,
        timestamp: new Date(),
        type: 'optimization' as const,
        action: `Action ${i}`,
        reasoning: `Reasoning ${i}`,
        confidence: 75,
        impact: `Impact ${i}`,
        // Newest first: the 15 newest are answered, the 5 oldest still wait.
        status: i < 15 ? ('completed' as const) : ('pending' as const),
        priority: 'low' as const,
      }));
      setupStoreMocks({ aiDecisions: decisions });
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      expect(screen.getAllByRole('button', { name: 'Inspect evidence' })).toHaveLength(15);
      expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(5);
      const cards = screen
        .getAllByRole('button', { name: 'Inspect evidence' })
        .map((button) => button.closest('.border'));
      expect(cards[0]).toHaveTextContent('Action 15');
      expect(cards[4]).toHaveTextContent('Action 19');
      expect(cards[5]).toHaveTextContent('Action 0');
    });

    it('shows a lapsed deferral by its outcome, not the note that said it would lapse', () => {
      setupStoreMocks({
        aiDecisions: [
          {
            id: 'lapsed',
            timestamp: new Date(),
            type: 'maintenance',
            action: 'Plan a bearing check',
            reasoning: 'Test',
            confidence: 80,
            impact: 'Test',
            status: 'superseded',
            priority: 'high',
            outcome: 'Deferred and not taken up within 3 plant hours; superseded.',
            response: {
              disposition: 'deferred',
              recordedAt: 1,
              note: 'Back for a decision. It lapses if left another 2 plant hours.',
            },
          },
        ],
      });
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);
      expect(
        screen.getByText('Deferred and not taken up within 3 plant hours; superseded.')
      ).toBeInTheDocument();
      expect(screen.queryByText(/It lapses if left/)).not.toBeInTheDocument();
    });

    // Note: Sparklines feature is noted as "Currently unused but kept for future feature expansion"
    // in AICommandCenter.tsx (lines 38-42). Test removed as feature is not currently implemented.
  });

  describe('System Status Display', () => {
    // Note: System status (CPU, memory, decision count) is now synced from aiConfigStore
    // rather than calculated locally. These tests verify the display of store-provided values.

    it('should display system status values from store', () => {
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Verify system status labels are displayed
      expect(screen.getByText('CPU')).toBeInTheDocument();
      expect(screen.getByText('MEM')).toBeInTheDocument();
      expect(screen.getByText('DEC')).toBeInTheDocument();

      // The values come from staticAIConfigState.systemStatus in the mock (cpu: 45, memory: 62, decisions: 0)
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText('62%')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should display efficiency from production metrics', () => {
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // mockProductionState has efficiency: 87.5
      expect(screen.getByText(/Eff: 88%/i)).toBeInTheDocument();
    });
  });

  // Note: Predictions tab was replaced with Strategic tab in embedded mode.
  // The Strategic tab shows VCL debug info, priority cards, action timeline, and decision history.
  // Predictions functionality is now handled by the store and aiEngine.ts.

  // Note: Impact Stats section was part of standalone mode which has been removed.
  // The embedded mode focuses on decision feed and strategic view.
  // Impact statistics are tracked in the store but not displayed in this component.

  // Note: Audio Cues were triggered as part of decision generation which has been
  // moved to aiEngine.ts. Audio cue tests should be in aiEngine.test.ts if needed.
  // The AICommandCenter component no longer generates decisions or plays audio cues.

  // Note: Confidence Adjustments UI was part of the standalone mode which has been removed.
  // The embedded mode shows a simplified decision feed without detailed confidence displays.
});
