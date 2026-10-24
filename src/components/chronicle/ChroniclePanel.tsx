import { useEffect, useRef, useState } from 'react';
import { useChronicleStore } from '../../stores/chronicleStore';
import { CharterScreen } from './CharterScreen';
import { ChronicleOverview } from './ChronicleOverview';
import { LedgerTab } from './LedgerTab';
import { NotesTab } from './NotesTab';
import { PartnersTab } from './PartnersTab';
import { PlansTab } from './PlansTab';
import { ScoreTab } from './ScoreTab';
import { rovingNext } from './shared';

const TABS = [
  { id: 'overview', label: 'Chronicle' },
  { id: 'plans', label: 'Plans' },
  { id: 'partners', label: 'Partners' },
  { id: 'ledger', label: 'Ledger' },
  { id: 'notes', label: 'Notes' },
  { id: 'score', label: 'Score' },
] as const;
type TabId = (typeof TABS)[number]['id'];

// The sidebar host clips; each workspace owns its padding and scrolling.
const SCROLL = 'h-full overflow-y-auto custom-scrollbar p-3';

/** The Mill Chronicle workspace (docs/CHRONICLE.md). */
export function ChroniclePanel() {
  const state = useChronicleStore((s) => s.chronicle);
  const [tab, setTab] = useState<TabId>('overview');
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
  if (state.status === 'unsigned')
    return (
      <div ref={rootRef} className={SCROLL} data-testid="chronicle-panel">
        <CharterScreen />
      </div>
    );
  const unread = state.unlockedNotes.filter((id) => !state.readNotes.includes(id)).length;
  return (
    <div ref={rootRef} className={`${SCROLL} space-y-3`} data-testid="chronicle-panel">
      <div
        role="tablist"
        aria-label="Chronicle sections"
        className="grid grid-cols-3 gap-1"
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
            className={`min-h-11 rounded-lg px-2 text-xs font-semibold ${
              tab === entry.id
                ? 'bg-cyan-400/15 text-white ring-1 ring-cyan-300/60'
                : 'bg-slate-800/80 text-slate-300 hover:text-white'
            }`}
          >
            {entry.label}
            {entry.id === 'notes' && unread > 0 && (
              <span className="ml-1 rounded-full bg-cyan-500 px-1.5 text-[10px] text-slate-950">
                {unread}
              </span>
            )}
            {entry.id === 'overview' && state.pendingEvents.length > 0 && (
              <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-[10px] text-slate-950">
                {state.pendingEvents.length}
              </span>
            )}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`chronicle-panel-${tab}`} aria-labelledby={`chronicle-tab-${tab}`}>
        {tab === 'overview' && <ChronicleOverview state={state} />}
        {tab === 'plans' && <PlansTab state={state} />}
        {tab === 'partners' && <PartnersTab state={state} />}
        {tab === 'ledger' && <LedgerTab state={state} />}
        {tab === 'notes' && <NotesTab state={state} />}
        {tab === 'score' && <ScoreTab state={state} />}
      </div>
    </div>
  );
}
