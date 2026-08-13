const assert = require('node:assert/strict');
const test = require('node:test');

const {
  decodeWebSocketKeyProtocol,
  isOriginAllowed,
  parseAllowedOrigins,
  parseBooleanFlag,
  parseBoundedInteger,
  safeKeyEqual,
} = require('../dist/security.js');

test('safeKeyEqual compares complete keys without accepting missing or unequal values', () => {
  assert.equal(safeKeyEqual('secret', 'secret'), true);
  assert.equal(safeKeyEqual('secret', 'secreu'), false);
  assert.equal(safeKeyEqual('short', 'longer'), false);
  assert.equal(safeKeyEqual(undefined, 'secret'), false);
});

test('parseBoundedInteger rejects fractional, malformed, and out-of-range settings', () => {
  assert.equal(parseBoundedInteger(undefined, 3001, 1, 65535), 3001);
  assert.equal(parseBoundedInteger('4173', 3001, 1, 65535), 4173);
  assert.throws(() => parseBoundedInteger('12.5', 3001, 1, 65535));
  assert.throws(() => parseBoundedInteger('not-a-number', 3001, 1, 65535));
  assert.throws(() => parseBoundedInteger('70000', 3001, 1, 65535));
});

test('parseBooleanFlag accepts only explicit boolean strings', () => {
  assert.equal(parseBooleanFlag(undefined, false), false);
  assert.equal(parseBooleanFlag('true', false), true);
  assert.equal(parseBooleanFlag('false', true), false);
  assert.throws(() => parseBooleanFlag('1', false));
  assert.throws(() => parseBooleanFlag('TRUE', false));
});

test('allowed origins are exact, deduplicated HTTP origins and never wildcarded', () => {
  assert.deepEqual(
    parseAllowedOrigins('https://www.millos.net,https://www.millos.net', ['http://localhost:3000']),
    ['http://localhost:3000', 'https://www.millos.net']
  );
  assert.throws(() => parseAllowedOrigins('*', []));
  assert.throws(() => parseAllowedOrigins('https://example.com/path', []));
  assert.equal(isOriginAllowed('https://www.millos.net', ['https://www.millos.net'], true), true);
  assert.equal(isOriginAllowed(undefined, [], true), false);
  assert.equal(isOriginAllowed(undefined, [], false), true);
});

test('WebSocket key protocols decode base64url credentials', () => {
  const encoded = Buffer.from('shared-secret', 'utf8').toString('base64url');
  assert.equal(
    decodeWebSocketKeyProtocol(`millos-scada, millos-scada-key.${encoded}`),
    'shared-secret'
  );
  assert.equal(decodeWebSocketKeyProtocol('millos-scada'), null);
});
