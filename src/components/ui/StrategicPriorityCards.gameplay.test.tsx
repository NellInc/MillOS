import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { StrategicPriorityCards } from './StrategicPriorityCards';
import { useAIConfigStore } from '../../stores/aiConfigStore';

describe('the strategic priority cards', () => {
  const original = useAIConfigStore.getState().strategic;
  afterEach(() => {
    cleanup();
    useAIConfigStore.setState({ strategic: original });
  });

  // Dismissing the last priority card hid the insight and trade-off with it,
  // though neither had been dismissed.
  it('keeps an undismissed insight and trade-off after every priority is dismissed', async () => {
    useAIConfigStore.setState({
      strategic: {
        ...original,
        isThinking: false,
        legacyPriorities: ['Cool RM-101 before the next order'],
        insight: 'Bearing heat tracks the afternoon load.',
        tradeoff: 'Slower line rate until the bearing cools.',
      },
    });
    render(<StrategicPriorityCards />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss priority' }));
    // The dismissed card leaves once its exit animation ends.
    await waitFor(() =>
      expect(screen.queryByText('Cool RM-101 before the next order')).not.toBeInTheDocument()
    );
    expect(screen.getByText('Bearing heat tracks the afternoon load.')).toBeInTheDocument();
    expect(screen.getByText('Slower line rate until the bearing cools.')).toBeInTheDocument();
  });

  // The dismiss button leaves with its card, and focus fell to the page body,
  // so a keyboard player had to Tab back through the whole sidebar.
  it('moves focus to the next card when a dismissed card leaves', async () => {
    useAIConfigStore.setState({
      strategic: {
        ...original,
        isThinking: false,
        legacyPriorities: ['Cool RM-101 before the next order', 'Stage spare rolls'],
        insight: 'Bearing heat tracks the afternoon load.',
        tradeoff: undefined,
      },
    });
    render(
      <div role="tabpanel" tabIndex={-1} data-testid="panel">
        <StrategicPriorityCards />
      </div>
    );
    const [first, second] = screen.getAllByRole('button', { name: 'Dismiss priority' });
    first.focus();
    fireEvent.click(first);
    await waitFor(() =>
      expect(screen.queryByText('Cool RM-101 before the next order')).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(second);

    fireEvent.click(second);
    await waitFor(() => expect(screen.queryByText('Stage spare rolls')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Dismiss insight' }));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss insight' }));
    await waitFor(() =>
      expect(screen.queryByText('Bearing heat tracks the afternoon load.')).not.toBeInTheDocument()
    );
    expect(document.activeElement).toBe(screen.getByTestId('panel'));
  });
  // Pass 7: every strategic decision (about every 45 s with an LLM connected)
  // re-issues the priorities, and a dismissed card came straight back even
  // when the re-issued plan said the same thing. Working if a dismissed card
  // stays dismissed while the plan repeats it, and a new priority shows.
  it('keeps a dismissed card dismissed when the same plan is re-issued', async () => {
    useAIConfigStore.setState({
      strategic: { ...original, isThinking: false, lastDecisionTime: 1 },
    });
    act(() =>
      useAIConfigStore.getState().setStrategicPriorities(['Cool RM-101 before the next order'], {
        insight: 'Bearing heat tracks the afternoon load.',
      })
    );
    render(<StrategicPriorityCards />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss priority' }));
    await waitFor(() =>
      expect(screen.queryByText('Cool RM-101 before the next order')).not.toBeInTheDocument()
    );

    act(() =>
      useAIConfigStore.getState().setStrategicPriorities(['Cool RM-101 before the next order'], {
        insight: 'Bearing heat tracks the afternoon load.',
      })
    );
    expect(screen.queryByText('Cool RM-101 before the next order')).not.toBeInTheDocument();
    expect(screen.getByText('Bearing heat tracks the afternoon load.')).toBeInTheDocument();

    act(() =>
      useAIConfigStore.getState().setStrategicPriorities(['Purge the dust filter'], {
        insight: 'Bearing heat tracks the afternoon load.',
      })
    );
    expect(screen.getByText('Purge the dust filter')).toBeInTheDocument();
  });
  // Pass 7: the Strategic tab unmounts the cards on every tab switch, and a
  // card the player had dismissed came back on returning. Working if a
  // dismissal survives switching tabs while the plan still carries the card.
  it('keeps a dismissed card dismissed across a tab switch', async () => {
    useAIConfigStore.setState({
      strategic: {
        ...original,
        isThinking: false,
        legacyPriorities: ['Rebalance line 2', 'Stage spare rolls'],
        insight: undefined,
        tradeoff: undefined,
      },
    });
    const first = render(<StrategicPriorityCards />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss priority' })[0]);
    await waitFor(() => expect(screen.queryByText('Rebalance line 2')).not.toBeInTheDocument());
    first.unmount();

    render(<StrategicPriorityCards />);
    expect(screen.queryByText('Rebalance line 2')).not.toBeInTheDocument();
    expect(screen.getByText('Stage spare rolls')).toBeInTheDocument();
  });
});
