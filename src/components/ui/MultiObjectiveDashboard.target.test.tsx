import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MultiObjectiveDashboard } from './MultiObjectiveDashboard';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useProductionStore } from '../../stores/productionStore';
import { useGameSimulationStore } from '../../stores/gameSimulationStore';

// PLAYTEST-7: the Production card read "7,550 kg/hr / Target: 30000 kg/hr".
// The plant's goal is 30 t per game DAY (ProductionTargetWidget) and its
// ceiling about 7.2 t/h, so the bar sat near 25% however well the line ran,
// and the target was printed ungrouped.
describe('the multi-objective production objective', () => {
  const original = useProductionStore.getState();
  const originalShow = useAIConfigStore.getState().showMultiObjective;
  const originalTime = useGameSimulationStore.getState().gameTime;
  const originalSpeed = useGameSimulationStore.getState().gameSpeed;

  beforeEach(() => {
    useAIConfigStore.setState({ showMultiObjective: true });
    useProductionStore.setState({ machines: [] });
    useGameSimulationStore.setState({ gameTime: 12, gameSpeed: 1 });
  });
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ showMultiObjective: originalShow });
    useProductionStore.setState({
      metrics: original.metrics,
      machines: original.machines,
      dailyBagsProduced: original.dailyBagsProduced,
    });
    useGameSimulationStore.setState({ gameTime: originalTime, gameSpeed: originalSpeed });
  });

  const productionCard = () => screen.getByText('Production').parentElement as HTMLElement;

  it("measures today's output against the 30 t daily target, grouped", () => {
    useProductionStore.setState({
      metrics: { ...original.metrics, throughput: 302 },
      dailyBagsProduced: 600, // 15,000 kg packed today
    });
    render(<MultiObjectiveDashboard />);
    const card = productionCard();
    expect(card).toHaveTextContent('15,000');
    expect(card).toHaveTextContent('30,000');
    expect(card).not.toHaveTextContent('30000');
    expect(card).not.toHaveTextContent('7,550');
  });

  it('reads a met daily target as a full bar, not a quarter', () => {
    useProductionStore.setState({
      metrics: { ...original.metrics, throughput: 302 },
      dailyBagsProduced: 1200,
    });
    render(<MultiObjectiveDashboard />);
    // framer-motion animates the bar from 0, so read the card's progress.
    expect(productionCard()).toHaveTextContent('30,000');
    expect(screen.getByText('Production').closest('[data-progress]')).toHaveAttribute(
      'data-progress',
      '100'
    );
  });

  // The bar shows the day's progress; the score must not call an on-pace
  // morning a trade-off just because the 30 t is not packed yet.
  it('scores a line on pace at the start of the day as balanced, not as a trade-off', () => {
    useGameSimulationStore.setState({ gameTime: 1 });
    useProductionStore.setState({
      // Nothing packed yet; 30 t over 23 h needs about 1,300 kg/h and the line
      // runs 7,500. Every other objective is met.
      metrics: { ...original.metrics, throughput: 300, quality: 99 },
      dailyBagsProduced: 0,
    });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText('All objectives balanced optimally.')).toBeInTheDocument();
  });

  it('does not read a paused plant as on pace', () => {
    useGameSimulationStore.setState({ gameTime: 1, gameSpeed: 0 });
    useProductionStore.setState({
      metrics: { ...original.metrics, throughput: 300, quality: 99 },
      dailyBagsProduced: 0,
    });
    render(<MultiObjectiveDashboard />);
    expect(screen.getByText(/Some objectives need attention/)).toBeInTheDocument();
  });
});
