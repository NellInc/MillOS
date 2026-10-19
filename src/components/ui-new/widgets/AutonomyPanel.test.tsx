import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutonomyPanel } from './AutonomyPanel';

vi.mock('./WorkplaceLab', () => ({ WorkplaceLab: () => null }));
vi.mock('./AgentCockpit', () => ({ AgentCockpit: () => null }));

afterEach(cleanup);

describe('AutonomyPanel', () => {
  it('supplies its own scroll root inside the clipping ContextSidebar body', () => {
    render(<AutonomyPanel />);
    // ContextSidebar wraps panels in `flex-1 overflow-hidden`, which the wheel cannot scroll.
    expect(screen.getByTestId('autonomy-panel')).toHaveClass(
      'h-full',
      'overflow-y-auto',
      'overscroll-contain'
    );
  });
});
