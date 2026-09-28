import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WorkerModel, type WorkerMotionState } from './models/WorkerModel';
import { getWorkerAppearance } from './workers/workerTypes';
import { CommunityDetails, COMMUNITY_GEOMETRY } from './scenery/CommunityDetails';
import { CommunityBus, DeliveryHandcart, CommunityBicycle } from './scenery/CommunityTransit';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  COMMUNITY_ROSTER,
  createCommunityPose,
  sampleCommunityPerson,
  sampleCommunityCyclist,
  sampleCommunityBus,
  sampleCommunityDelivery,
  advanceCommunityBusClock,
} from '../simulation/communityLife';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../constants/renderLayers';

const COLOURS = ['#596e72', '#53637c', '#9a7654', '#6b8568', '#bdad82', '#6b5871'];
const _truckPosition = new THREE.Vector3();

/** One schedule update feeds bodies, vehicles and the props they use. It never
 * changes production inventory or reintroduces the retired worker-voice system.
 * Working if pausing freezes movement, bodies keep their pose, and unload props
 * appear only after the visible courier's unloading interval.
 */
export function CommunityLife() {
  const reducedMotion = useReducedMotion();
  const enabled = useGraphicsStore((s) => !s.graphics.perfDebug.disableCommunityLife);
  const roots = useRef<Array<THREE.Group | null>>([]);
  const deliveryProp = useRef<THREE.Group>(null);
  const initialHour = useRef(
    useGameSimulationStore.getState().gameDay * 24 + useGameSimulationStore.getState().gameTime
  ).current;
  const clocks = useRef({ world: initialHour, people: initialHour, bus: initialHour });
  const residents = useMemo(
    () =>
      COMMUNITY_ROSTER.map((person, i) => {
        const pose = sampleCommunityPerson(person, initialHour, createCommunityPose());
        const motion: WorkerMotionState = {
          activity: pose.activity,
          groundSpeed: pose.activity === 'walking' ? 1.1 : 0,
          seated: pose.seated,
          enabled: false,
          phase: i * 1.731,
        };
        return {
          person,
          pose,
          motion,
          appearance: getWorkerAppearance(person.role, COLOURS[i % COLOURS.length], person.id),
        };
      }),
    [initialHour]
  );
  const bus = useRef(sampleCommunityBus(initialHour)).current;
  const bicycle = useRef(sampleCommunityCyclist(initialHour)).current;
  const delivery = sampleCommunityDelivery(initialHour);
  const cart = useRef({
    visible: delivery.visible,
    position: [delivery.cartX, 0, delivery.cartZ] as [number, number, number],
    rotation: delivery.rotation,
    loaded: delivery.loaded,
  }).current;

  useFrame(({ scene, camera }, delta) => {
    if (!enabled) {
      residents.forEach((actor) => {
        actor.motion.enabled = false;
      });
      return;
    }
    const game = useGameSimulationStore.getState();
    const worldHour = game.gameDay * 24 + game.gameTime;
    const elapsed = worldHour - clocks.current.world;
    const jump = Math.abs(elapsed) > 0.5;
    const emergency = game.emergencyActive || game.emergencyDrillMode;
    const moving = game.isTabVisible && game.gameSpeed > 0 && !emergency;
    if (jump) {
      clocks.current.people = worldHour;
      clocks.current.bus = worldHour;
    } else if (moving) clocks.current.people += elapsed;
    // Art-directed time changes still update the static pose while paused.
    else if (!emergency && elapsed !== 0) clocks.current.people = worldHour;
    let trafficBlocked = false;
    const truck = scene.getObjectByName('shipping-truck');
    if (truck?.visible) {
      truck.getWorldPosition(_truckPosition);
      trafficBlocked = _truckPosition.z > 75 && _truckPosition.z < 260;
    }
    clocks.current.bus = advanceCommunityBusClock(
      clocks.current.bus,
      jump ? 0 : moving ? elapsed : 0,
      trafficBlocked
    );
    if (!moving && !emergency && elapsed !== 0)
      clocks.current.bus = advanceCommunityBusClock(worldHour, 0, trafficBlocked);
    clocks.current.world = worldHour;
    Object.assign(bus, sampleCommunityBus(clocks.current.bus));
    Object.assign(bicycle, sampleCommunityCyclist(clocks.current.people));
    const drop = sampleCommunityDelivery(clocks.current.people);
    const machines = useProductionStore.getState().machines;
    for (let i = 0; i < residents.length; i++) {
      const actor = residents[i],
        root = roots.current[i];
      if (!root) continue;
      const oldX = actor.pose.position[0],
        oldZ = actor.pose.position[2];
      sampleCommunityPerson(
        actor.person,
        actor.person.district === 'bus' ? clocks.current.bus : clocks.current.people,
        actor.pose
      );
      const { pose, motion } = actor;
      root.position.set(...pose.position);
      const turn = Math.atan2(
        Math.sin(pose.rotation - root.rotation.y),
        Math.cos(pose.rotation - root.rotation.y)
      );
      root.rotation.y =
        moving && !jump ? root.rotation.y + turn * (1 - Math.exp(-delta * 8)) : pose.rotation;
      root.visible = pose.visible;
      motion.activity = emergency && !pose.seated ? 'idle' : pose.activity;
      motion.seated = pose.seated;
      motion.seatFloorOffset = actor.person.district === 'bus' ? 0.048 : 0;
      motion.cycling = actor.person.role === 'Cyclist';
      motion.cyclePhase = bicycle.pedalPhase;
      motion.cartGrip = actor.person.id === 'village-courier' ? drop.cartGrip : undefined;
      motion.groundSpeed =
        moving && !jump && delta > 0
          ? Math.min(4, Math.hypot(pose.position[0] - oldX, pose.position[2] - oldZ) / delta)
          : 0;
      // Cosmetic motion is omitted far away. Semantic poses still
      // update in WorkerModel when enabled is false.
      const distanceSquared = camera.position.distanceToSquared(root.position);
      motion.animationInterval =
        distanceSquared < 18 * 18 ? 1 / 60 : distanceSquared < 50 * 50 ? 1 / 30 : 1 / 15;
      motion.enabled = moving && !reducedMotion && pose.visible && distanceSquared < 150 * 150;
      let task = emergency ? 'Holding safely for the site safety stop' : pose.task;
      if (pose.activity === 'working' && actor.person.machineId) {
        const machine = machines.find((m) => m.id === actor.person.machineId);
        if (machine?.status === 'idle') task = 'Checking the idle line';
        if (machine?.status === 'critical' || machine?.status === 'warning')
          task = 'Inspecting a reported equipment fault';
      }
      Object.assign(root.userData, {
        activity: motion.activity,
        task,
        seated: pose.seated,
        groundSpeed: motion.groundSpeed,
      });
    }
    cart.visible = drop.visible;
    cart.rotation = Math.PI;
    // Handles terminate at the courier's hands, with the cart trailing behind.
    cart.position[0] = drop.cartX;
    cart.position[2] = drop.cartZ;
    cart.loaded = drop.loaded;
    if (deliveryProp.current) deliveryProp.current.visible = drop.delivered;
  }, -1);

  return (
    <>
      <group name="world-personnel" visible={enabled} userData={{ noStaticBatch: true }}>
        {residents.map(({ person, appearance, motion, pose }, index) => (
          <group
            key={person.id}
            name={person.id}
            ref={(node) => {
              roots.current[index] = node;
            }}
            position={pose.position}
            rotation={[0, pose.rotation, 0]}
            visible={pose.visible}
            userData={{ communityId: person.id, activity: pose.activity, task: pose.task }}
          >
            <WorkerModel appearance={appearance} motion={motion} />
          </group>
        ))}
      </group>
      <group name="world-community-details" visible={enabled} userData={{ noStaticBatch: true }}>
        <CommunityDetails />
        {/* The normal detail assembly owns the display; only delivery geometry is
          mounted here so a mutable event can change visibility without a store. */}
        <group ref={deliveryProp} visible={delivery.delivered}>
          <DeliveryStock />
        </group>
        <CommunityBus pose={bus} />
        <CommunityBicycle pose={bicycle} />
        <DeliveryHandcart pose={cart} />
        {/* Turnaround blends at the same datum as the existing approach road. */}
        <mesh
          name="village-shuttle-turnaround"
          position={[20, EXTERIOR_LAYERS.ground, 118]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <circleGeometry args={[12, 48]} />
          <meshStandardMaterial
            color="#34393a"
            roughness={0.96}
            polygonOffset
            polygonOffsetFactor={POLYGON_OFFSET.exteriorMid.factor}
            polygonOffsetUnits={POLYGON_OFFSET.exteriorMid.units}
          />
        </mesh>
      </group>
    </>
  );
}

const DELIVERY_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.84 });
function DeliveryStock() {
  return (
    <mesh
      name="shop-unloaded-flour"
      geometry={COMMUNITY_GEOMETRY.delivery}
      material={DELIVERY_MATERIAL}
      castShadow
      receiveShadow
      dispose={null}
    />
  );
}
