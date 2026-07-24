import { sql, relations } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
  index,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";

// Note: full-text search is implemented with a generated `search_vector`
// tsvector column plus GIN/trigram indexes. Those are created by
// `scripts/sql/setup.sql` rather than declared here, because generated columns
// and `gin_trgm_ops` are not expressible in Drizzle's push workflow.

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * Every kind of thing that lives in the codex. Adding a kind here plus an entry
 * in `src/lib/kinds.ts` is all that's needed to surface a new section in the UI.
 */
export const entryKind = pgEnum("entry_kind", [
  "deity",
  "pantheon",
  "organization",
  "faction",
  "location",
  "empire",
  "npc",
  "family",
  "creature",
  "item",
  "ore",
  "flora",
  "lore",
  "quest",
  "session",
  "rule",
  "system",
  "note",
]);

export const userRole = pgEnum("user_role", ["dm", "player"]);

/**
 * Controls who can see an entry.
 *  - `public`  : visible to players and the DM
 *  - `secret`  : DM only. Players never receive these rows from the API.
 *  - `revealed`: was secret, now deliberately shown to players.
 */
export const visibility = pgEnum("visibility", ["public", "secret", "revealed"]);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("player"),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    // Bumping this invalidates every outstanding session for the user.
    sessionEpoch: integer("session_epoch").notNull().default(0),
  },
  (t) => [uniqueIndex("users_username_lower_idx").on(sql`lower(${t.username})`)],
);

// ---------------------------------------------------------------------------
// Entries — the single polymorphic table backing the whole codex
// ---------------------------------------------------------------------------

export const entries = pgTable(
  "entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: entryKind("kind").notNull(),
    /** URL-safe identifier, unique among non-archived entries. */
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    /** Short one-liner shown in lists and search results. */
    summary: text("summary").notNull().default(""),
    /** Main body, Markdown. Visible to whoever can see the entry. */
    body: text("body").notNull().default(""),
    /**
     * DM-only notes. Never serialised to a player, even on a `public` entry —
     * this is where "the innkeeper is actually a doppelganger" goes.
     */
    dmNotes: text("dm_notes").notNull().default(""),
    /**
     * Kind-specific properties (alignment, domains, race, symbol, type, ...).
     * Free-form so new fields never need a migration.
     */
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
    tags: text("tags").array().notNull().default(sql`ARRAY[]::text[]`),
    visibility: visibility("visibility").notNull().default("public"),
    /** Optional parent for hierarchy (a city inside an empire, a god in a pantheon). */
    parentId: uuid("parent_id").references((): any => entries.id, {
      onDelete: "set null",
    }),
    /** Where this came from in the original Notion export. Purely informational. */
    sourcePath: text("source_path"),
    /**
     * Soft delete. Nothing is ever removed from this table by the application;
     * "delete" sets this timestamp and the row drops out of the default views.
     */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("entries_slug_idx").on(t.slug),
    index("entries_kind_idx").on(t.kind),
    index("entries_archived_idx").on(t.archivedAt),
    index("entries_name_idx").on(t.name),
    index("entries_parent_idx").on(t.parentId),
    index("entries_tags_idx").using("gin", t.tags),
  ],
);

// ---------------------------------------------------------------------------
// Links — the graph between entries, powering backlinks
// ---------------------------------------------------------------------------

export const links = pgTable(
  "links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    targetId: uuid("target_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    /** e.g. "mentions", "worships", "located-in", "member-of". */
    relation: text("relation").notNull().default("mentions"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("links_unique_idx").on(t.sourceId, t.targetId, t.relation),
    index("links_source_idx").on(t.sourceId),
    index("links_target_idx").on(t.targetId),
  ],
);

// ---------------------------------------------------------------------------
// Revisions — an append-only history of every write
// ---------------------------------------------------------------------------

/**
 * A full snapshot of an entry is written here *before* each update and on
 * archive/restore. Combined with soft deletes this means no edit is ever
 * unrecoverable.
 */
export const revisions = pgTable(
  "revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => entries.id, { onDelete: "cascade" }),
    snapshot: jsonb("snapshot").notNull(),
    /** "create" | "update" | "archive" | "restore" | "import" */
    action: text("action").notNull(),
    authorId: uuid("author_id").references(() => users.id, {
      onDelete: "set null",
    }),
    authorName: text("author_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("revisions_entry_idx").on(t.entryId, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Rollable tables
// ---------------------------------------------------------------------------

export const rollTables = pgTable(
  "roll_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description").notNull().default(""),
    /** Dice expression rolled against the table, e.g. "1d20", "2d6". */
    dice: text("dice").notNull().default("1d20"),
    /** [{ min, max, result }] — min/max are inclusive roll bounds. */
    items: jsonb("items")
      .$type<{ min: number; max: number; result: string }[]>()
      .notNull()
      .default([]),
    visibility: visibility("visibility").notNull().default("secret"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("roll_tables_slug_idx").on(t.slug)],
);

// ---------------------------------------------------------------------------
// Login throttling — protects the password form from brute force
// ---------------------------------------------------------------------------

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Hashed IP + username, so raw addresses are never stored. */
    identifier: text("identifier").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("login_attempts_idx").on(t.identifier, t.attemptedAt)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const entriesRelations = relations(entries, ({ many, one }) => ({
  outgoing: many(links, { relationName: "source" }),
  incoming: many(links, { relationName: "target" }),
  revisions: many(revisions),
  parent: one(entries, {
    fields: [entries.parentId],
    references: [entries.id],
    relationName: "children",
  }),
}));

export const linksRelations = relations(links, ({ one }) => ({
  source: one(entries, {
    fields: [links.sourceId],
    references: [entries.id],
    relationName: "source",
  }),
  target: one(entries, {
    fields: [links.targetId],
    references: [entries.id],
    relationName: "target",
  }),
}));

export const revisionsRelations = relations(revisions, ({ one }) => ({
  entry: one(entries, {
    fields: [revisions.entryId],
    references: [entries.id],
  }),
  author: one(users, { fields: [revisions.authorId], references: [users.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
export type User = typeof users.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Revision = typeof revisions.$inferSelect;
export type RollTable = typeof rollTables.$inferSelect;
export type EntryKind = (typeof entryKind.enumValues)[number];
export type Visibility = (typeof visibility.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];
