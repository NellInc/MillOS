/**
 * A* Pathfinding System
 *
 * Provides grid-based A* pathfinding for worker navigation in the factory.
 * Supports 8-directional movement with octile distance heuristic.
 *
 * TODO: DEAD CODE - This file has no imports anywhere in the codebase.
 * The worker navigation system uses simpler direct movement instead.
 * Consider deleting this file if the A* pathfinding feature is not planned.
 * Verified 2025-12-30 via: grep -r "pathfinding" src/ (no imports found)
 */

import * as THREE from 'three';

// ============================================================================
// TYPES
// ============================================================================

export interface GridCell {
  x: number;
  z: number;
  walkable: boolean;
}

export interface PathNode {
  x: number;
  z: number;
  g: number; // Cost from start
  h: number; // Heuristic cost to goal
  f: number; // Total cost (g + h)
  parent: PathNode | null;
}

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ObstacleRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// ============================================================================
// NAVIGATION GRID
// ============================================================================

/**
 * NavigationGrid converts world coordinates to grid cells and manages obstacles.
 * The grid uses a cell-based representation where each cell can be walkable or blocked.
 */
export class NavigationGrid {
  private cellSize: number;
  private bounds: WorldBounds;
  private gridWidth: number;
  private gridHeight: number;
  private grid: boolean[][]; // true = walkable, false = blocked

  constructor(bounds: WorldBounds, cellSize: number = 1.0) {
    this.bounds = bounds;
    this.cellSize = cellSize;

    // Calculate grid dimensions
    this.gridWidth = Math.ceil((bounds.maxX - bounds.minX) / cellSize);
    this.gridHeight = Math.ceil((bounds.maxZ - bounds.minZ) / cellSize);

    // Initialize grid (all walkable by default)
    this.grid = [];
    for (let x = 0; x < this.gridWidth; x++) {
      this.grid[x] = [];
      for (let z = 0; z < this.gridHeight; z++) {
        this.grid[x][z] = true;
      }
    }
  }

  /**
   * Convert world coordinates to grid cell
   */
  worldToGrid(worldX: number, worldZ: number): { x: number; z: number } {
    const x = Math.floor((worldX - this.bounds.minX) / this.cellSize);
    const z = Math.floor((worldZ - this.bounds.minZ) / this.cellSize);
    return {
      x: Math.max(0, Math.min(this.gridWidth - 1, x)),
      z: Math.max(0, Math.min(this.gridHeight - 1, z)),
    };
  }

  /**
   * Convert grid cell to world coordinates (center of cell)
   */
  gridToWorld(gridX: number, gridZ: number): { x: number; z: number } {
    return {
      x: this.bounds.minX + (gridX + 0.5) * this.cellSize,
      z: this.bounds.minZ + (gridZ + 0.5) * this.cellSize,
    };
  }

  /**
   * Check if a grid cell is walkable
   */
  isWalkable(gridX: number, gridZ: number): boolean {
    if (gridX < 0 || gridX >= this.gridWidth || gridZ < 0 || gridZ >= this.gridHeight) {
      return false;
    }
    return this.grid[gridX][gridZ];
  }

  /**
   * Set a grid cell's walkability
   */
  setWalkable(gridX: number, gridZ: number, walkable: boolean): void {
    if (gridX >= 0 && gridX < this.gridWidth && gridZ >= 0 && gridZ < this.gridHeight) {
      this.grid[gridX][gridZ] = walkable;
    }
  }

  /**
   * Add a rectangular obstacle (marks cells as non-walkable)
   */
  addObstacle(obstacle: ObstacleRect, padding: number = 0.5): void {
    // Convert obstacle bounds to grid cells with padding
    const minCell = this.worldToGrid(obstacle.minX - padding, obstacle.minZ - padding);
    const maxCell = this.worldToGrid(obstacle.maxX + padding, obstacle.maxZ + padding);

    // Mark all cells within the obstacle as non-walkable
    for (let x = minCell.x; x <= maxCell.x; x++) {
      for (let z = minCell.z; z <= maxCell.z; z++) {
        this.setWalkable(x, z, false);
      }
    }
  }

  /**
   * Add multiple obstacles
   */
  addObstacles(obstacles: ObstacleRect[], padding: number = 0.5): void {
    for (const obstacle of obstacles) {
      this.addObstacle(obstacle, padding);
    }
  }

  /**
   * Clear all obstacles (reset to all walkable)
   */
  clearObstacles(): void {
    for (let x = 0; x < this.gridWidth; x++) {
      for (let z = 0; z < this.gridHeight; z++) {
        this.grid[x][z] = true;
      }
    }
  }

  /**
   * Get neighbors for a cell (8-directional movement)
   */
  getNeighbors(gridX: number, gridZ: number): Array<{ x: number; z: number; cost: number }> {
    const neighbors: Array<{ x: number; z: number; cost: number }> = [];

    // 8 directions: N, NE, E, SE, S, SW, W, NW
    const directions = [
      { dx: 0, dz: -1, cost: 1.0 }, // N
      { dx: 1, dz: -1, cost: Math.SQRT2 }, // NE
      { dx: 1, dz: 0, cost: 1.0 }, // E
      { dx: 1, dz: 1, cost: Math.SQRT2 }, // SE
      { dx: 0, dz: 1, cost: 1.0 }, // S
      { dx: -1, dz: 1, cost: Math.SQRT2 }, // SW
      { dx: -1, dz: 0, cost: 1.0 }, // W
      { dx: -1, dz: -1, cost: Math.SQRT2 }, // NW
    ];

    for (const dir of directions) {
      const nx = gridX + dir.dx;
      const nz = gridZ + dir.dz;

      if (this.isWalkable(nx, nz)) {
        // For diagonal movement, check that both adjacent cardinal cells are walkable
        // This prevents cutting corners around obstacles
        if (dir.dx !== 0 && dir.dz !== 0) {
          if (!this.isWalkable(gridX + dir.dx, gridZ) || !this.isWalkable(gridX, gridZ + dir.dz)) {
            continue; // Can't cut this corner
          }
        }
        neighbors.push({ x: nx, z: nz, cost: dir.cost });
      }
    }

    return neighbors;
  }

  /**
   * Get grid dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.gridWidth, height: this.gridHeight };
  }

  /**
   * Get bounds
   */
  getBounds(): WorldBounds {
    return { ...this.bounds };
  }

  /**
   * Get cell size
   */
  getCellSize(): number {
    return this.cellSize;
  }
}

// ============================================================================
// A* PATHFINDER
// ============================================================================

/**
 * AStarPathfinder implements the A* algorithm with octile distance heuristic.
 * Supports path smoothing for more natural movement.
 */
export class AStarPathfinder {
  private grid: NavigationGrid;

  constructor(grid: NavigationGrid) {
    this.grid = grid;
  }

  /**
   * Octile distance heuristic (accounts for diagonal movement)
   */
  private heuristic(x1: number, z1: number, x2: number, z2: number): number {
    const dx = Math.abs(x2 - x1);
    const dz = Math.abs(z2 - z1);
    // Octile distance: diagonal movement costs sqrt(2)
    return Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz);
  }

  /**
   * Find a path from start to goal using A*
   * Returns array of world coordinates, or null if no path found
   */
  findPath(
    startX: number,
    startZ: number,
    goalX: number,
    goalZ: number,
    smooth: boolean = true
  ): Array<{ x: number; z: number }> | null {
    // Convert world coordinates to grid
    const start = this.grid.worldToGrid(startX, startZ);
    const goal = this.grid.worldToGrid(goalX, goalZ);

    // If goal is not walkable, find nearest walkable cell
    if (!this.grid.isWalkable(goal.x, goal.z)) {
      const nearestWalkable = this.findNearestWalkable(goal.x, goal.z);
      if (!nearestWalkable) return null;
      goal.x = nearestWalkable.x;
      goal.z = nearestWalkable.z;
    }

    // If start is not walkable, find nearest walkable cell
    if (!this.grid.isWalkable(start.x, start.z)) {
      const nearestWalkable = this.findNearestWalkable(start.x, start.z);
      if (!nearestWalkable) return null;
      start.x = nearestWalkable.x;
      start.z = nearestWalkable.z;
    }

    // A* algorithm
    const openSet: PathNode[] = [];
    const closedSet = new Set<string>();

    const startNode: PathNode = {
      x: start.x,
      z: start.z,
      g: 0,
      h: this.heuristic(start.x, start.z, goal.x, goal.z),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    openSet.push(startNode);

    const maxIterations = 10000; // Prevent infinite loops
    let iterations = 0;

    while (openSet.length > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest f score
      let lowestIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIndex].f) {
          lowestIndex = i;
        }
      }

      const current = openSet[lowestIndex];

      // Check if we reached the goal
      if (current.x === goal.x && current.z === goal.z) {
        // Reconstruct path
        const gridPath = this.reconstructPath(current);

        // Convert grid path to world coordinates
        let worldPath = gridPath.map((cell) => this.grid.gridToWorld(cell.x, cell.z));

        // Smooth the path if requested
        if (smooth && worldPath.length > 2) {
          worldPath = this.smoothPath(worldPath);
        }

        return worldPath;
      }

      // Move current from open to closed
      openSet.splice(lowestIndex, 1);
      closedSet.add(`${current.x},${current.z}`);

      // Check all neighbors
      const neighbors = this.grid.getNeighbors(current.x, current.z);
      for (const neighbor of neighbors) {
        const neighborKey = `${neighbor.x},${neighbor.z}`;
        if (closedSet.has(neighborKey)) continue;

        const tentativeG = current.g + neighbor.cost;

        // Check if neighbor is already in open set
        const existingNode = openSet.find((n) => n.x === neighbor.x && n.z === neighbor.z);

        if (!existingNode) {
          // Add new node
          const newNode: PathNode = {
            x: neighbor.x,
            z: neighbor.z,
            g: tentativeG,
            h: this.heuristic(neighbor.x, neighbor.z, goal.x, goal.z),
            f: 0,
            parent: current,
          };
          newNode.f = newNode.g + newNode.h;
          openSet.push(newNode);
        } else if (tentativeG < existingNode.g) {
          // Found a better path to this node
          existingNode.g = tentativeG;
          existingNode.f = existingNode.g + existingNode.h;
          existingNode.parent = current;
        }
      }
    }

    // No path found
    return null;
  }

  /**
   * Reconstruct path from goal to start
   */
  private reconstructPath(goalNode: PathNode): Array<{ x: number; z: number }> {
    const path: Array<{ x: number; z: number }> = [];
    let current: PathNode | null = goalNode;

    while (current !== null) {
      path.unshift({ x: current.x, z: current.z });
      current = current.parent;
    }

    return path;
  }

  /**
   * Find nearest walkable cell to a given cell
   */
  private findNearestWalkable(gridX: number, gridZ: number): { x: number; z: number } | null {
    const maxRadius = 20;

    for (let radius = 1; radius <= maxRadius; radius++) {
      // Check all cells at this radius (perimeter of square)
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          // Only check perimeter cells
          if (Math.abs(dx) !== radius && Math.abs(dz) !== radius) continue;

          const nx = gridX + dx;
          const nz = gridZ + dz;

          if (this.grid.isWalkable(nx, nz)) {
            return { x: nx, z: nz };
          }
        }
      }
    }

    return null;
  }

  /**
   * Smooth path using line-of-sight checks
   * Removes unnecessary waypoints while ensuring path stays clear
   */
  private smoothPath(path: Array<{ x: number; z: number }>): Array<{ x: number; z: number }> {
    if (path.length <= 2) return path;

    const smoothed: Array<{ x: number; z: number }> = [path[0]];
    let currentIndex = 0;

    while (currentIndex < path.length - 1) {
      // Try to skip as many waypoints as possible
      let farthestVisible = currentIndex + 1;

      for (let i = path.length - 1; i > currentIndex + 1; i--) {
        if (this.hasLineOfSight(path[currentIndex], path[i])) {
          farthestVisible = i;
          break;
        }
      }

      smoothed.push(path[farthestVisible]);
      currentIndex = farthestVisible;
    }

    return smoothed;
  }

  /**
   * Check if there's a clear line of sight between two points
   * Uses Bresenham's line algorithm on the grid
   */
  private hasLineOfSight(from: { x: number; z: number }, to: { x: number; z: number }): boolean {
    const fromGrid = this.grid.worldToGrid(from.x, from.z);
    const toGrid = this.grid.worldToGrid(to.x, to.z);

    let x0 = fromGrid.x;
    let z0 = fromGrid.z;
    const x1 = toGrid.x;
    const z1 = toGrid.z;

    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    while (true) {
      if (!this.grid.isWalkable(x0, z0)) {
        return false;
      }

      if (x0 === x1 && z0 === z1) {
        return true;
      }

      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        z0 += sz;
      }
    }
  }
}

// ============================================================================
// PATH FOLLOWER
// ============================================================================

export type PathFollowerState = 'idle' | 'moving' | 'arrived' | 'stuck';

/**
 * PathFollower handles smooth movement along a calculated path.
 * Provides interpolation between waypoints and arrival detection.
 */
export class PathFollower {
  private path: Array<{ x: number; z: number }> = [];
  private currentWaypointIndex: number = 0;
  private position: THREE.Vector3 = new THREE.Vector3();
  private targetRotation: number = 0;
  private state: PathFollowerState = 'idle';
  private arrivalThreshold: number;
  private stuckTimer: number = 0;
  private lastPosition: THREE.Vector3 = new THREE.Vector3();

  constructor(arrivalThreshold: number = 0.5) {
    this.arrivalThreshold = arrivalThreshold;
  }

  /**
   * Set a new path to follow
   */
  setPath(path: Array<{ x: number; z: number }>, currentPosition: THREE.Vector3): void {
    this.path = path;
    this.currentWaypointIndex = 0;
    this.position.copy(currentPosition);
    this.lastPosition.copy(currentPosition);
    this.state = path.length > 0 ? 'moving' : 'idle';
    this.stuckTimer = 0;

    // Calculate initial rotation towards first waypoint
    if (path.length > 0) {
      this.updateTargetRotation();
    }
  }

  /**
   * Clear the current path
   */
  clearPath(): void {
    this.path = [];
    this.currentWaypointIndex = 0;
    this.state = 'idle';
    this.stuckTimer = 0;
  }

  /**
   * Get current state
   */
  getState(): PathFollowerState {
    return this.state;
  }

  /**
   * Get current waypoint (null if no path)
   */
  getCurrentWaypoint(): { x: number; z: number } | null {
    if (this.currentWaypointIndex >= this.path.length) return null;
    return this.path[this.currentWaypointIndex];
  }

  /**
   * Get final destination (null if no path)
   */
  getDestination(): { x: number; z: number } | null {
    if (this.path.length === 0) return null;
    return this.path[this.path.length - 1];
  }

  /**
   * Get target rotation (radians)
   */
  getTargetRotation(): number {
    return this.targetRotation;
  }

  /**
   * Get the full path
   */
  getPath(): Array<{ x: number; z: number }> {
    return [...this.path];
  }

  /**
   * Get remaining path (from current waypoint)
   */
  getRemainingPath(): Array<{ x: number; z: number }> {
    return this.path.slice(this.currentWaypointIndex);
  }

  /**
   * Check if path is complete
   */
  isComplete(): boolean {
    return this.state === 'arrived' || this.state === 'idle';
  }

  /**
   * Check if stuck (no progress for too long)
   */
  isStuck(): boolean {
    return this.state === 'stuck';
  }

  /**
   * Update the path follower
   * @param currentPosition Current world position
   * @param delta Time delta in seconds
   * @param speed Movement speed
   * @returns Direction vector to move (normalized), or null if arrived/stuck
   */
  update(
    currentPosition: THREE.Vector3,
    delta: number,
    speed: number
  ): { dx: number; dz: number } | null {
    if (this.state !== 'moving' || this.path.length === 0) {
      return null;
    }

    this.position.copy(currentPosition);

    // Check for stuck condition
    const distMoved = this.position.distanceTo(this.lastPosition);
    if (distMoved < 0.01 * delta * speed) {
      this.stuckTimer += delta;
      if (this.stuckTimer > 2.0) {
        this.state = 'stuck';
        return null;
      }
    } else {
      this.stuckTimer = 0;
    }
    this.lastPosition.copy(currentPosition);

    // Get current waypoint
    const waypoint = this.path[this.currentWaypointIndex];
    if (!waypoint) {
      this.state = 'arrived';
      return null;
    }

    // Calculate distance to waypoint
    const dx = waypoint.x - currentPosition.x;
    const dz = waypoint.z - currentPosition.z;
    const distance = Math.sqrt(dx * dx + dz * dz);

    // Check if we've reached the waypoint
    if (distance < this.arrivalThreshold) {
      this.currentWaypointIndex++;

      // Check if we've completed the path
      if (this.currentWaypointIndex >= this.path.length) {
        this.state = 'arrived';
        return null;
      }

      // Update rotation for next waypoint
      this.updateTargetRotation();

      // Recursively update to move towards next waypoint
      return this.update(currentPosition, delta, speed);
    }

    // Calculate normalized direction
    const invDist = 1 / distance;
    return {
      dx: dx * invDist,
      dz: dz * invDist,
    };
  }

  /**
   * Update target rotation to face current waypoint
   */
  private updateTargetRotation(): void {
    const waypoint = this.path[this.currentWaypointIndex];
    if (!waypoint) return;

    const dx = waypoint.x - this.position.x;
    const dz = waypoint.z - this.position.z;
    this.targetRotation = Math.atan2(dx, dz);
  }
}
