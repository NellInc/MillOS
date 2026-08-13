const assert = require('node:assert/strict');
const test = require('node:test');

const {
  MAX_WS_SUBSCRIPTIONS,
  applySubscriptionChange,
  isTagSubscribed,
  validateSubscriptionTagIds,
} = require('../dist/subscriptions.js');

test('subscription validation deduplicates known bounded tag identifiers', () => {
  const result = validateSubscriptionTagIds(
    ['RM101.ST001.PV', 'RM101.ST001.PV', 'SILO_ALPHA.LT001.PV'],
    (tagId) => tagId !== 'unknown'
  );
  assert.deepEqual(result, {
    ok: true,
    tagIds: ['RM101.ST001.PV', 'SILO_ALPHA.LT001.PV'],
  });
});

test('subscription validation rejects unknown, oversized, and malformed requests', () => {
  assert.deepEqual(
    validateSubscriptionTagIds(['unknown'], () => false),
    {
      ok: false,
      error: 'Unknown tag unknown',
    }
  );
  assert.equal(
    validateSubscriptionTagIds(new Array(MAX_WS_SUBSCRIPTIONS + 1).fill('tag'), () => true).ok,
    false
  );
  assert.equal(validateSubscriptionTagIds([''], () => true).ok, false);
  assert.equal(validateSubscriptionTagIds('tag', () => true).ok, false);
});

test('unsubscribe removes update delivery eligibility', () => {
  const subscriptions = new Set();
  applySubscriptionChange(subscriptions, 'subscribe', ['RM101.ST001.PV', 'RM101.TT001.PV']);
  assert.equal(isTagSubscribed(subscriptions, 'RM101.ST001.PV'), true);

  applySubscriptionChange(subscriptions, 'unsubscribe', ['RM101.ST001.PV']);
  assert.equal(isTagSubscribed(subscriptions, 'RM101.ST001.PV'), false);
  assert.equal(isTagSubscribed(subscriptions, 'RM101.TT001.PV'), true);
  assert.equal(isTagSubscribed(undefined, 'RM101.TT001.PV'), false);
});

test('additive subscriptions cannot exceed the per-client limit', () => {
  const subscriptions = new Set(
    Array.from({ length: MAX_WS_SUBSCRIPTIONS }, (_, index) => `tag-${index}`)
  );

  assert.equal(applySubscriptionChange(subscriptions, 'subscribe', ['tag-new']), false);
  assert.equal(subscriptions.size, MAX_WS_SUBSCRIPTIONS);
  assert.equal(subscriptions.has('tag-new'), false);
  assert.equal(applySubscriptionChange(subscriptions, 'subscribe', ['tag-0']), true);
  assert.equal(subscriptions.size, MAX_WS_SUBSCRIPTIONS);
});
