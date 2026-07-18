import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  unique,
  check,
  primaryKey,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import { uuidv7 } from "uuidv7"

// ─── Enums ────────────────────────────────────────────────────────────────────

export const planTierEnum = pgEnum("plan_tier", [
  "free",
  "starter",
  "growth",
  "enterprise",
])

export const workspaceRoleEnum = pgEnum("workspace_role", [
  "admin",
  "editor",
  "viewer",
])

export const testPriorityEnum = pgEnum("test_priority", [
  "critical",
  "high",
  "medium",
  "low",
])

export const testStatusEnum = pgEnum("test_status", [
  "pass",
  "fail",
  "blocked",
  "skipped",
  "untested",
])

export const runStatusEnum = pgEnum("run_status", [
  "draft",
  "active",
  "completed",
  "aborted",
])

// ─── Non-tenant tables ────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password_hash: text("password_hash"),
  name: varchar("name", { length: 255 }),
  email_verified: boolean("email_verified").notNull().default(false),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const verificationTokens = pgTable("verification_tokens", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Store bcrypt hash of the 6-digit code — never store the raw OTP
  token_hash: text("token_hash").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  attempt_count: integer("attempt_count").notNull().default(0),
  used_at: timestamp("used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  // Store bcrypt hash of the reset token — never store the raw token
  token_hash: text("token_hash").notNull(),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  used_at: timestamp("used_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

export const oauthAccounts = pgTable(
  "user_oauth_accounts",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 20 }).notNull(),
    provider_account_id: varchar("provider_account_id", { length: 255 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("user_oauth_accounts_provider_unique").on(t.provider, t.provider_account_id),
    unique("user_oauth_accounts_user_provider_unique").on(t.user_id, t.provider),
  ]
)

// ─── Workspace + membership (tenant root) ─────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  name: varchar("name", { length: 255 }).notNull(),
  // slug: lowercase, hyphenated, globally unique. User can edit ONCE after creation.
  slug: varchar("slug", { length: 63 }).notNull().unique(),
  plan_tier: planTierEnum("plan_tier").notNull().default("free"),
  // Tracks whether the user has edited the slug (enforced at app layer)
  slug_edited: boolean("slug_edited").notNull().default(false),
  // Active AI provider for test generation ('anthropic' | 'openai'). Keys live in
  // workspace_integration_secrets keyed by provider.
  ai_provider: varchar("ai_provider", { length: 20 }).notNull().default("anthropic"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    user_id: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").notNull().default("editor"),
    is_active: boolean("is_active").notNull().default(true),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One membership record per user per workspace
    unique("workspace_members_workspace_user_unique").on(t.workspace_id, t.user_id),
  ]
)

// ─── Workspace Invitations (tenant-scoped, Phase 6) ───────────────────────────

export const workspaceInvitations = pgTable("workspace_invitations", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 255 }).notNull(),
  role: workspaceRoleEnum("role").notNull().default("editor"),
  // SHA-256 hash of the one-time invite token — never store the raw token
  token_hash: text("token_hash").notNull(),
  invited_by: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  accepted_at: timestamp("accepted_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Projects (tenant-scoped) ─────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    // project_key: lowercase letters/numbers only, e.g. "velo", "acme". Set at creation, not editable.
    project_key: varchar("project_key", { length: 20 }).notNull(),
    description: text("description"),
    // test_format: 'steps' (traditional) | 'gwt' (given-when-then). Set at creation, immutable after.
    test_format: varchar("test_format", { length: 10 }).notNull().default("steps"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Project keys are unique within a workspace (not globally)
    unique("projects_workspace_key_unique").on(t.workspace_id, t.project_key),
    // Enforce lowercase project_key at DB layer
    check("projects_key_lowercase", sql`project_key = lower(project_key)`),
    check("projects_key_format", sql`project_key ~ '^[a-z0-9-]+$'`),
  ]
)

// ─── Test Suites (tenant-scoped, Phase 2 entity defined now for seeding) ──────

export const suites = pgTable(
  "suites",
  {
    id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
    workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    project_id: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    // Null parent_id = root suite
    parent_id: uuid("parent_id"),
    name: varchar("name", { length: 255 }).notNull(),
    // Gap-based integer position for drag-drop reorder (increments of 1000)
    position: integer("position").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  }
)

// ─── Test Cases (tenant-scoped, Phase 2 entity defined now for seeding) ───────

export const testCases = pgTable("test_cases", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  project_id: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  suite_id: uuid("suite_id").references(() => suites.id, { onDelete: "set null" }),
  title: varchar("title", { length: 500 }).notNull(),
  preconditions: text("preconditions"),
  priority: testPriorityEnum("priority").notNull().default("medium"),
  // Gap-based integer position within its suite
  position: integer("position").notNull().default(0),
  // Nullable — set when matched by CI ingestion parser for external ID mapping
  external_id: varchar("external_id", { length: 255 }),
  // Source tracking — where this case was imported from (e.g. Linear issue)
  source_url: varchar("source_url", { length: 500 }),
  source_ref: varchar("source_ref", { length: 100 }),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Test Case Steps (normalized, NOT JSONB) ──────────────────────────────────

export const testCaseSteps = pgTable("test_case_steps", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  test_case_id: uuid("test_case_id").notNull().references(() => testCases.id, { onDelete: "cascade" }),
  // Step ordering within the test case (gap-based)
  step_order: integer("step_order").notNull(),
  action: text("action").notNull(),
  expected_result: text("expected_result"),
  // step_type: 'action' = traditional step; GWT keywords: 'given'/'when'/'then'/'and'/'but'
  step_type: varchar("step_type", { length: 10 }).notNull().default("action"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Test Runs (tenant-scoped, Phase 3 entity — schema only, no UI in Phase 1) ─

export const testRuns = pgTable("test_runs", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  project_id: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  status: runStatusEnum("status").notNull().default("draft"),
  assigned_to: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  started_at: timestamp("started_at", { withTimezone: true }),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Run Items (tenant-scoped) ────────────────────────────────────────────────

export const runItems = pgTable("run_items", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  run_id: uuid("run_id").notNull().references(() => testRuns.id, { onDelete: "cascade" }),
  // Nullable — CI-ingested run items may not map to an existing test case
  test_case_id: uuid("test_case_id").references(() => testCases.id, { onDelete: "cascade" }),
  // Title snapshot taken at run creation (migration 0003) — kept immutable so
  // renaming a case doesn't rewrite in-progress/historic runs.
  case_title: varchar("case_title", { length: 500 }),
  // Full case-definition snapshot (preconditions + steps) taken at run creation
  // (migration 0015 / VEL-46). Nullable: pre-0015 runs and CI items have none and
  // fall back to the live case. Shape: { preconditions, steps: [{ step_order,
  // action, expected_result, step_type }] }.
  case_snapshot: jsonb("case_snapshot"),
  status: testStatusEnum("status").notNull().default("untested"),
  comment: text("comment"),
  executed_by: uuid("executed_by").references(() => users.id, { onDelete: "set null" }),
  executed_at: timestamp("executed_at", { withTimezone: true }),
  // "manual" (human-created) | "ci" (ingested from CI pipeline)
  source: varchar("source", { length: 10 }).notNull().default("manual"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Run Item Attachments (test evidence) ─────────────────────────────────────

export const runItemAttachments = pgTable("run_item_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  run_item_id: uuid("run_item_id").notNull().references(() => runItems.id, { onDelete: "cascade" }),
  filename: varchar("filename", { length: 255 }).notNull(),
  r2_key: varchar("r2_key", { length: 500 }).notNull(),
  content_type: varchar("content_type", { length: 100 }).notNull(),
  size_bytes: integer("size_bytes").notNull(),
  uploaded_by: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Defects (tenant-scoped) ──────────────────────────────────────────────────

export const defects = pgTable("defects", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  run_item_id: uuid("run_item_id").references(() => runItems.id, { onDelete: "set null" }),
  // External issue reference (Linear issue URL or ID)
  external_id: varchar("external_id", { length: 255 }),
  external_url: text("external_url"),
  // Cached Linear issue status (e.g. "Todo", "In Progress", "Done")
  external_status: varchar("external_status", { length: 50 }),
  title: varchar("title", { length: 500 }).notNull(),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── API Keys (tenant-scoped, Phase 4) ────────────────────────────────────────

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  // First 8 chars of the raw key — safe to store for lookup (e.g. "velo_abc")
  key_prefix: varchar("key_prefix", { length: 10 }).notNull(),
  // SHA-256 hex digest of the raw key — used for constant-time comparison
  key_hash: varchar("key_hash", { length: 64 }).notNull(),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp("expires_at", { withTimezone: true }),
  revoked_at: timestamp("revoked_at", { withTimezone: true }),
})

// ─── Linear Connections (tenant-scoped, Phase 5) ────────────────────────────────

// Generic per-workspace secret store for simple single-key BYO providers
// (Anthropic today). Keyed by (workspace_id, provider).
export const workspaceIntegrationSecrets = pgTable("workspace_integration_secrets", {
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 50 }).notNull(),
  secret_enc: text("secret_enc").notNull(),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.workspace_id, t.provider] }),
}))

export const linearConnections = pgTable("linear_connections", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  // OAuth token encrypted via AES-256-GCM before storage. Nullable since 0017 —
  // API-key-only connections have no OAuth token (api_key_enc carries the credential).
  access_token_enc: text("access_token_enc"),
  refresh_token_enc: text("refresh_token_enc"),
  linear_org_id: varchar("linear_org_id", { length: 255 }).notNull(),
  linear_org_name: varchar("linear_org_name", { length: 255 }),
  team_id: varchar("team_id", { length: 255 }).notNull(),
  team_name: varchar("team_name", { length: 255 }),
  // Persistent API key (encrypted) — used for all server-to-server API calls.
  // Unlike OAuth tokens, API keys don't expire.
  api_key_enc: text("api_key_enc"),
  webhook_signing_secret: text("webhook_signing_secret"),
  connected_by: uuid("connected_by").references(() => users.id, { onDelete: "set null" }),
  connected_at: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── Webhooks (tenant-scoped, Phase 5) ──────────────────────────────────────────

export const webhooks = pgTable("webhooks", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  project_id: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  endpoint_url: text("endpoint_url").notNull(),
  // HMAC-SHA256 signing secret (32 bytes hex)
  secret: varchar("secret", { length: 64 }).notNull(),
  // Subscribed event types: 'run.completed', 'run_item.failed'
  events: text("events").array().notNull().default([]),
  active: boolean("active").notNull().default(true),
  created_by: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

// ─── CI Ingestion Runs (tenant-scoped, Phase 4) ───────────────────────────────

export const ciIngestionRuns = pgTable("ci_ingestion_runs", {
  id: uuid("id").primaryKey().$defaultFn(() => uuidv7()),
  workspace_id: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  project_id: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  // Linked test run (nullable — may not be linked if parsing fails)
  run_id: uuid("run_id").references(() => testRuns.id, { onDelete: "set null" }),
  // API key that submitted this ingestion (nullable — if key later deleted)
  api_key_id: uuid("api_key_id").references(() => apiKeys.id, { onDelete: "set null" }),
  // "junit" | "allure"
  format: varchar("format", { length: 20 }).notNull(),
  // Cloudflare R2 object key for the raw uploaded payload
  r2_key: text("r2_key").notNull(),
  // "pending" | "processing" | "completed" | "failed"
  status: varchar("status", { length: 20 }).notNull(),
  total_tests: integer("total_tests"),
  matched_tests: integer("matched_tests"),
  error_message: text("error_message"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
})
