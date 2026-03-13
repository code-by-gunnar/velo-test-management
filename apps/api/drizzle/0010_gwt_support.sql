-- Add test_format to projects (steps = traditional, gwt = given-when-then)
ALTER TABLE projects
  ADD COLUMN test_format VARCHAR(10) NOT NULL DEFAULT 'steps';

-- Add step_type to test_case_steps
-- 'action' = traditional step, 'given'/'when'/'then'/'and'/'but' = GWT keywords
ALTER TABLE test_case_steps
  ADD COLUMN step_type VARCHAR(10) NOT NULL DEFAULT 'action';
