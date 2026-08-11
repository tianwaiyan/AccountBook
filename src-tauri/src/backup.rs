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
    let file = fs::File::open(backup_path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    let manifest: BackupManifest = {
        let mut entry = archive
            .by_name("manifest.json")
            .map_err(|_| "备份缺少 manifest.json".to_string())?;
        let mut text = String::new();
        entry
            .read_to_string(&mut text)
            .map_err(|error| error.to_string())?;
        serde_json::from_str(&text).map_err(|error| format!("备份清单无效：{error}"))?
    };
    if manifest.format_version != 1 {
        return Err(format!("不支持的备份格式版本：{}", manifest.format_version));
    }
    let mut database_bytes = Vec::new();
    let database_entry = if archive.file_names().any(|name| name == DATABASE_FILE_NAME) {
        DATABASE_FILE_NAME
    } else {
        "account-book.db"
    };
    archive
        .by_name(database_entry)
        .map_err(|_| format!("备份缺少 {DATABASE_FILE_NAME}"))?
        .read_to_end(&mut database_bytes)
        .map_err(|error| error.to_string())?;
    if database_bytes.len() as u64 != manifest.database_bytes
        || sha256(&database_bytes) != manifest.database_sha256
    {
        return Err("备份数据库校验值不匹配".into());
    }
    fs::write(pending_path, database_bytes).map_err(|error| error.to_string())?;
    if let Err(error) = check_database(pending_path) {
        let _ = fs::remove_file(pending_path);
        return Err(error);
    }
    Ok(pending_path.to_path_buf())
}

#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    fs::write(path, contents).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use rusqlite::{params, Connection};
    use uuid::Uuid;

    use super::{create_backup_file, stage_restore_file};
    use crate::storage::apply_pending_restore_files;

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
}
