import pg from "pg";
import fs from "node:fs";

const lines = fs.readFileSync(".env.local", "utf8").split(/\r?\n/);
let conn = "";
for (const line of lines) {
  if (line.startsWith("SUPABASE_DB_URL=")) conn = line.slice("SUPABASE_DB_URL=".length).trim();
}
if (!conn) {
  console.log("NO_CONN_STRING");
  process.exit(1);
}

const sql = fs.readFileSync("supabase/schema.sql", "utf8");
const stmts = [];
let cur = "";
let inDollar = false;
for (let i = 0; i < sql.length; i++) {
  if (sql.slice(i, i + 2) === "$$") {
    inDollar = !inDollar;
    cur += "$$";
    i++;
    continue;
  }
  if (sql[i] === ";" && !inDollar) {
    stmts.push(cur);
    cur = "";
    continue;
  }
  cur += sql[i];
}
if (cur.trim()) stmts.push(cur);

const pool = new pg.Pool({ connectionString: conn, ssl: { rejectUnauthorized: false } });
for (const s of stmts) {
  const t = s.trim();
  if (!t) continue;
  try {
    await pool.query(t);
    console.log("OK: " + t.slice(0, 70).replace(/\s+/g, " "));
  } catch (e) {
    if (e.code === "42P07" || e.code === "42710") {
      console.log("SKIP (exists): " + t.slice(0, 70).replace(/\s+/g, " "));
      continue;
    }
    console.log("FAIL: " + e.message);
    process.exit(1);
  }
}
const chk = await pool.query(
  "select table_name from information_schema.tables where table_schema='public' and table_name in ('users','teams','players','matches') order by 1"
);
console.log("TABLES: " + JSON.stringify(chk.rows.map((r) => r.table_name)));
await pool.end();
console.log("DONE");
