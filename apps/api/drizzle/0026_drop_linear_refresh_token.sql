-- Drop the never-used refresh_token_enc column on linear_connections.
-- The now-removed OAuth callback only ever wrote access_token_enc
-- (exchangeCodeForTokens returned no refresh token), and no code path has ever
-- read this column — it is dead since inception.
--
-- NOTE: access_token_enc is deliberately RETAINED. It is still a live read
-- fallback for legacy OAuth-era connection rows (defect auto-file and AI import
-- prefer api_key_enc and fall back to decrypt(access_token_enc)). Only the
-- write path (the OAuth flow) was removed, so those rows must keep working.
ALTER TABLE linear_connections DROP COLUMN IF EXISTS refresh_token_enc;
