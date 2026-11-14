/**
 * D-058: an adjustment appears by its register name. The resident card's
 * adjustment and "agreed with" labels are read from the register's own
 * catalogue (simulation/agreedAdjustments.messages.ts), in both languages, and
 * the card defines none of its own. A quiet-room booking is the room's
 * schedule, shown on the room, not on the person who books it.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import * as THREE from 'three';
import { setLocale, translate } from '../../i18n';
import {
  AGREED_ADJUSTMENTS,
  QUIET_ROOM_BOOKINGS,
  quietRoomBookingSign,
  type AgreedAdjustments,
} from '../../simulation/agreedAdjustments';
import { agreedAdjustmentsMessages } from '../../simulation/agreedAdjustments.messages';
import { aiAccommodationMessages } from '../../utils/aiAccommodation.messages';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import {
  activateAimedInteractable,
  updateAimedInteractable,
  useAimedInteractableStore,
} from '../../utils/worldInteractables';
import { linkSceneInteractables, unlinkSceneInteractables } from '../../utils/sceneInteractables';
import { WorldCard } from './WorldCard';
import { worldCardMessages } from './WorldCard.messages';

afterEach(() => {
  cleanup();
  unlinkSceneInteractables();
  useAimedInteractableStore.getState().setAimed(null);
  setLocale('en');
});

function scene() {
  const root = new THREE.Scene();
  const personnel = new THREE.Group();
  personnel.name = 'world-personnel';
  COMMUNITY_ROSTER.forEach((person, i) => {
    const body = new THREE.Group();
    body.name = person.id;
    body.position.set(i * 10, 0, 0);
    body.userData = { communityId: person.id, task: 'Tea break' };
    personnel.add(body);
  });
  root.add(personnel);
  linkSceneInteractables(root);
  return personnel;
}

const eye = new THREE.Vector3();
const toward = new THREE.Vector3(0, 0, -1);
function greet(personnel: THREE.Object3D, personId: string) {
  const body = personnel.getObjectByName(personId)!;
  eye.set(body.position.x, 1.2, body.position.z + 2);
  act(() => updateAimedInteractable(eye, toward));
  act(() => {
    activateAimedInteractable(eye, toward);
  });
}

describe('resident card labels come from the register', () => {
  for (const locale of ['en', 'pt-BR'] as const)
    it(`${locale}: every adjustment and "agreed with" label is the register's own name`, () => {
      setLocale(locale);
      const personnel = scene();
      render(<WorldCard />);
      for (const entry of AGREED_ADJUSTMENTS as readonly AgreedAdjustments[]) {
        greet(personnel, entry.personId);
        const card = screen.getByTestId('resident-card');
        const items = within(screen.getByTestId('resident-adjustments'))
          .getAllByRole('listitem')
          .map((li) => li.textContent);
        expect(items, entry.personId).toEqual(
          entry.adjustments.map((id) => translate(agreedAdjustmentsMessages, id))
        );
        expect(card.textContent).toContain(
          `${translate(worldCardMessages, 'agreedWith')}: ${translate(
            agreedAdjustmentsMessages,
            entry.agreedWith
          )}`
        );
        // No number on a person's card at all: not even a room's booking.
        expect(card.textContent, entry.personId).not.toMatch(/\d/);
      }
    });

  it('the card module names no adjustment or role of its own', () => {
    const en = worldCardMessages.en as Record<string, string>;
    for (const key of [
      'adjustableBench',
      'tactileWayfinding',
      'captions',
      'shiftSupervisor',
      'qualityLead',
      'councilOffice',
      'quietRoomBooking',
    ])
      expect(en[key], key).toBeUndefined();
    const source = readFileSync('src/components/worldCard/WorldCard.tsx', 'utf8');
    expect(source).not.toMatch(/aiAccommodationMessages|QUIET_ROOM_BOOKINGS/);
  });

  for (const locale of ['en', 'pt-BR'] as const)
    it(`${locale}: the factory AI's three names for register entries match the register`, () => {
      setLocale(locale);
      expect(translate(aiAccommodationMessages, 'stepFreeRoute')).toBe(
        translate(agreedAdjustmentsMessages, 'step-free-route')
      );
      expect(translate(aiAccommodationMessages, 'visualAlerts')).toBe(
        translate(agreedAdjustmentsMessages, 'visual-alerts')
      );
      expect(translate(aiAccommodationMessages, 'systemQuietRoom')).toBe(
        translate(agreedAdjustmentsMessages, 'quiet-room')
      );
    });
});

describe('the quiet room shows its own bookings', () => {
  it('the room sign lists every booking from the register, and names nobody', () => {
    const sign = quietRoomBookingSign();
    expect(sign).toBe('BOOKED 10:00-10:30  14:00-14:30');
    for (const booking of QUIET_ROOM_BOOKINGS) expect(sign).not.toContain(booking.personId);
    const fittings = readFileSync('src/components/accessibility/AccessFittings.tsx', 'utf8');
    expect(fittings).toContain('quietRoomBookingSign()');
  });
});
