# AccountBook

AccountBook 是一款面向个人和家庭使用的 Windows 本地记账软件。它强调**快速记录、清晰整理和数据掌控**，不需要注册账号，也不依赖网络。

## 软件特色

- 本地保存账本数据，不上传云端，不依赖服务器。
- 支持快速记账、流水筛选、排序、批量编辑和月度预设。
- 支持支付宝 CSV/XLSX、微信 CSV/XLSX 和标准 CSV 导入。
- 提供收入、支出、结余、趋势和分类统计。
- 使用多文件绿色版发布包，不需要安装程序。

## 下载和运行

GitHub Release 提供 `AccountBook-v<version>-windows-x64.zip`，其中 `<version>` 是应用版本，例如 `2.1.0`。请先将压缩包完整解压到普通且具有写入权限的文件夹，例如 `D:\AccountBook`，再双击其中的 `AccountBook\AccountBook.exe`。

发布包结构如下：

```text
AccountBook/
├─ AccountBook.exe              # 启动入口，不包含前端资源
├─ resources/
│  ├─ web/                      # 前端 HTML、JavaScript、CSS 和其他资源
│  └─ manifest.json             # 资源版本和 SHA-256 清单
├─ data/                        # 账本数据库和 WebView2 数据
├─ backups/                     # 默认备份目录
└─ README.md
```

`AccountBook.exe` 不能脱离同级 `resources/` 目录运行。启动时会校验资源清单中的版本、文件路径和 SHA-256；资源缺失、被修改或版本不匹配时，程序会阻止启动并提示重新完整解压发布包。

不要直接从压缩包内部、临时目录、只读磁盘或受保护的系统目录运行。程序不会把账本数据偷偷改存到 AppData 或其他目录。

## 覆盖升级

1. 退出正在运行的 AccountBook。
2. 解压新版本压缩包中的 `AccountBook.exe` 和 `resources/`，覆盖旧目录中的同名文件。
3. 保留原有的 `data/` 和 `backups/`，不要用新包中的空目录覆盖它们。
4. 重新双击 `AccountBook.exe`。

数据库仍会使用已有的 `data/AccountBook.db`，并继续执行版本化数据库迁移。升级前建议先创建完整备份。

## 数据和备份

软件会在应用程序所在目录保存以下内容：

```text
data/
├─ AccountBook.db              # 账本数据库
└─ webview/                    # WebView2 缓存、Cookie 和站点数据
backups/                       # 默认备份目录
```

- 首次启动会自动创建 `data/`、`data/webview/`、`backups/` 和数据库文件。
- “创建完整备份”默认保存到 `backups/`，也可以选择其他位置。
- 恢复备份前会检查 SHA-256、SQLite 完整性和应用 schema，并先创建回滚备份。
- 退出时清理 WebView2 只会删除缓存、Cookie 和站点数据，不会删除账本或备份。
- 请不要把真实数据库、WebView2 数据或备份文件上传到公开平台。

## 运行要求

- Windows 10 或 Windows 11
- Microsoft Edge WebView2 Runtime
- 软件所在目录具有写入权限

## 开发和构建

开发环境继续使用 Vite 和 Tauri 开发模式。便携发布是手动操作，不会随着 Git commit 自动执行。首次从源码构建前，先安装锁定的项目依赖：

```powershell
npm.cmd ci
```

使用当前版本校验并构建发布包：

```powershell
npm.cmd run portable
```

同步应用版本并构建发布包，例如：

```powershell
npm.cmd run portable -- -Version 2.1.0
```

脚本只同步 `package.json`、`package-lock.json` 根包版本字段、Tauri 配置和 Rust 应用包版本；版本必须是严格的 `MAJOR.MINOR.PATCH` 格式。自动化执行时可追加 `-NoPause`，错误会返回非零退出码且不会等待输入。依赖缺失时请先执行 `npm.cmd ci`；版本不一致或构建失败时脚本会显示具体原因，交互式执行会暂停等待确认。

构建结果位于仓库的 `release/` 目录：

```text
release/
├─ staging/AccountBook/        # 发布包临时目录
└─ AccountBook-v<version>-windows-x64.zip
```

发布脚本不会生成或更新仓库根目录的裸 EXE。`release/staging/` 和发布 ZIP 只用于手动发布，不应加入 Git commit；GitHub Release 只上传运行 ZIP。GitHub 会自动提供源码归档，不需要另行上传源码 ZIP，也不上传单独的裸 EXE。
