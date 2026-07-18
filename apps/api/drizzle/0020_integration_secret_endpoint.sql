-- Custom (OpenAI-compatible) AI provider: an endpoint + model alongside the key.
-- base_url and model are config (not secrets); only provider='custom' uses them.
ALTER TABLE workspace_integration_secrets ADD COLUMN IF NOT EXISTS base_url VARCHAR(500);
ALTER TABLE workspace_integration_secrets ADD COLUMN IF NOT EXISTS model VARCHAR(100);
