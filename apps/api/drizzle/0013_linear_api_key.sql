-- Add encrypted API key column for stable Linear integration (replaces expiring OAuth tokens)
ALTER TABLE linear_connections
  ADD COLUMN api_key_enc TEXT;
