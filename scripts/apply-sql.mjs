import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import pg from "pg";

function loadEnv(file) {
  const raw = readFileSync(file, "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnv(resolve(process.cwd(), ".env.local"));
const connectionString = env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error("SUPABASE_DB_URL is missing from .env.local");
  process.exit(1);
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/apply-sql.mjs <path-to-sql-file>");
  process.exit(1);
}

const sql = readFileSync(resolve(process.cwd(), target), "utf8");

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 120000,
});

const started = Date.now();

try {
  await client.connect();
  console.log(`Connected as ${(await client.query("select current_user, current_database()")).rows[0].current_user}`);
  await client.query(sql);
  console.log(`Applied ${target} in ${Date.now() - started}ms`);

  const tables = await client.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  const views = await client.query(
    `select table_name from information_schema.views
      where table_schema = 'public' order by table_name`,
  );
  const triggers = await client.query(
    `select count(*)::int as n from information_schema.triggers where trigger_schema = 'public'`,
  );
  const policies = await client.query(
    `select count(*)::int as n from pg_policies where schemaname = 'public'`,
  );
  const buckets = await client.query(`select id, public from storage.buckets order by id`);

  console.log(`Tables (${tables.rowCount}): ${tables.rows.map((r) => r.table_name).join(", ")}`);
  console.log(`Views (${views.rowCount}): ${views.rows.map((r) => r.table_name).join(", ")}`);
  console.log(`Triggers: ${triggers.rows[0].n} · Policies: ${policies.rows[0].n}`);
  console.log(`Buckets: ${buckets.rows.map((r) => `${r.id}${r.public ? " (public)" : ""}`).join(", ")}`);
} catch (error) {
  console.error("FAILED:", error.message);
  if (error.position) console.error(`SQL position: ${error.position}`);
  if (error.detail) console.error(`Detail: ${error.detail}`);
  if (error.hint) console.error(`Hint: ${error.hint}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
