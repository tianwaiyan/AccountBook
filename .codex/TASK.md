# Current Task

## Objective

完成第一阶段安全修复：防止 CSV 导出中的电子表格公式注入，并限制备份恢复的资源消耗；保持现有备份格式、恢复流程、数据库 schema 和迁移不变。

## User Requirements

- CSV 用户可控文本字段以 `=`, `+`, `-`, `@` 或控制字符开头时添加单引号保护。
- 金额、日期和其他结构化字段保持原有导出格式。
- 备份恢复限制备份文件 `512 MiB`、manifest `1 MiB`、数据库条目 `256 MiB`、ZIP 条目 `1024` 个。
- 限制在内存分配和写入 `pending-restore` 前检查；失败时保留已有恢复暂存文件。
- 本阶段不处理通用 `database_select`、`database_execute` 和任意路径 `write_text_file` 接口。

## Constraints

- 不修改数据库结构、迁移、金额规则、备份格式或发布架构。
- 不读取、覆盖或上传真实数据库、备份和账务内容。
- 不执行便携发布构建，不处理第二阶段范围外的架构重构。
- 遵守 `AGENTS.md`、`STATE.md` 和项目数据安全规则。

## Plan

- [x] 读取工作规范、状态文档、任务记录、更新记录和相关源码。
- [x] 为 CSV 导出文本字段增加电子表格文本保护，并补充普通文本与金额测试。
- [x] 为备份恢复增加文件、manifest、数据库条目和 ZIP 条目限制。
- [x] 在恢复校验完成后使用临时文件替换暂存文件，失败时保留已有暂存文件。
- [x] 补充超限、读取失败和暂存文件保护测试。
- [x] 更新任务记录和更新记录，明确第二阶段遗留风险。
- [x] 运行前端与 Rust 全套验证。

## Current Step

第一阶段代码、测试和文档已完成，最终验证和修改范围审查通过；第二阶段通用数据库命令与任意路径写入风险仍未修复。

## Blockers

无。

## Verification

- `npm.cmd test`：62 项通过、2 项跳过。
- `npm.cmd run build`：通过。
- `cargo fmt --check`：通过。
- `cargo test`：16 项通过。
- `cargo check`：通过。
- 严格 Clippy：通过。
- 未执行便携发布构建，符合本次计划范围。

## Changed Files

- `src/services/import-service.ts`
- `src/services/import-service.test.ts`
- `src-tauri/src/backup.rs`
- `.codex/TASK.md`
- `更新记录.md`

## Residual Risk

前端仍可通过通用 `database_select` / `database_execute` 传入任意 SQL，`write_text_file` 仍允许任意路径写入。这是计划中的第二阶段工作，本阶段不宣称已关闭。

## Next Step

后续单独设计并实施 Rust 侧白名单业务操作，移除前端任意 SQL 接口和任意路径文本写入命令；开始新任务时更新本文件。
