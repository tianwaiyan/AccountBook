# AccountBook Codex 工作规范

本文件只记录长期有效的工作规则。开始任务前阅读本文件、`.codex/STATE.md`、`.codex/TASK.md`、相关源码和 `更新记录.md`。

规则冲突优先级为：用户当前要求、`AGENTS.md`、`STATE.md`、`TASK.md`、`DECISIONS.md`、实际代码与配置、其他文档、README、历史聊天。若文档与代码行为冲突，以代码为事实并修正文档，不为了符合旧文档修改代码。

## 1. 项目地图

- AccountBook 是 Windows 本地优先、单用户、离线运行的记账应用。
- 技术栈：Tauri v2、React、TypeScript、Vite、Tailwind、Vitest、Rust、`rusqlite`。
- `src/`：React 页面、组件、业务 features、Repository、Service、类型、工具和前端测试。
- `src-tauri/`：Tauri 启动逻辑、Rust commands、SQLite、备份、资源校验、存储和版本化 migration。
- `scripts/`：构建和便携发布脚本；当前应用版本以 `package.json` 为主来源。
- 浏览器 Vite 开发模式使用内存 Demo；Tauri 模式使用 Rust SQLite 适配器。
- 生产前端使用 `accountbook://localhost` 从同级 `resources/web/` 读取外部资源。

## 2. 绝对安全规则

- 不删除、覆盖、上传或泄露真实用户数据库、备份、导出文件或账务内容。
- 不用测试数据覆盖用户数据，不在日志、调试输出或异常信息中写入不必要的账务内容。
- 不覆盖未提交的修改；发现既有修改时先保护并排除，不擅自回退。
- 未经明确授权不得执行不可逆数据库操作、危险清理、强制 Git 操作或发布上传。
- 禁止使用 `git reset --hard`、`git clean -fd`、`git restore .`、`git checkout -- .`、`git push --force`。
- 不擅自改变本地优先、离线能力、数据位置、核心 schema、金额规则、迁移、备份恢复或发布架构。
- 风险无法判断时停止写操作，先说明影响、回滚方案和需要的授权。

## 3. DATA SAFETY

- 便携运行时以可执行文件所在目录为根；默认数据库是 `data/AccountBook.db`，WebView2 数据是 `data/webview/`，默认备份和恢复回滚在 `backups/`。
- 恢复暂存文件是 `data/AccountBook.pending-restore.db`；未知数据文件、回滚文件和用户选择的外部备份一律按重要数据处理。
- 当前仓库已确认的 `data/AccountBook.db` 与 `backups/legacy/` 是早期测试数据，可在明确的开发任务中使用；不得把它们与真实用户安装目录混淆。
- 浏览器测试使用 Demo 数据；Rust 测试使用带 UUID 的临时目录。没有固定的专用测试数据库时，不得指向用户运行目录。
- 数据库结构变化只能新增 migration；不得重写或删除已发布 migration，必须验证旧库迁移、兼容性、事务和失败回滚。
- 当前 migration 未完整实现 checksum drift detection；当前 restore 校验主要是 SHA-256、字节数、SQLite `quick_check` 和 `schema_migrations` 表存在性，不得在文档中夸大为完整 schema 校验。
- backup/restore 修改必须先保护原库并验证失败路径；不得用 `database_execute` 或 `write_text_file` 对真实路径做调试写入。
- Git 禁止提交 `data/`、`backups/`、真实账单、备份、日志、缓存、`dist/`、`release/` 和构建输出。

## 4. D 盘工作空间

- 项目工作目录固定为 `D:\Codex\AccountBook`。
- 项目文件、大型过程文件、分析输出和临时脚本优先写入 D 盘；不要把 C 盘作为默认项目工作目录。
- 能配置临时目录时优先使用项目 `.codex/tmp/` 或 D 盘临时目录；系统工具必须使用 C 盘时，不破坏系统目录，记录限制并尽可能清理本次产物。
- 清理前必须确认范围；未知文件、用户明确保留的文件、数据库和备份不得删除。
- 对于已经存在的 `.md` 文件，优先使用 `apply_patch` 进行局部修改；新建 `.md` 文件时可直接创建。

## 5. 架构边界

- 页面和组件不得直接执行 SQL；数据库访问经 Repository / Service 组织。
- 当前前端通过通用 `database_select`、`database_execute` Tauri 接口访问 Rust SQLite 适配器，SQL 主要由 Repository 维护；不要声称当前所有 command 都是 schema 级强类型接口。
- React 不依赖 SQLite 文件路径或 Rust 内部实现；路径由 Rust 根据可执行文件位置计算。
- SQL 必须参数化；批量写入、导入和预设生成必须使用事务，失败回滚。
- 稳定 UUID 用于流水和业务实体；金额以整数分保存，支出为负，收入和退款为正。
- 流水软删除；账户、分类和标签优先停用；外部原分类保存为 `source_category`。
- 手动录入允许相同真实流水；外部导入使用版本化 fingerprint 去重；特殊业务身份使用 `system_key`。
- 当前导入范围为支付宝 CSV/XLSX、微信 CSV/XLSX 和标准 CSV；无法识别关键字段必须明确报错。

## 6. 产品决策边界

- 普通实现优先复用现有目录、Repository、Service、Tauri 和 SQLite 模式，采用最小必要修改。
- 非必要不得重构数据库、状态管理、UI 框架、依赖、发布机制或无关模块。
- 需求若影响金额、日期、ID、数据模型、导入去重、migration、backup/restore、数据位置或离线能力，先分析兼容性和风险。
- 存在重大且无法从代码推断的产品选择时，向用户说明冲突，给出2~3个可选方案，等用户决定后再实施。

## 7. 修改前调查

- 开始任务时先执行 `git status --short`，确认已有未提交修改，不得覆盖、回退、删除或擅自提交与当前任务无关的修改。
- 先确定影响边界和验证范围，再修改；不要看到一个文件就大规模重写。
- 发现与当前任务无关的问题只记录建议，不顺手扩大范围。
- 快速检查 `.codex/STATE.md` 和 `.codex/TASK.md`，判断是否存在与当前任务相关的项目状态或未完成任务。仅在内容相关时深入阅读。
- 如果任务涉及架构、数据库、schema、migration、数据模型、backup/restore、import/export 或其他长期设计，阅读 `.codex/DECISIONS.md`，额外检查 schema、migration、路径和相关脚本。
- 小型修改通常无需更新 `TASK.md`；需要多个步骤、涉及多个模块或需要持续跟踪的任务，应使用 `TASK.md` 记录目标、进度、验证结果和下一步。
- 仅在项目当前状态发生实质变化时更新 `STATE.md`。
- 仅在产生长期有效的架构或产品决策时更新 `DECISIONS.md`。
- 长任务发生重要阶段变化时更新 `TASK.md`；发生 context compaction 前，确保必要状态已写入 `TASK.md` 和 `STATE.md` 。

## 8. 验证与发布

- 前端修改按需运行 `npm.cmd test` 和 `npm.cmd run build`；本项目中 `test` 已执行 `vitest run`。
- Rust/Tauri 修改按需在 `src-tauri/` 运行 `cargo fmt --check`、`cargo test`、`cargo check` 和 `cargo clippy --all-targets -- -D warnings`。
- UI 修改检查桌面布局；存储、导入、备份和恢复修改补充对应的隔离数据验证。
- `scripts/build-portable.ps1` 会重建 `release/staging/` 和版本 ZIP，可能清理已有发布产物；只在任务需要且用户授权时运行。
- 便携构建前须确认版本字段、外部资源、`bundle.active = false` 和 `accountbook://localhost` 与实际配置一致；GitHub Release 由用户手动执行。

## 9. Git、文档与状态

- 修改前后检查 `git status --short`、`git diff --stat` 和目标文件 diff。
- 完成一个逻辑完整、经过验证的功能单元后，默认创建一次本地 commit。commit 只包含本任务明确修改的文件。
- commit提交信息为 type: description 格式，description 应能概括本次变更。type 为英文格式，description 为中文格式。
- 探索性修改、实验性分支或用户明确要求不要提交时，不强制 commit。有外部未提交修改时不擅自 commit。
- 项目修改后在 `更新记录.md` 顶部追加真实的长期变化，不记录测试过程；历史记录不重写。
- `AGENTS.md` 只放永久规则；`.codex/STATE.md` 放当前项目状态；`.codex/TASK.md` 放当前任务；`.codex/DECISIONS.md` 放长期决策。
- 长任务完成重要阶段后更新状态；发生 context compaction 前，确保状态文件能独立说明已完成内容、阻塞点和下一步。
- 修改后提供本地预览的浏览器地址。