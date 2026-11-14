/**
 * World targets the first-person controllers find in the scene and register
 * for aiming (worldInteractables): every resident (report 04 P5), the farm
 * windmill and the henhouse (P9). The owners need no change: residents are the
 * children of CommunityLife's `world-personnel` group, keyed by
 * `userData.communityId`; the farm models are the groups FarmArea names
 * `farm-windmill` and `farm-henhouse`.
 *
 * The controllers call `linkSceneInteractables` every frame. It looks the
 * groups up by name at most once a second until it has them, and again only
 * when one leaves the scene (a remount), so it neither traverses nor
 * allocates on an ordinary frame.
 */
import * as THREE from 'three';
import { registerWorldInteractable } from './worldInteractables';
import { useWorldCardStore } from '../components/worldCard/worldCardStore';
import { useWindmillLearningStore } from '../stores/windmillLearningStore';
import { useProcessInspectionStore } from '../stores/processInspectionStore';

/** Chest height on a standing resident, and the aim sphere round it, m. */
const RESIDENT_AIM_HEIGHT = 1.2;
const RESIDENT_AIM_RADIUS = 0.45;
/** Greeting distance: a conversation, not a shout. */
const RESIDENT_REACH = 4;
/** Frames between lookups while something is still missing. */
const PROBE_FRAMES = 60;

interface Link {
  object: THREE.Object3D;
  dispose: () => void;
}
const links: Record<'personnel' | 'windmill' | 'henhouse', Link | null> = {
  personnel: null,
  windmill: null,
  henhouse: null,
};
let countdown = 0;

const openWorkspace = () =>
  window.dispatchEvent(new CustomEvent('millos:open-operations-workspace', { detail: 'overview' }));

function linkResidents(group: THREE.Object3D): () => void {
  const disposers = group.children.flatMap((root) => {
    const personId = root.userData?.communityId;
    if (typeof personId !== 'string') return [];
    const id = `resident-${personId}`;
    return [
      registerWorldInteractable({
        id,
        prompt: 'greet',
        centre: new THREE.Vector3(),
        radius: RESIDENT_AIM_RADIUS,
        reach: RESIDENT_REACH,
        follow: root,
        followHeight: RESIDENT_AIM_HEIGHT,
        activate: () => {
          const cards = useWorldCardStore.getState();
          if (cards.card?.kind === 'resident' && cards.card.personId === personId) {
            cards.close();
            return true;
          }
          cards.show({
            kind: 'resident',
            personId,
            task: String(root.userData.task ?? ''),
            interactableId: id,
          });
          return true;
        },
      }),
    ];
  });
  return () => disposers.forEach((dispose) => dispose());
}

const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/** A static farm model: its bounds give the aim sphere, once. */
function linkFarmModel(
  object: THREE.Object3D,
  id: string,
  prompt: 'windmillLesson' | 'henhouseInspection',
  activate: () => boolean
): () => void {
  object.updateWorldMatrix(true, true);
  _box.setFromObject(object);
  const centre = new THREE.Vector3();
  if (_box.isEmpty()) object.getWorldPosition(centre);
  else _box.getCenter(centre);
  const radius = _box.isEmpty() ? 1.5 : Math.max(1, Math.min(_box.getSize(_size).x, _size.z) / 2);
  return registerWorldInteractable({ id, prompt, centre, radius, reach: radius + 6, activate });
}

/** The windmill cutaway lesson, as a click on the model starts it (FarmArea). */
export function startWindmillLesson(): boolean {
  if (!useWindmillLearningStore.getState().ready) return false;
  openWorkspace();
  useProcessInspectionStore.getState().close();
  return useWindmillLearningStore.getState().start();
}

/** The henhouse inspection, as a click on the coop starts it (FarmArea). */
export function startHenhouseInspection(): boolean {
  if (!useProcessInspectionStore.getState().available.henhouse) return false;
  openWorkspace();
  return useProcessInspectionStore.getState().start('henhouse');
}

const live = (link: Link | null) => link !== null && link.object.parent !== null;

export function linkSceneInteractables(scene: THREE.Object3D | null | undefined): void {
  if (!scene) return;
  if (live(links.personnel) && live(links.windmill) && live(links.henhouse)) return;
  if (--countdown > 0) return;
  countdown = PROBE_FRAMES;
  const relink = (
    key: keyof typeof links,
    name: string,
    attach: (object: THREE.Object3D) => () => void
  ) => {
    if (live(links[key])) return;
    links[key]?.dispose();
    links[key] = null;
    const object = scene.getObjectByName(name);
    if (object) links[key] = { object, dispose: attach(object) };
  };
  relink('personnel', 'world-personnel', linkResidents);
  relink('windmill', 'farm-windmill', (o) =>
    linkFarmModel(o, 'farm-windmill', 'windmillLesson', startWindmillLesson)
  );
  relink('henhouse', 'farm-henhouse', (o) =>
    linkFarmModel(o, 'farm-henhouse', 'henhouseInspection', startHenhouseInspection)
  );
}

/** Forget every scene target (the controller is leaving first person). */
export function unlinkSceneInteractables(): void {
  for (const key of Object.keys(links) as (keyof typeof links)[]) {
    links[key]?.dispose();
    links[key] = null;
  }
  countdown = 0;
  useWorldCardStore.getState().close();
}
