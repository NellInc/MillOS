// TODO: Consider spatial partitioning (grid/quadtree) for better scaling.
// Current implementation uses O(n*m) linear scans in getEntitiesNearby/isPathClear,
// which may become a bottleneck with many entities. A spatial hash grid would
// reduce this to O(1) average case for radius queries.

// Shared position registry for collision avoidance
// Workers and forklifts register their positions for mutual awareness

export interface EntityPosition {
  id: string;
  x: number;
  y?: number; // Y position (height)
  z: number;
  type: 'worker' | 'forklift';
  dirX?: number; // Direction vector for forklifts
  dirZ?: number;
  isStopped?: boolean; // Whether forklift is currently stopped
}

// Static obstacle definition (axis-aligned bounding box)
export interface Obstacle {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  // Optional: height for future 3D collision (workers can walk under elevated equipment)
  minY?: number;
  maxY?: number;
  // If true, only forklifts are blocked (workers can pass under/around)
  forkliftOnly?: boolean;
}

class PositionRegistry {
  private positions: Map<string, EntityPosition> = new Map();
  private obstacles: Obstacle[] = [];

  register(
    id: string,
    x: number,
    z: number,
    type: 'worker' | 'forklift',
    dirX?: number,
    dirZ?: number,
    isStopped?: boolean,
    y: number = 0
  ) {
    this.positions.set(id, { id, x, y, z, type, dirX, dirZ, isStopped });
  }

  // Register static obstacles (called once during scene setup)
  registerObstacles(obstacles: Obstacle[]) {
    this.obstacles = obstacles;
  }

  // Check if a point is inside any obstacle (with padding for entity radius)
  // Set isForklift=true to include forkliftOnly obstacles
  isInsideObstacle(
    x: number,
    z: number,
    padding: number = 0.5,
    isForklift: boolean = false
  ): boolean {
    for (const obs of this.obstacles) {
      // Skip forklift-only obstacles when checking for workers
      if (obs.forkliftOnly && !isForklift) continue;

      if (
        x >= obs.minX - padding &&
        x <= obs.maxX + padding &&
        z >= obs.minZ - padding &&
        z <= obs.maxZ + padding
      ) {
        return true;
      }
    }
    return false;
  }

  // Get the nearest obstacle in the direction of movement
  // Set isForklift=true to include forkliftOnly obstacles
  getObstacleAhead(
    x: number,
    _z: number,
    dirZ: number,
    checkDistance: number,
    padding: number = 0.5,
    isForklift: boolean = false
  ): Obstacle | null {
    const z = _z;
    for (const obs of this.obstacles) {
      // Skip forklift-only obstacles when checking for workers
      if (obs.forkliftOnly && !isForklift) continue;

      // Check if obstacle is in front of us (considering direction)
      const obstacleInPath =
        dirZ > 0
          ? z < obs.maxZ + padding && z + checkDistance > obs.minZ - padding
          : z > obs.minZ - padding && z - checkDistance < obs.maxZ + padding;

      if (obstacleInPath && x >= obs.minX - padding && x <= obs.maxX + padding) {
        return obs;
      }
    }
    return null;
  }

  // Find a clear path around an obstacle (returns x offset to avoid it)
  findClearPath(x: number, _z: number, obstacleId: string, padding: number = 1.0): number {
    const obstacle = this.obstacles.find((o) => o.id === obstacleId);
    if (!obstacle) return 0;

    // Calculate distances to go around left vs right
    const distToLeft = x - (obstacle.minX - padding);
    const distToRight = obstacle.maxX + padding - x;

    // Choose the shorter path, but prefer staying closer to original position
    if (Math.abs(distToLeft) < Math.abs(distToRight)) {
      return obstacle.minX - padding - 0.5; // Go left
    } else {
      return obstacle.maxX + padding + 0.5; // Go right
    }
  }

  // Get all obstacles (for debugging/visualization)
  getAllObstacles(): Obstacle[] {
    return [...this.obstacles];
  }

  unregister(id: string) {
    this.positions.delete(id);
  }

  // Get all entities of a specific type within a radius
  // Get all entities of a specific type within a radius
  // If y is provided, ignore entities that are too far vertically (> 3 units)
  getEntitiesNearby(
    x: number,
    z: number,
    radius: number,
    type: 'worker' | 'forklift',
    excludeId?: string,
    y?: number
  ): EntityPosition[] {
    const nearby: EntityPosition[] = [];
    this.positions.forEach((pos) => {
      if (pos.type === type && pos.id !== excludeId) {
        // Check vertical distance if provided
        if (y !== undefined && pos.y !== undefined) {
          if (Math.abs(pos.y - y) > 3.0) return;
        }

        const dx = pos.x - x;
        const dz = pos.z - z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < radius) {
          nearby.push(pos);
        }
      }
    });
    return nearby;
  }

  // Get all workers within a certain radius of a point
  getWorkersNearby(x: number, z: number, radius: number, y?: number): EntityPosition[] {
    return this.getEntitiesNearby(x, z, radius, 'worker', undefined, y);
  }

  // Get all forklifts within a certain radius (excluding self)
  getForkliftsNearby(
    x: number,
    z: number,
    radius: number,
    excludeId: string,
    y?: number
  ): EntityPosition[] {
    return this.getEntitiesNearby(x, z, radius, 'forklift', excludeId, y);
  }

  // Check if there's any worker, forklift, or obstacle in the path ahead
  isPathClear(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    checkDistance: number,
    safetyRadius: number,
    forkliftId?: string,
    checkObstacles: boolean = false,
    y: number = 0
  ): boolean {
    // Check points along the path ahead
    for (let d = 1; d <= checkDistance; d += 0.5) {
      const checkX = x + dirX * d;
      const checkZ = z + dirZ * d;
      const workersNearby = this.getWorkersNearby(checkX, checkZ, safetyRadius, y);
      if (workersNearby.length > 0) {
        return false;
      }
      // Also check for other forklifts if forkliftId is provided
      if (forkliftId) {
        const forkliftsNearby = this.getForkliftsNearby(
          checkX,
          checkZ,
          safetyRadius,
          forkliftId,
          y
        );
        if (forkliftsNearby.length > 0) {
          return false;
        }
      }
      // Check for static obstacles if enabled (forkliftId presence indicates forklift)
      if (
        checkObstacles &&
        this.isInsideObstacle(checkX, checkZ, safetyRadius * 0.5, !!forkliftId)
      ) {
        return false;
      }
    }
    return true;
  }

  // Get the nearest forklift to a position (for workers to detect approaching forklifts)
  getNearestForklift(x: number, z: number, maxDistance: number, y?: number): EntityPosition | null {
    let nearest: EntityPosition | null = null;
    let nearestDist = maxDistance;

    this.positions.forEach((pos) => {
      if (pos.type === 'forklift') {
        // Check vertical distance
        if (y !== undefined && pos.y !== undefined) {
          if (Math.abs(pos.y - y) > 3.0) return;
        }

        const dx = pos.x - x;
        const dz = pos.z - z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < nearestDist) {
          nearestDist = distance;
          nearest = pos;
        }
      }
    });
    return nearest;
  }

  // Get the nearest worker to a position (for worker conversations)
  getNearestWorker(
    x: number,
    z: number,
    maxDistance: number,
    excludeId: string,
    y?: number
  ): EntityPosition | null {
    let nearest: EntityPosition | null = null;
    let nearestDist = maxDistance;

    this.positions.forEach((pos) => {
      if (pos.type === 'worker' && pos.id !== excludeId) {
        // Check vertical distance
        if (y !== undefined && pos.y !== undefined) {
          if (Math.abs(pos.y - y) > 3.0) return;
        }

        const dx = pos.x - x;
        const dz = pos.z - z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance < nearestDist) {
          nearestDist = distance;
          nearest = { ...pos, distance } as EntityPosition & { distance: number };
        }
      }
    });
    return nearest;
  }

  // Get worker position by ID
  getWorkerPosition(id: string): EntityPosition | null {
    const pos = this.positions.get(id);
    return pos?.type === 'worker' ? pos : null;
  }

  // Check if a forklift is approaching a position (heading towards it)
  isForkliftApproaching(workerX: number, workerZ: number, forklift: EntityPosition): boolean {
    // If forklift is stopped, it's not approaching
    if (forklift.isStopped) return false;
    if (forklift.dirX === undefined || forklift.dirZ === undefined) return false;

    // Vector from forklift to worker
    const toWorkerX = workerX - forklift.x;
    const toWorkerZ = workerZ - forklift.z;

    // Dot product to check if forklift is heading towards worker
    const dot = toWorkerX * forklift.dirX + toWorkerZ * forklift.dirZ;
    // Require stronger alignment (dot > 0.3) to prevent edge-case oscillation
    return dot > 0.3;
  }

  // Get all workers for mini-map display
  getAllWorkers(): EntityPosition[] {
    const workers: EntityPosition[] = [];
    this.positions.forEach((pos) => {
      if (pos.type === 'worker') {
        workers.push(pos);
      }
    });
    return workers;
  }

  // Get all forklifts for mini-map display
  getAllForklifts(): EntityPosition[] {
    const forklifts: EntityPosition[] = [];
    this.positions.forEach((pos) => {
      if (pos.type === 'forklift') {
        forklifts.push(pos);
      }
    });
    return forklifts;
  }
}

export const positionRegistry = new PositionRegistry();
