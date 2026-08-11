CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_legacy_import_hash
  ON transactions(book_id, legacy_import_hash)
  WHERE legacy_import_hash IS NOT NULL AND deleted_at IS NULL;

INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at)
VALUES (3, 'legacy_hash_index', '0003-legacy-hash-index-v1', CURRENT_TIMESTAMP);

