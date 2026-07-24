import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzleNode } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL_UNPOOLED;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and add your Neon connection string.",
  );
}

/**
 * Neon's HTTP driver is the right choice on Vercel — no connection pool to
 * exhaust across serverless invocations. Anything else (a local Postgres in
 * Docker, a self-hosted instance) goes through node-postgres instead.
 */
export const isNeon = /neon\.tech|neon\.build/.test(connectionString);

// Reuse the pool across hot reloads in development, otherwise every edit leaks
// connections until Postgres refuses new ones.
const globalForDb = globalThis as unknown as { __asetheriaPool?: Pool };

function makeDb() {
  if (isNeon) {
    return drizzleNeon(neon(connectionString!), { schema });
  }
  const pool =
    globalForDb.__asetheriaPool ??
    new Pool({ connectionString, max: 10 });
  if (process.env.NODE_ENV !== "production") globalForDb.__asetheriaPool = pool;
  return drizzleNode(pool, { schema });
}

export const db = makeDb() as ReturnType<typeof drizzleNeon<typeof schema>>;
export { schema };
export * from "./schema";
