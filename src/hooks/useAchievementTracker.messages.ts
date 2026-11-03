import { defineMessages } from '../i18n';
import { achievementCopyNow } from '../stores/achievementsStore';

/** The bell's line for an unlock, from the achievement's id; '' (stored text) for an unknown one. */
const unlockedNotice = ({ id }: { id: string }): string => {
  const copy = achievementCopyNow(id);
  return copy ? `${copy.name} - ${copy.description}` : '';
};

/** Unlock toast and celebration; the achievement's own name and description come from its store. */
export const achievementTrackerMessages = defineMessages({
  en: {
    unlockedTitle: 'Achievement Unlocked',
    unlockedMessage: '{name} - {description}',
    unlockedNoticeMessage: unlockedNotice,
    unlockedCelebration: 'Achievement unlocked: {name}',
  },
  'pt-BR': {
    unlockedTitle: 'Conquista desbloqueada',
    unlockedMessage: '{name} - {description}',
    unlockedNoticeMessage: unlockedNotice,
    unlockedCelebration: 'Conquista desbloqueada: {name}',
  },
});
