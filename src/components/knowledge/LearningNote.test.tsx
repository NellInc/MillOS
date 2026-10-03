import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningNote } from './LearningNote';
import { Datalinks } from './Datalinks';
import { getKnowledgeEntries, KNOWLEDGE_ENTRIES } from '../../stores/knowledgeStore';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
afterEach(cleanup);

describe('contextual operating guide', () => {
  it('makes deeper teaching optional and names real places to observe it', () => {
    render(<LearningNote entryId="bottlenecks-and-buffers" />);
    const summary = screen.getByText('Why it matters: Bottlenecks and Buffers');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    fireEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByText(/Follow the queue to find the limiting stage/)).toBeVisible();
    expect(screen.getByText(/SCADA Process workspace/)).toBeVisible();
  });

  it.each(['unknown-entry', 'depth-and-material-policy'])(
    'does not inject %s into contextual player teaching',
    (entryId) => {
      const { container } = render(<LearningNote entryId={entryId} />);
      expect(container).toBeEmptyDOMElement();
    }
  );

  it('keeps every entry id and related link valid while leaving all reading available', () => {
    const ids = KNOWLEDGE_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of KNOWLEDGE_ENTRIES) {
      expect(entry.unlockCondition.type).toBe('always');
      for (const related of entry.relatedEntries) expect(ids).toContain(related);
      expect(entry.seeInAction.length).toBeGreaterThan(0);
    }
    expect(getKnowledgeEntries().some((entry) => entry.id === 'depth-and-material-policy')).toBe(
      false
    );
    expect(getKnowledgeEntries('developer').map((entry) => entry.id)).toEqual([
      'depth-and-material-policy',
    ]);
  });

  it('separates developer reference and restores the operating guide', () => {
    render(<Datalinks isOpen onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Operating guide' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(
      screen.queryByRole('button', { name: 'Depth and Material Policy' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Developer reference' }));
    expect(screen.getByRole('button', { name: 'Depth and Material Policy' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Bottlenecks and Buffers' })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Operating guide' }));
    expect(screen.getByRole('button', { name: 'Bottlenecks and Buffers' })).toBeInTheDocument();
  });

  it('offers a reachable article and Back to list on compact and desktop markup', () => {
    render(<Datalinks isOpen onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'The Mill and Its Neighbours' }));
    expect(
      screen.getByRole('heading', { name: 'A Delivery Has a Destination' })
    ).toBeInTheDocument();
    expect(screen.getByText(/does not create another quantity of flour/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to list' }));
    expect(
      screen.queryByRole('heading', { name: 'A Delivery Has a Destination' })
    ).not.toBeInTheDocument();
  });
});
