# AccountBook 项目约定

本文件是 `D:\Codex\AccountBook` 的长期开发规范。开始修改前先阅读本文件、`更新记录.md`、`README.md`、和相关源码。

## 1. 产品边界

- AccountBook 是 Windows 本地优先、单用户、免安装的记账应用。
- 技术栈固定为 Tauri v2、React、TypeScript、Vite、Tailwind CSS、shadcn/ui 风格组件和 SQLite。
- SQLite 是生产环境唯一持久化数据源；浏览器开发模式只使用内存演示数据。
- 首版不实现登录、服务器、云同步、多人账本、预算或移动端安装包。
- 保留 `SyncService` 接口，当前实现必须保持完全离线。

## 2. 架构与代码边界

```text
src/
├─ components/       通用 UI、导航和反馈
├─ pages/            页面组合
├─ features/         业务功能模块
├─ db/               SQLite 客户端和 Repository 实现
├─ services/         业务服务、接口和编排
├─ types/            领域类型
├─ hooks/            React Hooks
├─ utils/            金额、日期、搜索和统计工具
└─ test/             测试初始化

src-tauri/
├─ capabilities/     Tauri 权限
├─ migrations/       版本化 SQL 迁移
└─ src/              Rust commands、数据库、备份、资源校验和启动逻辑
```

- 页面和组件不得直接执行 SQL，数据库访问必须经过 Repository / Service。
- 前端通过类型化 Tauri commands 调用 Rust SQLite 适配器，不得重新引入 SQL 插件或依赖 AppConfig 的数据库路径。
- React 组件不得依赖 SQLite 文件路径或 Rust 实现细节。
- 数据库结构变化只能新增版本化迁移；已发布迁移不得重写。
- SQL 必须参数化；需要原子性的批量操作必须使用事务并在失败时回滚。

## 3. 便携存储

- 正式发布包是多文件绿色版；`AccountBook.exe` 只是启动入口，前端资源位于同级 `resources/web/`。
- `resources/manifest.json` 保存资源清单、应用版本和逐文件 SHA-256；正式启动前必须校验版本、路径、文件存在性和哈希。
- 正式运行模式使用 `accountbook://localhost` 自定义 URI Scheme 读取外部资源，不得把前端资源重新嵌入 EXE，也不得在正式模式回退到内嵌资源。
- 开发模式继续使用 Vite `devUrl`，开发启动不要求存在发布包资源目录。
- 数据库固定为应用程序同级目录下的 `data/AccountBook.db`。
- WebView2 数据固定为 `data/webview/`；备份、恢复回滚和完整备份默认使用 `backups/`。
- 首次启动必须自动创建 `data/`、`backups/` 和数据库。
- 启动时必须检查应用目录可写性。只读介质、临时目录或权限不足时，要显示包含实际路径和处理建议的错误，不得静默改用其他目录。
- 退出时清理 WebView2 只允许删除缓存、Cookie 和站点数据，不得删除数据库或备份。


## 4. 数据规则

- 流水和业务实体使用稳定 UUID。
- 金额使用整数分保存：支出为负，收入和退款为正；UI 输入由 Service 统一设置符号。
- 分类和标签允许为空；外部原分类保存在 `source_category`。
- 流水使用软删除；账户、分类和标签优先停用，不破坏历史引用。
- 手动录入允许内容相同的真实流水；只有外部导入使用版本化指纹自动去重。
- 特殊业务身份依赖 `system_key`，不得依赖可重命名的显示名称。

## 5. 导入、导出与备份

- 当前支持支付宝 CSV/XLSX、微信 CSV/XLSX 和标准 CSV。
- 无法识别关键字段时必须明确报错，不得猜测成普通收入或支出。
- 自动过滤记录只保留在当前会话，不写入 SQLite。
- 导入提交必须事务化；重复项计入 `skipped`，失败不得留下部分数据。
- 完整备份和恢复必须校验 SHA-256、SQLite 完整性和应用 schema；恢复前先生成回滚备份。


## 6. UI 规则

- 中文优先，界面紧凑，适合快速录入、扫描和批量编辑。
- 桌面使用侧边导航和数据表格，窄屏使用底部导航和卡片列表；最低验收宽度为 390px。
- 使用 Lucide 图标并提供可访问名称；危险操作需要确认或可恢复机制。
- 表格筛选、排序、列宽调整和长按拖动列顺序应互不冲突；编辑草稿不得因导航或筛选变化静默丢失。
- 页面不得产生无意义的横向溢出；UI 修改后检查桌面和 390px 窄屏。

## 7. 开发与验证

- PowerShell 中统一使用 `npm.cmd`，避免执行策略拦截 `npm.ps1`。
- 缺少工具时先全局检索；确认缺失后可自行安装，安装失败则暂停并报告。
- 修改保持范围清晰，不回退或覆盖无关的用户文件。
- 发布资源加载必须拒绝绝对路径、路径穿越和 resources/web 目录之外的文件；资源目录中允许存在 manifest 未列出的额外文件。
- 前端修改至少运行：

```powershell
npm.cmd test -- --run
npm.cmd run build
```


- Rust/Tauri 修改至少运行格式检查、测试、`cargo check` 和 `cargo clippy --all-targets -- -D warnings`。
- UI 修改检查桌面端和 390px 窄屏；存储、导入和备份修改补充对应的路径、事务、恢复和真实样本验证。
- 构建脚本不得关闭其他目录中的同名进程，也不得修改用户发布目录中的 `data/` 或 `backups/`。

## 8. 构建与发布

- 标准便携构建命令为 `npm.cmd run portable`。
- `package.json` 是版本主来源；发布脚本必须校验 package-lock、Tauri 配置、Cargo 配置和 Cargo.lock 的版本一致。
- `src-tauri/tauri.conf.json` 使用 `accountbook://localhost` 作为生产前端地址，并保持 `bundle.active = false`；不生成 MSI 或 NSIS。
- `scripts/build-portable.ps1` 只生成 `release/staging/AccountBook/` 和 `release/AccountBook-v<version>-windows-x64.zip`，不得生成或更新仓库根目录 EXE。
- 发布目录固定为 `AccountBook/`，包含 `AccountBook.exe`、`resources/`、空的 `data/`、空的 `backups/` 和 `README.md`。
- GitHub Release 只上传运行 ZIP；GitHub 自动生成的源码归档不重复上传，也不上传单独的裸 EXE。
- 不得上传 `data/AccountBook.db`、`data/webview/`、真实备份或其他用户数据。

## 9. 文档与 Git

- 每次项目修改后，必须在根目录 `更新记录.md` 中总结实际改动和已完成验证；只记录已经完成的事实。
- 每次项目修改完成并通过基础验证后，必须运行 `scripts/build-portable.ps1`重新生成发布 staging 目录和 ZIP；未完成便携构建不得视为收尾完成。
- 每次项目修改完成后，必须检查 `git status`，确认没有误包含数据库、备份、真实账单、构建缓存或其他用户文件，然后在本地 Git 执行一次 commit。
- Commit 应只包含本次有意修改的文件，提交信息应能概括本次变更。
- 如果存在无法安全处理的既有未提交改动，不得擅自覆盖或回退，应先报告。
- 用户运行方式变化时更新 `README.md`。
