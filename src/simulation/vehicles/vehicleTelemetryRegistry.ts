export type VehicleTelemetryType = 'forklift' | 'truck';

export interface VehicleTelemetrySnapshot {
  id: string;
  type: VehicleTelemetryType;
  speedMps: number;
  steeringRadians: number;
  phase: string;
  stopReason: string;
  articulationRadians: number;
  transferReady: boolean;
  /** A forklift's load, for the inspector that stays open while it works. */
  cargo?: 'pallet' | 'empty';
}

class VehicleTelemetryRegistry {
  private readonly vehicles = new Map<string, VehicleTelemetrySnapshot>();

  publish(snapshot: VehicleTelemetrySnapshot): void {
    if (
      !snapshot.id ||
      !Number.isFinite(snapshot.speedMps) ||
      !Number.isFinite(snapshot.steeringRadians) ||
      !Number.isFinite(snapshot.articulationRadians)
    ) {
      return;
    }
    const existing = this.vehicles.get(snapshot.id);
    if (existing) {
      existing.type = snapshot.type;
      existing.speedMps = snapshot.speedMps;
      existing.steeringRadians = snapshot.steeringRadians;
      existing.phase = snapshot.phase;
      existing.stopReason = snapshot.stopReason;
      existing.articulationRadians = snapshot.articulationRadians;
      existing.transferReady = snapshot.transferReady;
      existing.cargo = snapshot.cargo;
      return;
    }
    this.vehicles.set(snapshot.id, { ...snapshot });
  }

  unregister(id: string): void {
    this.vehicles.delete(id);
  }

  get(id: string): VehicleTelemetrySnapshot | undefined {
    return this.vehicles.get(id);
  }

  getAll(): VehicleTelemetrySnapshot[] {
    return Array.from(this.vehicles.values());
  }

  clear(): void {
    this.vehicles.clear();
  }
}

export const vehicleTelemetryRegistry = new VehicleTelemetryRegistry();
