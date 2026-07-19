ALTER TABLE "test_runs" ADD COLUMN "deleted_at" timestamptz DEFAULT NULL;--> statement-breakpoint
CREATE INDEX "idx_runs_not_deleted" ON "test_runs" ("project_id","created_at") WHERE "deleted_at" IS NULL;
