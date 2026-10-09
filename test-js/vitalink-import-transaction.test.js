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

test("database transaction commits success and rolls back failure", async () => {
  const commands = [];
  const client = {
    query: async (sql) => {
      commands.push(String(sql));
      return { rows: [] };
    },
    release: () => commands.push("RELEASE"),
  };
  class PoolMock {
    async connect() { return client; }
    async query(sql) { commands.push(`POOL:${sql}`); return { rows: [] }; }
  }
  const db = load("netlify/functions/services/db.js", {
    pg: { Pool: PoolMock },
  });

  const value = await db.withTransaction(async () => {
    await db.query("SELECT inside_transaction");
    return 42;
  });
  assert.equal(value, 42);
  assert.deepEqual(commands.slice(0, 4), [
    "BEGIN",
    "SELECT inside_transaction",
    "COMMIT",
    "RELEASE",
  ]);

  commands.length = 0;
  await assert.rejects(
    db.withTransaction(async () => {
      await db.query("SELECT before_failure");
      throw new Error("stop");
    }),
    /stop/,
  );
  assert.deepEqual(commands, [
    "BEGIN",
    "SELECT before_failure",
    "ROLLBACK",
    "RELEASE",
  ]);
});

function importHarness({ priorPackage = null, archivedClient = false } = {}) {
  const queries = [];
  let transactionCount = 0;
  const db = {
    query: async (sql, params = []) => {
      const text = String(sql);
      queries.push({ sql: text, params });
      if (text.includes("WHERE import_key=$1")) {
        return { rows: priorPackage ? [priorPackage] : [] };
      }
      if (text.includes("WHERE package_id=$1")) {
        return { rows: [{ id: "doc-existing", document_type: "hipaa_soa" }] };
      }
      if (text.includes("FROM crm_clients")) {
        return { rows: [{ id: "client-1", first_name: "Pat", last_name: "Client",
          archived_at: archivedClient ? "2026-09-01T12:00:00Z" : null }] };
      }
      if (text.includes("UPDATE crm_clients")) {
        return { rows: [{ id: "client-1", first_name: "Pat", last_name: "Client" }] };
      }
      return { rows: [], rowCount: 0 };
    },
    withTransaction: async (callback) => {
      transactionCount += 1;
      return callback();
    },
  };
  const recordedPackages = [];
  const auditEvents = [];
  const handler = load("netlify/functions/import-vitalink-package.js", {
    "./services/db": db,
    "./crm-auth": {
      requireCrmAgent: async () => ({ crmAgentId: "agent-1", agent: { id: "agent-1" } }),
    },
    "./services/crm-vitalink-import": {
      AUDIT_EVENTS: {
        CLIENT_CREATED: "client_created",
        CLIENT_RESTORED: "client_restored",
        IMPORT_COMPLETED: "import_completed",
      },
      DOCUMENT_TYPES: {
        HIPAA: "hipaa",
        SOA: "soa",
        HIPAA_SOA: "hipaa_soa",
        VITALINK_CSV: "vitalink_csv",
      },
      ensureVitalinkImportSchema: async () => {},
      logCrmAuditEvent: async (args) => { auditEvents.push(args); },
      recordCrmClientDocument: async (args) => ({ id: "doc-1", document_type: args.documentType }),
      recordVitalinkPackageReceived: async (args) => {
        recordedPackages.push(args);
        return { id: "package-1", ...args };
      },
    },
  }).handler;
  return { db, handler, queries, recordedPackages, auditEvents,
    transactionCount: () => transactionCount };
}

const importEvent = () => ({
  httpMethod: "POST",
  headers: {},
  body: JSON.stringify({
    agent_id: "agent-1",
    app_user_id: "42",
    app_profile_id: "profile-1",
    hipaa_signed_at: "2026-10-08T12:00:00Z",
    soa_signed_at: "2026-10-08T12:00:00Z",
    client: { name: "Pat Client", email: "pat@example.com" },
    documents: {
      source: "vitalink_package",
      hipaaSoa: { contentBase64: Buffer.from("signed PDF").toString("base64") },
    },
  }),
});

test("VitaLink import is transactional and a signed import clears CRM revocation", async () => {
  const harness = importHarness();
  const response = await harness.handler(importEvent());
  assert.equal(response.statusCode, 200);
  assert.equal(harness.transactionCount(), 1);
  assert.equal(harness.recordedPackages.length, 1);
  assert.match(harness.recordedPackages[0].importKey, /^[a-f0-9]{64}$/);

  const update = harness.queries.find((entry) => entry.sql.includes("UPDATE crm_clients"));
  assert.ok(update);
  assert.match(update.sql, /authorization_revoked_at\s*=\s*CASE/);
});

test("manual combined-form import uses the document signing date to clear revocation", async () => {
  const harness = importHarness();
  const event = importEvent();
  const body = JSON.parse(event.body);
  delete body.hipaa_signed_at;
  delete body.soa_signed_at;
  body.documents.hipaaSoa.signedAt = "2026-10-08T12:00:00Z";
  event.body = JSON.stringify(body);

  const response = await harness.handler(event);
  assert.equal(response.statusCode, 200);

  const update = harness.queries.find((entry) => entry.sql.includes("UPDATE crm_clients"));
  assert.equal(update.params[15], "2026-10-08T12:00:00Z");
  assert.equal(update.params[16], "2026-10-08T12:00:00Z");
});

test("a newly signed package restores an archived client and records why", async () => {
  const harness = importHarness({ archivedClient: true });
  const response = await harness.handler(importEvent());
  const body = JSON.parse(response.body);

  assert.equal(response.statusCode, 200);
  assert.equal(body.action, "restored");
  const update = harness.queries.find((entry) => entry.sql.includes("UPDATE crm_clients"));
  assert.match(update.sql, /archived_at\s*=\s*CASE/);
  assert.match(update.sql, /archived_by\s*=\s*CASE/);
  assert.equal(
    harness.auditEvents.some((event) =>
      event.eventType === "client_restored" &&
      event.metadata.source === "new_signed_vitalink_package"),
    true,
  );
});

test("retrying an imported package returns its existing documents without another write", async () => {
  const harness = importHarness({
    priorPackage: { id: "package-existing", import_key: "existing" },
  });
  const response = await harness.handler(importEvent());
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.action, "already_imported");
  assert.equal(harness.recordedPackages.length, 0);
  assert.equal(body.documents[0].id, "doc-existing");
});

