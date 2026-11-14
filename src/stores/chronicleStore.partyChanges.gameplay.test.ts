/**
 * Plan item 1.3: organisations' changes outside rulings are saved with the
 * governance state. A save from before they were kept loads without them and
 * records from then on; a damaged entry is dropped rather than rendered.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { useChronicleStore } from './chronicleStore';
import { useOperationsCampaignStore } from './operationsCampaignStore';
import { DEFAULT_CHARTER } from '../chronicle/charter';
import { createInitialState, recentPartyChanges } from '../chronicle/engine';
import { EVENT_DECK } from '../chronicle/eventDeck';

const merge = () => useChronicleStore.persist.getOptions().merge!;
type StoreState = ReturnType<typeof useChronicleStore.getState>;
const load = (chronicle: unknown) =>
  (merge()({ chronicle }, useChronicleStore.getState()) as StoreState).chronicle;

describe('saved changes to the organisations', () => {
  beforeEach(() => {
    useOperationsCampaignStore.getState().resetCampaign();
    useChronicleStore.setState({ chronicle: createInitialState() });
    useChronicleStore.getState().sign(DEFAULT_CHARTER, 21);
  });

  it('loads a save from before they were kept, with none listed', () => {
    const saved = JSON.parse(JSON.stringify(useChronicleStore.getState().chronicle));
    delete saved.governance.partyChanges;
    const chronicle = load(saved);
    expect(chronicle.governance.partyChanges).toBeUndefined();
    expect(recentPartyChanges(chronicle, 'growers', EVENT_DECK)).toEqual([]);
  });

  it('keeps the entries it can render and drops the rest', () => {
    const saved = JSON.parse(JSON.stringify(useChronicleStore.getState().chronicle));
    const kept = {
      party: 'growers',
      shift: 12,
      delta: -15,
      cause: { kind: 'red-line', ladder: 'intake', rung: 0 },
    };
    const quota = {
      party: 'federation',
      shift: 18,
      delta: 6,
      cause: { kind: 'quota', met: true, year: 1 },
    };
    saved.governance.partyChanges = [
      kept,
      quota,
      { ...kept, party: 'mayor' },
      { ...kept, delta: 'lots' },
      { ...kept, cause: { kind: 'red-line', ladder: 'payroll', rung: 0 } },
      { ...kept, cause: { kind: 'quota', met: 'yes', year: 1 } },
      { ...kept, cause: null },
      'growers -15',
    ];
    const chronicle = load(saved);
    expect(chronicle.governance.partyChanges).toEqual([kept, quota]);
    const notAList = load({ ...saved, governance: { ...saved.governance, partyChanges: 'x' } });
    expect(notAList.governance.partyChanges).toBeUndefined();
  });
});
