const assert = require('node:assert/strict');
const test = require('node:test');

const { parseTagDefinitions } = require('../dist/TagRegistry.js');
const { validateWrite } = require('../dist/validation.js');

const writable = (overrides = {}) => ({
  id: 'TEST.VALUE',
  name: 'Test Value',
  protocol: 'opcua',
  address: 'ns=2;s=Test.Value',
  dataType: 'FLOAT32',
  accessMode: 'READ_WRITE',
  engLow: 0,
  engHigh: 100,
  ...overrides,
});

test('validateWrite rejects unsafe coercion and out-of-range values', () => {
  assert.deepEqual(validateWrite(writable(), 50), { ok: true, value: 50 });
  assert.equal(validateWrite(writable(), 101).ok, false);
  assert.equal(validateWrite(writable({ dataType: 'INT16' }), 1.5).ok, false);
  assert.equal(validateWrite(writable({ dataType: 'INT16', engHigh: undefined }), 40000).ok, false);
  assert.equal(validateWrite(writable({ accessMode: 'READ' }), 50).ok, false);
  assert.equal(validateWrite(writable({ dataType: 'STRING' }), 'x'.repeat(1025)).ok, false);
});

test('parseTagDefinitions validates structure, uniqueness, bounds, and Modbus addressing', () => {
  assert.equal(parseTagDefinitions([writable()]).length, 1);
  assert.throws(() => parseTagDefinitions([]));
  assert.throws(() => parseTagDefinitions([writable(), writable()]));
  assert.throws(() => parseTagDefinitions([writable({ engLow: 10, engHigh: 5 })]));
  assert.throws(() =>
    parseTagDefinitions([
      writable({
        protocol: 'modbus',
        address: '40001',
        modbusRegister: 'holding',
        modbusOffset: -1,
        modbusSlave: 1,
      }),
    ])
  );
  assert.throws(() =>
    parseTagDefinitions([
      writable({
        protocol: 'modbus',
        dataType: 'FLOAT32',
        address: '00001',
        modbusRegister: 'coil',
        modbusOffset: 0,
        modbusSlave: 1,
      }),
    ])
  );
  assert.throws(() =>
    parseTagDefinitions([
      writable({
        protocol: 'modbus',
        dataType: 'BOOL',
        accessMode: 'READ_WRITE',
        address: '10001',
        modbusRegister: 'discrete',
        modbusOffset: 0,
        modbusSlave: 1,
      }),
    ])
  );
  assert.throws(() =>
    parseTagDefinitions([
      writable({
        protocol: 'modbus',
        address: '40001',
        modbusRegister: 'holding',
        modbusOffset: 0,
        modbusSlave: 1,
        modbusByteSwap: 'yes',
      }),
    ])
  );
});
