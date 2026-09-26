import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  EXTENT_QUANTUM,
  EXTERIOR_SHADOW_VOLUME,
  FACTORY_SHADOW_VOLUME,
  LEAD_MAX_FRACTION,
  LEAD_MIN_FRACTION,
  NORMAL_BIAS_RANGE,
  NORMAL_BIAS_TEXELS,
  VERTICAL_SUN_THRESHOLD,
  exteriorHalfExtent,
  factoryOccluderDepth,
  exteriorLeadDistance,
  isInsideFactoryFootprint,
  normalBiasForTexel,
  projectedHalfExtent,
  quantiseExtent,
  snapToTexel,
} from './SunShadowRig';
import { SITE_LAYOUT } from '../../constants/siteLayout';

/**
 * Fit the factory volume the way the rig does, so the assertions below measure
 * the real geometry rather than a restatement of the formula.
 */
function fitFactoryExtent(sunDirection: THREE.Vector3): number {
  const up =
    Math.abs(sunDirection.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4().lookAt(sunDirection, new THREE.Vector3(), up).elements;
  const [halfX, halfY, halfZ] = FACTORY_SHADOW_VOLUME.half;
  return Math.max(
    projectedHalfExtent(basis[0], basis[1], basis[2], halfX, halfY, halfZ),
    projectedHalfExtent(basis[4], basis[5], basis[6], halfX, halfY, halfZ)
  );
}

describe('projectedHalfExtent', () => {
  it('returns the box half size along a cardinal axis', () => {
    expect(projectedHalfExtent(1, 0, 0, 62, 18.5, 52)).toBe(62);
    expect(projectedHalfExtent(0, 1, 0, 62, 18.5, 52)).toBe(18.5);
    expect(projectedHalfExtent(0, 0, -1, 62, 18.5, 52)).toBe(52);
  });

  it('is the support function, so a diagonal axis sums the contributions', () => {
    const diagonal = Math.SQRT1_2;
    expect(projectedHalfExtent(diagonal, 0, diagonal, 10, 4, 20)).toBeCloseTo(
      diagonal * 10 + diagonal * 20,
      10
    );
  });
});

describe('quantiseExtent', () => {
  it('rounds up to the grid so the texel size is stable between refits', () => {
    expect(quantiseExtent(74.5)).toBe(76);
    expect(quantiseExtent(76)).toBe(76);
    expect(quantiseExtent(76.0001)).toBe(80);
    expect(quantiseExtent(74.5) % EXTENT_QUANTUM).toBe(0);
  });

  it('never returns a degenerate extent', () => {
    expect(quantiseExtent(0)).toBe(EXTENT_QUANTUM);
    expect(quantiseExtent(-10)).toBe(EXTENT_QUANTUM);
    expect(quantiseExtent(Number.NaN)).toBe(EXTENT_QUANTUM);
  });
});

describe('snapToTexel', () => {
  it('quantises to whole texels, which is what stops the shadow edge crawling', () => {
    const texel = 0.25;
    expect(snapToTexel(1.06, texel)).toBeCloseTo(1, 10);
    expect(snapToTexel(1.13, texel)).toBeCloseTo(1.25, 10);
    expect(snapToTexel(-1.13, texel)).toBeCloseTo(-1.25, 10);
  });

  it('is idempotent, so a stationary camera produces a stationary grid', () => {
    const texel = 0.1328125;
    const once = snapToTexel(37.913, texel);
    expect(snapToTexel(once, texel)).toBeCloseTo(once, 10);
  });

  it('never divides by a degenerate texel', () => {
    expect(snapToTexel(3, 0)).toBe(3);
    expect(snapToTexel(3, Number.NaN)).toBe(3);
    expect(snapToTexel(Number.NaN, 1)).toBe(0);
  });
});

describe('normalBiasForTexel', () => {
  it('scales with the texel footprint', () => {
    expect(normalBiasForTexel(0.1)).toBeCloseTo(NORMAL_BIAS_TEXELS * 0.1, 10);
  });

  it('clamps both ends so a 4096 map is not acne and a 1024 map is not peter-pan', () => {
    expect(normalBiasForTexel(0.0001)).toBe(NORMAL_BIAS_RANGE.min);
    expect(normalBiasForTexel(10)).toBe(NORMAL_BIAS_RANGE.max);
    expect(normalBiasForTexel(Number.NaN)).toBe(NORMAL_BIAS_RANGE.min);
  });
});

describe('isInsideFactoryFootprint', () => {
  it('classifies every benchmark camera the way the shadow fit needs', () => {
    const inside = ['interior', 'milling', 'packing', 'processFloor'];
    const outside = [
      'silos',
      'forklift',
      'overview',
      'shipping',
      'yard',
      'water',
      'village',
      'farm',
      'tankFarm',
      'logisticsClose',
    ];
    for (const name of inside) {
      const [x, , z] = SITE_LAYOUT.cameras[name as keyof typeof SITE_LAYOUT.cameras].position;
      expect(isInsideFactoryFootprint(x, z)).toBe(true);
    }
    for (const name of outside) {
      const [x, , z] = SITE_LAYOUT.cameras[name as keyof typeof SITE_LAYOUT.cameras].position;
      expect(isInsideFactoryFootprint(x, z)).toBe(false);
    }
  });
});

describe('exteriorHalfExtent', () => {
  it('spends the whole box only on a shot that reaches across the site', () => {
    expect(exteriorHalfExtent(200)).toBe(EXTERIOR_SHADOW_VOLUME.halfExtent);
    expect(exteriorHalfExtent(-1)).toBe(EXTERIOR_SHADOW_VOLUME.halfExtent);
  });

  it('tightens on a close shot, which is both cheaper and sharper', () => {
    // `water` looks 55 units to its subject. A fixed 110 half extent gives a
    // 0.215 texel at 1024 and re-submits the village and the tree line into a
    // shadow pass that never shows them.
    const water = exteriorHalfExtent(55);
    expect(water).toBe(EXTERIOR_SHADOW_VOLUME.minHalfExtent);
    expect((2 * water) / 1024).toBeLessThan((2 * EXTERIOR_SHADOW_VOLUME.halfExtent) / 1024);
  });

  it('never collapses below the floor, so the near field keeps its shadows', () => {
    expect(exteriorHalfExtent(0)).toBe(EXTERIOR_SHADOW_VOLUME.minHalfExtent);
    expect(exteriorHalfExtent(Number.NaN)).toBe(EXTERIOR_SHADOW_VOLUME.halfExtent);
  });

  it('always leaves the camera inside its own box', () => {
    for (const groundDistance of [0, 20, 55, 90, 150, 300]) {
      const halfExtent = exteriorHalfExtent(groundDistance);
      expect(exteriorLeadDistance(groundDistance, halfExtent)).toBeLessThan(halfExtent);
    }
  });
});

describe('exteriorLeadDistance', () => {
  const halfExtent = EXTERIOR_SHADOW_VOLUME.halfExtent;

  it('leads by half the ground distance inside the clamp band', () => {
    expect(exteriorLeadDistance(120, halfExtent)).toBe(60);
  });

  it('leads by the maximum when the view ray never meets the ground', () => {
    expect(exteriorLeadDistance(-1, halfExtent)).toBe(LEAD_MAX_FRACTION * halfExtent);
    expect(exteriorLeadDistance(Number.NaN, halfExtent)).toBe(LEAD_MAX_FRACTION * halfExtent);
  });

  it('keeps the camera inside its own box at the far clamp', () => {
    expect(exteriorLeadDistance(10_000, halfExtent)).toBeLessThan(halfExtent);
  });

  it('still leads on a near-vertical view so the box is not centred on the feet', () => {
    expect(exteriorLeadDistance(0, halfExtent)).toBe(LEAD_MIN_FRACTION * halfExtent);
  });

  it('covers the factory from the overview camera, which a flat 0.35 lead does not', () => {
    // Use the authored overview lens and aim, rather than an old copied pose.
    const camera = SITE_LAYOUT.cameras.overview;
    const forward = new THREE.Vector3(
      camera.target[0] - camera.position[0],
      camera.target[1] - camera.position[1],
      camera.target[2] - camera.position[2]
    ).normalize();
    const t = -camera.position[1] / forward.y;
    const groundX = camera.position[0] + forward.x * t;
    const groundZ = camera.position[2] + forward.z * t;
    const groundDistance = Math.hypot(groundX - camera.position[0], groundZ - camera.position[2]);

    // The site-wide shot is exactly the case that still needs the full box.
    expect(exteriorHalfExtent(groundDistance)).toBe(halfExtent);
    const planar = Math.hypot(forward.x, forward.z);
    const axis = Math.max(Math.abs(forward.x), Math.abs(forward.z)) / planar;
    const lead = exteriorLeadDistance(groundDistance, halfExtent, axis);
    const centreX = camera.position[0] + (forward.x / planar) * lead;
    const centreZ = camera.position[2] + (forward.z / planar) * lead;

    // A 220-unit box cannot strictly contain both a camera 173 units out and a
    // 120-unit building centred on its view target, so the west wall face is
    // covered to within a fraction of a unit rather than exactly. At 170 units
    // of view distance that residue is well under a pixel.
    const tolerance = 1;
    const bounds = SITE_LAYOUT.factory.bounds;
    expect(centreX - halfExtent).toBeLessThanOrEqual(bounds.minX + tolerance);
    expect(centreX + halfExtent).toBeGreaterThanOrEqual(bounds.maxX);
    expect(centreZ - halfExtent).toBeLessThanOrEqual(bounds.minZ + tolerance);
    expect(centreZ + halfExtent).toBeGreaterThanOrEqual(bounds.maxZ);
    // The camera has to stay in its own box or the near field loses shadows.
    expect(Math.abs(camera.position[0] - centreX)).toBeLessThan(halfExtent);
    expect(Math.abs(camera.position[2] - centreZ)).toBeLessThan(halfExtent);

    // Compare the old fixed lead on the far edge for the authored overview camera.
    const flatLead = 0.35 * halfExtent;
    const flatCentreZ = camera.position[2] + (forward.z / planar) * flatLead;
    expect(flatCentreZ - halfExtent).toBeGreaterThan(bounds.minZ + 20);
  });
});

describe('factory shadow volume', () => {
  it('contains the whole envelope including the roof slabs', () => {
    const bounds = SITE_LAYOUT.factory.bounds;
    const [centreX, centreY, centreZ] = FACTORY_SHADOW_VOLUME.centre;
    const [halfX, halfY, halfZ] = FACTORY_SHADOW_VOLUME.half;
    expect(centreX - halfX).toBeLessThanOrEqual(bounds.minX);
    expect(centreX + halfX).toBeGreaterThanOrEqual(bounds.maxX);
    expect(centreZ - halfZ).toBeLessThanOrEqual(bounds.minZ);
    expect(centreZ + halfZ).toBeGreaterThanOrEqual(bounds.maxZ);
    expect(centreY + halfY).toBeGreaterThanOrEqual(bounds.maxY + 1.02);
    expect(centreY - halfY).toBeLessThanOrEqual(0);
  });

  it('includes outdoor bins and the elevator along light depth without widening receiver coverage', () => {
    expect(FACTORY_SHADOW_VOLUME.half[0]).toBe(62);
    expect(FACTORY_SHADOW_VOLUME.half[2]).toBe(52);
    const tower = SITE_LAYOUT.bulkStorage.elevator;
    for (const direction of [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(1, 1, -1).normalize(),
    ]) {
      const depth = factoryOccluderDepth(...direction.toArray());
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) {
            const point = new THREE.Vector3(
              tower.position[0] + (x * tower.footprint[0]) / 2,
              tower.position[1] + ((y + 1) * tower.height) / 2,
              tower.position[2] + (z * tower.footprint[1]) / 2
            ).sub(new THREE.Vector3(...FACTORY_SHADOW_VOLUME.centre));
            expect(Math.abs(point.dot(direction))).toBeLessThan(depth);
          }
    }
  });

  it('stays inside a usable texel size at every solar elevation and azimuth', () => {
    // The whole point of fitting to the envelope rather than to the camera is
    // that the interior never shows a shadow boundary. That is only affordable
    // if the resulting texel stays small enough to read - so the worst case
    // over the full solar sphere, not one convenient sample, is what matters.
    // The lowest 1024 texel this can produce sets the interior's normal bias,
    // and that bias is what peter-panning looks like when it is too large.
    const elevations = [0.05, 0.25, 0.5, 0.75, 0.95, 1];
    const azimuths = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI];
    let worstTexel = 0;
    for (const elevation of elevations) {
      for (const azimuth of azimuths) {
        const radial = Math.sqrt(Math.max(0, 1 - elevation * elevation));
        const direction = new THREE.Vector3(
          radial * Math.cos(azimuth),
          elevation,
          radial * Math.sin(azimuth)
        ).normalize();
        const extent = quantiseExtent(fitFactoryExtent(direction));
        const texelAt1024 = (2 * extent) / 1024;
        worstTexel = Math.max(worstTexel, texelAt1024);

        // Never degenerate, and never wider than the interior needs.
        expect(extent).toBeGreaterThanOrEqual(52);
        expect(extent).toBeLessThanOrEqual(88);
        expect(texelAt1024).toBeLessThan(0.18);
        expect(normalBiasForTexel(texelAt1024)).toBeLessThan(NORMAL_BIAS_RANGE.max);
      }
    }
    // Tighter than the 0.215 an exterior 110 half extent gives on the same map,
    // which is the right way round: the interior is where the camera gets close
    // to what is casting.
    expect(worstTexel).toBeLessThan((2 * 110) / 1024);
  });
});

/**
 * The exterior fit, reproduced from the camera the way the rig's `useFrame`
 * does it, so the cases below measure the box every authored camera actually
 * gets instead of restating `exteriorHalfExtent`.
 */
interface ExteriorFit {
  /** Half size of the WORLD box, before it is projected into light space. */
  half: number;
  centreX: number;
  centreZ: number;
  /** Where the view ray meets y=0 - the subject of the shot. */
  groundX: number;
  groundZ: number;
  groundDistance: number;
}

function fitExteriorCamera(
  position: readonly [number, number, number],
  target: readonly [number, number, number]
): ExteriorFit {
  const forward = new THREE.Vector3(
    target[0] - position[0],
    target[1] - position[1],
    target[2] - position[2]
  ).normalize();
  const planar = Math.hypot(forward.x, forward.z);
  const rayLength = forward.y < -0.05 && position[1] > 0 ? -position[1] / forward.y : -1;
  const groundDistance = rayLength >= 0 ? rayLength * planar : -1;
  const half = exteriorHalfExtent(groundDistance);
  const axis = planar > 1e-4 ? Math.max(Math.abs(forward.x), Math.abs(forward.z)) / planar : 1;
  const lead = exteriorLeadDistance(groundDistance, half, axis);
  const leadX = planar > 1e-4 ? (forward.x / planar) * lead : 0;
  const leadZ = planar > 1e-4 ? (forward.z / planar) * lead : 0;
  return {
    half,
    centreX: position[0] + leadX,
    centreZ: position[2] + leadZ,
    groundX: rayLength >= 0 ? position[0] + forward.x * rayLength : position[0] + leadX,
    groundZ: rayLength >= 0 ? position[2] + forward.z * rayLength : position[2] + leadZ,
    groundDistance,
  };
}

/** Ortho half extent the rig hands the shadow camera, for a world box and sun. */
function fitExteriorExtent(half: number, sunDirection: THREE.Vector3): number {
  const up =
    Math.abs(sunDirection.y) > VERTICAL_SUN_THRESHOLD
      ? new THREE.Vector3(0, 0, 1)
      : new THREE.Vector3(0, 1, 0);
  const basis = new THREE.Matrix4().lookAt(sunDirection, new THREE.Vector3(), up).elements;
  const halfY = EXTERIOR_SHADOW_VOLUME.halfY;
  return quantiseExtent(
    Math.max(
      projectedHalfExtent(basis[0], basis[1], basis[2], half, halfY, half),
      projectedHalfExtent(basis[4], basis[5], basis[6], half, halfY, half)
    )
  );
}

const EXTERIOR_CAMERAS = Object.entries(SITE_LAYOUT.cameras).filter(
  ([, camera]) => !isInsideFactoryFootprint(camera.position[0], camera.position[2])
);

describe('exterior fit across every authored camera', () => {
  it('covers cameras that are actually outside the building', () => {
    // If this ever empties the rest of this block silently passes.
    expect(EXTERIOR_CAMERAS.length).toBeGreaterThanOrEqual(7);
    expect(EXTERIOR_CAMERAS.map(([name]) => name)).toEqual(
      expect.arrayContaining(['overview', 'yard', 'farm'])
    );
  });

  it('keeps both the camera and the point it is looking at inside its own box', () => {
    for (const [name, camera] of EXTERIOR_CAMERAS) {
      const fit = fitExteriorCamera(camera.position, camera.target);
      // The camera stands in its own cascade, or the ground under the viewer is
      // a hard-edged patch of full sun.
      expect(Math.abs(camera.position[0] - fit.centreX), name).toBeLessThanOrEqual(fit.half);
      expect(Math.abs(camera.position[2] - fit.centreZ), name).toBeLessThanOrEqual(fit.half);
      // And so does the subject of the shot.
      expect(Math.abs(fit.groundX - fit.centreX), name).toBeLessThanOrEqual(fit.half);
      expect(Math.abs(fit.groundZ - fit.centreZ), name).toBeLessThanOrEqual(fit.half);
    }
  });

  it('leaves an up-sun margin for a full-height caster down to a 30 degree sun', () => {
    // WHY THIS IS THE CONSTRAINT ON TIGHTENING, NOT THE TEXEL SIZE.
    //
    // A caster of height h standing up-sun of the subject drops its shadow
    // h / tan(elevation) down-sun. Anything that far outside the box is culled
    // by the shadow camera's own frustum, so its shadow simply does not exist -
    // and the failure shows up as missing shadow INSIDE the frame, not at the
    // edge of the world. The margin the fit has left is therefore the real
    // ceiling on how far the box can shrink.
    //
    // The bound used is the inradius: the perpendicular distance from the
    // subject to the nearest face, which is a lower bound on the distance to
    // the boundary along any horizontal direction, so it holds for every solar
    // azimuth without enumerating them.
    const elevationDegrees = 30;
    const required = EXTERIOR_SHADOW_VOLUME.halfY / Math.tan((elevationDegrees * Math.PI) / 180);
    for (const [name, camera] of EXTERIOR_CAMERAS) {
      const fit = fitExteriorCamera(camera.position, camera.target);
      const margin = Math.min(
        fit.half - Math.abs(fit.groundX - fit.centreX),
        fit.half - Math.abs(fit.groundZ - fit.centreZ)
      );
      expect(margin, name).toBeGreaterThanOrEqual(required);
    }
  });

  it('does not saturate on the two exterior benchmark scenes that are budgeted', () => {
    // Recorded because the obvious hypothesis about the exterior shadow cost -
    // that the fit pins to `halfExtent` and sweeps the whole site - is false for
    // the scene that misses its budget. `farm` fits at 88 of a possible 110 and
    // `yard` sits ON the floor and cannot tighten at all. Only `overview`, which
    // passes, spends the whole box.
    const yard = fitExteriorCamera(
      SITE_LAYOUT.cameras.yard.position,
      SITE_LAYOUT.cameras.yard.target
    );
    const farm = fitExteriorCamera(
      SITE_LAYOUT.cameras.farm.position,
      SITE_LAYOUT.cameras.farm.target
    );
    const overview = fitExteriorCamera(
      SITE_LAYOUT.cameras.overview.position,
      SITE_LAYOUT.cameras.overview.target
    );

    expect(yard.half).toBeCloseTo(EXTERIOR_SHADOW_VOLUME.minHalfExtent, 0);
    expect(farm.half).toBeGreaterThan(EXTERIOR_SHADOW_VOLUME.minHalfExtent);
    expect(farm.half).toBeLessThan(EXTERIOR_SHADOW_VOLUME.halfExtent);
    expect(overview.half).toBe(EXTERIOR_SHADOW_VOLUME.halfExtent);
  });

  it('holds a readable texel on a 1024 map at every camera and elevation', () => {
    // ANSWERS "IS 1024 MATCHED TO THE FIT". These are the world sizes of one
    // shadow texel that `medium`'s configured 1024 actually produces. They are
    // fine for the PCF lookup selected by App. PCFSoft silently fell through
    // to BASIC in three 0.182; shaderInjectionAnchors.test now guards the real
    // Canvas value against the installed renderer mapping.
    const azimuths = [0, Math.PI / 3, (2 * Math.PI) / 3, Math.PI];
    let worstVertical = 0;
    let worstOverall = 0;
    for (const [name, camera] of EXTERIOR_CAMERAS) {
      const fit = fitExteriorCamera(camera.position, camera.target);
      for (const elevation of [0.2, 0.5, 0.75, 1]) {
        for (const azimuth of azimuths) {
          const radial = Math.sqrt(Math.max(0, 1 - elevation * elevation));
          const direction = new THREE.Vector3(
            radial * Math.cos(azimuth),
            elevation,
            radial * Math.sin(azimuth)
          ).normalize();
          const extent = fitExteriorExtent(fit.half, direction);
          const texel = (2 * extent) / 1024;
          expect(extent % EXTENT_QUANTUM, name).toBe(0);
          if (elevation >= 1) worstVertical = Math.max(worstVertical, texel);
          worstOverall = Math.max(worstOverall, texel);
        }
      }
    }
    // At the vertical sun the harness runs at (`--time=12`) the light basis is
    // the world basis and the square box maps onto itself: 0.219 m per texel on
    // the widest camera.
    expect(worstVertical).toBeLessThanOrEqual(0.22);
    // At any other hour the ortho extent is driven by the SOLAR AZIMUTH, not
    // the elevation: the light-space x axis is horizontal, so a square world box
    // seen at 45 degrees of azimuth projects sqrt(2) wider. That is a 41% coarser
    // texel than the benchmark ever measures, and it is the number that makes an
    // unfiltered shadow lookup visible.
    expect(worstOverall).toBeLessThanOrEqual(0.3);
    expect(worstOverall).toBeGreaterThan(worstVertical * 1.3);
  });
});
