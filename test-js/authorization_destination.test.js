const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

test('a withdrawn authorization cannot prepare a quoting destination', async () => {
  const file = path.resolve(__dirname, '../netlify/functions/services/crm-destinations.js');
  const original = Module._load;
  let queryCount = 0;
  Module._load = function (request, parent, isMain) {
    if (request === './db') return { query: async () => {
      queryCount++;
      return { rows: [{ id: 'client-1', authorization_revoked_at: '2026-09-22T12:00:00Z' }] };
    } };
    if (request === './crm-vitalink-import') return {
      AUDIT_EVENTS: {},
      DOCUMENT_TYPES: { HIPAA: 'hipaa', SOA: 'soa' },
      ensureVitalinkImportSchema: async () => {},
      logCrmAuditEvent: async () => {},
    };
    return original.call(this, request, parent, isMain);
  };
  let prepareDestinationPackage;
  try {
    delete require.cache[require.resolve(file)];
    ({ prepareDestinationPackage } = require(file));
  } finally {
    Module._load = original;
  }
  const result = await prepareDestinationPackage({
    crmAgentId: 'agent-1',
    crmClientId: 'client-1',
    destination: 'sunfire',
  });
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 409);
  assert.match(result.error, /withdrew/);
  assert.equal(queryCount, 1);
});

test('the recorded withdrawal blocks prep if the CRM mirror is stale', async () => {
  const file = path.resolve(__dirname, '../netlify/functions/services/crm-destinations.js');
  const original = Module._load;
  let queryCount = 0;
  Module._load = function (request, parent, isMain) {
    if (request === './db') return { query: async () => {
      queryCount++;
      return { rows: [{ id: 'client-1', authorization_revoked_at: null }] };
    } };
    if (request === './crm-authorization-status') return {
      getRecordedRevocation: async () => '2026-09-22T12:00:00Z',
    };
    if (request === './crm-vitalink-import') return {
      AUDIT_EVENTS: {},
      DOCUMENT_TYPES: { HIPAA: 'hipaa', SOA: 'soa' },
      ensureVitalinkImportSchema: async () => {},
      logCrmAuditEvent: async () => {},
    };
    return original.call(this, request, parent, isMain);
  };
  let prepareDestinationPackage;
  try {
    delete require.cache[require.resolve(file)];
    ({ prepareDestinationPackage } = require(file));
  } finally {
    Module._load = original;
  }
  const result = await prepareDestinationPackage({
    crmAgentId: 'agent-1',
    crmClientId: 'client-1',
    destination: 'sunfire',
  });
  assert.equal(result.statusCode, 409);
  assert.equal(queryCount, 1);
});
