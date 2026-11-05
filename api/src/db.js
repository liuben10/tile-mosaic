import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import config from "./config.js";

const MIGRATIONS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

let pool;

async function poolConfig() {
  const { db } = config;
  if (db.url) return { connectionString: db.url };

  // RDS keeps the master credentials in Secrets Manager and rotates them, so read them at startup
  const sm = new SecretsManagerClient({ region: config.region });
  const secret = await sm.send(new GetSecretValueCommand({ SecretId: db.secretArn }));
  const { username, password } = JSON.parse(secret.SecretString);
  return {
    host: db.host, port: db.port, database: db.name, user: username, password,
    ssl: db.ssl ? { ca: db.caFile ? fs.readFileSync(db.caFile, "utf8") : undefined, rejectUnauthorized: true } : false,
  };
}

export async function connect() {
  pool = new pg.Pool({ ...(await poolConfig()), max: 10, idleTimeoutMillis: 30_000 });
  pool.on("error", (e) => console.error("postgres pool error:", e.message));
  await migrate();
  return pool;
}

export const query = (text, params) => pool.query(text, params);

export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

// Apply migrations/*.sql in name order, once each. An advisory lock keeps two
// API containers starting at the same time from racing.
async function migrate() {
  await tx(async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(727274)");
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const file of fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      await c.query(fs.readFileSync(path.join(MIGRATIONS, file), "utf8"));
      await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      console.log(`applied migration ${file}`);
    }
  });
}
