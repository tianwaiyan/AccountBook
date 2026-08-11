use std::{collections::HashMap, sync::Mutex};

use rusqlite::{params_from_iter, types::Value as SqlValue, Connection, OptionalExtension};
use serde::Serialize;
use serde_json::Value as JsonValue;
use tauri::State;

use crate::storage::{
    apply_pending_restore, ensure_portable_layout, portable_paths, PortablePaths,
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    rows_affected: usize,
    last_insert_id: i64,
}

pub struct PortableDatabase {
    paths: Option<PortablePaths>,
    connection: Mutex<Option<Connection>>,
    startup_error: Option<String>,
}

impl PortableDatabase {
    pub fn initialize() -> Self {
        let paths = match portable_paths() {
            Ok(paths) => paths,
            Err(error) => {
                return Self {
                    paths: None,
                    connection: Mutex::new(None),
                    startup_error: Some(error),
                };
            }
        };
        match Self::connect(paths.clone(), true) {
            Ok(database) => database,
            Err(error) => Self {
                paths: Some(paths),
                connection: Mutex::new(None),
                startup_error: Some(error),
            },
        }
    }

    fn connect(paths: PortablePaths, reject_temporary_directory: bool) -> Result<Self, String> {
        ensure_portable_layout(&paths, reject_temporary_directory)?;
        apply_pending_restore(&paths)?;
        let connection = Connection::open(&paths.database_path).map_err(|error| {
            format!(
                "无法打开便携数据库 {}：{}",
                paths.database_path.display(),
                error
            )
        })?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;")
            .map_err(|error| error.to_string())?;
        apply_migrations(&connection)?;
        Ok(Self {
            paths: Some(paths),
            connection: Mutex::new(Some(connection)),
            startup_error: None,
        })
    }

    #[cfg(test)]
    fn initialize_at(root: &std::path::Path) -> Result<Self, String> {
        Self::connect(crate::storage::portable_paths_at(root), false)
    }

    pub fn paths(&self) -> Result<&PortablePaths, String> {
        if self.startup_error.is_some() {
            return Err(self.error_message());
        }
        self.paths.as_ref().ok_or_else(|| self.error_message())
    }

    pub fn configured_paths(&self) -> Option<&PortablePaths> {
        self.paths.as_ref()
    }

    pub fn is_ready(&self) -> bool {
        self.startup_error.is_none()
    }

    pub fn should_clear_webview_data_on_exit(&self) -> bool {
        self.with_connection(|connection| {
            let value = connection
                .query_row(
                    "SELECT value_json FROM app_settings WHERE key = ? LIMIT 1",
                    ["clear_webview_data_on_exit"],
                    |row| row.get::<_, String>(0),
                )
                .optional()
                .map_err(|error| error.to_string())?;
            Ok(value
                .and_then(|json| serde_json::from_str::<bool>(&json).ok())
                .unwrap_or(true))
        })
        .unwrap_or(false)
    }

    fn error_message(&self) -> String {
        self.startup_error
            .clone()
            .unwrap_or_else(|| "便携数据库尚未初始化".into())
    }

    fn with_connection<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self
            .connection
            .lock()
            .map_err(|_| "数据库连接状态异常，请重新启动 AccountBook".to_string())?;
        let connection = guard.as_mut().ok_or_else(|| self.error_message())?;
        operation(connection)
    }

    fn select(
        &self,
        sql: &str,
        bind_values: Vec<JsonValue>,
    ) -> Result<Vec<HashMap<String, JsonValue>>, String> {
        self.with_connection(|connection| {
            let values = bind_values
                .into_iter()
                .map(json_to_sql)
                .collect::<Result<Vec<_>, _>>()?;
            let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
            let columns = statement
                .column_names()
                .into_iter()
                .map(str::to_string)
                .collect::<Vec<_>>();
            let rows = statement
                .query_map(params_from_iter(values.iter()), |row| {
                    let mut result = HashMap::with_capacity(columns.len());
                    for (index, name) in columns.iter().enumerate() {
                        result.insert(name.clone(), sql_to_json(row.get_ref(index)?));
                    }
                    Ok(result)
                })
                .map_err(|error| error.to_string())?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| error.to_string())?;
            Ok(rows)
        })
    }

    fn execute(&self, sql: &str, bind_values: Vec<JsonValue>) -> Result<ExecuteResult, String> {
        self.with_connection(|connection| {
            let values = bind_values
                .into_iter()
                .map(json_to_sql)
                .collect::<Result<Vec<_>, _>>()?;
            let rows_affected = connection
                .execute(sql, params_from_iter(values.iter()))
                .map_err(|error| error.to_string())?;
            Ok(ExecuteResult {
                rows_affected,
                last_insert_id: connection.last_insert_rowid(),
            })
        })
    }
}

fn apply_migrations(connection: &Connection) -> Result<(), String> {
    for migration in [
        include_str!("../migrations/0001_initial.sql"),
        include_str!("../migrations/0002_seed_defaults.sql"),
        include_str!("../migrations/0003_legacy_hash_index.sql"),
    ] {
        connection
            .execute_batch(migration)
            .map_err(|error| format!("数据库迁移失败：{error}"))?;
    }
    Ok(())
}

fn json_to_sql(value: JsonValue) -> Result<SqlValue, String> {
    match value {
        JsonValue::Null => Ok(SqlValue::Null),
        JsonValue::Bool(value) => Ok(SqlValue::Integer(i64::from(value))),
        JsonValue::Number(value) => {
            if let Some(integer) = value.as_i64() {
                Ok(SqlValue::Integer(integer))
            } else if let Some(unsigned) = value.as_u64() {
                i64::try_from(unsigned)
                    .map(SqlValue::Integer)
                    .map_err(|_| format!("SQL 整数超出范围：{unsigned}"))
            } else if let Some(real) = value.as_f64() {
                Ok(SqlValue::Real(real))
            } else {
                Err(format!("无法转换 SQL 数字参数：{value}"))
            }
        }
        JsonValue::String(value) => Ok(SqlValue::Text(value)),
        JsonValue::Array(_) | JsonValue::Object(_) => {
            Err("SQL 参数仅支持空值、布尔值、数字和字符串".into())
        }
    }
}

fn sql_to_json(value: rusqlite::types::ValueRef<'_>) -> JsonValue {
    match value {
        rusqlite::types::ValueRef::Null => JsonValue::Null,
        rusqlite::types::ValueRef::Integer(value) => JsonValue::from(value),
        rusqlite::types::ValueRef::Real(value) => JsonValue::from(value),
        rusqlite::types::ValueRef::Text(value) => {
            JsonValue::String(String::from_utf8_lossy(value).into_owned())
        }
        rusqlite::types::ValueRef::Blob(value) => JsonValue::Array(
            value
                .iter()
                .copied()
                .map(JsonValue::from)
                .collect::<Vec<_>>(),
        ),
    }
}

#[tauri::command]
pub fn portable_database_info(
    database: State<'_, PortableDatabase>,
) -> Result<PortablePaths, String> {
    database.paths().cloned()
}

#[tauri::command]
pub fn database_select(
    database: State<'_, PortableDatabase>,
    sql: String,
    bind_values: Option<Vec<JsonValue>>,
) -> Result<Vec<HashMap<String, JsonValue>>, String> {
    database.select(&sql, bind_values.unwrap_or_default())
}

#[tauri::command]
pub fn database_execute(
    database: State<'_, PortableDatabase>,
    sql: String,
    bind_values: Option<Vec<JsonValue>>,
) -> Result<ExecuteResult, String> {
    database.execute(&sql, bind_values.unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use serde_json::json;
    use uuid::Uuid;

    use super::PortableDatabase;

    #[test]
    fn creates_and_uses_database_in_the_application_directory() {
        let root = std::env::temp_dir().join(format!("account-book-portable-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create portable root");
        let database =
            PortableDatabase::initialize_at(&root).expect("initialize portable database");
        let paths = database.paths().expect("read portable paths");
        assert_eq!(
            paths.database_path,
            root.join("data").join("AccountBook.db")
        );
        assert!(paths.database_path.is_file());
        assert!(root.join("backups").is_dir());

        database
            .execute(
                "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                vec![json!("portable-test"), json!("true")],
            )
            .expect("write portable database");
        let rows = database
            .select(
                "SELECT value_json AS valueJson FROM app_settings WHERE key = ?",
                vec![json!("portable-test")],
            )
            .expect("read portable database");
        assert_eq!(rows[0]["valueJson"], json!("true"));

        drop(database);
        fs::remove_dir_all(root).expect("remove portable root");
    }

    #[test]
    fn reads_the_webview_cleanup_preference_from_settings() {
        let root = std::env::temp_dir().join(format!("account-book-webview-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).expect("create portable root");
        let database =
            PortableDatabase::initialize_at(&root).expect("initialize portable database");
        assert!(database.should_clear_webview_data_on_exit());

        database
            .execute(
                "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                vec![json!("clear_webview_data_on_exit"), json!("true")],
            )
            .expect("save cleanup preference");
        assert!(database.should_clear_webview_data_on_exit());

        database
            .execute(
                "UPDATE app_settings SET value_json = ? WHERE key = ?",
                vec![json!("false"), json!("clear_webview_data_on_exit")],
            )
            .expect("disable cleanup preference");
        assert!(!database.should_clear_webview_data_on_exit());

        drop(database);
        fs::remove_dir_all(root).expect("remove portable root");
    }
}
