import { translate } from '../i18n';
import { customerNameMessages } from './customerNames.messages';

/**
 * The stored customer string (CustomerOrder.customer) is canonical: saves, the
 * Chronicle's customerIdForName, agent text and ids keep it as written. Every
 * place a player reads a customer name goes through customerDisplayName (D17).
 * Working if a save naming "Community Pasta Works" reads as Community Polenta
 * Kitchen in both languages and the Chronicle still finds that account.
 */
export const CUSTOMER_DISPLAY_KEYS: Readonly<Record<string, keyof typeof customerNameMessages.en>> =
  {
    "Riverside Bakers' Cooperative": 'riverside',
    'Community Pasta Works': 'maizeMeal',
    'County School Meals': 'school',
  };

/** A stored customer name as the player reads it; an unknown name as stored. */
export function customerDisplayName(stored: string): string {
  const key = Object.prototype.hasOwnProperty.call(CUSTOMER_DISPLAY_KEYS, stored)
    ? CUSTOMER_DISPLAY_KEYS[stored]
    : undefined;
  return key ? translate(customerNameMessages, key) : stored;
}
