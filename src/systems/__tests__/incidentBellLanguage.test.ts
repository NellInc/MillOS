import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ringIncident, ringIncidentDecision } from '../incidentRuntime';
import { useUIStore } from '../../stores/uiStore';
import { incidentTitle } from '../../stores/incidentText';
import { alertText } from '../../i18n/alertCopy';
import { setLocale } from '../../i18n';
import type { PartnerProposal } from '../../simulation/partnerProposals';

// An incident bell is kept and restored, and read in the language active now.
// Filed with the incident's title already worded, a language switch left the
// title in the old language beside a translated rest: "Bearing overheat.
// Parceiro: Isolar o moinho." The bell keeps the kind and words it at display.

const proposal = {
  id: 'proposal-00042',
  kind: 'incident',
  subject: 'bearing_overheat',
  raisedAtMinute: 0,
  windowMinutes: 24,
  options: [],
  defaultOptionId: 'isolate',
  facts: { incidentKind: 'bearing_overheat' },
  sessionId: 's',
  status: 'open',
} as unknown as PartnerProposal<'incident'>;

const bell = (prefix: string) =>
  useUIStore.getState().alerts.find((alert) => alert.id === `${prefix}-${proposal.id}`)!;

beforeEach(() => {
  setLocale('en');
  useUIStore.setState({ alerts: [] });
});
afterEach(() => setLocale('en'));

describe('an incident bell after a language switch', () => {
  it('words the asked, decided and refused bells wholly in the language active now', () => {
    ringIncident(proposal);
    ringIncidentDecision(proposal, true);
    const asked = bell('partner-proposal');
    const decided = bell('partner-decided');
    ringIncidentDecision(proposal, false);
    const refused = bell('partner-decided');
    const enTitle = incidentTitle({ kind: 'bearing_overheat', title: '' }, 'en');
    expect(alertText(asked).message.startsWith(`${enTitle}. Partner: Isolate the mill.`)).toBe(
      true
    );

    setLocale('pt-BR');
    const ptTitle = incidentTitle({ kind: 'bearing_overheat', title: '' }, 'pt-BR');
    expect(ptTitle).not.toBe(enTitle);
    for (const filed of [asked, decided, refused]) {
      const { title, message } = alertText(filed);
      expect(message).not.toContain(enTitle);
      expect(message.startsWith(`${ptTitle}.`)).toBe(true);
      expect(title).toBe('Ocorrência');
    }
  });

  it('still shows a bell saved before the kind was kept, with its stored title', () => {
    const saved = {
      id: 'partner-proposal-old',
      type: 'info' as const,
      title: 'Incident',
      message: 'Bearing overheat. Partner: Isolate the mill.',
      timestamp: new Date(0),
      acknowledged: false,
      copy: {
        catalog: 'floorProposals',
        title: 'kindIncident',
        message: 'bellIncidentProposed',
        params: { title: 'Bearing overheat', option: 'isolate' },
      },
    };
    setLocale('pt-BR');
    expect(alertText(saved).message).toBe('Bearing overheat. Parceiro: Isolar o moinho.');
  });
});
