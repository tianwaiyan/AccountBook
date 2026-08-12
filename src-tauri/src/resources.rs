use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
};

use serde::Deserialize;
use sha2::{Digest, Sha256};

use tauri::http::{Method, Request, Response, StatusCode};

const MANIFEST_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ResourceManifest {
    format_version: u32,
    app_version: String,
    files: Vec<ResourceFile>,
}

#[derive(Debug, Deserialize)]
struct ResourceFile {
    path: String,
    sha256: String,
}

pub fn load(resources_root: impl AsRef<Path>, expected_version: &str) -> Result<(), String> {
    let resources_root = resources_root.as_ref().to_path_buf();
    let web_root = resources_root.join("web");
    let manifest_path = resources_root.join("manifest.json");
    let manifest_text = fs::read_to_string(&manifest_path).map_err(|error| {
        format!(
            "无法读取外部资源清单：{}。详细错误：{}",
            manifest_path.display(),
            error
        )
    })?;
    let manifest: ResourceManifest = serde_json::from_str(&manifest_text).map_err(|error| {
        format!(
            "外部资源清单格式无效：{}。详细错误：{}",
            manifest_path.display(),
            error
        )
    })?;

    if manifest.format_version != MANIFEST_FORMAT_VERSION {
        return Err(format!(
            "不支持的外部资源清单版本：{}，当前程序需要版本 {}。",
            manifest.format_version, MANIFEST_FORMAT_VERSION
        ));
    }
    if manifest.app_version != expected_version {
        return Err(format!(
            "程序版本与外部资源版本不一致：程序为 {}，资源为 {}。",
            expected_version, manifest.app_version
        ));
    }
    if manifest.files.is_empty() {
        return Err("外部资源清单没有列出任何前端文件。".to_string());
    }

    let canonical_web_root = fs::canonicalize(&web_root).map_err(|error| {
        format!(
            "无法定位外部前端资源目录：{}。详细错误：{}",
            web_root.display(),
            error
        )
    })?;
    let mut seen_paths = HashSet::new();
    let mut has_index = false;

    for file in manifest.files {
        let relative_path = safe_relative_path(&file.path)?;
        let normalized_path = relative_path.to_string_lossy().replace('\\', "/");
        if !seen_paths.insert(normalized_path.clone()) {
            return Err(format!("外部资源清单包含重复文件：{}。", file.path));
        }
        if normalized_path == "index.html" {
            has_index = true;
        }

        let path = web_root.join(&relative_path);
        let canonical_path = fs::canonicalize(&path).map_err(|error| {
            format!("外部资源文件缺失：{}。详细错误：{}", path.display(), error)
        })?;
        if !canonical_path.starts_with(&canonical_web_root) {
            return Err(format!(
                "外部资源文件超出 resources/web 目录：{}。",
                file.path
            ));
        }
        if !canonical_path.is_file() {
            return Err(format!("外部资源路径不是文件：{}。", path.display()));
        }

        let actual_hash = sha256_file(&canonical_path).map_err(|error| {
            format!(
                "无法校验外部资源文件：{}。详细错误：{}",
                path.display(),
                error
            )
        })?;
        if !actual_hash.eq_ignore_ascii_case(&file.sha256) {
            return Err(format!(
                "外部资源校验失败：{} 的 SHA-256 不匹配。",
                path.display()
            ));
        }
    }

    if !has_index {
        return Err("外部资源清单缺少入口文件：index.html。".to_string());
    }

    Ok(())
}

pub fn load_for_application(application_dir: impl AsRef<Path>) -> Result<(), String> {
    load(
        application_dir.as_ref().join("resources"),
        env!("CARGO_PKG_VERSION"),
    )
}

pub fn serve_request(web_root: &Path, request: Request<Vec<u8>>) -> Response<Vec<u8>> {
    if request.method() != Method::GET && request.method() != Method::HEAD {
        return error_response(
            StatusCode::METHOD_NOT_ALLOWED,
            "Only GET and HEAD are supported",
        );
    }

    let requested_path = request.uri().path();
    let relative_path = match request_path(requested_path) {
        Ok(path) => path,
        Err(error) => return error_response(StatusCode::BAD_REQUEST, &error),
    };
    let path = web_root.join(&relative_path);
    let canonical_web_root = match fs::canonicalize(web_root) {
        Ok(path) => path,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "External web resources are missing")
        }
    };
    let canonical_path = match fs::canonicalize(&path) {
        Ok(path) => path,
        Err(_) => {
            return error_response(StatusCode::NOT_FOUND, "External resource file is missing")
        }
    };
    if !canonical_path.starts_with(&canonical_web_root) || !canonical_path.is_file() {
        return error_response(
            StatusCode::NOT_FOUND,
            "External resource file is unavailable",
        );
    }

    let body = match fs::read(&canonical_path) {
        Ok(body) => body,
        Err(_) => {
            return error_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "External resource cannot be read",
            )
        }
    };
    let content_type = content_type(&canonical_path);
    let body = if request.method() == Method::HEAD {
        Vec::new()
    } else {
        body
    };

    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("X-Content-Type-Options", "nosniff")
        .body(body)
        .expect("valid resource response")
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value.contains('\0') || value.contains('\\') {
        return Err(format!("外部资源路径无效：{}。", value));
    }

    let path = Path::new(value);
    if path.is_absolute() {
        return Err(format!("外部资源路径必须是相对路径：{}。", value));
    }

    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            Component::CurDir
            | Component::ParentDir
            | Component::RootDir
            | Component::Prefix(_) => {
                return Err(format!("外部资源路径包含不安全部分：{}。", value));
            }
        }
    }

    Ok(path.to_path_buf())
}

fn request_path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() || value == "/" {
        return Ok(PathBuf::from("index.html"));
    }
    if !value.starts_with('/') || value.starts_with("//") {
        return Err("外部资源请求路径无效。".to_string());
    }

    let decoded = percent_decode(&value[1..])?;
    if decoded.is_empty() {
        return Ok(PathBuf::from("index.html"));
    }
    safe_relative_path(&decoded)
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("外部资源请求包含无效编码。".to_string());
            }
            let high = hex_digit(bytes[index + 1])?;
            let low = hex_digit(bytes[index + 2])?;
            decoded.push((high << 4) | low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded).map_err(|_| "外部资源请求不是有效 UTF-8 路径。".to_string())
}

fn hex_digit(value: u8) -> Result<u8, String> {
    match value {
        b'0'..=b'9' => Ok(value - b'0'),
        b'a'..=b'f' => Ok(value - b'a' + 10),
        b'A'..=b'F' => Ok(value - b'A' + 10),
        _ => Err("外部资源请求包含无效编码。".to_string()),
    }
}

fn sha256_file(path: &Path) -> std::io::Result<String> {
    let digest = Sha256::digest(fs::read(path)?);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|extension| extension.to_str()) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("ico") => "image/x-icon",
        Some("webp") => "image/webp",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("wasm") => "application/wasm",
        Some("txt" | "map") => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn error_response(status: StatusCode, message: &str) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("X-Content-Type-Options", "nosniff")
        .body(message.as_bytes().to_vec())
        .expect("valid error response")
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use serde_json::json;
    use uuid::Uuid;

    use super::{load, serve_request};
    use tauri::http::StatusCode;

    fn test_root() -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!("account-book-resources-{}", Uuid::new_v4()));
        fs::create_dir_all(root.join("resources/web/assets")).expect("create resource root");
        fs::write(root.join("resources/web/index.html"), b"<html></html>").expect("write index");
        fs::write(
            root.join("resources/web/assets/app.js"),
            b"console.log('ok');",
        )
        .expect("write asset");
        root
    }

    fn write_manifest(root: &Path, files: serde_json::Value) {
        let manifest = json!({
            "formatVersion": 1,
            "appVersion": "2.0.0",
            "files": files,
        });
        fs::write(
            root.join("resources/manifest.json"),
            serde_json::to_vec_pretty(&manifest).expect("serialize manifest"),
        )
        .expect("write manifest");
    }

    fn actual_files(root: &Path) -> serde_json::Value {
        let index_hash = super::sha256_file(&root.join("resources/web/index.html")).unwrap();
        let app_hash = super::sha256_file(&root.join("resources/web/assets/app.js")).unwrap();
        json!([
            {"path": "index.html", "sha256": index_hash},
            {"path": "assets/app.js", "sha256": app_hash}
        ])
    }

    #[test]
    fn accepts_valid_manifest_and_extra_files() {
        let root = test_root();
        fs::write(root.join("resources/web/extra.txt"), b"extra").expect("write extra");
        write_manifest(&root, actual_files(&root));
        load(root.join("resources"), "2.0.0").expect("valid resources");
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn rejects_version_mismatch() {
        let root = test_root();
        write_manifest(&root, actual_files(&root));
        let error = load(root.join("resources"), "2.1.0").expect_err("version mismatch");
        assert!(error.contains("版本不一致"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn rejects_hash_mismatch() {
        let root = test_root();
        let files = json!([{"path": "index.html", "sha256": "deadbeef"}]);
        write_manifest(&root, files);
        let error = load(root.join("resources"), "2.0.0").expect_err("hash mismatch");
        assert!(error.contains("校验失败"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn rejects_missing_file() {
        let root = test_root();
        let files = json!([
            {"path": "index.html", "sha256": super::sha256_file(&root.join("resources/web/index.html")).unwrap()},
            {"path": "assets/missing.js", "sha256": "deadbeef"}
        ]);
        write_manifest(&root, files);
        let error = load(root.join("resources"), "2.0.0").expect_err("missing file");
        assert!(error.contains("文件缺失"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn rejects_path_traversal() {
        let root = test_root();
        let index_hash = super::sha256_file(&root.join("resources/web/index.html")).unwrap();
        let files = json!([
            {"path": "index.html", "sha256": index_hash},
            {"path": "../outside.txt", "sha256": "deadbeef"}
        ]);
        write_manifest(&root, files);
        let error = load(root.join("resources"), "2.0.0").expect_err("path traversal");
        assert!(error.contains("不安全"));
        fs::remove_dir_all(root).expect("remove test root");
    }

    #[test]
    fn serves_mime_type_and_rejects_encoded_traversal() {
        let root = test_root();
        let request = tauri::http::Request::builder()
            .uri("/assets/app.js")
            .body(Vec::new())
            .expect("build request");
        let response = serve_request(&root.join("resources/web"), request);
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()["content-type"],
            "text/javascript; charset=utf-8"
        );

        let traversal = tauri::http::Request::builder()
            .uri("/%2e%2e/secret.txt")
            .body(Vec::new())
            .expect("build traversal request");
        let response = serve_request(&root.join("resources/web"), traversal);
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        fs::remove_dir_all(root).expect("remove test root");
    }
}
