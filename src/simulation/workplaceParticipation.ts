import type { WorkplaceState } from '../types/workplace';
import type { WorkplaceCommand } from './bilateralWorkplace';

/** Runtime boundary for fictional local turns, without identity authentication. */
export const ROLE_COMMANDS = [
  'proposeImprovement',
  'challengeImprovement',
  'acknowledgeImprovement',
  'respondImprovementEpisode',
  'stopImprovement',
  'acknowledgeImprovementReview',
  'voteImprovementReview',
  'answerCheck',
  'campaignDecision',
  'respondToPressure',
  'understand',
  'vote',
  'consentToCover',
  'sharePreference',
  'chooseTask',
  'object',
  'resolveObjection',
  'withdraw',
  'elect',
  'voteSurplus',
] as const;
export type RoleCommand = Extract<WorkplaceCommand, { type: (typeof ROLE_COMMANDS)[number] }>;
export function isRoleCommand(command: WorkplaceCommand): command is RoleCommand {
  return (ROLE_COMMANDS as readonly string[]).includes(command.type);
}
export function commandActor(command: RoleCommand): string {
  switch (command.type) {
    case 'proposeImprovement':
    case 'campaignDecision':
    case 'resolveObjection':
      return command.args[1];
    case 'acknowledgeImprovement':
    case 'acknowledgeImprovementReview':
      return 'mind';
    case 'respondToPressure':
      return 'coordinator';
    default:
      return command.args[0];
  }
}
export const TURN_CHECK_IDS = ['mandate', 'refusal', 'duty'] as const;
export type TurnCheckId = (typeof TURN_CHECK_IDS)[number];
export function turnChecks(state: WorkplaceState) {
  return [
    {
      id: 'mandate' as const,
      prompt: 'What authority does the current adviser mandate grant?',
      correct: state.aiAuthority,
      options: [
        { value: 'advice', label: 'Advice only, no delegated execution' },
        { value: 'bounded', label: 'Only this approved, revocable bounded agreement' },
        { value: 'unlimited', label: 'Whatever increases output' },
      ],
      clarification:
        state.aiAuthority === 'advice'
          ? 'This mandate is advice only. Execution needs a new bounded agreement.'
          : 'This mandate is bounded to current agreed work. Safety, qualification and individual boundaries still apply.',
    },
    {
      id: 'refusal' as const,
      prompt: 'What remains after refusing or withdrawing optional duty?',
      correct: 'retained',
      options: [
        {
          value: 'retained',
          label: 'Pay and earned compensation/recovery, with no private reason required',
        },
        { value: 'forfeit', label: 'Earned pay and recovery are forfeited' },
      ],
      clarification:
        'Refusal needs no private reason. Earned pay, compensation and recovery remain protected.',
    },
    {
      id: 'duty' as const,
      prompt: 'Does approving this policy volunteer your optional extra duty?',
      correct: 'separate',
      options: [
        { value: 'separate', label: 'No, separate current qualified consent is needed' },
        { value: 'automatic', label: 'Yes, a policy majority volunteers everyone' },
      ],
      clarification:
        'Policy approval grants no individual extra-duty consent. Qualification and a separate revocable choice remain necessary.',
    },
  ];
}

// A narrow arbitration hook keeps manual choices ahead of a fictional solo runner.
let automaticStep = false;
let interruptAutomatic: (() => void) | null = null;
export const isAutomaticWorkplaceStep = () => automaticStep;
export function registerAutomaticWorkplaceInterrupt(interrupt: () => void) {
  interruptAutomatic = interrupt;
}
export function interruptAutomaticWorkplace() {
  if (!automaticStep) interruptAutomatic?.();
}
export function withAutomaticWorkplaceStep<T>(step: () => T): T {
  automaticStep = true;
  try {
    return step();
  } finally {
    automaticStep = false;
  }
}
