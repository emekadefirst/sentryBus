import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { databaseConfig } from "../configs/env";
import { readdir } from "fs/promises";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";

const MIGRATIONS_FOLDER = "./drizzle";

/**
 * Checks whether the DB already has the schema (i.e. "users" table exists).
 */
async function schemaAlreadyExists(sql: postgres.Sql): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'users'
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

/**
 * Returns hashes already recorded in Drizzle's own journal table.
 * Drizzle stores this in the "drizzle" schema as "drizzle"."__drizzle_migrations".
 */
async function getAppliedHashes(sql: postgres.Sql): Promise<Set<string>> {
  try {
    const rows = await sql<{ hash: string }[]>`
      SELECT hash FROM "drizzle"."__drizzle_migrations"
    `;
    return new Set(rows.map((r) => r.hash));
  } catch {
    // Table doesn't exist yet — no migrations applied
    return new Set();
  }
}

/**
 * Ensures the drizzle schema and journal table exist, then backfills
 * all existing migration files so Drizzle won't replay them.
 */
async function backfillJournal(sql: postgres.Sql, appliedHashes: Set<string>) {
  // Ensure drizzle schema exists (Drizzle creates this itself, but we need it now)
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`;
  await sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL UNIQUE,
      created_at BIGINT
    )
  `;

  const files = (await readdir(MIGRATIONS_FOLDER))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(MIGRATIONS_FOLDER, file), "utf8");
    const hash = createHash("sha256").update(content).digest("hex");

    if (!appliedHashes.has(hash)) {
      await sql`
        INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
        VALUES (${hash}, ${Date.now()})
      `;
      console.log(`  ✔ Backfilled: ${file}`);
    }
  }
}

async function runMigration() {
  console.log("⏳ Running migrations...");

  const connectionString = databaseConfig.dbUrl!;
  if (!connectionString) throw new Error("DBURL not configured");

  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  try {
    const appliedHashes = await getAppliedHashes(sql);
    const journalIsEmpty = appliedHashes.size === 0;
    const schemaExists = await schemaAlreadyExists(sql);

    if (journalIsEmpty && schemaExists) {
      console.log(
        "⚠️  Journal is empty but schema exists — backfilling to skip already-applied migrations..."
      );
      await backfillJournal(sql, appliedHashes);
      console.log("✅ Journal backfilled. Running any pending new migrations...");
    }

    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("✅ Migrations completed successfully!");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runMigration();