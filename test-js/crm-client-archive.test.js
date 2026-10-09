const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

function load(relativePath, mocks) {
  const file = path.resolve(__dirname, "..", relativePath);
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (Object.hasOwn(mocks, request)) return mocks[request];
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(file)];
    return require(file);
  } finally {
    Module._load = originalLoad;
  }
}

function mutationHarness(relativePath, returningRows) {
  const queries = [];
  const client = {
    query: async (sql, params = []) => {
      queries.push({ sql: String(sql), params });
      if (/RETURNING id/.test(String(sql))) return { rows: returningRows };
      return { rows: [] };
    },
    release() {},
  };
  class PoolMock {
    async connect() { return client; }
  }
  const { handler } = load(relativePath, {
    pg: { Pool: PoolMock },
    "./crm-auth": {
      requireCrmClient: async () => ({
        crmAgentId: "agent-owner",
        agent: { id: "agent-user" },
      }),
    },
    "./services/crm-vitalink-import": {
      ensureVitalinkImportSchema: async () => {},
    },
  });
  return { handler, queries };
}

const postEvent = {
  httpMethod: "POST",
  headers: { "user-agent": "test" },
  body: JSON.stringify({ id: "client-1" }),
};

test("archive retains every related record and writes an audit event", async () => {
  const harness = mutationHarness(
    "netlify/functions/delete-crm-client.js",
    [{ id: "client-1" }],
  );
  const response = await harness.handler(postEvent);

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).archived, true);
  assert.equal(harness.queries.some(({ sql }) => /\bDELETE\b/i.test(sql)), false);
  assert.equal(harness.queries.some(({ sql }) => /UPDATE crm_clients/.test(sql)), true);
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO crm_audit_log/.test(sql) && /client_archived/.test(sql)),
    true,
  );
  assert.equal(
    harness.queries.some(({ sql }) => /crm_tasks|crm_appointments|crm_vitalink_packages|crm_client_documents/.test(sql)),
    false,
  );
});

test("restore is owner-scoped and audit logged without deleting anything", async () => {
  const harness = mutationHarness(
    "netlify/functions/restore-crm-client.js",
    [{ id: "client-1" }],
  );
  const response = await harness.handler(postEvent);

  assert.equal(response.statusCode, 200);
  assert.equal(JSON.parse(response.body).restored, true);
  const restore = harness.queries.find(({ sql }) => /UPDATE crm_clients/.test(sql));
  assert.match(restore.sql, /agent_id=\$2/);
  assert.match(restore.sql, /archived_at IS NOT NULL/);
  assert.equal(harness.queries.some(({ sql }) => /\bDELETE\b/i.test(sql)), false);
  assert.equal(
    harness.queries.some(({ sql }) => /INSERT INTO crm_audit_log/.test(sql) && /client_restored/.test(sql)),
    true,
  );
});

async function listQuery(archived) {
  const queries = [];
  class PoolMock {
    async query(sql, params = []) {
      queries.push({ sql: String(sql), params });
      return { rows: [] };
    }
  }
  const { handler } = load("netlify/functions/get-crm-clients.js", {
    pg: { Pool: PoolMock },
    "./crm-auth": {
      requireCrmAgent: async () => ({ crmAgentId: "agent-owner" }),
    },
    "./services/crm-vitalink-import": {
      ensureVitalinkImportSchema: async () => {},
      DOCUMENT_TYPES: { SOA: "soa", HIPAA: "hipaa", HIPAA_SOA: "hipaa_soa" },
    },
  });
  const response = await handler({
    queryStringParameters: {
      agent_id: "agent-owner",
      archived: archived ? "true" : "false",
    },
  });
  return { response, queries };
}

test("normal client lists hide archived clients", async () => {
  const { response, queries } = await listQuery(false);
  assert.equal(response.statusCode, 200);
  const select = queries.find(({ sql }) => /FROM crm_clients c/.test(sql));
  assert.match(select.sql, /c\.archived_at IS NULL/);
});

test("archived client recall returns only the agent's archived clients", async () => {
  const { response, queries } = await listQuery(true);
  assert.equal(response.statusCode, 200);
  const select = queries.find(({ sql }) => /FROM crm_clients c/.test(sql));
  assert.match(select.sql, /c\.agent_id::text = \$1::text/);
  assert.match(select.sql, /c\.archived_at IS NOT NULL/);
});
