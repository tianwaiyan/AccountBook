# Architecture Decisions

## Decision: Local-first and offline operation

### Status

Accepted

### Decision

AccountBook 以 Windows 本地优先、单用户、离线运行为产品边界；保留 `SyncService` 接口，但当前实现不连接服务器或云同步。

### Rationale

记账数据应由用户掌控，首版不依赖账号、服务器或网络。

### Consequences

业务数据必须保存在本地 SQLite；未来同步能力不能破坏离线能力。

### Date

2026-08-18

## Decision: Desktop-first UI acceptance boundary

### Status

Accepted

### Decision

AccountBook 默认以桌面布局作为 UI 功能验收目标，不默认承诺窄视口适配；只有用户明确提出响应式或窄视口需求时，才为该需求增加专项布局设计和验证。

### Rationale

当前应用的主要使用和验收场景是 Windows 桌面端；将窄视口排除在默认验收范围外，可以避免普通 UI 修改被额外的窄屏约束牵制，同时保持需求边界清晰。

### Consequences

后续普通 UI 任务只需验证桌面布局，不执行 `390px` 等窄视口专项检查，也不主动增加窄视口专用的宽度、换行或溢出适配。该决策不删除现有移动端页面或代码；用户明确提出窄视口需求时，任务范围可单独扩展。

### Date

2026-08-18

## Decision: Portable sibling-directory storage

### Status

Accepted

### Decision

正式运行时以可执行文件同级目录为应用根，数据库位于 `data/AccountBook.db`，WebView2 数据位于 `data/webview/`，默认备份位于 `backups/`。

### Rationale

绿色版需要可移动、可备份且不偷偷改写 AppData 或其他目录。

### Consequences

启动必须检查目录可写性；发布包必须保留 `data/` 和 `backups/`，升级不得覆盖用户数据。

### Date

2026-08-18

## Decision: Rust rusqlite adapter

### Status

Accepted

### Decision

生产 SQLite 由 Rust `rusqlite` 管理，前端经 Tauri 的通用 `database_select` / `database_execute` 接口访问，SQL 由 Repository / Service 组织。

### Rationale

当前实现已从 SQL 插件迁移到本地 Rust SQLite 适配器，并需要保持前端与文件路径、Rust 细节解耦。

### Consequences

页面和组件不能直接执行 SQL；数据库接口当前不是逐业务 command 的强类型 schema API，未来改进需单独决策。

### Date

2026-08-18

## Decision: Append-only database migrations

### Status

Accepted

### Decision

数据库结构变化通过新增版本化 migration 完成；已发布 migration 不重写、不删除。

### Rationale

便携应用需要兼容已有本地数据库，并允许用户跨版本升级。

### Consequences

每次 schema 变化都必须验证旧库迁移、数据兼容、事务和失败回滚；当前 checksum drift detection 尚未完整实现。

### Date

2026-08-18

## Decision: Separate durable project memory by responsibility

### Status

Accepted

### Decision

`AGENTS.md` 保存永久工作规则；`STATE.md` 保存当前项目状态；`TASK.md` 保存当前任务；`DECISIONS.md` 保存长期决策；`更新记录.md` 保存重要历史更新。

### Rationale

不同信息的生命周期不同，分离后可降低 token 消耗并支持 context compaction 后恢复。

### Consequences

这些文件不得互相复制；长任务只在阶段变化时更新对应文件。

### Date

2026-08-18
