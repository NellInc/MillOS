import { useT } from '../../i18n';
import { messages } from './ChroniclePanel.messages';
import { useEffect, useRef, useState } from 'react';
import { answerablePending } from '../../chronicle/engine';
import { EVENT_DECK } from '../../chronicle/eventDeck';
import { useChronicleStore } from '../../stores/chronicleStore';
import { CharterScreen } from './CharterScreen';
import { ChronicleOverview } from './ChronicleOverview';
import { LedgerTab } from './LedgerTab';
import { NotesTab } from './NotesTab';
import { PartnersTab } from './PartnersTab';
import { PlansTab } from './PlansTab';
import { PolicyTab } from './PolicyTab';
import { ReturnsTab } from './ReturnsTab';
import { ScoreTab } from './ScoreTab';
import { rovingNext } from './shared';

const TABS = [
  { id: 'overview', label: 'm0' },
  { id: 'plans', label: 'm1' },
  { id: 'policy', label: 'm7' },
  { id: 'partners', label: 'm2' },
  { id: 'returns', label: 'm8' },
  { id: 'ledger', label: 'm3' },
  { id: 'notes', label: 'm4' },
  { id: 'score', label: 'm5' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// The sidebar host clips; each workspace owns its padding and scrolling.
const SCROLL = 'h-full overflow-y-auto custom-scrollbar p-3';

/** The Mill Chronicle workspace (docs/CHRONICLE.md). */
export function ChroniclePanel() {
  const t = useT(messages);
  const state = useChronicleStore((s) => s.chronicle);
  const seeNotes = useChronicleStore((s) => s.seeNotes);
  const [tab, setTab] = useState<TabId>('overview');
  // The badge says what is new since the player last looked; opening the tab is
  // looking, including at a note that unlocks while it is open. Reading a note
  // (and its know-how) still takes opening that note.
  const notesOpen = tab === 'notes' && state.status !== 'unsigned';
  useEffect(() => {
    if (notesOpen) seeNotes();
  }, [notesOpen, state.unlockedNotes, seeNotes]);
  const rootRef = useRef<HTMLDivElement>(null);
  // Signing swaps the charter for the chronicle; start the new view at its top
  // in whichever container scrolls (the sidebar or the mobile sheet).
  useEffect(() => {
    for (
      let el = rootRef.current as HTMLElement | null;
      el && el !== document.body;
      el = el.parentElement
    ) {
      if (el.scrollTop > 0) el.scrollTop = 0;
    }
  }, [state.status]);
  // Signing and abandoning replace the whole view, and the button that did it
  // with it. A new chronicle opens on its overview, and focus that fell to the
  // page lands on the new view instead. The chronicle ending at a shift close
  // is not the player's action, so it moves nothing.
  const previousStatus = useRef(state.status);
  useEffect(() => {
    const before = previousStatus.current;
    previousStatus.current = state.status;
    if (before === state.status || (before !== 'unsigned' && state.status !== 'unsigned')) return;
    if (state.status !== 'unsigned') setTab('overview');
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) return;
    if (state.status === 'unsigned')
      rootRef.current?.querySelector<HTMLElement>('input[type="radio"]:checked')?.focus();
    else document.getElementById('chronicle-tab-overview')?.focus();
  }, [state.status]);
  // Most actions here replace their own button (a mitigation becomes a chip, an
  // install a cancel, a section closes once answered). If the player was working
  // in the workspace and the focus fell to the page, keep it on the open tab's
  // panel. Working elsewhere (the scene, a dialog) is left alone.
  const panelRef = useRef<HTMLDivElement>(null);
  const engaged = useRef(false);
  useEffect(() => {
    const track = (event: Event) => {
      engaged.current = !!rootRef.current?.contains(event.target as Node | null);
    };
    document.addEventListener('focusin', track, true);
    document.addEventListener('pointerdown', track, true);
    return () => {
      document.removeEventListener('focusin', track, true);
      document.removeEventListener('pointerdown', track, true);
    };
  }, []);
  useEffect(() => {
    if (!engaged.current) return;
    const active = document.activeElement;
    if (active && active !== document.body && document.contains(active)) return;
    // The panel can be tall; holding focus must not move the sidebar's scroll.
    panelRef.current?.focus({ preventScroll: true });
  });
  if (state.status === 'unsigned')
    return (
      <div ref={rootRef} className={SCROLL} data-testid="chronicle-panel">
        <CharterScreen />
      </div>
    );
  const unread = state.unlockedNotes.filter(
    (id) => !state.readNotes.includes(id) && !state.seenNotes.includes(id)
  ).length;
  const awaiting = answerablePending(state, EVENT_DECK).length;
  // An open proposal and running warnings wait on the steward in the Policy tab.
  const attention = (state.governance.proposal ? 1 : 0) + state.governance.countdowns.length;
  return (
    <div ref={rootRef} className={`${SCROLL} space-y-3`} data-testid="chronicle-panel">
      <div
        role="tablist"
        aria-label={t('m6')}
        className="grid grid-cols-4 gap-1"
        onKeyDown={(event) => {
          const next = rovingNext(
            event.key,
            TABS.map((entry) => entry.id),
            tab
          );
          if (!next) return;
          event.preventDefault();
          setTab(next);
          document.getElementById(`chronicle-tab-${next}`)?.focus();
        }}
      >
        {TABS.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            id={`chronicle-tab-${entry.id}`}
            aria-selected={tab === entry.id}
            tabIndex={tab === entry.id ? 0 : -1}
            aria-controls={`chronicle-panel-${entry.id}`}
            onClick={() => setTab(entry.id)}
            className={`relative min-h-11 rounded-lg px-2 text-xs font-semibold ${
              tab === entry.id
                ? 'bg-cyan-400/15 text-white ring-1 ring-cyan-300/60'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
          >
            {t(entry.label)}
            {entry.id === 'notes' && unread > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-cyan-500 px-1.5 text-[10px] text-slate-950">
                {unread}
              </span>
            )}
            {entry.id === 'policy' && attention > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-950">
                {attention}
              </span>
            )}
            {entry.id === 'overview' && awaiting > 0 && (
              <span className="absolute -right-1 -top-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-950">
                {awaiting}
              </span>
            )}
          </button>
        ))}
      </div>
      <div
        ref={panelRef}
        role="tabpanel"
        tabIndex={-1}
        id={`chronicle-panel-${tab}`}
        aria-labelledby={`chronicle-tab-${tab}`}
      >
        {tab === 'overview' && <ChronicleOverview state={state} />}
        {tab === 'plans' && <PlansTab state={state} />}
        {tab === 'policy' && <PolicyTab state={state} />}
        {tab === 'partners' && <PartnersTab state={state} />}
        {tab === 'returns' && <ReturnsTab state={state} />}
        {tab === 'ledger' && <LedgerTab state={state} />}
        {tab === 'notes' && <NotesTab state={state} />}
        {tab === 'score' && <ScoreTab state={state} />}
      </div>
    </div>
  );
}
