import type { WorkplaceState } from '../types/workplace';
import type { WorkplaceCommand } from './bilateralWorkplace';
import { translate } from '../i18n';
import { workplaceParticipationMessages as msg } from './workplaceParticipation.messages';

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
      prompt: translate(msg, 'mandatePrompt'),
      correct: state.aiAuthority,
      options: [
        { value: 'advice', label: translate(msg, 'mandateAdvice') },
        { value: 'bounded', label: translate(msg, 'mandateBounded') },
        { value: 'unlimited', label: translate(msg, 'mandateUnlimited') },
      ],
      clarification:
        state.aiAuthority === 'advice'
          ? translate(msg, 'mandateClarifyAdvice')
          : translate(msg, 'mandateClarifyBounded'),
    },
    {
      id: 'refusal' as const,
      prompt: translate(msg, 'refusalPrompt'),
      correct: 'retained',
      options: [
        { value: 'retained', label: translate(msg, 'refusalRetained') },
        { value: 'forfeit', label: translate(msg, 'refusalForfeit') },
      ],
      clarification: translate(msg, 'refusalClarify'),
    },
    {
      id: 'duty' as const,
      prompt: translate(msg, 'dutyPrompt'),
      correct: 'separate',
      options: [
        { value: 'separate', label: translate(msg, 'dutySeparate') },
        { value: 'automatic', label: translate(msg, 'dutyAutomatic') },
      ],
      clarification: translate(msg, 'dutyClarify'),
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
