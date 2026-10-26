import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningNote } from './LearningNote';
import { Datalinks } from './Datalinks';
import { setLocale } from '../../i18n';
import {
  getKnowledgeEntries,
  HISTORY_ENTRY_UNLOCK,
  KNOWLEDGE_ENTRIES,
} from '../../stores/knowledgeStore';

vi.mock('../../hooks/useReducedMotion', () => ({ useReducedMotion: () => true }));
afterEach(() => {
  cleanup();
  setLocale('en');
});

describe('contextual operating guide', () => {
  it.each(['en', 'pt-BR'] as const)(
    'distinguishes batch isolation from plant-wide quality release in %s',
    (locale) => {
      setLocale(locale);
      render(<LearningNote entryId="batch-quality" />);
      const entry = KNOWLEDGE_ENTRIES.find((item) => item.id === 'batch-quality')!;
      const expected =
        locale === 'en'
          ? [
              'Batch holds isolate affected material.',
              'can also block all dispatch.',
              'Releasing a batch does not clear those conditions.',
            ]
          : [
              'Retenções de lote isolam o material afetado.',
              'também podem bloquear toda a expedição.',
              'Liberar um lote não resolve essas condições.',
            ];
      fireEvent.click(
        screen.getByText(
          locale === 'en'
            ? 'Why it matters: Batch Quality and Recall'
            : 'Por que isso importa: Qualidade de lotes e recolhimento'
        )
      );
      expect(screen.getByText(entry.brief)).toBeVisible();
      expect(entry.brief).toContain(expected[0]);
      expect(entry.brief).toContain(expected[1]);
      expect(entry.article).toContain(expected[2]);
    }
  );

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
    const always = KNOWLEDGE_ENTRIES[0].unlockCondition;
    expect(always.type).toBe('always');
    const ids = KNOWLEDGE_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const entry of KNOWLEDGE_ENTRIES) {
      // Only Mill Chronicle history notes wait for a live event to unlock them;
      // every operating explanation stays readable from the start.
      expect(entry.unlockCondition).toBe(
        entry.id.startsWith('history-') ? HISTORY_ENTRY_UNLOCK : always
      );
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
