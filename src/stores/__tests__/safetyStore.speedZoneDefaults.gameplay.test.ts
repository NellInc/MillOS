import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import * as safetyStoreModule from '../safetyStore';
import { speedZoneName, useSafetyStore } from '../safetyStore';

// The six defaults of the builds before the current set. They lay off every
// forklift route, so a returning player's Speed Zone Rate slider did nothing.
const LEGACY_EN = [
  { id: 'zone-1', x: 0, z: 0, radius: 5, name: 'Central Area' },
  { id: 'zone-2', x: 0, z: 28, radius: 4, name: 'North Loading' },
  { id: 'zone-3', x: 0, z: -28, radius: 4, name: 'South Loading' },
  { id: 'zone-4', x: -28, z: 0, radius: 3, name: 'West Corridor' },
  { id: 'zone-5', x: 28, z: 0, radius: 3, name: 'East Corridor' },
  { id: 'zone-6', x: 0, z: 18, radius: 4, name: 'Packing Zone' },
];
const NEW_IDS = [
  'zone-west-service',
  'zone-west-walkway',
  'zone-shipping-door',
  'zone-receiving-door',
  'zone-shipping-crew',
];

const merge = (persisted: unknown) => {
  const fn = useSafetyStore.persist.getOptions().merge;
  if (!fn) throw new Error('safety store has no merge');
  return fn(persisted, useSafetyStore.getInitialState()) as ReturnType<
    typeof useSafetyStore.getState
  >;
};

describe('saved speed zones: the untouched old default set takes the new defaults', () => {
  beforeEach(() => setLocale('en'));
  afterEach(() => setLocale('en'));

  it('replaces the untouched old six (English names) on rehydrate', () => {
    const merged = merge({ speedZones: LEGACY_EN });
    expect(merged.speedZones.map((zone) => zone.id)).toEqual(NEW_IDS);
  });

  it('replaces the untouched old six named in Portuguese, in any order', () => {
    const pt = LEGACY_EN.map((zone) => ({ ...zone, name: `${zone.name} (pt)` })).reverse();
    expect(merge({ speedZones: pt }).speedZones.map((zone) => zone.id)).toEqual(NEW_IDS);
  });

  it('keeps an old set the player edited: a radius changed, a zone removed, a zone added', () => {
    const resized = LEGACY_EN.map((zone) => (zone.id === 'zone-3' ? { ...zone, radius: 6 } : zone));
    expect(merge({ speedZones: resized }).speedZones).toEqual(resized);
    const removed = LEGACY_EN.slice(1);
    expect(merge({ speedZones: removed }).speedZones).toEqual(removed);
    const added = [...LEGACY_EN, { id: 'zone-77', x: -35, z: -22, radius: 4, name: 'Mine' }];
    expect(merge({ speedZones: added }).speedZones).toEqual(added);
  });

  it('keeps an empty set the player cleared, and today’s defaults as saved', () => {
    expect(merge({ speedZones: [] }).speedZones).toEqual([]);
    const current = useSafetyStore.getInitialState().speedZones;
    expect(merge({ speedZones: current }).speedZones).toEqual(current);
  });

  it('exports the same rule for the physical-session restore', () => {
    const adopt = (safetyStoreModule as Record<string, unknown>).adoptSavedSpeedZones as
      | ((saved: unknown) => Array<{ id: string }>)
      | undefined;
    expect(typeof adopt).toBe('function');
    expect(adopt?.(LEGACY_EN).map((zone) => zone.id)).toEqual(NEW_IDS);
  });
});

describe('default speed-zone names are keys, read in the language active now', () => {
  beforeEach(() => {
    setLocale('en');
    useSafetyStore.setState(useSafetyStore.getInitialState(), true);
  });
  afterEach(() => setLocale('en'));

  it('stores the same default record whatever language the first load had', () => {
    const english = useSafetyStore.getInitialState().speedZones;
    setLocale('pt-BR');
    const adoptedInPortuguese = merge({ speedZones: LEGACY_EN }).speedZones;
    expect(adoptedInPortuguese).toEqual(english);
    expect(
      adoptedInPortuguese.every((zone) => zone.name === english.find((e) => e.id === zone.id)?.name)
    ).toBe(true);
  });

  it('reads a keyed default name in the current language even when its stored text is stale', () => {
    // Stored text from an earlier catalogue wording matches neither language.
    const zone = { id: 'zone-west-service', x: -35, z: -22, radius: 4, name: 'West Door' };
    const keyed = { ...zone, nameKey: 'zoneWestServiceDoor' };
    setLocale('pt-BR');
    expect(speedZoneName(keyed)).not.toBe('West Door');
    expect(speedZoneName(keyed)).toBe(speedZoneName({ ...zone, name: 'West Service Door' }));
    // A player-typed name has no key and is shown as stored.
    expect(speedZoneName({ ...zone, id: 'zone-123', name: 'Mezzanine' })).toBe('Mezzanine');
  });

  it('a rename drops the default key, so the player’s name is what shows', () => {
    useSafetyStore.getState().updateSpeedZone('zone-west-walkway', { name: 'Loading lane' });
    const zone = useSafetyStore.getState().speedZones.find((z) => z.id === 'zone-west-walkway')!;
    expect(speedZoneName(zone)).toBe('Loading lane');
    // A move keeps the key.
    useSafetyStore.getState().updateSpeedZone('zone-west-service', { x: -34 });
    const moved = useSafetyStore.getState().speedZones.find((z) => z.id === 'zone-west-service')!;
    setLocale('pt-BR');
    expect(speedZoneName(moved)).not.toBe('West Service Door');
  });
});
