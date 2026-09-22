const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const functionPath = path.resolve(__dirname, "../netlify/functions/update-crm-client.js");

function loadHandler() {
  const queries = [];
  class Pool {
    async query(sql, values = []) {
      queries.push({ sql, values });
      return { rows: [{ id: "client-1" }] };
    }
  }
  const originalLoad = Module._load;
  Module._load = function mockLoad(request, parent, isMain) {
    if (request === "pg") return { Pool };
    if (request === "./crm-auth") {
      return {
        requireCrmClient: async () => ({ crmAgentId: "agent-1" }),
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[functionPath];
  try {
    return { handler: require(functionPath).handler, queries };
  } finally {
    Module._load = originalLoad;
  }
}

test("lead information saves currency amounts as database-safe numbers", async () => {
  const { handler, queries } = loadHandler();
  const response = await handler({
    httpMethod: "POST",
    body: JSON.stringify({
      id: "client-1",
      lead_source: "Referral",
      lead_source_detail: "Jane Smith",
      lead_cost: "$1,250.00",
      date_added: "2026-09-22",
    }),
  });
  assert.equal(response.statusCode, 200);
  const update = queries.find(({ sql }) => /UPDATE crm_clients/.test(sql));
  assert.ok(update);
  assert.equal(update.values[2], "1250.00");
  assert.equal(update.values[3], "2026-09-22");
  assert.deepEqual(update.values.slice(-2), ["client-1", "agent-1"]);
});

test("invalid lead cost is rejected before the database update", async () => {
  const { handler, queries } = loadHandler();
  const response = await handler({
    httpMethod: "POST",
    body: JSON.stringify({ id: "client-1", lead_cost: "about $25" }),
  });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).error, /valid lead cost/);
  assert.equal(queries.some(({ sql }) => /UPDATE crm_clients/.test(sql)), false);
});
