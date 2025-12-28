// Animation phases for realistic truck docking
export type TruckPhase =
  | 'entering'
  | 'slowing'
  | 'turning_in'
  | 'straightening'
  | 'positioning'
  | 'stopping_to_back'
  | 'backing'
  | 'final_adjustment'
  | 'docked'
  | 'preparing_to_leave'
  | 'pulling_out'
  | 'turning_out'
  | 'accelerating'
  | 'leaving';

// Truck animation state with full 2D position and detailed state
export interface TruckAnimState {
  phase: TruckPhase;
  x: number;
  z: number;
  rotation: number;
  speed: number;
  steeringAngle: number;
  brakeLights: boolean;
  reverseLights: boolean;
  leftSignal: boolean;
  rightSignal: boolean;
  trailerAngle: number;
  cabRoll: number;
  cabPitch: number;
  throttle: number;
  doorsOpen: boolean;
}

// =============================================================================
// EASING FUNCTIONS
// =============================================================================

const easeInOutCubic = (t: number): number => {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

const easeInQuad = (t: number): number => {
  return t * t;
};

const easeInOutQuad = (t: number): number => {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// =============================================================================
// SHIPPING DOCK (Front of building, z=50)
// Uses 90-degree alley dock: Drive past, swing left, back straight in
// =============================================================================

export const calculateShippingTruckState = (cycle: number, time: number): TruckAnimState => {
  // WAYPOINTS - simple (x, z, rotation) tuples
  // Rotation: π = facing -Z (toward building), 0 = facing +Z (away from building)
  const TUNNEL = { x: 20, z: 270, rot: Math.PI };
  const APPROACH = { x: 20, z: 95, rot: Math.PI };
  const SETUP = { x: -8, z: 75, rot: 0 }; // Swung left, now facing +Z for backing
  const DOCK = { x: 0, z: 61, rot: 0 };
  const PULLOUT_END = { x: 0, z: 80, rot: 0 };
  const EXIT_ROAD = { x: 20, z: 110, rot: 0 };

  // Phase durations (total = 60s)
  const T_ENTER = 8; // Tunnel to approach
  const T_TURN = 6; // Swing left into setup position
  const T_BACK = 8; // Back into dock
  const T_DOCKED = 16; // Loading
  const T_PULLOUT = 4; // Pull forward
  const T_EXIT = 6; // Turn right to road
  const T_LEAVE = 12; // Drive away

  const signalBlink = Math.sin(time * 8) > 0;

  // =========================================================================
  // PHASE 1: ENTERING - Straight from tunnel to approach point
  // =========================================================================
  if (cycle < T_ENTER) {
    const t = easeInOutQuad(cycle / T_ENTER);
    return {
      phase: 'entering',
      x: lerp(TUNNEL.x, APPROACH.x, t),
      z: lerp(TUNNEL.z, APPROACH.z, t),
      rotation: TUNNEL.rot, // Constant: facing -Z
      speed: lerp(1.0, 0.4, t),
      steeringAngle: 0,
      brakeLights: t > 0.8,
      reverseLights: false,
      leftSignal: t > 0.6 && signalBlink,
      rightSignal: false,
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: t > 0.8 ? 0.02 : 0,
      throttle: lerp(0.7, 0.3, t),
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 2: TURNING IN - Swing left to setup position (90-degree alley dock)
  // =========================================================================
  if (cycle < T_ENTER + T_TURN) {
    const t = easeInOutCubic((cycle - T_ENTER) / T_TURN);

    // Simple lerp for position and rotation
    const x = lerp(APPROACH.x, SETUP.x, t);
    const z = lerp(APPROACH.z, SETUP.z, t);
    // Rotation sweeps from π to 0 (180° turn)
    const rotation = lerp(APPROACH.rot, SETUP.rot, t);

    // Steering angle follows the turn
    const steeringAngle = -0.4 * Math.sin(t * Math.PI);

    return {
      phase: 'turning_in',
      x,
      z,
      rotation,
      speed: 0.35,
      steeringAngle,
      brakeLights: t > 0.9,
      reverseLights: false,
      leftSignal: signalBlink,
      rightSignal: false,
      trailerAngle: steeringAngle * -0.3,
      cabRoll: steeringAngle * 0.05,
      cabPitch: 0,
      throttle: 0.35,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 3: BACKING - Straight reverse into dock
  // =========================================================================
  if (cycle < T_ENTER + T_TURN + T_BACK) {
    const t = easeInOutQuad((cycle - T_ENTER - T_TURN) / T_BACK);

    // Curve slightly to center the trailer
    const x = lerp(SETUP.x, DOCK.x, smoothstep(t));
    const z = lerp(SETUP.z, DOCK.z, t);

    // Small steering corrections for realism
    const wobble = Math.sin(cycle * 2) * 0.02 * (1 - t);
    const steeringAngle = 0.15 * Math.sin(t * Math.PI * 0.8) * (1 - t) + wobble;

    return {
      phase: 'backing',
      x,
      z,
      rotation: SETUP.rot + wobble,
      speed: -0.25,
      steeringAngle,
      brakeLights: false,
      reverseLights: true,
      leftSignal: false,
      rightSignal: false,
      trailerAngle: steeringAngle * 0.2,
      cabRoll: 0,
      cabPitch: -0.01,
      throttle: 0.25,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 4: DOCKED - Loading/unloading
  // =========================================================================
  if (cycle < T_ENTER + T_TURN + T_BACK + T_DOCKED) {
    const phaseTime = cycle - T_ENTER - T_TURN - T_BACK;
    return {
      phase: 'docked',
      x: DOCK.x,
      z: DOCK.z,
      rotation: DOCK.rot,
      speed: 0,
      steeringAngle: 0,
      brakeLights: false,
      reverseLights: false,
      leftSignal: false,
      rightSignal: false,
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: 0,
      throttle: 0.1,
      doorsOpen: phaseTime > 1 && phaseTime < T_DOCKED - 2,
    };
  }

  // =========================================================================
  // PHASE 5: PULLING OUT - Drive forward from dock
  // =========================================================================
  if (cycle < T_ENTER + T_TURN + T_BACK + T_DOCKED + T_PULLOUT) {
    const t = easeInQuad((cycle - T_ENTER - T_TURN - T_BACK - T_DOCKED) / T_PULLOUT);
    return {
      phase: 'pulling_out',
      x: lerp(DOCK.x, PULLOUT_END.x, t),
      z: lerp(DOCK.z, PULLOUT_END.z, t),
      rotation: DOCK.rot,
      speed: lerp(0.1, 0.5, t),
      steeringAngle: 0,
      brakeLights: false,
      reverseLights: false,
      leftSignal: false,
      rightSignal: signalBlink,
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: -0.02 * t,
      throttle: lerp(0.3, 0.5, t),
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 6: TURNING OUT - Right turn toward road
  // =========================================================================
  const exitStart = T_ENTER + T_TURN + T_BACK + T_DOCKED + T_PULLOUT;
  if (cycle < exitStart + T_EXIT) {
    const t = easeInOutCubic((cycle - exitStart) / T_EXIT);

    const x = lerp(PULLOUT_END.x, EXIT_ROAD.x, t);
    const z = lerp(PULLOUT_END.z, EXIT_ROAD.z, t);

    // Steering right
    const steeringAngle = 0.35 * Math.sin(t * Math.PI);

    return {
      phase: 'turning_out',
      x,
      z,
      rotation: PULLOUT_END.rot, // Stays at 0 (facing +Z)
      speed: 0.5 + t * 0.2,
      steeringAngle,
      brakeLights: false,
      reverseLights: false,
      leftSignal: false,
      rightSignal: t < 0.7 && signalBlink,
      trailerAngle: steeringAngle * -0.2,
      cabRoll: steeringAngle * 0.04,
      cabPitch: -0.015,
      throttle: 0.55,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 7: LEAVING - Drive away to tunnel
  // =========================================================================
  const leaveStart = exitStart + T_EXIT;
  if (cycle < leaveStart + T_LEAVE) {
    const t = easeInQuad((cycle - leaveStart) / T_LEAVE);
    return {
      phase: 'accelerating',
      x: EXIT_ROAD.x,
      z: lerp(EXIT_ROAD.z, TUNNEL.z, t),
      rotation: 0, // Facing +Z (away from building)
      speed: 0.8 + t * 0.3,
      steeringAngle: 0,
      brakeLights: false,
      reverseLights: false,
      leftSignal: false,
      rightSignal: false,
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: -0.02,
      throttle: 0.8,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 8: HOLD - At tunnel (cycle wraps)
  // =========================================================================
  return {
    phase: 'leaving',
    x: TUNNEL.x,
    z: TUNNEL.z,
    rotation: 0,
    speed: 1.0,
    steeringAngle: 0,
    brakeLights: false,
    reverseLights: false,
    leftSignal: false,
    rightSignal: false,
    trailerAngle: 0,
    cabRoll: 0,
    cabPitch: 0,
    throttle: 0,
    doorsOpen: false,
  };
};

// =============================================================================
// RECEIVING DOCK (Back of building, z=-50)
// Mirror of shipping: Drive past, swing right, back straight in
// =============================================================================

export const calculateReceivingTruckState = (cycle: number, time: number): TruckAnimState => {
  // WAYPOINTS - mirrored from shipping (x and z signs flipped, rotation offset by π)
  // Rotation: 0 = facing +Z (toward building), π = facing -Z (away from building)
  const TUNNEL = { x: -20, z: -270, rot: 0 };
  const APPROACH = { x: -20, z: -95, rot: 0 };
  const SETUP = { x: 8, z: -75, rot: Math.PI }; // Swung right, now facing -Z for backing
  const DOCK = { x: 0, z: -61, rot: Math.PI };
  const PULLOUT_END = { x: 0, z: -80, rot: Math.PI };
  const EXIT_ROAD = { x: -20, z: -110, rot: Math.PI };

  // Phase durations (same as shipping, total = 60s)
  const T_ENTER = 8;
  const T_TURN = 6;
  const T_BACK = 8;
  const T_DOCKED = 16;
  const T_PULLOUT = 4;
  const T_EXIT = 6;
  const T_LEAVE = 12;

  const signalBlink = Math.sin(time * 8) > 0;

  // =========================================================================
  // PHASE 1: ENTERING - Straight from tunnel to approach point
  // =========================================================================
  if (cycle < T_ENTER) {
    const t = easeInOutQuad(cycle / T_ENTER);
    return {
      phase: 'entering',
      x: lerp(TUNNEL.x, APPROACH.x, t),
      z: lerp(TUNNEL.z, APPROACH.z, t),
      rotation: TUNNEL.rot, // Constant: facing +Z
      speed: lerp(1.0, 0.4, t),
      steeringAngle: 0,
      brakeLights: t > 0.8,
      reverseLights: false,
      leftSignal: false,
      rightSignal: t > 0.6 && signalBlink, // Signaling right (mirror)
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: t > 0.8 ? 0.02 : 0,
      throttle: lerp(0.7, 0.3, t),
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 2: TURNING IN - Swing right to setup position (mirror of shipping)
  // =========================================================================
  if (cycle < T_ENTER + T_TURN) {
    const t = easeInOutCubic((cycle - T_ENTER) / T_TURN);

    // Simple lerp for position and rotation
    const x = lerp(APPROACH.x, SETUP.x, t);
    const z = lerp(APPROACH.z, SETUP.z, t);
    // Rotation sweeps from 0 to π (180° turn)
    const rotation = lerp(APPROACH.rot, SETUP.rot, t);

    // Steering angle follows the turn (positive = right turn)
    const steeringAngle = 0.4 * Math.sin(t * Math.PI);

    return {
      phase: 'turning_in',
      x,
      z,
      rotation,
      speed: 0.35,
      steeringAngle,
      brakeLights: t > 0.9,
      reverseLights: false,
      leftSignal: false,
      rightSignal: signalBlink,
      trailerAngle: steeringAngle * -0.3,
      cabRoll: steeringAngle * 0.05,
      cabPitch: 0,
      throttle: 0.35,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 3: BACKING - Straight reverse into dock
  // =========================================================================
  if (cycle < T_ENTER + T_TURN + T_BACK) {
    const t = easeInOutQuad((cycle - T_ENTER - T_TURN) / T_BACK);

    // Curve slightly to center the trailer
    const x = lerp(SETUP.x, DOCK.x, smoothstep(t));
    const z = lerp(SETUP.z, DOCK.z, t);

    // Small steering corrections for realism
    const wobble = Math.sin(cycle * 2) * 0.02 * (1 - t);
    const steeringAngle = -0.15 * Math.sin(t * Math.PI * 0.8) * (1 - t) + wobble;

    return {
      phase: 'backing',
      x,
      z,
      rotation: SETUP.rot + wobble,
      speed: -0.25,
      steeringAngle,
      brakeLights: false,
      reverseLights: true,
      leftSignal: false,
      rightSignal: false,
      trailerAngle: steeringAngle * 0.2,
      cabRoll: 0,
      cabPitch: -0.01,
      throttle: 0.25,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 4: DOCKED - Loading/unloading
  // =========================================================================
  if (cycle < T_ENTER + T_TURN + T_BACK + T_DOCKED) {
    const phaseTime = cycle - T_ENTER - T_TURN - T_BACK;
    return {
      phase: 'docked',
      x: DOCK.x,
      z: DOCK.z,
      rotation: DOCK.rot,
      speed: 0,
      steeringAngle: 0,
      brakeLights: false,
      reverseLights: false,
      leftSignal: false,
      rightSignal: false,
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: 0,
      throttle: 0.1,
      doorsOpen: phaseTime > 1 && phaseTime < T_DOCKED - 2,
    };
  }

  // =========================================================================
  // PHASE 5: PULLING OUT - Drive forward from dock
  // =========================================================================
  if (cycle < T_ENTER + T_TURN + T_BACK + T_DOCKED + T_PULLOUT) {
    const t = easeInQuad((cycle - T_ENTER - T_TURN - T_BACK - T_DOCKED) / T_PULLOUT);
    return {
      phase: 'pulling_out',
      x: lerp(DOCK.x, PULLOUT_END.x, t),
      z: lerp(DOCK.z, PULLOUT_END.z, t),
      rotation: DOCK.rot,
      speed: lerp(0.1, 0.5, t),
      steeringAngle: 0,
      brakeLights: false,
      reverseLights: false,
      leftSignal: signalBlink, // Mirror: signal left
      rightSignal: false,
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: -0.02 * t,
      throttle: lerp(0.3, 0.5, t),
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 6: TURNING OUT - Left turn toward road (mirror of shipping)
  // =========================================================================
  const exitStart = T_ENTER + T_TURN + T_BACK + T_DOCKED + T_PULLOUT;
  if (cycle < exitStart + T_EXIT) {
    const t = easeInOutCubic((cycle - exitStart) / T_EXIT);

    const x = lerp(PULLOUT_END.x, EXIT_ROAD.x, t);
    const z = lerp(PULLOUT_END.z, EXIT_ROAD.z, t);

    // Steering left (negative, mirror of shipping)
    const steeringAngle = -0.35 * Math.sin(t * Math.PI);

    return {
      phase: 'turning_out',
      x,
      z,
      rotation: PULLOUT_END.rot, // Stays at π (facing -Z)
      speed: 0.5 + t * 0.2,
      steeringAngle,
      brakeLights: false,
      reverseLights: false,
      leftSignal: t < 0.7 && signalBlink,
      rightSignal: false,
      trailerAngle: steeringAngle * -0.2,
      cabRoll: steeringAngle * 0.04,
      cabPitch: -0.015,
      throttle: 0.55,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 7: LEAVING - Drive away to tunnel
  // =========================================================================
  const leaveStart = exitStart + T_EXIT;
  if (cycle < leaveStart + T_LEAVE) {
    const t = easeInQuad((cycle - leaveStart) / T_LEAVE);
    return {
      phase: 'accelerating',
      x: EXIT_ROAD.x,
      z: lerp(EXIT_ROAD.z, TUNNEL.z, t),
      rotation: Math.PI, // Facing -Z (away from building)
      speed: 0.8 + t * 0.3,
      steeringAngle: 0,
      brakeLights: false,
      reverseLights: false,
      leftSignal: false,
      rightSignal: false,
      trailerAngle: 0,
      cabRoll: 0,
      cabPitch: -0.02,
      throttle: 0.8,
      doorsOpen: false,
    };
  }

  // =========================================================================
  // PHASE 8: HOLD - At tunnel (cycle wraps)
  // =========================================================================
  return {
    phase: 'leaving',
    x: TUNNEL.x,
    z: TUNNEL.z,
    rotation: Math.PI,
    speed: 1.0,
    steeringAngle: 0,
    brakeLights: false,
    reverseLights: false,
    leftSignal: false,
    rightSignal: false,
    trailerAngle: 0,
    cabRoll: 0,
    cabPitch: 0,
    throttle: 0,
    doorsOpen: false,
  };
};
