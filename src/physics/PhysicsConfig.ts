/**
 * Physics configuration for Rapier physics engine integration
 *
 * Uses @react-three/rapier for autonomous vehicles and first-person site inspection.
 */
import { FIRST_PERSON_EYE_HEIGHT } from '../utils/cameraNavigation';
import { SITE_LAYOUT } from '../constants/siteLayout';

// Physics world configuration
export const PHYSICS_CONFIG = {
  gravity: [0, -9.81, 0] as const,
  timestep: 1 / 60,

  // Forklift physics properties
  forklift: {
    mass: 2000,
    linearDamping: 4,
    angularDamping: 10,
    maxLinearVelocity: 4, // Normal speed
    maxSlowVelocity: 2, // Crossing zone speed
    moveForce: 6000,
  },

  // First-person player properties
  player: {
    mass: 80,
    linearDamping: 12, // Very high for responsive feel
    angularDamping: 1,
    maxLinearVelocity: 12, // Walk speed
    maxSprintVelocity: 36, // Sprint speed (3x walk)
    moveForce: 1500,
    sprintForce: 4500,
    height: FIRST_PERSON_EYE_HEIGHT, // Eye height above the walkable surface
    capsuleRadius: 0.4,
    capsuleHalfHeight: 0.5,
  },
} as const;

// Collision groups using bit masks for efficient filtering
export const COLLISION_GROUPS = {
  NONE: 0x0000,
  STATIC: 0x0001, // Machines, obstacles (not walls)
  FORKLIFT: 0x0004, // Forklifts
  PLAYER: 0x0008, // First-person player
  BOUNDARY: 0x0020, // World boundary walls (no collision)
  ALL: 0xffff,
} as const;

// Collision filters: [membership, filter]
// membership = what group this body belongs to
// filter = what groups this body collides with
export const COLLISION_FILTERS = {
  // Static objects collide with autonomous vehicles and the inspection camera.
  static: {
    memberships: COLLISION_GROUPS.STATIC,
    filter: COLLISION_GROUPS.FORKLIFT | COLLISION_GROUPS.PLAYER,
  },

  // Forklifts collide with static and player only
  forklift: {
    memberships: COLLISION_GROUPS.FORKLIFT,
    filter: COLLISION_GROUPS.STATIC | COLLISION_GROUPS.PLAYER,
  },

  // The inspection camera collides with every physical scene body.
  player: {
    memberships: COLLISION_GROUPS.PLAYER,
    filter: COLLISION_GROUPS.STATIC | COLLISION_GROUPS.FORKLIFT,
  },

  // Boundary walls - no collision with anything (player can walk through)
  boundary: {
    memberships: COLLISION_GROUPS.BOUNDARY,
    filter: COLLISION_GROUPS.NONE,
  },
} as const;

// World boundary - circular at mountain base (mountains start at radius 260)
export const WORLD_RADIUS = SITE_LAYOUT.world.radius;

// Factory bounds for physics world (legacy - kept for debug visualization)
export const FACTORY_BOUNDS = {
  minX: SITE_LAYOUT.factory.bounds.minX,
  maxX: SITE_LAYOUT.factory.bounds.maxX,
  minZ: SITE_LAYOUT.factory.bounds.minZ,
  maxZ: SITE_LAYOUT.factory.bounds.maxZ,
  height: SITE_LAYOUT.factory.bounds.maxY,
} as const;

// Helper to create collision groups value for Rapier
// Returns a number encoding both membership and filter
export function createCollisionGroups(membership: number, filter: number): number {
  // Rapier expects: (membership << 16) | filter
  return (membership << 16) | filter;
}
