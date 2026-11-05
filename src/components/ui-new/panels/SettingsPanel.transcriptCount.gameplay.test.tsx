import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./BuildCacheDiagnostics', () => ({ BuildCacheDiagnostics: () => null }));

import { SettingsPanel } from './SettingsPanel';
import { useAnnouncementsStore, type Announcement } from '../../../stores/announcementsStore';
import { setLocale } from '../../../i18n';

const line = (n: number): Announcement => ({
  id: `pa-${n}`,
  type: 'info',
  message: `Line ${n}`,
  timestamp: new Date(2026, 0, 1, 9, n),
  priority: 1,
  channel: 'operational',
  tone: 'literal',
  audience: 'all',
  cooldownMs: 0,
  dismissed: true,
});

// The transcript keeps the last 50 PA lines and its summary counts them, but
// the log listed only the newest 30: "PA transcript (45)" opened onto 30 rows,
// and the 15 oldest could be reached only by searching for them.
// Working if the summary's count is the number of lines the log lists.
describe('PA transcript count', () => {
  beforeEach(() => {
    setLocale('en');
    useAnnouncementsStore.setState({
      announcements: Array.from({ length: 45 }, (_, index) => line(index)),
      lastAnnouncementTime: {},
      mode: 'focused',
    });
  });
  afterEach(() => {
    cleanup();
    useAnnouncementsStore.setState({ announcements: [], lastAnnouncementTime: {} });
  });

  it('lists every line its summary counts', () => {
    render(<SettingsPanel productionSpeed={1} setProductionSpeed={() => {}} />);
    expect(screen.getByText('PA transcript (45)')).toBeInTheDocument();
    expect(within(screen.getByRole('log')).getAllByRole('article')).toHaveLength(45);
    expect(within(screen.getByRole('log')).getByText('Line 0')).toBeInTheDocument();
  });
});
