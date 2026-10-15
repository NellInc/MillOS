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
  createCommunityGreeting,
  communityPassengerAttention,
  sampleCommunityGreeting,
  createCommunityPose,
  sampleCommunityPerson,
  sampleCommunityCyclist,
  sampleCommunityBus,
  sampleCommunityDelivery,
  advanceCommunityBusClock,
  advanceCommunityPeopleClock,
  advanceCommunityPresentationClock,
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

/** Convert after the actor's real eased heading, not the route's target yaw.
 * Working if fully supported feet survive the existing incoming half-turn.
 */
function updateSeatCue(
  motion: WorkerMotionState,
  pose: ReturnType<typeof createCommunityPose>,
  yaw: number
) {
  if (!pose.seat) {
    motion.seat = undefined;
    return;
  }
  const cue = motion.seat ?? (motion.seat = { amount: 0, support: 0, x: 0, z: 0, yaw: 0 });
  const dx = pose.seat.position[0] - pose.position[0],
    dz = pose.seat.position[2] - pose.position[2];
  cue.amount = pose.seat.amount;
  cue.support = pose.seat.support;
  cue.x = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  cue.z = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  cue.yaw = Math.atan2(Math.sin(pose.seat.rotation - yaw), Math.cos(pose.seat.rotation - yaw));
}

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

/** Initial presentation and admitted frames read the same domain truth.
 * Working if an unstocked shop or rain hold cannot briefly render as work.
 */
function readCommunityOperations(out: CommunityOperationsSnapshot) {
  const campaign = useOperationsCampaignStore.getState();
  out.machines = useProductionStore.getState().machines;
  out.workOrders = useBreakdownStore.getState().workOrders;
  out.batches = useMaterialFlowStore.getState().productionBatches;
  out.bakeryStocked = hasCommunityBakerySupply(campaign.orders, campaign.elapsedMinutes);
  out.weather = useGameSimulationStore.getState().weather;
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
  const clocks = useRef({
    world: initialHour,
    presentation: initialHour,
    people: initialHour,
    bus: initialHour,
  });
  const operations = useRef<CommunityOperationsSnapshot>({
    machines: [],
    workOrders: [],
    batches: [],
    bakeryStocked: false,
  }).current;
  const residents = useMemo(() => {
    readCommunityOperations(operations);
    const game = useGameSimulationStore.getState();
    const emergency = game.emergencyActive || game.emergencyDrillMode;
    const workplace = useWorkplaceStore.getState().workplace;
    return COMMUNITY_ROSTER.map((person, i) => {
      const pose = sampleCommunityPerson(person, initialHour, createCommunityPose());
      const response = communityWorkResponse(person, pose, operations);
      const agreement = communityAgreementCue(person.id, workplace);
      communityAgreementResponse(agreement, pose, response);
      const activity = emergency && !pose.seated ? 'idle' : response.activity;
      const motion: WorkerMotionState = {
        activity,
        groundSpeed: !emergency && pose.activity === 'walking' ? 1.1 : 0,
        seated: pose.seated,
        enabled: false,
        phase: i * 1.731,
      };
      updateSeatCue(motion, pose, pose.rotation);
      return {
        person,
        hour: initialHour,
        pose,
        motion,
        response,
        // R3F retains this object. React must not replace frame-resolved duties
        // with a new object containing the unguarded scheduled task.
        userData: {
          communityId: person.id,
          activity,
          task: emergency ? 'Holding safely for the site safety stop' : response.task,
        },
        greeting: createCommunityGreeting(),
        appearance: getWorkerAppearance(person.role, COLOURS[i % COLOURS.length], person.id),
      };
    });
  }, [initialHour, operations]);
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
            resident.pose.seat = undefined;
            resident.motion.seat = undefined;
            Object.assign(resident.pose, actor.pose);
            resident.motion.attentionYaw = actor.motion.attentionYaw ?? 0;
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
    const jump = elapsed < 0 || Math.abs(elapsed) > 0.5;
    const emergency = game.emergencyActive || game.emergencyDrillMode;
    const held = emergency || !game.isTabVisible;
    const moving = !held && game.gameSpeed > 0;
    const previousPresentation = clocks.current.presentation;
    clocks.current.presentation = advanceCommunityPresentationClock(
      previousPresentation,
      worldHour,
      elapsed,
      delta,
      game.gameSpeed,
      game.isTabVisible,
      emergency
    );
    const presentedElapsed = held ? 0 : clocks.current.presentation - previousPresentation;
    const reframe = !held && (jump || (!moving && elapsed !== 0));
    const previousPeopleHour = clocks.current.people;
    clocks.current.people = advanceCommunityPeopleClock(
      clocks.current.people,
      clocks.current.presentation,
      presentedElapsed,
      moving,
      held
    );
    if (reframe) clocks.current.bus = worldHour;
    let trafficBlocked = false;
    const truck = scene.getObjectByName('shipping-truck');
    if (truck?.visible) {
      truck.getWorldPosition(_truckPosition);
      trafficBlocked = _truckPosition.z > 75 && _truckPosition.z < 260;
    }
    if (!held)
      clocks.current.bus = advanceCommunityBusClock(
        clocks.current.bus,
        reframe ? 0 : moving ? presentedElapsed : 0,
        trafficBlocked
      );
    if (reframe) clocks.current.bus = advanceCommunityBusClock(worldHour, 0, trafficBlocked);
    clocks.current.world = worldHour;
    Object.assign(bus, sampleCommunityBus(clocks.current.bus));
    Object.assign(bicycle, sampleCommunityCyclist(clocks.current.people));
    const drop = sampleCommunityDelivery(clocks.current.people);
    const workplace = useWorkplaceStore.getState().workplace;
    readCommunityOperations(operations);
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
      // Riders and held cart grips share their prop's exact heading. Easing only
      // the body breaks the hand/foot contacts during turns.
      // Working if rider and bicycle transforms agree on every moving frame.
      const coupled =
        actor.person.role === 'Cyclist' ||
        (actor.person.id === 'village-courier' && !!drop.cartGrip);
      root.rotation.y =
        moving && !jump && !coupled
          ? root.rotation.y + turn * (1 - Math.exp(-delta * 8))
          : pose.rotation;
      root.visible = pose.visible;
      motion.activity = emergency && !pose.seated ? 'idle' : pose.activity;
      motion.seated = pose.seated;
      updateSeatCue(motion, pose, root.rotation.y);
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
      motion.enabled =
        moving &&
        presentedElapsed > 0 &&
        !reducedMotion &&
        pose.visible &&
        distanceSquared < 150 * 150;
      const response = communityWorkResponse(actor.person, pose, operations, actor.response);
      communityAgreementResponse(agreement, pose, response);
      const task = emergency ? 'Holding safely for the site safety stop' : response.task;
      if (!emergency) motion.activity = response.activity;
      Object.assign(root.userData, {
        activity: motion.activity,
        task,
        seated: pose.seated,
        greeting: false,
        groundSpeed: motion.groundSpeed,
        agreementMemberId: agreement?.memberId ?? null,
        agreementState: agreement?.state ?? null,
        agreementPresentation: agreement ? 'representative' : null,
      });
    }
    // Second pass: all recipients now have this frame's pose, not a mixture of frames.
    for (let i = 0; i < residents.length; i++) {
      const actor = residents[i],
        root = roots.current[i];
      if (!root) continue;
      // The replay already captures motion.greetingTargetId. Seed hysteresis
      // from that authoritative state, never an uncaptured future recipient.
      // Working if restoring old/null motion discards the stale scratch target.
      actor.greeting.targetId = actor.motion.greetingTargetId ?? null;
      const greeting = sampleCommunityGreeting(actor.person, actor.pose, residents, actor.greeting);
      actor.motion.greetingTargetId = greeting.targetId;
      actor.motion.greetingYaw = greeting.yaw;
      const motion = actor.motion;
      // The route already owns the desired direction. Look into its real turn,
      // relative to the eased root, without sampling a future simulation state.
      // Working if the head acknowledges turns while routes/prop contacts stay exact.
      const routeTurn = actor.pose.rotation - root.rotation.y;
      motion.attentionYaw =
        motion.activity === 'walking' &&
        motion.enabled &&
        !jump &&
        !motion.seated &&
        !motion.seat &&
        !motion.cycling &&
        !motion.cartGrip
          ? THREE.MathUtils.clamp(Math.atan2(Math.sin(routeTurn), Math.cos(routeTurn)), -0.6, 0.6)
          : communityPassengerAttention(actor.person, actor.pose, bus);
      root.userData.attentionYaw = actor.motion.attentionYaw;
      actor.motion.greeting = !emergency && actor.motion.activity === 'idle' && !!greeting.targetId;
      root.userData.greeting = actor.motion.greeting;
      root.userData.greetingTargetId = greeting.targetId;
      if (!emergency && actor.pose.task === 'Greeting a neighbour')
        root.userData.task = greeting.targetId
          ? 'Greeting a passing neighbour'
          : 'A moment outside the shop';
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
        {residents.map(({ person, appearance, motion, pose, userData }, index) => (
          <group
            key={person.id}
            name={person.id}
            ref={(node) => {
              roots.current[index] = node;
            }}
            position={pose.position}
            rotation={[0, pose.rotation, 0]}
            visible={pose.visible}
            userData={userData}
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
