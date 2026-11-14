/**
 * Plan 6.5 (report 04 P5): a resident answers E with a card naming their role,
 * what they are doing now, and for the five people in the agreed-adjustments
 * register (D-058) each adjustment as the register holds it. No condition, no
 * aid, no number about the person.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import * as THREE from 'three';
import { setLocale } from '../../i18n';
import { AGREED_ADJUSTMENTS, type AgreedAdjustments } from '../../simulation/agreedAdjustments';
import { COMMUNITY_ROSTER } from '../../simulation/communityLife';
import {
  activateAimedInteractable,
  updateAimedInteractable,
  useAimedInteractableStore,
} from '../../utils/worldInteractables';
import { linkSceneInteractables, unlinkSceneInteractables } from '../../utils/sceneInteractables';
import { WorldCard } from './WorldCard';
import { useWorldCardStore } from './worldCardStore';

beforeEach(() => setLocale('en'));
afterEach(() => {
  cleanup();
  unlinkSceneInteractables();
  useAimedInteractableStore.getState().setAimed(null);
  setLocale('en');
});

/** CommunityLife's resident roots, as the scene holds them. */
function sceneWithResidents(tasks: Record<string, string>) {
  const scene = new THREE.Scene();
  const personnel = new THREE.Group();
  personnel.name = 'world-personnel';
  COMMUNITY_ROSTER.forEach((person, i) => {
    const root = new THREE.Group();
    root.name = person.id;
    root.position.set(i * 10, 0, 0);
    root.userData = { communityId: person.id, task: tasks[person.id] ?? 'Tea break' };
    personnel.add(root);
  });
  scene.add(personnel);
  return { scene, personnel };
}

const eye = new THREE.Vector3();
const toward = new THREE.Vector3();
/** Stand 2 m in front of a resident's chest, look at them, and press E. */
function greet(personnel: THREE.Object3D, personId: string): boolean {
  const root = personnel.getObjectByName(personId)!;
  eye.set(root.position.x, 1.2, root.position.z + 2);
  toward.set(0, 0, -1);
  act(() => updateAimedInteractable(eye, toward));
  let acted = false;
  act(() => {
    acted = activateAimedInteractable(eye, toward);
  });
  return acted;
}

describe('the resident card', () => {
  it('shows a resident mid-task in English and in Portuguese', () => {
    const { scene, personnel } = sceneWithResidents({
      'mill-packing-quiet': 'Break in the quiet room',
    });
    linkSceneInteractables(scene);
    expect(greet(personnel, 'mill-packing-quiet')).toBe(true);
    render(<WorldCard />);
    const card = screen.getByTestId('resident-card');
    expect(card.textContent).toContain('Packing operator');
    expect(card.textContent).toContain('Now: Break in the quiet room');
    // The room's bookings are on the room's sign, not on the person's card.
    expect(card.textContent).not.toMatch(/\d/);
    act(() => setLocale('pt-BR'));
    const pt = screen.getByTestId('resident-card').textContent ?? '';
    expect(pt).toContain('Operação da linha de ensaque');
    expect(pt).toContain('Agora: Pausa na sala silenciosa');
    expect(pt).not.toMatch(/\d/);
    expect(pt).not.toContain('Break in the quiet room');
  });

  it('closes when the view leaves the person, and E again closes it', () => {
    const { scene, personnel } = sceneWithResidents({});
    linkSceneInteractables(scene);
    greet(personnel, 'mill-engineer');
    render(<WorldCard />);
    expect(screen.getByTestId('resident-card').textContent).toContain('Maintenance engineer');
    greet(personnel, 'mill-engineer');
    expect(screen.queryByTestId('resident-card')).toBeNull();
    greet(personnel, 'mill-engineer');
    expect(screen.getByTestId('resident-card')).toBeTruthy();
    act(() => useAimedInteractableStore.getState().setAimed(null));
    expect(screen.queryByTestId('resident-card')).toBeNull();
  });

  it('names the five agreed adjustments from the register, and who agreed them', () => {
    expect(AGREED_ADJUSTMENTS).toHaveLength(5);
    const { scene, personnel } = sceneWithResidents({});
    linkSceneInteractables(scene);
    render(<WorldCard />);
    const names = {
      'step-free-route': 'Step-free route',
      'visual-alerts': 'Alarms as light and vibration',
      'quiet-room': 'Quiet room',
      'adjustable-bench': 'Bench set to seated working height',
      'tactile-wayfinding': 'Tactile paving and a clear route',
      captions: 'PA lines as captions',
    } as const;
    const agreedWith = {
      'shift-supervisor': 'Shift supervisor',
      'quality-lead': 'Quality lead',
      'council-office': 'Council office',
    } as const;
    for (const entry of AGREED_ADJUSTMENTS as readonly AgreedAdjustments[]) {
      greet(personnel, entry.personId);
      const card = screen.getByTestId('resident-card');
      const items = within(screen.getByTestId('resident-adjustments'))
        .getAllByRole('listitem')
        .map((li) => li.textContent);
      expect(items, entry.personId).toEqual(entry.adjustments.map((id) => names[id]));
      expect(card.textContent).toContain(`Agreed with: ${agreedWith[entry.agreedWith]}`);
      // No aid and no condition, and no number about the person: not even
      // the quiet room's bookings, which are on the room's sign.
      expect(card.textContent).not.toMatch(/wheelchair|cane|deaf|autis|blind/i);
      expect(card.textContent, entry.personId).not.toMatch(/\d/);
    }
  });

  it('shows no adjustments for someone not in the register', () => {
    const { scene, personnel } = sceneWithResidents({});
    linkSceneInteractables(scene);
    greet(personnel, 'village-baker');
    render(<WorldCard />);
    expect(screen.getByTestId('resident-card').textContent).toContain('Village baker');
    expect(screen.queryByTestId('resident-adjustments')).toBeNull();
  });

  it('skips a resident who is not in view', () => {
    const { scene, personnel } = sceneWithResidents({});
    linkSceneInteractables(scene);
    personnel.getObjectByName('mill-supervisor')!.visible = false;
    expect(greet(personnel, 'mill-supervisor')).toBe(false);
    expect(useWorldCardStore.getState().card).toBeNull();
  });
});
