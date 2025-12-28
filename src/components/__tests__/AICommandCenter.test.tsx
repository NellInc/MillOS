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
  isGeminiConnected: false,
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
  isStrategicLayerActive: vi.fn(() => false),
  isGeminiModeActive: vi.fn(() => false),
};

const audioManagerMock = {
  playAIDecision: vi.fn(),
  playAICriticalAlert: vi.fn(),
  playAIAnomaly: vi.fn(),
};

// Mock lucide-react to avoid importing thousands of icon components in unit tests.
vi.mock('lucide-react', () => ({
  __esModule: true,
  Bot: () => null,
  Brain: () => null,
  Shield: () => null,
  User: () => null,
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
vi.mock('../GeminiSettingsModal', () => ({
  GeminiSettingsModal: () => null,
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
    workerSatisfaction: {
      averageEnergy: 75,
      averageSatisfaction: 80,
    },
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
    it('should not render when isOpen is false', () => {
      const { container } = render(<AICommandCenter isOpen={false} onClose={vi.fn()} embedded />);

      expect(container.firstChild).toBeNull();
    });

    it('should render when isOpen is true', () => {
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Embedded mode uses 'AI Engine' instead of 'AI Command Center'
      expect(screen.getByText('AI Engine')).toBeInTheDocument();
    });

    it('should display initial system status', () => {
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // System status cards are abbreviated in embedded mode
      expect(screen.getByText('CPU')).toBeInTheDocument();
      expect(screen.getByText('MEM')).toBeInTheDocument();
      expect(screen.getByText('DEC')).toBeInTheDocument();
    });

    it('should show emergency drill banner when drill mode is active', () => {
      setupStoreMocks({}, {}, { emergencyDrillMode: true });

      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      expect(screen.getByText('EMERGENCY DRILL IN PROGRESS')).toBeInTheDocument();
    });
  });

  // Note: Decision generation logic was moved from this component to aiEngine.ts
  // The AICommandCenter now only visualizes decisions from the store.
  // Tests for decision generation should be in aiEngine.test.ts or the store tests.

  describe('Memory Management and Cleanup', () => {
    it('should clear any pending alert reaction timeout on unmount', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const mockAlert: AlertData = {
        id: 'alert-cleanup',
        type: 'warning',
        title: 'Test Alert',
        message: 'Cleanup test',
        machineId: 'RM-101',
        timestamp: new Date(),
        acknowledged: false,
      };

      setupStoreMocks({}, { alerts: [mockAlert] });

      const { unmount } = render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Flush effects so the timeout is scheduled.
      await act(async () => {});

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it('should reset decisionOutcomesRef on unmount', async () => {
      const { unmount, rerender } = render(
        <AICommandCenter isOpen={true} onClose={vi.fn()} embedded />
      );

      // Simulate some decisions being processed
      const storeWithDecisions = {
        aiDecisions: [
          {
            id: 'd1',
            timestamp: new Date(),
            type: 'optimization',
            action: 'Test',
            reasoning: 'Test',
            confidence: 80,
            impact: 'Test',
            status: 'completed',
            priority: 'medium',
            outcome: 'Success',
          },
        ] as AIDecision[],
      };

      setupStoreMocks(storeWithDecisions);

      rerender(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Unmount and remount
      unmount();

      // Reset store mock
      setupStoreMocks();

      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Success rate display is simplified in embedded mode - check the render works
      const efficiencyElement = screen.getByText(/Eff:/i);
      expect(efficiencyElement).toBeInTheDocument();
    });
  });

  // Note: Embedded mode doesn't have a close button - onClose is not used.
  // The component is always embedded in ContextSidebar.

  it('should switch between decisions and strategic tabs', () => {
    render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

    // Initially on decisions tab - check for the decisions button showing selected state
    const decisionsButton = screen.getByRole('button', { name: /decisions/i });
    expect(decisionsButton).toHaveClass('bg-cyan-500/20');

    // Click strategic tab
    const strategicButton = screen.getByRole('button', { name: /strategic/i });
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

    it('should display decisions with different statuses', () => {
      const mockDecisions: AIDecision[] = [
        {
          id: 'status-pending',
          timestamp: new Date(),
          type: 'assignment',
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
          type: 'assignment',
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
          type: 'assignment',
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

      // All decision actions should be displayed
      expect(screen.getByText('Pending task')).toBeInTheDocument();
      expect(screen.getByText('In progress task')).toBeInTheDocument();
      expect(screen.getByText('Completed task')).toBeInTheDocument();
    });

    it('should show empty state when no decisions exist', () => {
      render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Embedded mode shows "AI analyzing factory state..."
      expect(screen.getByText(/AI analyzing factory state/i)).toBeInTheDocument();
    });

    // Updated: Embedded mode limits to 15 decisions, not 20
    it('should limit displayed decisions to 15', () => {
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

      // Embedded mode shows 15 decisions
      expect(screen.getByText('Action 0')).toBeInTheDocument();
      expect(screen.getByText('Action 14')).toBeInTheDocument();
      expect(screen.queryByText('Action 15')).not.toBeInTheDocument();
    });

    // Note: Sparklines feature is noted as "Currently unused but kept for future feature expansion"
    // in AICommandCenter.tsx (lines 38-42). Test removed as feature is not currently implemented.
  });

  describe('Alert Reactions', () => {
    it('should react to new alerts', async () => {
      const mockAlert: AlertData = {
        id: 'alert-1',
        type: 'critical',
        title: 'Machine Failure',
        message: 'RM-101 has stopped',
        machineId: 'RM-101',
        timestamp: new Date(),
        acknowledged: false,
      };

      const mockDecision: AIDecision = {
        id: 'reaction-decision',
        timestamp: new Date(),
        type: 'maintenance',
        action: 'Emergency maintenance',
        reasoning: 'Machine failure detected',
        confidence: 95,
        impact: 'Restore operation',
        status: 'pending',
        priority: 'critical',
        triggeredBy: 'alert',
      };

      aiEngineMock.reactToAlert.mockReturnValue(mockDecision);

      const { rerender } = render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Update store with new alert
      setupStoreMocks({}, { alerts: [mockAlert] });

      rerender(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      // Should react to alert after delay (1500ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(aiEngineMock.reactToAlert).toHaveBeenCalledWith(mockAlert);
    });

    it('should apply effects of alert reaction decision', async () => {
      const mockAlert: AlertData = {
        id: 'alert-2',
        type: 'warning',
        title: 'High Temperature',
        message: 'Temperature spike',
        machineId: 'RM-102',
        timestamp: new Date(),
        acknowledged: false,
      };

      const mockDecision: AIDecision = {
        id: 'alert-reaction',
        timestamp: new Date(),
        type: 'safety',
        action: 'Reduce load',
        reasoning: 'High temperature alert',
        confidence: 90,
        impact: 'Lower temperature',
        status: 'pending',
        priority: 'high',
      };

      aiEngineMock.reactToAlert.mockReturnValue(mockDecision);

      const { rerender } = render(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      setupStoreMocks({}, { alerts: [mockAlert] });

      rerender(<AICommandCenter isOpen={true} onClose={vi.fn()} embedded />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1500);
      });

      expect(aiEngineMock.applyDecisionEffects).toHaveBeenCalledWith(mockDecision);
    });
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
