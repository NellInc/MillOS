/** Shared autonomous-vehicle registry for route conflict and obstacle checks. */

export interface EntityPosition {
  id: string;
  x: number;
  y?: number;
  z: number;
  dirX?: number;
  dirZ?: number;
  isStopped?: boolean;
  kind?: 'forklift' | 'truck';
}

export interface Obstacle {
  id: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  minY?: number;
  maxY?: number;
  forkliftOnly?: boolean;
}

class PositionRegistry {
  private positions = new Map<string, EntityPosition>();
  private obstacles: Obstacle[] = [];

  register(
    id: string,
    x: number,
    z: number,
    dirX?: number,
    dirZ?: number,
    isStopped?: boolean,
    y = 0,
    kind: EntityPosition['kind'] = 'forklift'
  ): void {
    const existing = this.positions.get(id);
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.z = z;
      existing.dirX = dirX;
      existing.dirZ = dirZ;
      existing.isStopped = isStopped;
      existing.kind = kind;
      return;
    }
    this.positions.set(id, { id, x, y, z, dirX, dirZ, isStopped, kind });
  }

  /** Read the live position without allocating a registry snapshot. */
  get(id: string): EntityPosition | undefined {
    return this.positions.get(id);
  }

  unregister(id: string): void {
    this.positions.delete(id);
  }

  registerObstacles(obstacles: Obstacle[]): void {
    this.obstacles = obstacles;
  }

  getAllObstacles(): Obstacle[] {
    return [...this.obstacles];
  }

  isInsideObstacle(x: number, z: number, padding = 0.5): boolean {
    return this.obstacles.some(
      (obstacle) =>
        x >= obstacle.minX - padding &&
        x <= obstacle.maxX + padding &&
        z >= obstacle.minZ - padding &&
        z <= obstacle.maxZ + padding
    );
  }

  getForkliftsNearby(
    x: number,
    z: number,
    radius: number,
    excludeId: string,
    y?: number
  ): EntityPosition[] {
    const nearby: EntityPosition[] = [];
    const radiusSquared = radius * radius;
    this.positions.forEach((position) => {
      if (position.id === excludeId) return;
      if (y !== undefined && position.y !== undefined && Math.abs(position.y - y) > 3) return;
      const dx = position.x - x;
      const dz = position.z - z;
      if (dx * dx + dz * dz < radiusSquared) nearby.push(position);
    });
    return nearby;
  }

  private anyForkliftWithin(
    x: number,
    z: number,
    radius: number,
    excludeId: string,
    y: number
  ): boolean {
    const radiusSquared = radius * radius;
    for (const position of this.positions.values()) {
      if (position.id === excludeId) continue;
      if (position.y !== undefined && Math.abs(position.y - y) > 3) continue;
      const dx = position.x - x;
      const dz = position.z - z;
      if (dx * dx + dz * dz < radiusSquared) return true;
    }
    return false;
  }

  isPathClear(
    x: number,
    z: number,
    dirX: number,
    dirZ: number,
    checkDistance: number,
    safetyRadius: number,
    forkliftId = '',
    checkObstacles = false,
    y = 0,
    samplePath?: (distanceAhead: number) => { x: number; z: number }
  ): boolean {
    for (let distance = 1; distance <= checkDistance; distance += 0.5) {
      // A turning vehicle follows its route, while callers without a route
      // keep the straight-line check. Working if a clear turn stays open and
      // a barrier or peer on that same turn still stops the vehicle.
      const point = samplePath?.(distance);
      const checkX = point?.x ?? x + dirX * distance;
      const checkZ = point?.z ?? z + dirZ * distance;
      if (this.anyForkliftWithin(checkX, checkZ, safetyRadius, forkliftId, y)) return false;
      if (checkObstacles && this.isInsideObstacle(checkX, checkZ, safetyRadius * 0.5)) return false;
    }
    return true;
  }

  getAllForklifts(): EntityPosition[] {
    return [...this.positions.values()].filter((position) => position.kind !== 'truck');
  }
}

export const positionRegistry = new PositionRegistry();
