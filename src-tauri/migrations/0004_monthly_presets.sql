CREATE TABLE IF NOT EXISTS monthly_presets (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  name TEXT NOT NULL,
  rule_json TEXT NOT NULL,
  entry_time TEXT NOT NULL DEFAULT '09:00:00',
  account_id TEXT NOT NULL REFERENCES accounts(id),
  trade_type TEXT NOT NULL CHECK(trade_type IN ('expense', 'refund', 'income')),
  amount_minor INTEGER NOT NULL,
  category_id TEXT REFERENCES categories(id),
  tag_id TEXT REFERENCES tags(id),
  status_code TEXT,
  remark TEXT NOT NULL DEFAULT '',
  counterparty TEXT NOT NULL DEFAULT '',
  payment_channel TEXT NOT NULL DEFAULT '',
  default_selected INTEGER NOT NULL DEFAULT 1 CHECK(default_selected IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_monthly_presets_book_active
  ON monthly_presets(book_id, is_active, name);

CREATE TABLE IF NOT EXISTS monthly_preset_runs (
  id TEXT PRIMARY KEY,
  preset_id TEXT NOT NULL REFERENCES monthly_presets(id),
  book_id TEXT NOT NULL REFERENCES books(id),
  year_month TEXT NOT NULL,
  generated_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(preset_id, year_month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_preset_runs_book_month
  ON monthly_preset_runs(book_id, year_month);

CREATE TABLE IF NOT EXISTS monthly_preset_run_items (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES monthly_preset_runs(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_preset_run_items_transaction
  ON monthly_preset_run_items(transaction_id);

INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at)
VALUES (4, 'monthly_presets', '0004-monthly-presets-v1', CURRENT_TIMESTAMP);
