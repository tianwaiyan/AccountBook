use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};

use chrono::Local;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::State;
use uuid::Uuid;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

use crate::{
    database::PortableDatabase,
    storage::{pending_restore_path, DATABASE_FILE_NAME},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupReport {
    backup_path: String,
    database_bytes: u64,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest {
    format_version: u32,
    app_version: String,
    created_at: String,
    database_sha256: String,
    database_bytes: u64,
}

const MAX_BACKUP_BYTES: u64 = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 1024 * 1024;
const MAX_DATABASE_BYTES: u64 = 256 * 1024 * 1024;
const MAX_ZIP_ENTRIES: usize = 1024;

#[derive(Clone, Copy)]
struct RestoreLimits {
    max_backup_bytes: u64,
    max_manifest_bytes: u64,
    max_database_bytes: u64,
    max_zip_entries: usize,
}

impl Default for RestoreLimits {
    fn default() -> Self {
        Self {
            max_backup_bytes: MAX_BACKUP_BYTES,
            max_manifest_bytes: MAX_MANIFEST_BYTES,
            max_database_bytes: MAX_DATABASE_BYTES,
            max_zip_entries: MAX_ZIP_ENTRIES,
        }
    }
}

fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn check_database(path: &Path) -> Result<(), String> {
    let connection = Connection::open(path).map_err(|error| error.to_string())?;
    let result: String = connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if result != "ok" {
        return Err(format!("SQLite 完整性检查失败：{result}"));
    }
    let has_schema: i64 = connection
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
            [],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    if has_schema == 0 {
        return Err("备份文件不是 AccountBook 数据库".into());
    }
    Ok(())
}

#[tauri::command]
pub fn create_backup(
    database: State<'_, PortableDatabase>,
    target_path: String,
) -> Result<BackupReport, String> {
    create_backup_file(&database.paths()?.database_path, Path::new(&target_path))
}

fn create_backup_file(database_path: &Path, target_path: &Path) -> Result<BackupReport, String> {
    if !database_path.exists() {
        return Err("数据库尚未创建".into());
    }
    let connection = Connection::open(database_path).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|error| error.to_string())?;
    drop(connection);

    let database_bytes = fs::read(database_path).map_err(|error| error.to_string())?;
    let created_at = Local::now().to_rfc3339();
    let manifest = BackupManifest {
        format_version: 1,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        created_at: created_at.clone(),
        database_sha256: sha256(&database_bytes),
        database_bytes: database_bytes.len() as u64,
    };

    let file = fs::File::create(target_path).map_err(|error| error.to_string())?;
    let mut archive = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    archive
        .start_file("manifest.json", options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(
            serde_json::to_string_pretty(&manifest)
                .map_err(|error| error.to_string())?
                .as_bytes(),
        )
        .map_err(|error| error.to_string())?;
    archive
        .start_file(DATABASE_FILE_NAME, options)
        .map_err(|error| error.to_string())?;
    archive
        .write_all(&database_bytes)
        .map_err(|error| error.to_string())?;
    archive.finish().map_err(|error| error.to_string())?;

    Ok(BackupReport {
        backup_path: target_path.to_string_lossy().into_owned(),
        database_bytes: database_bytes.len() as u64,
        created_at,
    })
}

#[tauri::command]
pub fn stage_restore(
    database: State<'_, PortableDatabase>,
    backup_path: String,
) -> Result<String, String> {
    let pending_path = pending_restore_path(database.paths()?);
    stage_restore_file(Path::new(&backup_path), &pending_path)
        .map(|path| path.to_string_lossy().into_owned())
}

fn stage_restore_file(backup_path: &Path, pending_path: &Path) -> Result<PathBuf, String> {
    stage_restore_file_with_limits(backup_path, pending_path, RestoreLimits::default())
}

fn stage_restore_file_with_limits(
    backup_path: &Path,
    pending_path: &Path,
    limits: RestoreLimits,
) -> Result<PathBuf, String> {
    let backup_bytes = fs::metadata(backup_path)
        .map_err(|error| error.to_string())?
        .len();
    if backup_bytes > limits.max_backup_bytes {
        return Err(format!(
            "备份文件超过大小限制：{} 字节，最大允许 {} 字节",
            backup_bytes, limits.max_backup_bytes
        ));
    }

    let file = fs::File::open(backup_path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    if archive.len() > limits.max_zip_entries {
        return Err(format!(
            "备份包含过多 ZIP 条目：{} 个，最大允许 {} 个",
            archive.len(),
            limits.max_zip_entries
        ));
    }

    let manifest: BackupManifest = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|_| "备份缺少 manifest.json".to_string())?;
        let entry_bytes = entry.size();
        if entry_bytes > limits.max_manifest_bytes {
            return Err(format!(
                "备份 manifest 超过大小限制：{} 字节，最大允许 {} 字节",
                entry_bytes, limits.max_manifest_bytes
            ));
        }
        let bytes = read_entry_limited(&mut entry, limits.max_manifest_bytes, "manifest")?;
        let text = String::from_utf8(bytes).map_err(|error| error.to_string())?;
        serde_json::from_str(&text).map_err(|error| format!("备份清单无效：{error}"))?
    };
    if manifest.format_version != 1 {
        return Err(format!("不支持的备份格式版本：{}", manifest.format_version));
    }
    if manifest.database_bytes > limits.max_database_bytes {
        return Err(format!(
            "备份数据库超过大小限制：{} 字节，最大允许 {} 字节",
            manifest.database_bytes, limits.max_database_bytes
        ));
    }

    let database_entry = if archive.file_names().any(|name| name == DATABASE_FILE_NAME) {
        DATABASE_FILE_NAME
    } else {
        "account-book.db"
    };
    let mut database_entry = archive
        .by_name(database_entry)
        .map_err(|_| format!("备份缺少 {DATABASE_FILE_NAME}"))?;
    if database_entry.size() > limits.max_database_bytes {
        return Err(format!(
            "备份数据库条目超过大小限制：{} 字节，最大允许 {} 字节",
            database_entry.size(),
            limits.max_database_bytes
        ));
    }
    let database_bytes =
        read_entry_limited(&mut database_entry, limits.max_database_bytes, "database")?;
    if database_bytes.len() as u64 != manifest.database_bytes
        || sha256(&database_bytes) != manifest.database_sha256
    {
        return Err("备份数据库校验值不匹配".into());
    }

    let temporary_path = pending_path.with_file_name(format!(
        ".{}-{}.tmp",
        pending_path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("accountbook-restore"),
        Uuid::new_v4()
    ));
    fs::write(&temporary_path, database_bytes).map_err(|error| error.to_string())?;
    if let Err(error) = check_database(&temporary_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error);
    }
    if pending_path.exists() {
        fs::remove_file(pending_path).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(&temporary_path, pending_path) {
        let _ = fs::remove_file(&temporary_path);
        return Err(error.to_string());
    }
    Ok(pending_path.to_path_buf())
}

fn read_entry_limited<R: Read>(
    entry: &mut R,
    max_bytes: u64,
    label: &str,
) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let mut limited = entry.take(max_bytes.saturating_add(1));
    limited
        .read_to_end(&mut bytes)
        .map_err(|error| format!("读取备份 {label} 失败：{error}"))?;
    if bytes.len() as u64 > max_bytes {
        return Err(format!(
            "备份 {label} 超过大小限制：最大允许 {} 字节",
            max_bytes
        ));
    }
    Ok(bytes)
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::{fs, io::Write, path::Path};

    use rusqlite::{params, Connection};
    use serde_json::json;
    use uuid::Uuid;
    use zip::{write::SimpleFileOptions, ZipWriter};

    use super::{
        create_backup_file, sha256, stage_restore_file, stage_restore_file_with_limits,
        RestoreLimits,
    };
    use crate::storage::apply_pending_restore_files;

    fn manifest_bytes(database: &[u8], database_bytes: usize) -> Vec<u8> {
        serde_json::to_vec(&json!({
            "formatVersion": 1,
            "appVersion": env!("CARGO_PKG_VERSION"),
            "createdAt": "2026-08-31T00:00:00+08:00",
            "databaseSha256": sha256(database),
            "databaseBytes": database_bytes,
        }))
        .expect("serialize backup manifest")
    }

    fn write_archive(path: &Path, manifest: &[u8], database: Option<&[u8]>, extra_entries: usize) {
        let file = fs::File::create(path).expect("create test backup");
        let mut archive = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        archive
            .start_file("manifest.json", options)
            .expect("start manifest entry");
        archive.write_all(manifest).expect("write manifest entry");
        if let Some(database) = database {
            archive
                .start_file(super::DATABASE_FILE_NAME, options)
                .expect("start database entry");
            archive.write_all(database).expect("write database entry");
        }
        for index in 0..extra_entries {
            archive
                .start_file(format!("extra-{index}.txt"), options)
                .expect("start extra entry");
            archive.write_all(b"extra").expect("write extra entry");
        }
        archive.finish().expect("finish test backup");
    }

    fn test_limits() -> RestoreLimits {
        RestoreLimits {
            max_backup_bytes: 1024 * 1024,
            max_manifest_bytes: 1024,
            max_database_bytes: 1024,
            max_zip_entries: 16,
        }
    }

    fn apply_schema(path: &std::path::Path) {
        let connection = Connection::open(path).expect("create test database");
        connection
            .execute_batch(include_str!("../migrations/0001_initial.sql"))
            .expect("apply initial schema");
        connection
            .execute_batch(include_str!("../migrations/0002_seed_defaults.sql"))
            .expect("seed defaults");
        connection
            .execute_batch(include_str!("../migrations/0003_legacy_hash_index.sql"))
            .expect("apply legacy hash index");
        connection
            .execute_batch(include_str!("../migrations/0004_monthly_presets.sql"))
            .expect("apply monthly presets");
        connection
            .execute(
                "INSERT INTO transactions(
                  id, book_id, occurred_at, account_id, trade_type, amount_minor,
                  remark, counterparty, payment_channel, source, created_at, updated_at
                 ) VALUES (?, 'book-default', '2026-08-09 09:30:00', 'account-cash',
                           'expense', -12345, '备份测试', '测试商户', '现金', 'manual',
                           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
                params![Uuid::new_v4().to_string()],
            )
            .expect("insert test transaction");
    }

    #[test]
    fn backup_and_restore_round_trip_preserves_the_database() {
        let temp =
            std::env::temp_dir().join(format!("account-book-backup-test-{}", Uuid::new_v4()));
        let database = temp.join("account-book.db");
        let backup = temp.join("account-book.abbackup");
        let pending = temp.join("account-book.pending-restore.db");
        let rollbacks = temp.join("backups");
        fs::create_dir_all(&temp).expect("create test directory");
        apply_schema(&database);

        let expected = fs::read(&database).expect("read source database");
        let report = create_backup_file(&database, &backup).expect("create backup");
        assert_eq!(report.database_bytes, expected.len() as u64);
        assert!(backup.is_file());

        {
            let connection = Connection::open(&database).expect("open database for mutation");
            connection
                .execute("DELETE FROM transactions", [])
                .expect("mutate current database");
        }
        assert_ne!(
            fs::read(&database).expect("read mutated database"),
            expected
        );

        stage_restore_file(&backup, &pending).expect("stage restore");
        apply_pending_restore_files(&database, &pending, &rollbacks).expect("apply staged restore");
        assert_eq!(
            fs::read(&database).expect("read restored database"),
            expected
        );
        assert!(!pending.exists());

        let rollback_count = fs::read_dir(&rollbacks)
            .expect("read test directory")
            .filter_map(Result::ok)
            .filter(|entry| {
                entry
                    .file_name()
                    .to_string_lossy()
                    .starts_with("AccountBook.rollback-")
            })
            .count();
        assert_eq!(rollback_count, 1);

        fs::remove_dir_all(temp).expect("remove test directory");
    }

    #[test]
    fn rejects_an_oversized_backup_without_replacing_pending_restore() {
        let temp =
            std::env::temp_dir().join(format!("account-book-backup-limit-{}", Uuid::new_v4()));
        let backup = temp.join("oversized.accountbook-backup");
        let pending = temp.join("pending.db");
        fs::create_dir_all(&temp).expect("create test directory");
        let database = b"small database";
        write_archive(
            &backup,
            &manifest_bytes(database, database.len()),
            Some(database),
            0,
        );
        fs::write(&pending, b"existing pending restore").expect("write existing pending restore");

        let archive_size = fs::metadata(&backup).expect("read backup metadata").len();
        let mut limits = test_limits();
        limits.max_backup_bytes = archive_size - 1;
        let error = stage_restore_file_with_limits(&backup, &pending, limits)
            .expect_err("oversized backup must be rejected");

        assert!(error.contains("备份文件超过大小限制"));
        assert_eq!(
            fs::read(&pending).expect("read pending restore"),
            b"existing pending restore"
        );
        fs::remove_dir_all(temp).expect("remove test directory");
    }

    #[test]
    fn rejects_an_oversized_manifest_without_replacing_pending_restore() {
        let temp =
            std::env::temp_dir().join(format!("account-book-manifest-limit-{}", Uuid::new_v4()));
        let backup = temp.join("oversized-manifest.accountbook-backup");
        let pending = temp.join("pending.db");
        fs::create_dir_all(&temp).expect("create test directory");
        let database = b"small database";
        let mut manifest = manifest_bytes(database, database.len());
        manifest.extend(std::iter::repeat_n(b'x', 64));
        write_archive(&backup, &manifest, Some(database), 0);
        fs::write(&pending, b"existing pending restore").expect("write existing pending restore");

        let mut limits = test_limits();
        limits.max_manifest_bytes = 16;
        let error = stage_restore_file_with_limits(&backup, &pending, limits)
            .expect_err("oversized manifest must be rejected");

        assert!(error.contains("manifest 超过大小限制"));
        assert_eq!(
            fs::read(&pending).expect("read pending restore"),
            b"existing pending restore"
        );
        fs::remove_dir_all(temp).expect("remove test directory");
    }

    #[test]
    fn rejects_an_oversized_database_entry_without_replacing_pending_restore() {
        let temp =
            std::env::temp_dir().join(format!("account-book-database-limit-{}", Uuid::new_v4()));
        let backup = temp.join("oversized-database.accountbook-backup");
        let pending = temp.join("pending.db");
        fs::create_dir_all(&temp).expect("create test directory");
        let database = vec![b'd'; 64];
        write_archive(&backup, &manifest_bytes(&database, 16), Some(&database), 0);
        fs::write(&pending, b"existing pending restore").expect("write existing pending restore");

        let mut limits = test_limits();
        limits.max_database_bytes = 16;
        let error = stage_restore_file_with_limits(&backup, &pending, limits)
            .expect_err("oversized database entry must be rejected");

        assert!(error.contains("数据库条目超过大小限制"));
        assert_eq!(
            fs::read(&pending).expect("read pending restore"),
            b"existing pending restore"
        );
        fs::remove_dir_all(temp).expect("remove test directory");
    }

    #[test]
    fn rejects_too_many_zip_entries_without_replacing_pending_restore() {
        let temp =
            std::env::temp_dir().join(format!("account-book-entry-limit-{}", Uuid::new_v4()));
        let backup = temp.join("too-many-entries.accountbook-backup");
        let pending = temp.join("pending.db");
        fs::create_dir_all(&temp).expect("create test directory");
        let database = b"small database";
        write_archive(
            &backup,
            &manifest_bytes(database, database.len()),
            Some(database),
            3,
        );
        fs::write(&pending, b"existing pending restore").expect("write existing pending restore");

        let mut limits = test_limits();
        limits.max_zip_entries = 2;
        let error = stage_restore_file_with_limits(&backup, &pending, limits)
            .expect_err("too many ZIP entries must be rejected");

        assert!(error.contains("过多 ZIP 条目"));
        assert_eq!(
            fs::read(&pending).expect("read pending restore"),
            b"existing pending restore"
        );
        fs::remove_dir_all(temp).expect("remove test directory");
    }

    #[test]
    fn preserves_existing_pending_restore_when_archive_read_fails() {
        let temp =
            std::env::temp_dir().join(format!("account-book-read-failure-{}", Uuid::new_v4()));
        let backup = temp.join("missing-database.accountbook-backup");
        let pending = temp.join("pending.db");
        fs::create_dir_all(&temp).expect("create test directory");
        let database = b"small database";
        write_archive(&backup, &manifest_bytes(database, database.len()), None, 0);
        fs::write(&pending, b"existing pending restore").expect("write existing pending restore");

        let error = stage_restore_file(&backup, &pending).expect_err("missing database must fail");

        assert!(error.contains("备份缺少"));
        assert_eq!(
            fs::read(&pending).expect("read pending restore"),
            b"existing pending restore"
        );
        fs::remove_dir_all(temp).expect("remove test directory");
    }
}
