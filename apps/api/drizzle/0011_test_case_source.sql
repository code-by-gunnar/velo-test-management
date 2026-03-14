-- Track the external source of a test case (e.g. Linear issue)
ALTER TABLE test_cases
  ADD COLUMN source_url VARCHAR(500),
  ADD COLUMN source_ref VARCHAR(100);
