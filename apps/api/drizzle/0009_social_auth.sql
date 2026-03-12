-- 0009_social_auth.sql
-- Social Auth: add user_oauth_accounts table, make password_hash nullable

-- Section 1: Allow OAuth users (no password hash required)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Section 2: OAuth account linking table
CREATE TABLE user_oauth_accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            VARCHAR(20)  NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT user_oauth_accounts_provider_unique UNIQUE (provider, provider_account_id),
  CONSTRAINT user_oauth_accounts_user_provider_unique UNIQUE (user_id, provider)
);

-- Section 3: Index for lookup by user_id
CREATE INDEX idx_user_oauth_accounts_user_id ON user_oauth_accounts (user_id);
