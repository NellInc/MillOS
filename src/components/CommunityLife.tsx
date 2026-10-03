import { useEffect, useMemo, useRef } from 'react';
import { registerReplayParticipant } from '../simulation/workplaceReplayRuntime';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { WorkerModel, type WorkerMotionState } from './models/WorkerModel';
import { getWorkerAppearance } from './workers/workerTypes';
import { CommunityDetails } from './scenery/CommunityDetails';
import { CommunityBus, DeliveryHandcart, CommunityBicycle } from './scenery/CommunityTransit';
import { useGameSimulationStore } from '../stores/gameSimulationStore';
import { useProductionStore } from '../stores/productionStore';
import { useOperationsCampaignStore } from '../stores/operationsCampaignStore';
import { useBreakdownStore } from '../stores/breakdownStore';
import { useMaterialFlowStore } from '../stores/materialFlowStore';
import { useGraphicsStore } from '../stores/graphicsStore';
import { useWorkplaceStore } from '../stores/workplaceStore';
import { SceneText } from './shared/SceneText';
import { useReducedMotion } from '../hooks/useReducedMotion';
import {
  COMMUNITY_ROSTER,
  createCommunityPose,
  sampleCommunityPerson,
  sampleCommunityCyclist,
  sampleCommunityBus,
  sampleCommunityDelivery,
  advanceCommunityBusClock,
  advanceCommunityPeopleClock,
  hasCommunityBakerySupply,
  communityWorkResponse,
  communityAgreementCue,
  communityAgreementResponse,
  advanceCommunityAgreementClock,
  type CommunityOperationsSnapshot,
} from '../simulation/communityLife';
import { EXTERIOR_LAYERS, POLYGON_OFFSET } from '../constants/renderLayers';

const COLOURS = ['#596e72', '#53637c', '#9a7654', '#6b8568', '#bdad82', '#6b5871'];
const _truckPosition = new THREE.Vector3();

function AgreementLabel({ personId }: { personId: string }) {
  const label = useWorkplaceStore((s) => communityAgreementCue(personId, s.workplace)?.label);
  const emergency = useGameSimulationStore((s) => s.emergencyActive || s.emergencyDrillMode);
  if (!label) return null;
  return (
    <Billboard position={[0, 2.15, 0]}>
      <SceneText
        fontSize={0.18}
        maxWidth={4.5}
        textAlign="center"
        anchorX="center"
        anchorY="bottom"
        color="#f4edda"
        outlineWidth={0.025}
        outlineColor="#172c32"
      >
        {emergency ? 'Site safety stop' : label}
      </SceneText>
    </Billboard>
  );
}

/** One schedule update feeds bodies, vehicles and the props they use. It never
 * changes production inventory or reintroduces the retired worker-voice system.
 * Working if pausing freezes movement, bodies keep their pose, and unload props
 * never imply a grocer delivery without a real order.
 */
export function CommunityLife() {
  const reducedMotion = useReducedMotion();
  const enabled = useGraphicsStore((s) => !s.graphics.perfDebug.disableCommunityLife);
  const roots = useRef<Array<THREE.Group | null>>([]);
  const labels = useRef<Array<THREE.Group | null>>([]);
  const bakeryStocked = useOperationsCampaignStore((s) =>
    hasCommunityBakerySupply(s.orders, s.elapsedMinutes)
  );
  const initialHour = useRef(
    useGameSimulationStore.getState().gameDay * 24 + useGameSimulationStore.getState().gameTime
  ).current;
  const clocks = useRef({ world: initialHour, people: initialHour, bus: initialHour });
  const operations = useRef<CommunityOperationsSnapshot>({
    machines: [],
    workOrders: [],
    batches: [],
    bakeryStocked: false,
  }).current;
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
          hour: initialHour,
          pose,
          motion,
          response: { activity: pose.activity, task: pose.task },
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

  useEffect(
    () =>
      registerReplayParticipant('personnel', {
        capture: () => ({
          clocks: { ...clocks.current },
          residents: residents.map(({ hour, pose, motion, response }) => ({
            hour,
            pose,
            motion,
            response,
          })),
          bus,
          bicycle,
          cart,
        }),
        restore: (saved) => {
          clocks.current = saved.clocks;
          saved.residents.forEach((actor, index) => {
            const resident = residents[index];
            if (!resident) return;
            resident.hour = actor.hour;
            Object.assign(resident.pose, actor.pose);
            Object.assign(resident.motion, actor.motion);
            Object.assign(resident.response, actor.response);
          });
          Object.assign(bus, saved.bus);
          Object.assign(bicycle, saved.bicycle);
          Object.assign(cart, saved.cart);
        },
      }),
    [residents, bus, bicycle, cart]
  );

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
    const previousPeopleHour = clocks.current.people;
    clocks.current.people = advanceCommunityPeopleClock(
      clocks.current.people,
      worldHour,
      elapsed,
      moving,
      emergency
    );
    if (jump && !emergency) clocks.current.bus = worldHour;
    let trafficBlocked = false;
    const truck = scene.getObjectByName('shipping-truck');
    if (truck?.visible) {
      truck.getWorldPosition(_truckPosition);
      trafficBlocked = _truckPosition.z > 75 && _truckPosition.z < 260;
    }
    if (!emergency)
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
    const campaign = useOperationsCampaignStore.getState();
    const workplace = useWorkplaceStore.getState().workplace;
    operations.machines = useProductionStore.getState().machines;
    operations.workOrders = useBreakdownStore.getState().workOrders;
    operations.batches = useMaterialFlowStore.getState().productionBatches;
    operations.bakeryStocked = hasCommunityBakerySupply(campaign.orders, campaign.elapsedMinutes);
    operations.weather = game.weather;
    for (let i = 0; i < residents.length; i++) {
      const actor = residents[i],
        root = roots.current[i];
      if (!root) continue;
      const oldX = actor.pose.position[0],
        oldZ = actor.pose.position[2];
      const agreement = communityAgreementCue(actor.person.id, workplace);
      actor.hour = advanceCommunityAgreementClock(
        actor.hour,
        clocks.current.people - previousPeopleHour,
        agreement
      );
      sampleCommunityPerson(
        actor.person,
        actor.person.district === 'bus' ? clocks.current.bus : actor.hour,
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
      const label = labels.current[i];
      if (label) label.visible = distanceSquared < 50 * 50;
      motion.animationInterval =
        distanceSquared < 18 * 18 ? 1 / 60 : distanceSquared < 50 * 50 ? 1 / 30 : 1 / 15;
      motion.enabled = moving && !reducedMotion && pose.visible && distanceSquared < 150 * 150;
      const response = communityWorkResponse(actor.person, pose, operations, actor.response);
      communityAgreementResponse(agreement, pose, response);
      const task = emergency ? 'Holding safely for the site safety stop' : response.task;
      if (!emergency) motion.activity = response.activity;
      Object.assign(root.userData, {
        activity: motion.activity,
        task,
        seated: pose.seated,
        groundSpeed: motion.groundSpeed,
        agreementMemberId: agreement?.memberId ?? null,
        agreementState: agreement?.state ?? null,
        agreementPresentation: agreement ? 'representative' : null,
      });
    }
    cart.visible = drop.visible;
    cart.rotation = Math.PI;
    // Handles terminate at the courier's hands, with the cart trailing behind.
    cart.position[0] = drop.cartX;
    cart.position[2] = drop.cartZ;
    cart.loaded = drop.loaded;
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
            <group
              ref={(node) => {
                labels.current[index] = node;
              }}
            >
              <AgreementLabel personId={person.id} />
            </group>
          </group>
        ))}
      </group>
      <group name="world-community-details" visible={enabled} userData={{ noStaticBatch: true }}>
        <CommunityDetails bakeryStocked={bakeryStocked} />
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
