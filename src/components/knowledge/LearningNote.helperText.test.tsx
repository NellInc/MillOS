import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { LearningNote } from './LearningNote';
import { VCLDebugPanel } from '../ui/VCLDebugPanel';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { setLocale } from '../../i18n';

afterEach(() => {
  cleanup();
  setLocale('en');
});

// D14: the note says where to see the idea; it no longer points the player
// at another screen for "the full explanation". The VCP panel lost its
// subtitle and its "How It Works" paragraph; the saved badge carries the
// reduction. Working if both still read in a screenshot without them.
describe('learning note and VCP panel without pointers or explainers', () => {
  it.each([
    ['en', 'Why it matters: Batch Quality and Recall', /Open Datalinks/],
    ['pt-BR', 'Por que isso importa: Qualidade de lotes e recolhimento', /Abra o Datalinks/],
  ] as const)('the learning note in %s', (locale, summary, pointer) => {
    setLocale(locale);
    render(<LearningNote entryId="batch-quality" />);
    fireEvent.click(screen.getByText(summary));
    expect(screen.getByText(/^(See it in|Veja na prática em) .+\.$/)).toBeInTheDocument();
    expect(screen.queryByText(pointer)).toBeNull();
  });

  it('the VCP panel', () => {
    const original = useAIConfigStore.getState().showVCLDebug;
    useAIConfigStore.setState({ showVCLDebug: true });
    try {
      render(<VCLDebugPanel />);
      expect(screen.getByText('Value Context Protocol')).toBeInTheDocument();
      expect(screen.queryByText(/Compact emoji encoding/)).toBeNull();
      expect(screen.queryByText('How It Works')).toBeNull();
    } finally {
      useAIConfigStore.setState({ showVCLDebug: original });
    }
  });
});
