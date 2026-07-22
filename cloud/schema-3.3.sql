CREATE TABLE IF NOT EXISTS impulse_purchases (
  id TEXT PRIMARY KEY,
  cloud_account_id TEXT NOT NULL REFERENCES cloud_accounts(id),
  server_id TEXT NOT NULL,
  local_user_id TEXT NOT NULL,
  room_id TEXT,
  product_code TEXT NOT NULL REFERENCES products(code),
  price_impulses INTEGER NOT NULL CHECK(price_impulses > 0),
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  ledger_transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
  entitlement_id TEXT NOT NULL REFERENCES entitlements(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS impulse_purchases_account_created ON impulse_purchases(cloud_account_id, created_at);
CREATE INDEX IF NOT EXISTS impulse_purchases_scope ON impulse_purchases(server_id, room_id, product_code, status);
