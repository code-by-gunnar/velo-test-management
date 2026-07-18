-- VEL-46 / audit #9: snapshot the case definition (preconditions + steps) into
-- run_items at run creation, so a historic run renders exactly what was tested
-- even after the underlying test case is edited. Nullable — runs created before
-- this migration and CI-ingested items carry no snapshot and fall back to the
-- live case. Shape: { "preconditions": text|null, "steps": [{ step_order, action,
-- expected_result, step_type }] }.
ALTER TABLE run_items ADD COLUMN IF NOT EXISTS case_snapshot JSONB;
