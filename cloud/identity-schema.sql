CREATE TABLE IF NOT EXISTS cloud_identities (
  account_id TEXT PRIMARY KEY REFERENCES cloud_accounts(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified_at TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret_cipher TEXT,
  password_changed_at TEXT NOT NULL,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_identities_email ON cloud_identities(email);

CREATE TABLE IF NOT EXISTS identity_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_identities(account_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('active','pending_mfa','revoked')),
  auth_time TEXT NOT NULL,
  mfa_verified_at TEXT,
  recent_auth_until TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS identity_sessions_account ON identity_sessions(account_id, status, expires_at);

CREATE TABLE IF NOT EXISTS identity_email_challenges (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_identities(account_id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK(purpose IN ('verify_email','password_reset')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS identity_email_outbox (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_identities(account_id) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  template TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','sending','sent','failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  locked_at TEXT,
  sent_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS identity_email_outbox_pending ON identity_email_outbox(status, available_at);

CREATE TABLE IF NOT EXISTS identity_mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES cloud_identities(account_id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(account_id, code_hash)
);

CREATE TABLE IF NOT EXISTS identity_login_attempts (
  id TEXT PRIMARY KEY,
  email_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  successful INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS identity_login_attempts_window ON identity_login_attempts(email_hash, ip_hash, created_at);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hash TEXT,
  client_type TEXT NOT NULL CHECK(client_type IN ('public','confidential')),
  display_name TEXT NOT NULL,
  redirect_uris_json TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  pkce_required INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES cloud_identities(account_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  redirect_uri TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  code_challenge TEXT NOT NULL,
  code_challenge_method TEXT NOT NULL CHECK(code_challenge_method='S256'),
  nonce TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES cloud_identities(account_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  scopes_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL REFERENCES cloud_identities(account_id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  scopes_json TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  rotated_from_id TEXT REFERENCES oauth_refresh_tokens(id),
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_refresh_tokens_account ON oauth_refresh_tokens(account_id, client_id, revoked_at);

CREATE TABLE IF NOT EXISTS oauth_browser_flows (
  id TEXT PRIMARY KEY,
  csrf_hash TEXT NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  server_id TEXT,
  local_user_id TEXT,
  link_id TEXT,
  nonce TEXT,
  state TEXT,
  code_challenge TEXT,
  code_challenge_method TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);
