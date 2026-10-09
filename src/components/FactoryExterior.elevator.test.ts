import { expect, it } from 'vitest';
import * as THREE from 'three';
import {
  GRAIN_ELEVATOR_FITTING_GROUPS,
  GRAIN_ELEVATOR_HEAD_SLATS,
  getElevatorFittingMatrix,
} from './FactoryExterior';

it('keeps all 60 authored steel beams in five exact-size groups, with 15 separate head slats', () => {
  expect(
    GRAIN_ELEVATOR_FITTING_GROUPS.map(({ size, fittings }) => [size, fittings.length])
  ).toEqual([
    [[0.55, 44, 0.55], 4],
    [[7.5, 0.35, 0.35], 14],
    [[Math.hypot(7, 6), 0.18, 0.18], 14],
    [[0.35, 0.35, 5.5], 14],
    [[0.18, 0.18, Math.hypot(5, 6)], 14],
  ]);
  expect(GRAIN_ELEVATOR_HEAD_SLATS.map(({ position }) => position)).toEqual(
    Array.from({ length: 15 }, (_, i) => [-4.25 + i * 0.607, 46.5, 3.55])
  );
});

it('retains beam centres, alternating brace angles and unit scale inside the positioned tower', () => {
  const parent = new THREE.Matrix4().makeTranslation(63, 0, -40);
  for (const [group, axis, angle] of [
    [GRAIN_ELEVATOR_FITTING_GROUPS[2], 'z', Math.atan2(6, 7)],
    [GRAIN_ELEVATOR_FITTING_GROUPS[4], 'x', Math.atan2(6, 5)],
  ] as const) {
    for (let bay = 0; bay < 7; bay++) {
      const fitting = group.fittings[bay * 2];
      const matrix = getElevatorFittingMatrix(fitting);
      expect(fitting.position[1]).toBe(7 + bay * 6);
      expect(fitting.rotation?.[axis === 'z' ? 2 : 0]).toBe((bay % 2 ? -1 : 1) * angle);
      const centre = new THREE.Vector3().setFromMatrixPosition(parent.clone().multiply(matrix));
      expect(centre.toArray()).toEqual([
        63 + fitting.position[0],
        fitting.position[1],
        -40 + fitting.position[2],
      ]);
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      expect(scale.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-12);
    }
  }
});
