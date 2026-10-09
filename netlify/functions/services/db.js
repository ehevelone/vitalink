// functions/services/db.js
const { Pool } = require("pg");
const { AsyncLocalStorage } = require("async_hooks");

// Expecting SUPABASE_URL in your Netlify environment variables
const pool = new Pool({
  connectionString: process.env.SUPABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase
});

const transactionStorage = new AsyncLocalStorage();

const db = {
  query: (text, params) => {
    const client = transactionStorage.getStore();
    return (client || pool).query(text, params);
  },
  withTransaction: async (callback) => {
    const existingClient = transactionStorage.getStore();
    if (existingClient) return callback();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await transactionStorage.run(client, callback);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  },
};

module.exports = db;
