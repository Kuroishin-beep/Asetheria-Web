import { Pool } from "pg";
import { loadEnv } from "./load-env";

loadEnv();

/**
 * Direct DB access for test setup/teardown that has no HTTP surface yet
 * (creating a second player account, tagging an entry `major-city`,
 * inspecting `entry_grants`). Every helper here talks to the same
 * disposable `asetheria-test-pg` container the app itself uses in tests —
 * never a mock, never the Neon production database (see playwright.config.ts).
 */
let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set for tests/db-helpers.ts");
    pool = new Pool({ connectionString: url, max: 3 });
  }
  return pool;
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const { rows } = await getPool().query(text, params);
  return rows as T[];
}

export async function closeDbHelpers() {
  await pool?.end();
  pool = null;
}

/** Creates a fresh player account with a known password, via the app's own hashing. */
export async function createTestPlayer(username: string, password: string) {
  // Mirrors src/lib/password.ts's scrypt scheme so the login route accepts it.
  const { hashPassword } = await import("../src/lib/password");
  const hash = await hashPassword(password);
  const rows = await query<{ id: string }>(
    `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'player') RETURNING id`,
    [username, hash],
  );
  return rows[0].id;
}

export async function deleteTestUser(userId: string) {
  await query(`DELETE FROM entry_grants WHERE user_id = $1`, [userId]);
  await query(`DELETE FROM users WHERE id = $1`, [userId]);
}

export async function getUserDisplayName(userId: string) {
  const rows = await query<{ display_name: string | null }>(
    `SELECT display_name FROM users WHERE id = $1`,
    [userId],
  );
  return rows[0]?.display_name ?? null;
}

export async function countGrantsForUser(userId: string) {
  const rows = await query<{ n: number }>(
    `SELECT count(*)::int AS n FROM entry_grants WHERE user_id = $1`,
    [userId],
  );
  return rows[0]?.n ?? 0;
}

/** Computes and writes a real embedding for one entry, for semantic-search tests. */
export async function embedEntryForTest(slug: string) {
  const { embed } = await import("../src/lib/embeddings");
  const rows = await query<{ id: string; name: string; summary: string; body: string }>(
    `SELECT id, name, summary, body FROM entries WHERE slug = $1`,
    [slug],
  );
  const row = rows[0];
  const vector = await embed([row.name, row.summary, row.body].filter(Boolean).join("\n"));
  await query(`UPDATE entries SET embedding = $1::vector WHERE id = $2`, [
    `[${vector.join(",")}]`,
    row.id,
  ]);
}
