import { describe, expect, it } from 'vitest';
import {
  createAlignmentSample,
  nearRailwayStation,
  PLATFORM_EDGE_OFFSET,
  placeRailwayConsist,
  RAILWAY,
  RAILWAY_CONSIST,
  RAILWAY_FORMATION,
  RAILWAY_LENGTH,
  RAILWAY_LEVELS,
  RAILWAY_PORTALS,
  RAILWAY_STATION,
  RAILWAY_STATIONS_S,
  RAILWAY_TIMETABLE,
  RAILWAY_TRACK_X,
  RAILWAY_TRAIN_LENGTH,
  railwayStationBlocks,
  railwayStationObstacles,
  railwayStationWalkingHeight,
  sampleAlignment,
  sampleOffset,
  sampleRailwayTrain,
  straightS,
  trackOffset,
  type RailwayVehiclePose,
} from '../railwayLayout';
import {
  getDistanceToRiver,
  MILLOS_RIVER_CONFIG,
  MILLOS_TERRAIN_REGIONS,
  sampleTerrainGroundHeight,
  signedDistanceToShape,
} from '../../components/terrain/splatMapGenerator';
import { LANDSCAPE_HEDGES } from '../../components/exterior/LandscapeDressing';
import {
  FRONT_PARKLAND_BENCHES,
  FRONT_PARKLAND_TREES,
  MAIN_EXTERIOR_BENCHES,
  MAIN_EXTERIOR_TREES,
  PARKLAND_BENCHES,
  PARKLAND_TREES,
} from '../../components/exterior/ExteriorVegetation';
import { SITE_LAYOUT } from '../siteLayout';

const sample = createAlignmentSample();

describe('Riverside railway alignment', () => {
  it('is one continuous line with no kink at any join', () => {
    const boundaries = [
      RAILWAY_STATIONS_S.northPortal,
      RAILWAY_STATIONS_S.curveEnd,
      RAILWAY_STATIONS_S.straightStart,
      RAILWAY_STATIONS_S.southPortal,
    ];
    for (const s of boundaries) {
      const before = sampleAlignment(s - 1e-4, createAlignmentSample());
      const after = sampleAlignment(s + 1e-4, createAlignmentSample());
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1e-3);
      expect(before.dirX * after.dirX + before.dirZ * after.dirZ).toBeGreaterThan(1 - 1e-6);
    }
    let previous = sampleAlignment(0, createAlignmentSample());
    for (let s = 0.5; s <= RAILWAY_LENGTH; s += 0.5) {
      const next = sampleAlignment(s, createAlignmentSample());
      expect(Math.hypot(next.x - previous.x, next.z - previous.z)).toBeCloseTo(0.5, 3);
      previous = next;
    }
  });

  it('runs straight past the station, between two portals inside the walkable disc', () => {
    sampleAlignment(straightS(RAILWAY_STATION.centreZ), sample);
    expect(sample.x).toBeCloseTo(RAILWAY.stationX);
    expect(sample.z).toBeCloseTo(RAILWAY_STATION.centreZ);
    expect(sample.dirZ).toBeCloseTo(1);
    for (const portal of RAILWAY_PORTALS) {
      const [x, , z] = portal.position;
      expect(Math.hypot(x, z)).toBeCloseTo(RAILWAY.portalRadius);
      expect(Math.hypot(x, z)).toBeLessThan(SITE_LAYOUT.world.radius);
    }
  });

  it('points each portal straight down its own track', () => {
    const [north, south] = RAILWAY_PORTALS;
    // Local +Z faces the valley, so it is the reverse of the line heading into the bore.
    sampleAlignment(RAILWAY_STATIONS_S.northPortal, sample);
    expect(Math.sin(north.rotation)).toBeCloseTo(sample.dirX);
    expect(Math.cos(north.rotation)).toBeCloseTo(sample.dirZ);
    expect(sample.x).toBeCloseTo(north.position[0]);
    sampleAlignment(RAILWAY_STATIONS_S.southPortal, sample);
    expect(Math.sin(south.rotation)).toBeCloseTo(-sample.dirX);
    expect(Math.cos(south.rotation)).toBeCloseTo(-sample.dirZ);
    expect(sample.z).toBeCloseTo(south.position[2]);
  });

  it('lies on level ground at every terrain tier, outside the river canyon', () => {
    for (const segments of [64, 128, 256])
      for (let s = 0; s <= RAILWAY_LENGTH; s += 2)
        for (const offset of [-RAILWAY_FORMATION.toe, 0, RAILWAY_FORMATION.toe]) {
          sampleOffset(s, offset, sample);
          expect(
            Math.abs(sampleTerrainGroundHeight(sample.x, sample.z, segments)),
            `${segments} s=${s} offset=${offset}`
          ).toBeLessThan(0.02);
        }
    for (let s = 0; s <= RAILWAY_LENGTH; s += 1) {
      sampleAlignment(s, sample);
      expect(getDistanceToRiver(sample.x, sample.z, MILLOS_RIVER_CONFIG)).toBeGreaterThan(
        MILLOS_RIVER_CONFIG.width / 2 + MILLOS_RIVER_CONFIG.bankWidth + RAILWAY_FORMATION.toe + 10
      );
    }
  });

  it('keeps a terrain corridor over the whole formation, so no tree or scrub can stand on it', () => {
    const corridor = MILLOS_TERRAIN_REGIONS.filter(
      (region) =>
        region.shape.type === 'path' ||
        (region.shape.type === 'rect' && region.shape.x === RAILWAY.stationX)
    );
    expect(corridor).toHaveLength(2);
    for (let s = 0; s <= RAILWAY_LENGTH; s += 1)
      for (const offset of [-RAILWAY_FORMATION.toe, RAILWAY_FORMATION.toe]) {
        sampleOffset(s, offset, sample);
        expect(
          Math.min(
            ...corridor.map((region) => signedDistanceToShape(sample.x, sample.z, region.shape))
          ),
          `s=${s}`
        ).toBeLessThan(0);
      }
  });

  it('keeps every hand-placed tree and bench off the formation', () => {
    // These lists are authored, not region-filtered: two "trees by lake" once
    // stood on the tracks. A crown needs 3 m beyond the ballast toe.
    const placed = [
      ...MAIN_EXTERIOR_TREES,
      ...PARKLAND_TREES,
      ...FRONT_PARKLAND_TREES,
      ...MAIN_EXTERIOR_BENCHES,
      ...PARKLAND_BENCHES,
      ...FRONT_PARKLAND_BENCHES,
    ];
    for (const { position } of placed) {
      let nearest = Infinity;
      for (let s = 0; s <= RAILWAY_LENGTH; s += 1) {
        sampleAlignment(s, sample);
        nearest = Math.min(nearest, Math.hypot(sample.x - position[0], sample.z - position[2]));
      }
      expect(nearest, `${position}`).toBeGreaterThan(RAILWAY_FORMATION.toe + 3);
    }
  });

  it('keeps the lineside hedges off the cess', () => {
    for (const { start, end, width } of LANDSCAPE_HEDGES)
      for (let t = 0; t <= 1; t += 0.05) {
        const x = start[0] + (end[0] - start[0]) * t;
        const z = start[1] + (end[1] - start[1]) * t;
        let nearest = Infinity;
        for (let s = 0; s <= RAILWAY_LENGTH; s += 1) {
          sampleAlignment(s, sample);
          nearest = Math.min(nearest, Math.hypot(sample.x - x, sample.z - z));
        }
        expect(nearest - width / 2, `${start} ${end}`).toBeGreaterThan(RAILWAY_FORMATION.toe + 1);
      }
  });
});

describe('Riverside station', () => {
  it('stands its platform edges the UK stand-off from both tracks', () => {
    expect(RAILWAY_TRACK_X[1] - RAILWAY_STATION.platform1.maxX).toBeCloseTo(PLATFORM_EDGE_OFFSET);
    expect(RAILWAY_STATION.platform2.minX - RAILWAY_TRACK_X[2]).toBeCloseTo(PLATFORM_EDGE_OFFSET);
    expect(RAILWAY_LEVELS.platformTop - RAILWAY_LEVELS.railTop).toBeCloseTo(0.915);
    // Building, forecourt and platform 1 abut without overlapping.
    expect(RAILWAY_STATION.forecourt.maxX).toBe(RAILWAY_STATION.building.minX);
    expect(RAILWAY_STATION.building.maxX).toBeLessThan(RAILWAY_STATION.platform1.maxX);
  });

  it('clears a 2.7 m coach on either track through the Victorian arch', () => {
    // The portal passage: 8 m wide, springing at 2.5 m, a 4 m radius crown.
    // `clearance` is how far inside that outline a point must stand.
    const insideArch = (x: number, y: number, clearance = 0) =>
      Math.abs(x) < 4 - clearance && (y < 2.5 || Math.hypot(x, y - 2.5) < 4 - clearance);
    for (const track of [1, 2] as const) {
      const centre = trackOffset(track);
      for (const [half, height] of [
        [1.36, 3.46],
        [1.0, 3.75],
        [0, 3.83],
      ])
        for (const side of [-1, 1]) {
          const x = centre + side * half;
          const y = RAILWAY_LEVELS.railTop + height;
          // At least 0.4 m between every corner of the body and the masonry.
          expect(insideArch(x, y, 0.4), `track ${track} ${x} ${y}`).toBe(true);
        }
    }
  });

  it('makes the steps and ramps walkable and the building solid', () => {
    const { entranceSteps: e, entranceZ, platform1, rampLength, building } = RAILWAY_STATION;
    const foot = e.face - e.landing - (e.rises - 1) * e.going;
    let previous: number = RAILWAY_LEVELS.ground;
    for (let x = foot - 0.5; x <= e.face; x += 0.05) {
      const height = railwayStationWalkingHeight(x, entranceZ) ?? RAILWAY_LEVELS.ground;
      expect(height - previous).toBeLessThan(0.23);
      previous = height;
    }
    expect(previous).toBeCloseTo(RAILWAY_LEVELS.platformTop);
    previous = RAILWAY_LEVELS.ground;
    for (let z = platform1.minZ - rampLength - 0.5; z <= platform1.minZ + 1; z += 0.12) {
      const height = railwayStationWalkingHeight(150, z) ?? RAILWAY_LEVELS.ground;
      expect(Math.abs(height - previous)).toBeLessThan(0.23);
      previous = height;
    }
    expect(previous).toBeCloseTo(RAILWAY_LEVELS.platformTop);
    expect(
      railwayStationBlocks((building.minX + building.maxX) / 2, 50, RAILWAY_LEVELS.platformTop)
    ).toBe(true);
    expect(railwayStationBlocks(152, 50, RAILWAY_LEVELS.platformTop)).toBe(false);
    expect(nearRailwayStation(0, 0)).toBe(false);
    expect(railwayStationWalkingHeight(0, 0)).toBeNull();
    for (const box of railwayStationObstacles()) {
      expect(
        [box.minX, box.maxX, box.minZ, box.maxZ, box.minY, box.maxY].every(Number.isFinite)
      ).toBe(true);
      expect(box.maxX).toBeGreaterThan(box.minX);
      expect(box.maxY).toBeGreaterThan(box.minY);
    }
  });
});

describe('Riverside train', () => {
  const poses: RailwayVehiclePose[] = RAILWAY_CONSIST.map(() => ({ s: 0, x: 0, z: 0, yaw: 0 }));

  it('stands at the platform on every even hour, alternating direction and track', () => {
    for (const hour of [0, 2, 12, 22, 24 * 7 + 6]) {
      const pose = sampleRailwayTrain(hour);
      expect(pose.phase).toBe('standing');
      const visit = Math.round(hour / RAILWAY_TIMETABLE.periodHours);
      expect(pose.track).toBe(visit % 2 === 0 ? 1 : 2);
      expect(pose.direction).toBe(pose.track === 1 ? -1 : 1);
      const centre = pose.headS - (pose.direction * RAILWAY_TRAIN_LENGTH) / 2;
      expect(centre).toBeCloseTo(straightS(RAILWAY_STATION.centreZ));
    }
    expect(sampleRailwayTrain(1).visible).toBe(false);
    expect(sampleRailwayTrain(1).phase).toBe('hidden');
  });

  it('never jumps while it can be seen', () => {
    const step = 1 / 3600;
    // The fastest it moves: 2d/t at the start of an even braking from the cap.
    const fastest =
      (2 * (RAILWAY_LENGTH + RAILWAY_TRAIN_LENGTH)) / (RAILWAY_TIMETABLE.approachHours * 3600);
    for (const start of [11, 13]) {
      let previous = sampleRailwayTrain(start);
      for (let hour = start + step; hour < start + 2; hour += step) {
        const next = sampleRailwayTrain(hour);
        if (previous.visible || next.visible) {
          expect(next.track).toBe(previous.track);
          expect(Math.abs(next.headS - previous.headS), `${hour}`).toBeLessThanOrEqual(
            fastest + 1e-6
          );
        }
        previous = next;
      }
    }
  });

  it('is wholly behind a void cap whenever it is hidden', () => {
    for (let hour = 10; hour < 14; hour += 0.01) {
      const pose = sampleRailwayTrain(hour);
      if (pose.visible) continue;
      const tail = pose.headS - pose.direction * RAILWAY_TRAIN_LENGTH;
      const inside = Math.max(pose.headS, tail) > 0 && Math.min(pose.headS, tail) < RAILWAY_LENGTH;
      expect(inside).toBe(false);
    }
  });

  it('keeps every vehicle on its rails round the curve', () => {
    for (let hour = 11.5; hour < 12.5; hour += 0.01) {
      const pose = sampleRailwayTrain(hour);
      if (!pose.visible) continue;
      placeRailwayConsist(pose, poses);
      poses.forEach((vehicle) => {
        sampleOffset(vehicle.s, trackOffset(pose.track), sample);
        // Chord midpoint of a 9.8 m bogie base on a 148 m curve: 8 cm sagitta.
        expect(Math.hypot(vehicle.x - sample.x, vehicle.z - sample.z)).toBeLessThan(0.12);
      });
      // Vehicles keep their order and spacing along the track.
      for (let i = 1; i < poses.length; i++)
        expect(pose.direction * (poses[i - 1].s - poses[i].s)).toBeGreaterThan(0);
    }
  });
});
