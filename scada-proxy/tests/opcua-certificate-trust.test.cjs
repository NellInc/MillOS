const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

// Isolate native default-PKI paths before loading NodeOPCUA, on all supported hosts.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'millos-opcua-trust-'));
const home = path.join(scratch, 'home');
fs.mkdirSync(home);
for (const name of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'XDG_CONFIG_HOME']) {
  process.env[name] = home;
}
const api = require('node-opcua-client');
const clientRequire = createRequire(require.resolve('node-opcua-client/package.json'));
const { CertificateAuthority } = clientRequire('node-opcua-pki');
const crypto = clientRequire('node-opcua-crypto');
const { OPCUAAdapter } = require('../dist/adapters/OPCUAAdapter');
const originalEnv = process.env.NODE_ENV;
after(() => {
  if (originalEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnv;
  fs.rmSync(scratch, { recursive: true, force: true });
});

async function captureRealManager(t, environment) {
  if (environment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = environment;
  const nativeCreate = api.OPCUAClient.create;
  const transportStopped = new Error('test stops before transport, no endpoint contacted');
  let client;
  let originalRoot;
  let flagAtTransport;
  t.mock.method(api.OPCUAClient, 'create', function (options) {
    client = nativeCreate.call(this, options);
    originalRoot = client.clientCertificateManager.rootDir;
    // Only transport is intercepted. The client, manager and certificate checks are real.
    t.mock.method(client, 'connect', async () => {
      flagAtTransport = client.clientCertificateManager.automaticallyAcceptUnknownCertificate;
      throw transportStopped;
    });
    return client;
  });
  const adapter = new OPCUAAdapter('opc.tcp://unused.invalid:4840');
  t.after(async () => {
    await adapter.disconnect();
    await client.clientCertificateManager.dispose();
  });
  await assert.rejects(adapter.connect(), (error) => error === transportStopped);
  assert.equal(adapter.isConnected(), false);
  assert.equal(adapter.getStatus().reconnectAttempts, 1);
  assert.equal(adapter.getStatus().lastError, transportStopped.message);
  assert.equal(client.clientCertificateManager.rootDir, originalRoot);
  assert.equal(path.basename(originalRoot), 'PKI');
  assert.ok(path.relative(home, originalRoot).split(path.sep)[0] !== '..');
  assert.equal(client.securityMode, environment === 'development' ? 1 : 3);
  return { manager: client.clientCertificateManager, flagAtTransport };
}

for (const environment of ['production', undefined, 'test', 'development']) {
  test('trust is configured before transport: ' + String(environment), async (t) => {
    const { flagAtTransport } = await captureRealManager(t, environment);
    assert.equal(flagAtTransport, environment === 'development');
  });
}

test('production rejects unknown trust and missing CRLs; explicit valid trust remains usable', async (t) => {
  const { manager, flagAtTransport } = await captureRealManager(t, 'production');
  assert.equal(flagAtTransport, false);
  await manager.initialize();
  const selfFile = path.join(scratch, 'self.pem');
  const parameters = {
    applicationUri: 'urn:millos:test:server',
    subject: '/CN=MillOS Local Certificate Test',
    dns: ['localhost'],
    ip: ['127.0.0.1'],
    startDate: new Date(Date.now() - 60_000),
    validity: 2
  };
  await manager.createSelfSignedCertificate({ ...parameters, outputFile: selfFile });
  const self = crypto.readCertificate(selfFile);
  assert.equal((await manager.checkCertificate(self)).value, api.StatusCodes.BadCertificateUntrusted.value);
  assert.equal((await manager.getTrustStatus(self)).value, api.StatusCodes.BadCertificateUntrusted.value);
  await manager.trustCertificate(self);
  assert.equal((await manager.checkCertificate(self)).value, api.StatusCodes.Good.value);

  const ca = new CertificateAuthority({
    location: path.join(scratch, 'ca'),
    keySize: 2048,
    subject: '/CN=MillOS Local Test CA'
  });
  await ca.initialize();
  const csr = await manager.createCertificateRequest(parameters);
  const leafFile = path.join(scratch, 'issued.pem');
  await ca.signCertificateRequest(leafFile, csr, parameters);
  const chain = crypto.readCertificateChain(leafFile);
  const leaf = chain[0];
  const issuer = crypto.readCertificate(ca.caCertificate);
  assert.equal(await manager.addIssuer(issuer, true, true), 'Good');
  const derChain = Buffer.concat([leaf, issuer]);
  assert.equal(
    (await manager.checkCertificate(derChain)).value,
    api.StatusCodes.BadCertificateRevocationUnknown.value
  );
  assert.notEqual((await manager.getTrustStatus(leaf)).value, api.StatusCodes.Good.value);
  assert.equal(
    await manager.addRevocationList(await crypto.readCertificateRevocationList(ca.revocationList)),
    'Good'
  );
  assert.equal((await manager.checkCertificate(derChain)).value, api.StatusCodes.Good.value);

  await ca.revokeCertificate(leafFile, { reason: 'keyCompromise' });
  await manager.clearRevocationLists('all');
  assert.equal(
    await manager.addRevocationList(await crypto.readCertificateRevocationList(ca.revocationList)),
    'Good'
  );
  assert.equal((await manager.checkCertificate(derChain)).value, api.StatusCodes.BadCertificateRevoked.value);
});

test('development retains native automatic acceptance for an unknown self-signed certificate', async (t) => {
  const { manager, flagAtTransport } = await captureRealManager(t, 'development');
  assert.equal(flagAtTransport, true);
  await manager.initialize();
  const file = path.join(scratch, 'development.pem');
  await manager.createSelfSignedCertificate({
    applicationUri: 'urn:millos:test:development',
    subject: '/CN=MillOS Development Test',
    dns: ['localhost'],
    startDate: new Date(Date.now() - 60_000),
    validity: 2,
    outputFile: file
  });
  const certificate = crypto.readCertificate(file);
  assert.equal((await manager.checkCertificate(certificate)).value, api.StatusCodes.Good.value);
  assert.equal((await manager.getTrustStatus(certificate)).value, api.StatusCodes.Good.value);
});
