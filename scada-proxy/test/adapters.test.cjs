const assert = require('node:assert/strict');
const test = require('node:test');
const { DataType } = require('node-opcua-client');

const { ModbusAdapter } = require('../dist/adapters/ModbusAdapter.js');
const { OPCUAAdapter } = require('../dist/adapters/OPCUAAdapter.js');

const holdingTag = (overrides = {}) => ({
  tagId: 'TEST.VALUE',
  slaveId: 1,
  registerType: 'holding',
  address: 0,
  count: 2,
  dataType: 'FLOAT32',
  ...overrides,
});

test('Modbus codecs round-trip byte and word orders', () => {
  const adapter = new ModbusAdapter('127.0.0.1');
  for (const config of [
    holdingTag(),
    holdingTag({ byteSwap: true }),
    holdingTag({ wordSwap: true }),
    holdingTag({ byteSwap: true, wordSwap: true }),
    holdingTag({ dataType: 'INT32' }),
    holdingTag({ dataType: 'INT32', byteSwap: true, wordSwap: true }),
  ]) {
    const value = config.dataType === 'FLOAT32' ? 123.25 : 0x1020304;
    const registers = adapter.valueToRegisters(value, config);
    assert.equal(adapter.convertValue(registers, config), value);
  }
});

test('Modbus serializes slave selection with each asynchronous operation', async () => {
  const adapter = new ModbusAdapter('127.0.0.1');
  const observations = [];
  let selectedSlave = 0;
  adapter.client = {
    isOpen: true,
    setID(id) {
      selectedSlave = id;
    },
    async readHoldingRegisters() {
      const atStart = selectedSlave;
      await new Promise((resolve) => setTimeout(resolve, 10));
      observations.push(['read', atStart, selectedSlave]);
      return { data: [0, 1] };
    },
    async writeRegisters() {
      const atStart = selectedSlave;
      await new Promise((resolve) => setTimeout(resolve, 1));
      observations.push(['write', atStart, selectedSlave]);
    },
  };
  adapter.connected = true;
  adapter.registerTag(holdingTag({ tagId: 'READ', slaveId: 1, dataType: 'INT32' }));
  adapter.registerTag(holdingTag({ tagId: 'WRITE', slaveId: 2, dataType: 'INT32' }));

  await Promise.all([adapter.readValues(['READ']), adapter.writeValue('WRITE', 3)]);
  assert.deepEqual(observations, [
    ['read', 1, 1],
    ['write', 2, 2],
  ]);
});

test('OPC-UA writes use the configured tag type rather than the JavaScript value shape', async () => {
  const adapter = new OPCUAAdapter('opc.tcp://127.0.0.1:4840');
  let request;
  adapter.session = {
    async write(candidate) {
      request = candidate;
      return { isGood: () => true };
    },
  };
  adapter.registerTag('FLOAT.TAG', 'ns=2;s=Float', 'FLOAT32');

  assert.equal(await adapter.writeValue('FLOAT.TAG', 1), true);
  assert.equal(request.value.value.dataType, DataType.Float);
});
