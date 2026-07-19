ALTER TABLE "test_cases" ADD COLUMN "deleted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "suites" ADD COLUMN "deleted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "test_runs" ADD COLUMN "deleted_by" uuid REFERENCES "users"("id") ON DELETE SET NULL;
