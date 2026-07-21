CREATE TABLE IF NOT EXISTS cloud_accounts (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK(status IN ('active','restricted','frozen','closed')),
        country TEXT,
        debt_amount INTEGER NOT NULL DEFAULT 0 CHECK(debt_amount >= 0),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS local_account_links (
        id TEXT PRIMARY KEY,
        cloud_account_id TEXT NOT NULL REFERENCES cloud_accounts(id),
        server_id TEXT NOT NULL,
        local_user_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('linked','unlinked','revoked')),
        linked_at TEXT NOT NULL,
        unlinked_at TEXT,
        last_verified_at TEXT NOT NULL,
        UNIQUE(server_id, local_user_id)
      );
      CREATE INDEX IF NOT EXISTS local_account_links_account ON local_account_links(cloud_account_id, status);

      CREATE TABLE IF NOT EXISTS products (
        code TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        product_type TEXT NOT NULL,
        impulse_amount INTEGER NOT NULL DEFAULT 0,
        entitlement_duration_days INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS prices (
        id TEXT PRIMARY KEY,
        product_code TEXT NOT NULL REFERENCES products(code),
        provider_price_id TEXT NOT NULL,
        currency TEXT NOT NULL,
        amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
        region TEXT NOT NULL DEFAULT '*',
        tax_mode TEXT NOT NULL DEFAULT 'exclusive',
        active INTEGER NOT NULL DEFAULT 1,
        UNIQUE(provider_price_id)
      );

      CREATE TABLE IF NOT EXISTS wallets (
        id TEXT PRIMARY KEY,
        cloud_account_id TEXT NOT NULL UNIQUE REFERENCES cloud_accounts(id),
        currency TEXT NOT NULL,
        balance INTEGER NOT NULL DEFAULT 0 CHECK(balance >= 0),
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ledger_accounts (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(owner_type, owner_id, kind, currency)
      );
      CREATE TABLE IF NOT EXISTS ledger_transactions (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL,
        reference_id TEXT,
        idempotency_key TEXT NOT NULL UNIQUE,
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
        account_id TEXT NOT NULL REFERENCES ledger_accounts(id),
        debit INTEGER NOT NULL DEFAULT 0 CHECK(debit >= 0),
        credit INTEGER NOT NULL DEFAULT 0 CHECK(credit >= 0),
        currency TEXT NOT NULL,
        created_at TEXT NOT NULL,
        CHECK((debit = 0 AND credit > 0) OR (credit = 0 AND debit > 0))
      );
      CREATE INDEX IF NOT EXISTS ledger_entries_transaction ON ledger_entries(transaction_id);
      CREATE INDEX IF NOT EXISTS ledger_entries_account ON ledger_entries(account_id, created_at);

      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        cloud_account_id TEXT NOT NULL REFERENCES cloud_accounts(id),
        server_id TEXT NOT NULL,
        local_user_id TEXT NOT NULL,
        product_code TEXT NOT NULL REFERENCES products(code),
        price_id TEXT NOT NULL REFERENCES prices(id),
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE
      );
      CREATE TABLE IF NOT EXISTS checkout_sessions (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        provider TEXT NOT NULL,
        provider_session_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        url TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS payments (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        provider TEXT NOT NULL,
        provider_payment_id TEXT NOT NULL UNIQUE,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS provider_events (
        provider_event_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        received_at TEXT NOT NULL,
        processed_at TEXT,
        error_code TEXT
      );
      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        payment_id TEXT NOT NULL REFERENCES payments(id),
        provider_refund_id TEXT UNIQUE,
        amount_minor INTEGER NOT NULL,
        status TEXT NOT NULL,
        ledger_transaction_id TEXT REFERENCES ledger_transactions(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS disputes (
        id TEXT PRIMARY KEY,
        payment_id TEXT REFERENCES payments(id),
        provider_dispute_id TEXT NOT NULL UNIQUE,
        amount_minor INTEGER NOT NULL,
        status TEXT NOT NULL,
        ledger_transaction_id TEXT REFERENCES ledger_transactions(id),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS receipts (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id),
        payment_id TEXT NOT NULL REFERENCES payments(id),
        receipt_number TEXT NOT NULL UNIQUE,
        amount_minor INTEGER NOT NULL,
        currency TEXT NOT NULL,
        tax_minor INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        provider_url TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS subscriptions (
        id TEXT PRIMARY KEY,
        cloud_account_id TEXT NOT NULL REFERENCES cloud_accounts(id),
        product_code TEXT NOT NULL REFERENCES products(code),
        provider_subscription_id TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL,
        cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS subscription_periods (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
        period_start TEXT NOT NULL,
        grant_type TEXT NOT NULL,
        ledger_transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
        created_at TEXT NOT NULL,
        UNIQUE(subscription_id, period_start, grant_type)
      );

      CREATE TABLE IF NOT EXISTS room_goals (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        room_id TEXT NOT NULL,
        product_code TEXT NOT NULL REFERENCES products(code),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        target_amount INTEGER NOT NULL CHECK(target_amount > 0),
        current_amount INTEGER NOT NULL DEFAULT 0 CHECK(current_amount >= 0),
        status TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        funded_at TEXT,
        closed_at TEXT,
        entitlement_duration_days INTEGER NOT NULL,
        CHECK(current_amount <= target_amount)
      );
      CREATE INDEX IF NOT EXISTS room_goals_scope ON room_goals(server_id, room_id, status);
      CREATE TABLE IF NOT EXISTS goal_contributions (
        id TEXT PRIMARY KEY,
        goal_id TEXT NOT NULL REFERENCES room_goals(id),
        cloud_account_id TEXT NOT NULL REFERENCES cloud_accounts(id),
        local_user_id TEXT NOT NULL,
        requested_amount INTEGER NOT NULL,
        accepted_amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        ledger_transaction_id TEXT NOT NULL REFERENCES ledger_transactions(id),
        created_at TEXT NOT NULL,
        refunded_at TEXT,
        UNIQUE(local_user_id, idempotency_key)
      );
      CREATE INDEX IF NOT EXISTS goal_contributions_goal ON goal_contributions(goal_id, created_at);

      CREATE TABLE IF NOT EXISTS entitlements (
        id TEXT PRIMARY KEY,
        jti TEXT NOT NULL UNIQUE,
        cloud_account_id TEXT REFERENCES cloud_accounts(id),
        server_id TEXT NOT NULL,
        room_id TEXT,
        product_code TEXT NOT NULL,
        status TEXT NOT NULL,
        issued_at TEXT NOT NULL,
        not_before TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        key_id TEXT NOT NULL,
        envelope_json TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS entitlements_scope ON entitlements(server_id, room_id, product_code, status, expires_at);

      CREATE TABLE IF NOT EXISTS outbox_events (
        event_id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        aggregate_type TEXT NOT NULL,
        aggregate_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS operator_audit (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        metadata_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );
