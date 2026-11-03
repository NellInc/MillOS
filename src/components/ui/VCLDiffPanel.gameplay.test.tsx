import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const encoded = vi.hoisted(() => ({ value: 'ABCD' }));
vi.mock('../../utils/vclEncoder', () => ({
  encodeFactoryContextVCL: () => encoded.value,
}));

import { VCLDiffPanel } from './VCLDiffPanel';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useUIStore } from '../../stores/uiStore';

// The badge counted only added glyphs, so an encoding that shrank (a field
// dropped) read "0 changes" beside the struck-out glyphs it highlighted.
describe('the VCP diff badge', () => {
  const originalShow = useAIConfigStore.getState().showVCLDebug;
  const originalAlerts = useUIStore.getState().alerts;
  afterEach(() => {
    cleanup();
    encoded.value = 'ABCD';
    useAIConfigStore.setState({ showVCLDebug: originalShow });
    useUIStore.setState({ alerts: originalAlerts });
  });

  it('counts a glyph that was removed', () => {
    useAIConfigStore.setState({ showVCLDebug: true });
    render(<VCLDiffPanel />);
    encoded.value = 'ABC';
    // Any watched input re-encodes; a new alerts array is the simplest.
    act(() => useUIStore.setState({ alerts: [] }));
    expect(screen.getByText('Previous')).toBeInTheDocument();
    expect(screen.queryByText('0 changes')).toBeNull();
    expect(screen.getByText('1 change')).toBeInTheDocument();
  });
});
