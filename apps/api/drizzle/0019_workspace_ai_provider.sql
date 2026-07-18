-- Active AI provider per workspace (which BYO key is used for AI test generation).
-- Keys themselves live in workspace_integration_secrets (provider = anthropic|openai).
ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(20) NOT NULL DEFAULT 'anthropic';
