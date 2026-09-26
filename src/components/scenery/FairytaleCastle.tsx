import React from 'react';
import * as THREE from 'three';
import { GeneratedBody } from '../models/GeneratedModel';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

interface FairytaleCastleProps {
  position?: [number, number, number];
  scale?: number;
  rotation?: [number, number, number];
}

/**
 * Tower silhouettes, drawn as lathe profiles.
 *
 * The castle stands at [45, 0, -200] at a site scale of 1.5 - a skyline
 * landmark read from 150-250 m away, never approached. That distance decides
 * everything below: a 0.2 m moulding is a fifth of a pixel and is not worth a
 * vertex, while the presence or absence of a corbel course, a crenellated
 * parapet or a flared eave is what separates "castle" from "pipe with a cone
 * on it". These profiles were designed and previewed against the app's own
 * camera (fov 65, 1080 px tall, 200 m out) in scripts/blender/specs/castle.json
 * plus an assembled in-situ render; features that did not survive that frame
 * were cut rather than shipped.
 *
 * Every profile keeps the EXACT unit envelope of the primitive it replaces -
 * max radius and y range - so no mesh position in this file moves. What does
 * move, deliberately, is where inside that envelope the widest ring sits: both
 * cone caps previously reached full radius at their bottom edge and so sleeved
 * down over the tower they were meant to sit on. Raising the widest ring to an
 * eave is the whole point of the redesign, and the harness still reports 0.00
 * mm drift because the half-extents are untouched.
 *
 * The castle is a single non-instanced landmark, so these geometries are built
 * once at module scope and shared - the two gatehouse turrets now draw one
 * body geometry and one cap geometry between them instead of a fresh pair
 * each. Nothing here carries a pointer handler, so no picking proxy is needed.
 *
 * Cost, counted on both sides of the batcher: as authored geometry the redesign
 * is +958 vertices, but MillScene wraps the castle in a StaticMeshBatch, which
 * merges compatible opaque meshes into one buffer and so copies a shared
 * geometry once per mesh that used it. Counted across the batched scene it is
 * about +1,485. Sharing still buys the geometry build, the second upload and
 * the bookkeeping - just not merged-buffer bytes. Either number is rounding
 * error for a landmark.
 *
 * The batcher keys its merge groups on flatShading among much else (see
 * materialSignature in StaticMeshBatch), which is load-bearing here: the
 * crenellation ring is the only cast+receive+flatShading mesh in the castle, so
 * it cannot be folded in with the smooth-shaded walls and keeps a buffer of its
 * own. Give another mesh that exact signature and the merlons join it.
 */
const lathe = (points: [number, number][], segments: number): THREE.LatheGeometry =>
  new THREE.LatheGeometry(
    points.map(([r, y]) => new THREE.Vector2(r, y)),
    segments
  );

/**
 * Watchtower shaft - 9 m across the foot, 36 m tall (13.5 m x 54 m rendered).
 *
 * Replaces CylinderGeometry(2.5, 3, 24, 16), whose single uniform taper read
 * as a factory chimney. A tower is not a cone: it stands on a splayed footing
 * and its wall is near vertical. This profile has a plinth, a weathered talus
 * spreading the load onto the rock, and two stages divided by a set-back, with
 * a batter of only 0.18 unit over the upper 19 units.
 *
 * The talus is the feature that carries at 200 m: 9 m at the foot against 8.1 m
 * at the shaft, over 4.4 m of height, right where the tower meets the mountain
 * plateau. The set-back at y = +0.4 is a near-range read only, and is two
 * points.
 *
 * Envelope: max radius 3.0 at y = -12, y in [-12, 12] - identical to the
 * cylinder. Segments stay at 16; the 200 m render shows no polygonal
 * silhouette, so spending there would buy nothing.
 */
const WATCHTOWER_SHAFT = lathe(
  [
    [0.0, -12.0], // underside centre
    [3.0, -12.0], // plinth foot - envelope max radius
    [3.0, -11.45], // plinth wall
    [2.94, -11.15], // plinth weathering
    [2.72, -8.2], // talus splay into the lower stage
    [2.68, 0.4], // lower stage
    [2.52, 1.1], // weathered set-back between the stages
    [2.5, 12.0], // upper stage head - meets the corbel at its own 2.5
    [0.0, 12.0],
  ],
  16
);

/**
 * Machicolation course - 14.4 m across, 2.25 m tall, seated on the shaft head.
 *
 * Replaces CylinderGeometry(3.2, 2.5, 1, 16), a plain inverted taper that was
 * in any case invisible: the old spire's base ring was 3.5 at y = -6 and
 * engulfed this band completely. The profile is a corbel splay off the tower
 * face, a vertical parapet wall, and a chamfered coping - the surface the
 * merlons stand on.
 *
 * The 1.05 m oversail on each side, and the shadow it throws down the shaft,
 * is what reads at distance; the coping chamfer is close-range.
 *
 * Envelope: max radius 3.2, y in [-0.5, 0.5]. Bottom radius stays at 2.5 so it
 * still meets the shaft head exactly.
 */
const WATCHTOWER_CORBEL = lathe(
  [
    [0.0, -0.5], // underside centre, inside the shaft
    [2.5, -0.5], // springing at the tower face
    [2.52, -0.42], // bottom arris of the machicolation band
    [3.2, -0.06], // corbel splay - envelope max radius
    [3.2, 0.36], // parapet wall
    [3.12, 0.46], // coping chamfer
    [3.08, 0.5], // coping top / wall-walk
    [0.0, 0.5],
  ],
  16
);

/**
 * Crenellated parapet - 12 merlons, each 1.27 m wide, 1.27 m deep, 1.5 m tall.
 *
 * New geometry: the tower had no crenellation at all. This is the one feature
 * here that must not be round, and it is worth stating why it is not a
 * "ribbed" lathe. Ribbing modulates RADIUS with angle - it cuts vertical flutes
 * into a wall and leaves the top edge of the ring perfectly level. Crenellation
 * is a HEIGHT modulation: merlon, gap, merlon, and the whole read is the
 * serrated line against the sky. No surface of revolution, ribbed or not, can
 * express it. So each merlon is a four-sided lathe - a genuine prism, chosen
 * rather than inherited - with a slight batter and a weathered coped top, and
 * the twelve are baked into ONE merged geometry so the ring is a single mesh
 * and a single draw call regardless of what StaticMeshBatch decides.
 *
 * Sized from the render, not from taste: at 200 m through the app's camera a
 * merlon is ~6 px wide and a gap ~4 px, which is the coarsest spacing that
 * still reads as notches rather than as a texture. Ring radius 2.776 puts each
 * merlon's outer FACE (0.424 proud of its centre, since a 4-sided lathe carries
 * its 0.6 half-extent on the corners) exactly on the parapet face at 3.2, and
 * the +45 deg twist is what turns a corner outward into a face outward.
 *
 * The sharpness lives on the MATERIAL, not here: the merged ring carries the
 * smooth per-vertex normals LatheGeometry computes around its revolution, which
 * on a 4-sided prism round the arrises off and read as lozenges. `flatShading`
 * on the mesh below overrides them at shade time. Drop that flag and the
 * crenellation goes soft - the geometry will not save you.
 */
const CRENELLATION_COUNT = 12;
const CRENELLATION_RING_RADIUS = 2.776;

function createCrenellationRingGeometry(): THREE.BufferGeometry {
  const merlon = lathe(
    [
      [0.0, -0.5], // seated on the coping
      [0.6, -0.5], // block foot - half-extent is on the corner, face is 0.424
      [0.585, 0.2], // batter
      [0.565, 0.34],
      [0.5, 0.45], // weathered cope
      [0.3, 0.5],
      [0.0, 0.5],
    ],
    4
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const axis = new THREE.Vector3(0, 1, 0);
  const unit = new THREE.Vector3(1, 1, 1);
  const blocks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < CRENELLATION_COUNT; i += 1) {
    const angle = (2 * Math.PI * i) / CRENELLATION_COUNT;
    position.set(
      CRENELLATION_RING_RADIUS * Math.sin(angle),
      0,
      CRENELLATION_RING_RADIUS * Math.cos(angle)
    );
    quaternion.setFromAxisAngle(axis, angle + Math.PI / 4);
    matrix.compose(position, quaternion, unit);
    blocks.push(merlon.clone().applyMatrix4(matrix));
  }
  // Every block is a clone of one lathe, so the attribute sets are identical
  // and the merge cannot fail.
  const ring = mergeGeometries(blocks);
  blocks.forEach((block) => block.dispose());
  merlon.dispose();
  return ring;
}

const WATCHTOWER_CRENELLATION = createCrenellationRingGeometry();

/**
 * Watchtower roof - 10.5 m across the eave, 18 m tall (15.75 m x 27 m rendered).
 *
 * Replaces ConeGeometry(3.5, 12, 16). That cone's widest ring was its bottom
 * edge, 1.5 units below the tower head, so it swallowed both the corbel course
 * and the top of the shaft and the tower ended in a party hat. Here the roof
 * springs from a narrow drum INSIDE the parapet, sweeps out along a soffit to a
 * bell-cast eave 1.35 m clear above the merlon tops, and then runs up a slender
 * slightly-concave pitch to the gold finial that already caps it.
 *
 * The drum is held at 2.15 against the merlons' 2.352 inner face: that 0.3 m
 * recess is what makes the embrasures read as shadow rather than as flush
 * surface, and it is checked in the preview script rather than eyeballed.
 *
 * Envelope: max radius 3.5, y in [-6, 6] - identical to the cone. The widest
 * ring moves from y = -6 to y = -2.6, which is exactly the change that lets the
 * parapet exist; half-extents are unaffected and every mesh position in this
 * file is unchanged.
 */
const WATCHTOWER_SPIRE = lathe(
  [
    [0.0, -6.0], // underside centre, buried in the shaft
    [2.05, -6.0], // drum foot
    [2.13, -4.4], // drum, inside the parapet
    [2.15, -3.3], // drum head - springing at the wall-walk
    [2.62, -3.06], // soffit sweeping out over the merlons
    [3.14, -2.78],
    [3.5, -2.6], // eave rim - envelope max radius
    [3.46, -2.44], // fascia
    [3.18, -2.18], // bell-cast flare
    [2.78, -1.8], // flare closes into the main pitch
    [2.23, -0.4],
    [1.69, 1.1],
    [1.2, 2.5],
    [0.77, 3.7],
    [0.42, 4.7],
    [0.25, 5.2],
    [0.14, 5.55], // neck, inside the gold finial ball
    [0.06, 5.85],
    [0.0, 6.0], // apex - envelope max y
  ],
  16
);

/**
 * Gatehouse turret shaft - 5.4 m across the foot, 18 m tall (8.1 m x 27 m).
 *
 * Replaces CylinderGeometry(1.5, 1.8, 12, 16). Same three moves as the
 * watchtower at half the size - plinth, talus, near-vertical shaft - plus a
 * corbelled head that oversails by 0.42 m, then a set-in drum for the roof to
 * spring from. The drum is the reason the head reads: it lets the cap's eave
 * sit at the corbel instead of 2.2 m down the shaft, and it is hidden inside
 * the cap so it costs nothing on the silhouette.
 *
 * Envelope: max radius 1.8 at y = -6, y in [-6, 6]. One geometry, drawn by both
 * turrets - previously each turret built its own inline cylinder.
 */
const GATE_TURRET_SHAFT = lathe(
  [
    [0.0, -6.0],
    [1.8, -6.0], // plinth foot - envelope max radius
    [1.8, -5.66], // plinth wall
    [1.75, -5.48], // plinth weathering
    [1.56, -4.28], // talus splay
    [1.52, -3.92], // shaft foot
    [1.46, 3.3], // shaft head
    [1.6, 3.62], // corbel bracket
    [1.74, 3.98], // machicolation face - oversail
    [1.74, 4.22], // head band
    [1.66, 4.4], // coping chamfer
    [1.3, 4.52], // set in to the roof drum
    [1.3, 6.0], // drum head, hidden inside the cap
    [0.0, 6.0],
  ],
  16
);

/**
 * Gatehouse turret roof - 6 m across the eave, 7.5 m tall (9 m x 11.25 m).
 *
 * Replaces ConeGeometry(2, 5, 16), which was sleeved 2.2 m down over the shaft
 * and hid whatever the turret head did. The eave now sits 0.39 m proud of the
 * corbelled head's own face (0.51 m proud of the coping chamfer above it, and a
 * full 1.05 m proud of the set-in drum it actually springs from, which is the
 * overhang that throws the shadow). The pitch is concave rather than straight,
 * and the profile ends in a ball-and-spike finial - the turrets have no
 * separate finial mesh the way the watchtower does, so it has to be in the
 * lathe.
 *
 * Envelope: max radius 2.0, y in [-2.5, 2.5] - identical to the cone. The
 * widest ring moves up 0.4 unit to become an eave; the mesh does not move.
 */
const GATE_TURRET_CAP = lathe(
  [
    [0.0, -2.5], // underside centre, inside the turret head
    [1.4, -2.5], // springing
    [1.62, -2.32], // soffit sweep
    [2.0, -2.1], // eave rim - envelope max radius
    [1.96, -1.96], // fascia
    [1.82, -1.72], // bell-cast flare
    [1.66, -1.45], // flare closes into the main pitch
    [1.25, -0.6],
    [0.86, 0.3],
    [0.52, 1.1],
    [0.29, 1.65],
    [0.15, 2.05], // neck
    [0.34, 2.2], // finial ball
    [0.15, 2.34], // collar
    [0.08, 2.43], // spike
    [0.02, 2.5], // tip - envelope max y
    [0.0, 2.5],
  ],
  16
);

const FairytaleCastlePrimitiveBody: React.FC = React.memo(() => {
  // Weathered heritage palette keeps the landmark grounded in the same
  // overcast industrial valley as the mill instead of reading as white set
  // dressing pasted over the mountain range.
  const colors = {
    walls: '#c6c3ba',
    roofs: '#314c5a',
    trim: '#9f8e76',
    rock: '#505957',
    gold: '#b89743',
  };

  return (
    <group>
      {/* ==================== BASE MOUNTAIN ==================== */}
      {/* Stays at 7 sides. It is the widest part here (75 m across) but 7 is
            deliberate: with `flatShading` it reads as a crag rather than a cone,
            and 7 is not divisible by 4 - its -Z extent is only 0.9009r, so any
            move to a multiple of 4 would push the base 3.7 m further back into
            whatever it is standing in. */}
      <mesh position={[0, -10, 0]} receiveShadow>
        <cylinderGeometry args={[18, 25, 30, 7]} />
        <meshStandardMaterial color={colors.rock} roughness={0.9} flatShading />
      </mesh>

      {/* ==================== MAIN KEEP (PALLAS) ==================== */}
      <group position={[2, 5, -2]}>
        {/* Main Body */}
        <mesh position={[0, 8, 0]} castShadow receiveShadow>
          <boxGeometry args={[12, 16, 8]} />
          <meshStandardMaterial color={colors.walls} roughness={0.6} />
        </mesh>
        {/* Roof */}
        <mesh position={[0, 20, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
          <coneGeometry args={[9, 8, 4]} /> {/* Pyramidal roof */}
          <meshStandardMaterial color={colors.roofs} roughness={0.7} />
        </mesh>
        {/* Windows */}
        {[-1, 0, 1].map((y) => (
          <group key={y} position={[0, 4 + y * 4, 4.1]}>
            {[-3, 0, 3].map((x) => (
              <mesh key={x} position={[x, 0, 0]}>
                <planeGeometry args={[1.2, 2]} />
                <meshStandardMaterial color="#2a2a2a" roughness={0.2} metalness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* ==================== TALL WATCHTOWER ==================== */}
      {/* Shaft, machicolation course, crenellated parapet, bell-cast roof.
            The profiles and the reasoning behind each live at the top of this
            file; the positions below are unchanged from the primitives they
            replace, because every profile keeps the same unit envelope. */}
      <group position={[-8, 5, 4]}>
        {/* Tower Shaft */}
        <mesh geometry={WATCHTOWER_SHAFT} position={[0, 12, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={colors.walls} roughness={0.6} />
        </mesh>
        {/* Machicolation course seated on the shaft head */}
        <mesh geometry={WATCHTOWER_CORBEL} position={[0, 24, 0]} castShadow>
          <meshStandardMaterial color={colors.trim} roughness={0.7} />
        </mesh>
        {/* Crenellated parapet standing on the coping - flatShading keeps the
              merlon arrises sharp, which is the whole point of a prism. */}
        <mesh geometry={WATCHTOWER_CRENELLATION} position={[0, 25, 0]} castShadow receiveShadow>
          <meshStandardMaterial color={colors.walls} roughness={0.6} flatShading />
        </mesh>
        {/* Spire Roof, springing from inside the parapet */}
        <mesh geometry={WATCHTOWER_SPIRE} position={[0, 29, 0]} castShadow>
          <meshStandardMaterial color={colors.roofs} roughness={0.5} />
        </mesh>
        {/* Finial - caps the spire neck, which tapers to 0.14 inside it */}
        <mesh position={[0, 35, 0]}>
          <sphereGeometry args={[0.5]} />
          <meshStandardMaterial color={colors.gold} metalness={0.8} roughness={0.2} />
        </mesh>
      </group>

      {/* ==================== CURTAIN WALL (Gatehouse to Tower) ==================== */}
      {/* Diagonal wall connecting the gatehouse to the tall watchtower */}
      <group position={[-1, 5, 6]} rotation={[0, Math.atan2(4, 14) - Math.PI / 6, 0]}>
        {/* Main wall section */}
        <mesh position={[0, 2, 0]} castShadow receiveShadow>
          <boxGeometry args={[15, 5, 1.5]} />
          <meshStandardMaterial color={colors.walls} roughness={0.6} />
        </mesh>
        {/* Battlements / Crenellations - positioned along wall top */}
        {[-6, -3, 0, 3, 6].map((x, i) => (
          <mesh key={i} position={[x, 5.25, 0]} castShadow>
            <boxGeometry args={[1.5, 1.5, 1.5]} />
            <meshStandardMaterial color={colors.walls} roughness={0.6} />
          </mesh>
        ))}
      </group>

      {/* ==================== GATEHOUSE ==================== */}
      <group position={[6, 2, 8]}>
        {/* Left Turret - 5.4 m across and 18 m tall, flanking the gate. Shaft
              and cap are the shared module-level profiles, so the pair costs
              one body geometry and one cap geometry between them. */}
        <mesh geometry={GATE_TURRET_SHAFT} position={[-3, 6, 0]} castShadow>
          <meshStandardMaterial color={colors.walls} roughness={0.6} />
        </mesh>
        <mesh geometry={GATE_TURRET_CAP} position={[-3, 13, 0]} castShadow>
          <meshStandardMaterial color={colors.roofs} roughness={0.5} />
        </mesh>

        {/* Right Turret - mirror of the left, same two geometries. */}
        <mesh geometry={GATE_TURRET_SHAFT} position={[3, 6, 0]} castShadow>
          <meshStandardMaterial color={colors.walls} roughness={0.6} />
        </mesh>
        <mesh geometry={GATE_TURRET_CAP} position={[3, 13, 0]} castShadow>
          <meshStandardMaterial color={colors.roofs} roughness={0.5} />
        </mesh>

        {/* Archway */}
        <mesh position={[0, 5, 0]} castShadow>
          <boxGeometry args={[4, 8, 2]} />
          <meshStandardMaterial color={colors.walls} roughness={0.6} />
        </mesh>
        <mesh position={[0, 3, 1.1]}>
          <circleGeometry args={[1.5, 32, 0, Math.PI]} />
          <meshStandardMaterial color="#1a1a1a" />
        </mesh>
      </group>

      {/* ==================== GRAND STAIRCASE ==================== */}
      {/* Stone steps leading up from ground level to the gatehouse */}
      <group position={[6, -5, 18]}>
        {/* Generate 20 steps going down from castle to ground */}
        {Array.from({ length: 20 }, (_, i) => (
          <mesh key={i} position={[0, -i * 0.8, i * 1.2]} castShadow receiveShadow>
            <boxGeometry args={[5, 0.6, 1]} />
            <meshStandardMaterial color={i % 2 === 0 ? '#a0a0a0' : '#909090'} roughness={0.8} />
          </mesh>
        ))}
        {/* Side walls / railings */}
        <mesh position={[-2.8, -8, 12]} castShadow>
          <boxGeometry args={[0.4, 2, 25]} />
          <meshStandardMaterial color={colors.rock} roughness={0.9} />
        </mesh>
        <mesh position={[2.8, -8, 12]} castShadow>
          <boxGeometry args={[0.4, 2, 25]} />
          <meshStandardMaterial color={colors.rock} roughness={0.9} />
        </mesh>
      </group>

      {/* ==================== SIDE HALL ==================== */}
      <group position={[-6, 3, -6]}>
        <mesh position={[0, 6, 0]} castShadow>
          <boxGeometry args={[10, 12, 6]} />
          <meshStandardMaterial color={colors.walls} roughness={0.6} />
        </mesh>
        {/* Roof - rotated to lay flat as peaked roof (flipped right-side up) */}
        <mesh position={[0, 14.5, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[4, 4, 10, 3]} />
          <meshStandardMaterial color={colors.roofs} roughness={0.7} />
        </mesh>
      </group>

      {/* ==================== SMALL TURRETS (Decor) ==================== */}
      {/* Left at 8. These are plain meshes drawn three times from the map, not
            a shared geometry, so segments here multiply where the watchtower's
            do not - and at 3 m across they are background dressing rather than a
            silhouette anyone reads. Large AND prominent is the bar; these are
            neither. */}
      {(
        [
          [-8, 5, -8],
          [8, 5, -8],
          [10, 10, 6],
        ] as [number, number, number][]
      ).map((pos, i) => (
        <group key={i} position={pos}>
          <mesh position={[0, 3, 0]} castShadow>
            <cylinderGeometry args={[1, 1, 6, 8]} />
            <meshStandardMaterial color={colors.walls} roughness={0.6} />
          </mesh>
          <mesh position={[0, 7, 0]} castShadow>
            <coneGeometry args={[1.4, 4, 8]} />
            <meshStandardMaterial color={colors.roofs} roughness={0.5} />
          </mesh>
        </group>
      ))}
    </group>
  );
});
FairytaleCastlePrimitiveBody.displayName = 'FairytaleCastlePrimitiveBody';

/**
 * The generated castle replaces the whole landmark, crag included - it arrives
 * with its own rock base. The silhouette does change: the primitive is a
 * Neuschwanstein-style keep on a 50 m mountain, and the generated one is a
 * broader, shorter fairytale castle on a low outcrop. At the 105 m viewing
 * distance this landmark is shot from that reads as a different castle rather
 * than a worse one, but it is the largest single change in this pass.
 */
/**
 * Seat the generated rock a little into the meadow (local metres, 0.3 m at the
 * landmark's 1.5 scale), so the gentle start of the river bank under the keep's
 * northern edge never opens a gap beneath it.
 */
export const CASTLE_ROCK_SINK = 0.2;

export const FairytaleCastle: React.FC<FairytaleCastleProps> = React.memo(
  ({
    position = [0, 0, 0] as [number, number, number],
    scale = 1,
    rotation = [0, 0, 0] as [number, number, number],
  }) => (
    <group name="heritage-castle" position={position} scale={scale} rotation={rotation}>
      <GeneratedBody
        asset="castle"
        sink={CASTLE_ROCK_SINK}
        fallback={<FairytaleCastlePrimitiveBody />}
      />
    </group>
  )
);
FairytaleCastle.displayName = 'FairytaleCastle';
