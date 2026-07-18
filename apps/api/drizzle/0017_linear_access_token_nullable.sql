-- API-key-only Linear connect: a connection created from just a personal API key
-- has no OAuth access token to store. Drop the NOT NULL so such rows are valid.
-- (Consumers already prefer api_key_enc and only fall back to access_token_enc.)
ALTER TABLE linear_connections ALTER COLUMN access_token_enc DROP NOT NULL;
