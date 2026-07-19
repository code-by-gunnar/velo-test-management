ALTER TABLE "suites" ADD COLUMN "deleted_at" timestamptz DEFAULT NULL;--> statement-breakpoint
CREATE INDEX "idx_suites_not_deleted" ON "suites" ("project_id","parent_id","position") WHERE "deleted_at" IS NULL;
