PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS books (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  currency_code TEXT NOT NULL DEFAULT 'CNY',
  timezone TEXT NOT NULL DEFAULT 'Asia/Hong_Kong',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  kind TEXT NOT NULL CHECK(kind IN ('expense', 'income')),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(book_id, kind, name)
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(book_id, name)
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  kind TEXT NOT NULL CHECK(kind IN ('expense', 'income')),
  name TEXT NOT NULL,
  system_key TEXT,
  default_tag_id TEXT REFERENCES tags(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(book_id, kind, name),
  UNIQUE(book_id, system_key)
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  occurred_at TEXT NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  trade_type TEXT NOT NULL CHECK(trade_type IN ('expense', 'refund', 'income')),
  amount_minor INTEGER NOT NULL,
  category_id TEXT REFERENCES categories(id),
  tag_id TEXT REFERENCES tags(id),
  status_code TEXT,
  remark TEXT NOT NULL DEFAULT '',
  counterparty TEXT NOT NULL DEFAULT '',
  payment_channel TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'manual',
  source_category TEXT,
  import_fingerprint TEXT,
  fingerprint_version INTEGER,
  legacy_import_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK(
    (trade_type = 'expense' AND amount_minor < 0) OR
    (trade_type IN ('income', 'refund') AND amount_minor > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_import_fingerprint
  ON transactions(book_id, import_fingerprint)
  WHERE import_fingerprint IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_occurred_at
  ON transactions(book_id, occurred_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_category
  ON transactions(book_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_account
  ON transactions(book_id, account_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS source_category_mappings (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL REFERENCES books(id),
  source TEXT NOT NULL,
  source_category TEXT NOT NULL,
  trade_type TEXT NOT NULL CHECK(trade_type IN ('expense', 'refund', 'income')),
  category_id TEXT NOT NULL REFERENCES categories(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(book_id, source, source_category, trade_type)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at)
VALUES (1, 'initial', '0001-initial-v1', CURRENT_TIMESTAMP);

