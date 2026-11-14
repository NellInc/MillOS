/**
 * Every task a resident can be doing has words in both languages (report 04
 * F7: the tasks were English `userData` only, never shown, never translated).
 * Two nets: a sweep of every roster person over two days against each plant
 * condition the work response reads, and a scan of the task literals in the
 * source, so a task added later fails here until it is written in both.
 */
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../i18n';
import {
  COMMUNITY_ROSTER,
  communityWorkResponse,
  createCommunityPose,
  sampleCommunityPerson,
  type CommunityOperationsSnapshot,
} from '../../simulation/communityLife';
import { FORKLIFT_CREW_SITES } from '../../constants/forkliftCrewLayout';
import { describeCommunityTask } from './communityTaskText';

afterEach(() => setLocale('en'));

const machineIds = [
  ...new Set(COMMUNITY_ROSTER.map((p) => p.machineId).filter(Boolean)),
] as string[];
const PHASES = [
  'diagnosed',
  'awaiting_parts',
  'repairing',
  'verification',
  'ready_to_restart',
  'restart_requested',
  'returned_to_service',
] as const;
const OPERATIONS: CommunityOperationsSnapshot[] = [
  { machines: [], workOrders: [], batches: [], bakeryStocked: false },
  {
    machines: machineIds.map((id) => ({ id, status: 'running' as const })),
    workOrders: [],
    batches: [{ packerId: 'packer-0', availableKg: 100, disposition: 'released' }],
    bakeryStocked: true,
    weather: 'rain',
  },
  {
    machines: machineIds.map((id) => ({ id, status: 'idle' as const })),
    workOrders: [],
    batches: [{ packerId: 'packer-0', availableKg: 100, disposition: 'hold' }],
    bakeryStocked: true,
    weather: 'storm',
  },
  {
    machines: machineIds.map((id) => ({ id, status: 'warning' as const })),
    workOrders: [],
    batches: [],
    recalledStockKg: 5,
    bakeryStocked: true,
  },
  ...PHASES.map((phase) => ({
    machines: [],
    workOrders: machineIds.map((machineId) => ({ machineId, phase })),
    batches: [],
    bakeryStocked: true,
  })),
];

function sweptTasks(): Set<string> {
  const tasks = new Set<string>();
  const pose = createCommunityPose();
  for (const person of COMMUNITY_ROSTER)
    for (let hour = 0; hour < 48; hour += 0.02) {
      sampleCommunityPerson(person, hour, pose);
      if (pose.task) tasks.add(pose.task);
      for (const operations of OPERATIONS) {
        const response = communityWorkResponse(person, pose, operations);
        if (response.task) tasks.add(response.task);
      }
    }
  return tasks;
}

/** Tasks CommunityLife.tsx writes itself, and the shift agreement's forms. */
const SCENE_TASKS = [
  'Holding safely for the site safety stop',
  'Greeting a passing neighbour',
  'A moment outside the shop',
  ...FORKLIFT_CREW_SITES.flatMap(({ tag }) => [
    `Driving ${tag}`,
    `Climbing into ${tag}`,
    `Climbing out of ${tag}`,
    `Waiting for ${tag}`,
  ]),
  'Attending a paid handoff briefing at the existing safe observation post',
  'Representing the qualified Packing agreement at a safe observation post',
  'Walking the safe route; Representing the qualified Pallet checks agreement at a safe observation post',
  'Protected rest under the fictional shift agreement',
  'Protected recovery under the fictional shift agreement',
  'Voluntary cover under the fictional shift agreement',
  'Agreed: Awaiting a qualified assignment under the fictional shift agreement',
];

/** Capitalised literals in communityLife.ts that are not tasks. */
const NOT_TASKS = new Set([
  'Shopkeeper',
  'Passenger',
  'ROUTE INFORMATION',
  'SERVICE HOURS\\n06:00 TO 22:00',
  'BUS AT THE STOP',
  'BUS ON ROUTE',
  'Packing',
  'Pallet checks',
  'Awaiting a qualified assignment',
  'Protected recovery',
  'Protected rest',
  'Voluntary cover',
  'Paid handoff briefing',
  'Gardener',
  'Baker',
  'Quality',
  'Operator',
  'Engineer',
  'Supervisor',
  'Resident',
  'Logistics',
  'Cyclist',
  'SkinnedMesh',
  "Riverside Bakers' Cooperative",
]);

function sourceTasks(): string[] {
  const source = readFileSync('src/simulation/communityLife.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  return [...source.matchAll(/'([A-Z][^'\n]*)'|"([A-Z][^"\n]*)"/g)]
    .map((m) => m[1] ?? m[2])
    .filter((literal) => !NOT_TASKS.has(literal));
}

describe('resident tasks in both languages', () => {
  const tasks = [...new Set([...sweptTasks(), ...SCENE_TASKS, ...sourceTasks()])];

  it('finds the tasks it checks', () => {
    expect(tasks.length).toBeGreaterThan(50);
    expect(tasks).toContain('Break in the quiet room');
    expect(tasks).toContain('Waiting for maintenance parts');
  });

  it('describes every task in English and in Portuguese', () => {
    const missing: string[] = [];
    for (const task of tasks) {
      setLocale('en');
      const english = describeCommunityTask(task);
      setLocale('pt-BR');
      const portuguese = describeCommunityTask(task);
      if (english === null || portuguese === null) missing.push(task);
      else expect(portuguese, task).not.toBe(english);
    }
    expect(missing).toEqual([]);
  });

  it('renders English as the scene writes it', () => {
    setLocale('en');
    for (const task of tasks.filter((t) => !/fictional shift agreement|Agreed:/.test(t)))
      expect(describeCommunityTask(task)).toBe(task);
  });
});
