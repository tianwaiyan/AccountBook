# Project State

## Current Focus

维护 AccountBook 的长期 Codex 工作规范和可恢复状态体系；当前业务功能开发基线稳定。

## Version

当前应用版本为 `2.1.0`，版本主来源是 `package.json`。最近提交为 `d92184ad fix: 统一筛选下拉列表样式`。

## Architecture

- 浏览器 Vite 开发模式使用内存 Demo 数据。
- Tauri 模式通过通用 `database_select` / `database_execute` 接口访问 Rust `rusqlite`。
- 生产资源使用 `accountbook://localhost` 从可执行文件同级 `resources/web/` 加载。
- 前端按页面、组件、features、Repository、Service、类型和工具分层；Rust 端负责启动、存储、SQLite、备份和资源校验。

## Data Locations

- 便携运行时数据库：应用目录 `data/AccountBook.db`。
- WebView2 数据：应用目录 `data/webview/`。
- 默认备份与恢复回滚：应用目录 `backups/`。
- 恢复暂存：`data/AccountBook.pending-restore.db`。
- 当前仓库根目录的数据库和 `backups/legacy/` 备份已确认是早期开发/测试数据，可用于明确隔离的测试任务。

## Database State

- 当前 migration 为 `0001_initial.sql` 至 `0004_monthly_presets.sql`。
- 金额使用整数分，流水使用稳定 UUID、软删除和版本化导入指纹。
- migration 使用 `CREATE IF NOT EXISTS` / `INSERT OR IGNORE`；checksum drift detection 尚未完整实现。

## Import / Export State

- 支持支付宝 CSV/XLSX、微信 CSV/XLSX 和标准 CSV。
- 导入无法识别关键字段时会报错；过滤项只保留在当前会话。
- 外部导入使用 fingerprint 去重，重复项计入 `skipped`；提交事务化。
- 标准 CSV 可导出；完整备份由 Rust 生成带 manifest 的压缩文件。

## Backup / Restore State

- 备份包含 manifest 和数据库文件，校验 SHA-256 与字节数。
- restore 当前还会检查 SQLite `quick_check` 和 `schema_migrations` 表存在性，然后通过 pending 文件重启应用并生成回滚备份。
- 当前实现尚未完成“完整当前应用 schema”校验；修改 backup/restore 前必须明确这一限制。

## Testing State

- 前端测试由 Vitest 驱动，配置为 jsdom；Rust 单元测试覆盖存储、资源、数据库和备份模块。
- 常用命令：`npm.cmd test`、`npm.cmd run build`；Rust 命令在 `src-tauri/` 执行。
- 本次规范重构按用户要求未运行测试、构建、migration、backup、restore 或业务程序。

## Release State

- 便携发布由 `scripts/build-portable.ps1` 生成 `release/staging/AccountBook/` 和版本 ZIP。
- `bundle.active` 保持关闭；GitHub Release 由用户手动执行。
- 构建脚本可能清理并重建发布产物，不应在普通任务中自动运行。

## Known Limitations

- 数据库 command 仍是通用 SQL 适配器，不是逐接口的 schema 强类型 API。
- migration checksum drift detection 尚未完整实现。
- restore 尚未完整验证当前应用全部 schema。
- Rust 测试使用系统临时目录；浏览器 Demo 与 Tauri SQLite 是两套运行路径。

## Important Files

- `AGENTS.md`
- `src/db/client.ts`
- `src/services/registry.ts`
- `src-tauri/src/storage.rs`
- `src-tauri/src/database.rs`
- `src-tauri/src/backup.rs`
- `src-tauri/migrations/`
- `scripts/build-portable.ps1`

## Next Recommended Actions

- 新任务开始时先读取本文件和 `TASK.md`，再检查 Git 状态。
- 涉及数据、迁移、备份、发布或 Tauri 启动逻辑时，先建立隔离测试路径和回滚方案。
- 重要架构变化写入 `DECISIONS.md`，任务阶段变化写入 `TASK.md`。

## Last Updated

2026-08-18
