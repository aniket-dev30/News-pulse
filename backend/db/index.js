/**
 * db/index.js
 *
 * Shared Postgres connection pool for the whole backend.
 * Using a pool (not one-off connections per request) is important —
 * the Python scraper hit Neon connection-storm errors earlier from
 * opening too many individual connections. A pool reuses a small set
 * of persistent connections across all incoming requests instead.
 */

require("dotenv").config();
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Create a .env file in /backend with " +
    "DATABASE_URL=<your neon connection string>"
  );
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // Neon requires SSL
});

pool.on("error", (err) => {
  console.error("[db] Unexpected pool error:", err);
});

module.exports = pool;