use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use serde::Serialize;

pub const DATABASE_FILE_NAME: &str = "AccountBook.db";
pub const PENDING_RESTORE_FILE_NAME: &str = "AccountBook.pending-restore.db";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortablePaths {
    pub application_dir: PathBuf,
    pub data_dir: PathBuf,
    pub backups_dir: PathBuf,
    pub database_path: PathBuf,
}

pub fn portable_paths() -> Result<PortablePaths, String> {
    let executable = env::current_exe().map_err(|error| format!("无法定位应用程序：{error}"))?;
    let application_dir = executable
        .parent()
        .ok_or_else(|| "无法确定应用程序所在目录".to_string())?;

    Ok(portable_paths_at(application_dir))
}

pub fn portable_paths_at(application_dir: impl AsRef<Path>) -> PortablePaths {
    let application_dir = application_dir.as_ref().to_path_buf();
    let data_dir = application_dir.join("data");
    let backups_dir = application_dir.join("backups");
    let database_path = data_dir.join(DATABASE_FILE_NAME);
    PortablePaths {
        application_dir,
        data_dir,
        backups_dir,
        database_path,
    }
}

pub fn ensure_portable_layout(
    paths: &PortablePaths,
    reject_temporary_directory: bool,
) -> Result<(), String> {
    if reject_temporary_directory {
        if let (Ok(temp_dir), Ok(app_dir)) = (
            env::temp_dir().canonicalize(),
            paths.application_dir.canonicalize(),
        ) {
            if app_dir.starts_with(&temp_dir) {
                return Err(format!(
                    "AccountBook 当前从临时目录运行：{}。请先完整解压发布文件，再从可写目录启动 AccountBook.exe。",
                    paths.application_dir.display()
                ));
            }
        }
    }
    fs::create_dir_all(&paths.data_dir).map_err(|error| writable_error(paths, error))?;
    fs::create_dir_all(&paths.backups_dir).map_err(|error| writable_error(paths, error))?;

    let probe = paths
        .application_dir
        .join(format!(".accountbook-write-test-{}", std::process::id()));
    let result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&probe)?;
        file.write_all(b"AccountBook write test")?;
        file.sync_all()?;
        fs::remove_file(&probe)?;
        Ok(())
    })();
    if let Err(error) = result {
        let _ = fs::remove_file(&probe);
        return Err(writable_error(paths, error));
    }
    Ok(())
}

fn writable_error(paths: &PortablePaths, error: std::io::Error) -> String {
    format!(
        "AccountBook 无法写入应用目录：{}。请将 AccountBook.exe、data 和 backups 完整放在有写入权限的目录（例如 D:\\AccountBook）；不要从临时目录、只读介质或受保护目录直接运行。详细错误：{}",
        paths.application_dir.display(),
        error
    )
}

pub fn pending_restore_path(paths: &PortablePaths) -> PathBuf {
    paths.data_dir.join(PENDING_RESTORE_FILE_NAME)
}

pub fn apply_pending_restore(paths: &PortablePaths) -> Result<(), String> {
    let pending = pending_restore_path(paths);
    apply_pending_restore_files(&paths.database_path, &pending, &paths.backups_dir)
}

pub(crate) fn apply_pending_restore_files(
    database: &Path,
    pending: &Path,
    backups_dir: &Path,
) -> Result<(), String> {
    if !pending.exists() {
        return Ok(());
    }
    fs::create_dir_all(backups_dir).map_err(|error| error.to_string())?;
    if database.exists() {
        let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
        let rollback = backups_dir.join(format!("AccountBook.rollback-{timestamp}.db"));
        fs::copy(database, rollback).map_err(|error| error.to_string())?;
        fs::remove_file(database).map_err(|error| error.to_string())?;
    }
    fs::rename(pending, database)
        .or_else(|_| {
            fs::copy(pending, database)?;
            fs::remove_file(pending)
        })
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use uuid::Uuid;

    use super::{ensure_portable_layout, portable_paths_at};

    #[test]
    fn rejects_temporary_application_directories() {
        let root = std::env::temp_dir().join(format!("account-book-temp-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create temporary application directory");
        let error = ensure_portable_layout(&portable_paths_at(&root), true)
            .expect_err("temporary directory must be rejected");
        assert!(error.contains("临时目录"));
        fs::remove_dir_all(root).expect("remove temporary application directory");
    }

    #[test]
    fn reports_a_clear_error_when_data_directory_cannot_be_created() {
        let root = std::env::temp_dir().join(format!("account-book-readonly-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create application directory");
        fs::write(root.join("data"), b"blocks directory creation")
            .expect("create blocking data file");
        let error = ensure_portable_layout(&portable_paths_at(&root), false)
            .expect_err("unwritable layout must be rejected");
        assert!(error.contains("无法写入应用目录"));
        assert!(error.contains(root.to_string_lossy().as_ref()));
        fs::remove_dir_all(root).expect("remove application directory");
    }
}
