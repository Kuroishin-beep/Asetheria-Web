import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../../src/db/schema";

/**
 * Database handle for one-off scripts. Neon's HTTP driver only talks to Neon,
 * so anything else (the local Docker test database, a self-hosted Postgres)
 * goes through node-postgres — the same split `src/db/index.ts` makes for the
 * app. `allowExitOnIdle` lets a script finish without an explicit pool.end().
 */
export function connectScriptDb(url: string) {
  if (/neon\.tech|neon\.build/.test(url)) {
    return drizzleNeon(neon(url), { schema });
  }
  const pool = new Pool({ connectionString: url, max: 5, allowExitOnIdle: true });
  return drizzleNode(pool, { schema }) as unknown as ReturnType<typeof drizzleNeon<typeof schema>>;
}
