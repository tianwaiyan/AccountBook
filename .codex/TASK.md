# Current Task

## Objective

建立 AccountBook 的长期 Codex 工作规范、项目状态、当前任务和架构决策持久化体系。

## User Requirements

- 只修改规范和状态文档，不修改业务代码或产品行为。
- 建立精简的 `AGENTS.md`、`.codex/STATE.md`、`.codex/TASK.md`、`.codex/DECISIONS.md`。
- 在 `更新记录.md` 顶部记录本次规范体系变化。
- 保护已有修改；本次不创建 Git commit。

## Constraints

- 允许修改：`AGENTS.md`、`.codex/` 三个状态文件、`更新记录.md`。
- 禁止修改：`src/`、`src-tauri/`、`package.json`、`scripts/`、`README.md`、`.gitignore`、数据库、migration、备份、release 和 dist。
- 不运行测试、构建、migration、backup、restore、portable build 或业务程序。
- 工作文件优先放在 `D:\Codex\AccountBook`；未知文件不删除。

## Plan

- [x] 复核 Git 状态和当前规范文件。
- [x] 根据实际代码重写长期工作规则。
- [x] 创建持久化项目状态、当前任务和架构决策文件。
- [x] 追加更新记录并检查修改范围。

## Completed

- [x] 将数据安全、D 盘工作空间、危险 Git 操作和清理边界前置。
- [x] 记录真实实现中的通用 SQL command、migration checksum 限制和 restore 校验边界。
- [x] 明确四类状态/历史文档的职责，支持 context compaction 后恢复。

## Current Step

规范体系已写入，最终 diff/status 检查已完成。

## Blockers

无。用户已确认仓库根目录数据库和 legacy backup 是开发/测试数据；本任务仍不执行数据库操作。

## Verification

- 已执行只读 Git 状态检查。
- 未运行测试、构建、migration、backup、restore 或业务程序，符合本任务约束。
- 最终检查只针对允许修改的文档文件和 Git 工作树。

## Changed Files

- `AGENTS.md`
- `.codex/STATE.md`
- `.codex/TASK.md`
- `.codex/DECISIONS.md`
- `更新记录.md`

## Next Step

本任务完成，不创建 commit。后续新任务开始时覆盖本文件中的当前任务内容，并保留本次架构决策和项目状态。
