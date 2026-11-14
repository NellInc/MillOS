/**
 * The first-person card: what a resident answers E (or the phone's context
 * button) with, and the reading at the top of a silo ladder (report 04 P5,
 * plan 6.5 and 6.9).
 *
 * A resident card names a role, what the person is doing now, and for the
 * people in the agreed-adjustments register (D-058) each adjustment and who
 * it was agreed with by the register's own names (agreedAdjustments.messages.ts). It never names a condition or an
 * aid and holds no number about the person (D-008). It closes when the view
 * leaves the person.
 */
import React, { useEffect } from 'react';
import { formatGrouped, translate, useLocale, useT } from '../../i18n';
import { agreedAdjustmentsFor } from '../../simulation/agreedAdjustments';
import { agreedAdjustmentsMessages } from '../../simulation/agreedAdjustments.messages';
import { FORKLIFT_CREW_SITES } from '../../constants/forkliftCrewLayout';
import { useAimedInteractableStore } from '../../utils/worldInteractables';
import { useProductionStore } from '../../stores/productionStore';
import { useMaterialFlowStore } from '../../stores/materialFlowStore';
import { describeCommunityTask } from './communityTaskText';
import { worldCardMessages } from './WorldCard.messages';
import { useWorldCardStore } from './worldCardStore';

type CardKey = keyof typeof worldCardMessages.en;

const ROLE_KEYS: Readonly<Record<string, CardKey>> = {
  'mill-operator-west': 'roleMillOperatorWest',
  'mill-operator-east': 'roleMillOperatorEast',
  'mill-engineer': 'roleMillEngineer',
  'mill-quality': 'roleMillQuality',
  'mill-packer': 'roleMillPacker',
  'mill-supervisor': 'roleMillSupervisor',
  'village-baker': 'roleVillageBaker',
  'village-shopkeeper': 'roleVillageShopkeeper',
  'village-gardener': 'roleVillageGardener',
  'village-neighbour': 'roleVillageNeighbour',
  'village-courier': 'roleVillageCourier',
  'village-cyclist': 'roleVillageCyclist',
  'bus-arriving': 'rolePassenger',
  'bus-departing': 'rolePassenger',
  'mill-quality-bench': 'roleQualityBench',
  'mill-packing-quiet': 'rolePackingQuiet',
  'village-hall-clerk': 'roleHallClerk',
  'village-hall-officer': 'roleHallOfficer',
};

/** A resident's role in the active language; a forklift operator by their forklift. */
export function residentRole(personId: string): string {
  const site = FORKLIFT_CREW_SITES.find((s) => s.operatorId === personId);
  if (site) return translate(worldCardMessages, 'roleForkliftOperator', { tag: site.tag });
  return translate(worldCardMessages, ROLE_KEYS[personId] ?? 'roleResident');
}

const cardClass =
  'pointer-events-none absolute left-1/2 top-1/2 mt-20 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-white/10 bg-slate-900/85 px-4 py-3 text-left text-sm text-slate-200 shadow-lg';

const ResidentCard: React.FC<{ personId: string; task: string; interactableId: string }> = ({
  personId,
  task,
  interactableId,
}) => {
  const t = useT(worldCardMessages);
  useLocale();
  const aimedId = useAimedInteractableStore((s) => s.aimedId);
  useEffect(() => {
    if (aimedId !== interactableId) useWorldCardStore.getState().close();
  }, [aimedId, interactableId]);
  const agreement = agreedAdjustmentsFor(personId);
  // The register's own names (D-058), keyed by its ids. A quiet-room booking
  // is the room's schedule and is on the room's sign, not on this card.
  const name = useT(agreedAdjustmentsMessages);
  const doing = describeCommunityTask(task) ?? task;
  return (
    <section data-testid="resident-card" aria-live="polite" className={cardClass}>
      <h2 className="text-base font-semibold text-white">{residentRole(personId)}</h2>
      {doing && (
        <p className="mt-1">
          <span className="text-slate-400">{t('nowDoing')}: </span>
          {doing}
        </p>
      )}
      {agreement && (
        <div className="mt-2 border-t border-white/10 pt-2">
          <h3 className="text-xs font-semibold text-cyan-200">{t('agreedAdjustments')}</h3>
          <ul data-testid="resident-adjustments" className="mt-1 list-disc pl-5">
            {agreement.adjustments.map((id) => (
              <li key={id}>{name(id)}</li>
            ))}
          </ul>
          <p className="mt-1">
            <span className="text-slate-400">{t('agreedWith')}: </span>
            {name(agreement.agreedWith)}
          </p>
        </div>
      )}
    </section>
  );
};

const SiloCard: React.FC<{ siloId: string }> = ({ siloId }) => {
  const t = useT(worldCardMessages);
  useLocale();
  const name = useProductionStore(
    (s) => s.machines.find((machine) => machine.id === siloId)?.name ?? siloId
  );
  const buffer = useMaterialFlowStore((s) => s.machineBuffers.get(siloId));
  const byType = new Map<string, number>();
  for (const material of [...(buffer?.inputBuffer ?? []), ...(buffer?.outputBuffer ?? [])])
    byType.set(material.type, (byType.get(material.type) ?? 0) + material.amount);
  const total = [...byType.values()].reduce((a, b) => a + b, 0);
  const grain = [...byType.keys()]
    .map((type) => (type === 'wheat_grain' || type === 'corn_grain' ? t(type) : type))
    .join(', ');
  return (
    <section data-testid="silo-card" aria-live="polite" className={cardClass}>
      <h2 className="text-base font-semibold text-white">{name}</h2>
      <p className="mt-1">
        <span className="text-slate-400">{t('siloContents')}: </span>
        {total > 0 ? grain : t('siloEmpty')}
      </p>
      {buffer && (
        <p className="mt-1 font-mono">
          {t('siloAmount', {
            kg: formatGrouped(Math.round(total)),
            capacity: formatGrouped(buffer.outputCapacity),
          })}
        </p>
      )}
    </section>
  );
};

/** The open card, if any. Mounted inside the first-person crosshair overlay. */
export const WorldCard: React.FC = () => {
  const card = useWorldCardStore((s) => s.card);
  if (!card) return null;
  if (card.kind === 'silo') return <SiloCard siloId={card.siloId} />;
  return (
    <ResidentCard personId={card.personId} task={card.task} interactableId={card.interactableId} />
  );
};
