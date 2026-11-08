/**
 * The school bell, hung on its yoke in the open belfry, and rung by the player.
 *
 * Orbit view: click it (pointer cursor and a faint warm glow on hover). First
 * person: look at it and press E or click (`worldInteractables`). Either way
 * the bell swings on its yoke as a damped pendulum (`schoolBellMotion`) and
 * strikes once (`schoolBellVoice`), at most once per cooldown however fast the
 * input arrives.
 *
 * It is a sibling of the school body, not part of it, so the generated body
 * and its primitive fallback share this one bell. The group is `dynamic`, which
 * keeps the authored-village StaticMeshBatch from freezing it into a merged
 * draw; its click handler would exclude it anyway.
 */
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import {
  SCHOOL_BELL_CENTRE_Y,
  SCHOOL_BELL_CLAPPER_HANG_Y,
  SCHOOL_BELL_PIVOT,
  createSchoolBellCastingGeometry,
  createSchoolBellClapperGeometry,
  createSchoolBellHeadstockGeometry,
} from './schoolBellGeometry';
import {
  createSchoolBellMotion,
  ringSchoolBell,
  schoolBellClapperAngle,
  stepSchoolBell,
} from './schoolBellMotion';
import { playSchoolBell } from '../../audio/schoolBellVoice';
import { registerWorldInteractable } from '../../utils/worldInteractables';

/** From the ground under the belfry (eye ~1.7 m, bell ~9.9 m) with room to step back. */
const SCHOOL_BELL_REACH = 14;
/** Aim sphere around the casting's centre: the casting plus its headstock. */
const SCHOOL_BELL_AIM_RADIUS = 0.85;
const HOVER_EMISSIVE = new THREE.Color('#ffcf7a');
const HOVER_INTENSITY = 0.22;

const _bellCentre = new THREE.Vector3();
const _toBell = new THREE.Vector3();
const _cameraRight = new THREE.Vector3();

export const SchoolBell: React.FC = React.memo(() => {
  const swingRef = useRef<THREE.Group>(null);
  const clapperRef = useRef<THREE.Group>(null);
  const centreRef = useRef<THREE.Object3D>(null);
  const hovered = useRef(false);
  const motion = useMemo(createSchoolBellMotion, []);
  const camera = useThree((state) => state.camera);

  const parts = useMemo(() => {
    const casting = createSchoolBellCastingGeometry();
    const headstock = createSchoolBellHeadstockGeometry();
    const clapper = createSchoolBellClapperGeometry();
    const bronze = new THREE.MeshStandardMaterial({
      color: '#a8843f',
      roughness: 0.38,
      metalness: 0.6,
      emissive: HOVER_EMISSIVE,
      emissiveIntensity: 0,
    });
    const oak = new THREE.MeshStandardMaterial({ color: '#5a4636', roughness: 0.85 });
    const iron = new THREE.MeshStandardMaterial({ color: '#354043', roughness: 0.65 });
    return {
      casting,
      oak: headstock.oak,
      iron: headstock.iron,
      clapper,
      bronze,
      oakMat: oak,
      ironMat: iron,
    };
  }, []);
  useEffect(
    () => () => {
      parts.casting.dispose();
      parts.oak.dispose();
      parts.iron.dispose();
      parts.clapper.dispose();
      parts.bronze.dispose();
      parts.oakMat.dispose();
      parts.ironMat.dispose();
    },
    [parts]
  );

  /** Ring it if the cooldown allows: swing and strike. True when it rang. */
  const ring = useCallback((): boolean => {
    if (!ringSchoolBell(motion, performance.now() / 1000)) return false;
    const centre = centreRef.current;
    let distance = 0;
    let pan = 0;
    if (centre) {
      centre.getWorldPosition(_bellCentre);
      _toBell.subVectors(_bellCentre, camera.position);
      distance = _toBell.length();
      if (distance > 1e-3) {
        _cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        pan = (_toBell.dot(_cameraRight) / distance) * 0.8;
      }
    }
    playSchoolBell({ distance, pan });
    return true;
  }, [camera, motion]);

  // First person: the bell is an activation target while mounted.
  useEffect(() => {
    const target = {
      id: 'school-bell',
      prompt: 'ringBell' as const,
      centre: new THREE.Vector3(),
      radius: SCHOOL_BELL_AIM_RADIUS,
      reach: SCHOOL_BELL_REACH,
      activate: ring,
    };
    centreRef.current?.getWorldPosition(target.centre);
    const unregister = registerWorldInteractable(target);
    const refresh = window.setInterval(() => {
      centreRef.current?.getWorldPosition(target.centre);
    }, 1000);
    return () => {
      window.clearInterval(refresh);
      unregister();
    };
  }, [ring]);

  useEffect(
    () => () => {
      if (hovered.current) document.body.style.cursor = 'auto';
    },
    []
  );

  useFrame((_state, delta) => {
    const swing = swingRef.current;
    const clapper = clapperRef.current;
    if (!swing || !clapper) return;
    const moving = stepSchoolBell(motion, delta);
    if (!moving && swing.rotation.x === 0) return;
    swing.rotation.x = motion.angle;
    clapper.rotation.x = schoolBellClapperAngle(motion);
  });

  const onClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      // First person rings through its own activation (E or click while
      // looking at it); R3F's pointer is stale under pointer lock.
      if (document.pointerLockElement) return;
      event.stopPropagation();
      ring();
    },
    [ring]
  );
  const onPointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (document.pointerLockElement) return;
      event.stopPropagation();
      hovered.current = true;
      document.body.style.cursor = 'pointer';
      parts.bronze.emissiveIntensity = HOVER_INTENSITY;
    },
    [parts]
  );
  const onPointerOut = useCallback(() => {
    if (!hovered.current) return;
    hovered.current = false;
    document.body.style.cursor = 'auto';
    parts.bronze.emissiveIntensity = 0;
  }, [parts]);

  return (
    <group
      name="school-bell"
      position={[...SCHOOL_BELL_PIVOT]}
      userData={{ dynamic: true }}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <group ref={swingRef} name="school-bell-swing">
        <mesh geometry={parts.casting} material={parts.bronze} castShadow receiveShadow />
        <mesh geometry={parts.oak} material={parts.oakMat} castShadow />
        <mesh geometry={parts.iron} material={parts.ironMat} castShadow />
        <group ref={clapperRef} position={[0, SCHOOL_BELL_CLAPPER_HANG_Y, 0]}>
          <mesh geometry={parts.clapper} material={parts.ironMat} castShadow />
        </group>
        <object3D ref={centreRef} position={[0, SCHOOL_BELL_CENTRE_Y, 0]} />
      </group>
    </group>
  );
});
SchoolBell.displayName = 'SchoolBell';
