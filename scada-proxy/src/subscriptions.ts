export const MAX_WS_SUBSCRIPTIONS = 256;

export type SubscriptionOperation = 'subscribe' | 'unsubscribe';

export type SubscriptionValidation = { ok: true; tagIds: string[] } | { ok: false; error: string };

export function validateSubscriptionTagIds(
  input: unknown,
  tagExists: (tagId: string) => boolean
): SubscriptionValidation {
  if (
    !Array.isArray(input) ||
    input.length > MAX_WS_SUBSCRIPTIONS ||
    !input.every((tagId) => typeof tagId === 'string' && tagId.length > 0 && tagId.length <= 128)
  ) {
    return {
      ok: false,
      error: `tagIds must be an array of at most ${MAX_WS_SUBSCRIPTIONS} non-empty strings up to 128 characters`,
    };
  }

  const tagIds = [...new Set(input as string[])];
  const unknownTagId = tagIds.find((tagId) => !tagExists(tagId));
  if (unknownTagId) return { ok: false, error: `Unknown tag ${unknownTagId}` };

  return { ok: true, tagIds };
}

export function applySubscriptionChange(
  subscriptions: Set<string>,
  operation: SubscriptionOperation,
  tagIds: readonly string[]
): boolean {
  if (operation === 'subscribe') {
    const additional = tagIds.reduce(
      (count, tagId) => count + (subscriptions.has(tagId) ? 0 : 1),
      0
    );
    if (subscriptions.size + additional > MAX_WS_SUBSCRIPTIONS) return false;
  }

  for (const tagId of tagIds) {
    if (operation === 'subscribe') subscriptions.add(tagId);
    else subscriptions.delete(tagId);
  }
  return true;
}

export function isTagSubscribed(subscriptions: Set<string> | undefined, tagId: string): boolean {
  return subscriptions?.has(tagId) ?? false;
}
