/**
 * A resident's task, as the scene writes it (English diagnostic data in
 * `userData.task`), in the active language for the resident card. Fixed tasks
 * are looked up whole; the forklift crew's and the shift agreement's tasks
 * carry a value and are matched by their pattern.
 */
import { translate } from '../../i18n';
import { communityAgreementMessages } from '../../simulation/communityLife.messages';
import { COMMUNITY_TASK_KEYS, communityTaskMessages } from './communityTask.messages';

const AGREEMENT_LABEL_KEYS: Readonly<
  Record<string, 'protectedRecovery' | 'protectedRest' | 'voluntaryCover' | 'paidBriefing'>
> = {
  'Protected recovery': 'protectedRecovery',
  'Protected rest': 'protectedRest',
  'Voluntary cover': 'voluntaryCover',
  'Paid handoff briefing': 'paidBriefing',
};

const agreementTask = (value: string) => translate(communityAgreementMessages, 'task', { value });

function agreementLabel(label: string): string | null {
  const key = AGREEMENT_LABEL_KEYS[label];
  if (key) return translate(communityAgreementMessages, key);
  const agreed = /^Agreed: (.+)$/.exec(label);
  if (!agreed) return null;
  return translate(communityAgreementMessages, 'agreed', {
    task:
      agreed[1] === 'Awaiting a qualified assignment'
        ? translate(communityAgreementMessages, 'awaitingAssignment')
        : agreementTask(agreed[1]),
  });
}

/** The task in the active language, or null when it is not a known task. */
export function describeCommunityTask(task: string): string | null {
  const key = COMMUNITY_TASK_KEYS[task];
  if (key) return translate(communityTaskMessages, key);
  const safe = /^Walking the safe route; (.+)$/.exec(task);
  if (safe) {
    const rest = describeCommunityTask(safe[1]);
    return rest === null ? null : translate(communityTaskMessages, 'safeRoute', { task: rest });
  }
  const representing =
    /^Representing the qualified (.+) agreement at a safe observation post$/.exec(task);
  if (representing)
    return translate(communityTaskMessages, 'representing', {
      task: agreementTask(representing[1]),
    });
  const under = /^(.+) under the fictional shift agreement$/.exec(task);
  if (under) {
    const label = agreementLabel(under[1]);
    return label === null ? null : translate(communityTaskMessages, 'underAgreement', { label });
  }
  for (const [pattern, key] of CREW_PATTERNS) {
    const match = pattern.exec(task);
    if (match) return translate(communityTaskMessages, key, { tag: match[1] });
  }
  return null;
}

/** The crew tasks (CommunityLife.tsx CREW_TASKS and the operator routine), by forklift tag. */
const CREW_PATTERNS: readonly (readonly [
  RegExp,
  'driving' | 'climbingIn' | 'climbingOut' | 'waitingForForklift',
])[] = [
  [/^Driving (FLT\d+)$/, 'driving'],
  [/^Climbing into (FLT\d+)$/, 'climbingIn'],
  [/^Climbing out of (FLT\d+)$/, 'climbingOut'],
  [/^Waiting for (FLT\d+)$/, 'waitingForForklift'],
];
