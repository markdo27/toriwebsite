"use strict";

const { Pool } = require("pg");

let pool = null;
let schemaReady = null;

function connectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    null
  );
}

function getPool() {
  if (pool) return pool;
  const cs = connectionString();
  if (!cs) {
    throw new Error(
      "No Postgres connection string found. Set POSTGRES_URL in .env (locally) or connect " +
        "a Postgres database to this project in the Vercel dashboard (Storage tab)."
    );
  }
  pool = new Pool({
    connectionString: cs,
    ssl: /localhost|127\.0\.0\.1/.test(cs) ? false : { rejectUnauthorized: false },
  });
  return pool;
}

async function migrateCapacityOverrides(pool) {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'capacity_overrides'`
  );
  const names = cols.rows.map((r) => r.column_name);

  if (names.length === 0) {
    await pool.query(`
      CREATE TABLE capacity_overrides (
        date_key TEXT NOT NULL,
        seating_time TEXT NOT NULL,
        max_guests INTEGER NOT NULL,
        PRIMARY KEY (date_key, seating_time)
      );
    `);
    return;
  }

  if (!names.includes("seating_time")) {
    // Older shape: one override per date, applied to both seatings. Expand
    // each row into one per seating time so existing overrides keep behaving
    // exactly as they did before (same cap on both), just now stored the
    // same way a single-seating override would be.
    const old = await pool.query(`SELECT date_key, max_guests FROM capacity_overrides`);
    await pool.query(`DROP TABLE capacity_overrides`);
    await pool.query(`
      CREATE TABLE capacity_overrides (
        date_key TEXT NOT NULL,
        seating_time TEXT NOT NULL,
        max_guests INTEGER NOT NULL,
        PRIMARY KEY (date_key, seating_time)
      );
    `);
    for (const row of old.rows) {
      for (const time of ["6:00 PM", "8:30 PM"]) {
        await pool.query(
          `INSERT INTO capacity_overrides (date_key, seating_time, max_guests) VALUES ($1, $2, $3)`,
          [row.date_key, time, row.max_guests]
        );
      }
    }
  }
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bookings (
        id UUID PRIMARY KEY,
        reference TEXT NOT NULL,
        date_key TEXT NOT NULL,
        seating_time TEXT NOT NULL,
        guests INTEGER NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS bookings_date_time_idx ON bookings (date_key, seating_time);

      CREATE TABLE IF NOT EXISTS site_images (
        key TEXT PRIMARY KEY,
        url TEXT
      );

      CREATE TABLE IF NOT EXISTS site_text (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS site_sections (
        key TEXT PRIMARY KEY,
        visible BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);
    await migrateCapacityOverrides(pool);
  })();
  try {
    await schemaReady;
  } catch (err) {
    schemaReady = null; // allow retry on the next call instead of caching a failure forever
    throw err;
  }
  return schemaReady;
}

async function query(text, params) {
  await ensureSchema();
  return getPool().query(text, params);
}

// For callers that need a single connection to run BEGIN/COMMIT/ROLLBACK on
// (transactions must stay on one client, not a fresh one per query from the pool).
async function connect() {
  await ensureSchema();
  return getPool().connect();
}

module.exports = { query, connect, ensureSchema };
