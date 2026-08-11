# AccountBook

AccountBook 是一款 Windows 本地记账软件。数据保存在本机，不需要登录、服务器或云同步。

## 快速开始

1. 将 `AccountBook.exe` 放在一个普通且可写的文件夹中。
2. 双击 `AccountBook.exe` 启动软件。
3. 首次启动会自动创建 `data`、`backups` 和数据库文件。

建议把软件放在例如 `D:\AccountBook` 这样的目录中。不要直接从临时目录、只读磁盘或没有写入权限的系统目录运行。

## 运行要求

- Windows 10 或 Windows 11
- Microsoft Edge WebView2 Runtime
- 应用目录具有写入权限

如果启动时提示目录不可写，请把整个软件文件夹移动到具有写入权限的位置后再启动。软件不会偷偷把数据改存到 AppData 或其他位置。

## 数据和备份

软件会在应用程序所在目录保存数据：

```text
AccountBook.exe
data/
  AccountBook.db       # 账本数据库，首次启动自动创建
  webview/              # WebView2 运行数据
backups/                # 默认备份目录
```

- 数据库固定为 `data/AccountBook.db`。
- 完整备份默认保存到 `backups/`，也可以在保存时选择其他位置。
- 恢复备份前会检查文件完整性，并自动创建回滚备份。
- 设置中的“退出时清理 WebView2 浏览数据”只清理缓存、Cookie 和站点数据，不会删除账本或备份。
- 移动软件时，请同时移动 `AccountBook.exe`、`data` 和 `backups` 文件夹。

## 主要功能

- 概览月度收支、趋势和分类统计
- 快速记账、流水筛选、排序、批量编辑和复制
- 长按表头调整流水列表列顺序，列宽可以单独调整
- 支付宝、微信 CSV/XLSX，以及标准 CSV 账单导入
- 账户、分类、标签和状态管理
- CSV 导出、完整本地备份和恢复

## 本地隐私

AccountBook 首版完全离线。账本数据、备份和 WebView2 数据都保存在应用目录中，不会自动上传到网络。

## 开发者预览

在项目根目录打开 PowerShell：

```powershell
Set-Location D:\Codex\AccountBook
npm.cmd run dev
```

然后在浏览器打开 `http://localhost:1420`。浏览器预览使用内存演示数据，只适合检查界面和交互。

构建根目录便携版 EXE：

```powershell
npm.cmd run portable
```

验证项目：

```powershell
npm.cmd test -- --run
npm.cmd run build
```

项目不会生成 MSI、NSIS 或 ZIP 安装程序，也不需要 WiX Toolset。

## 反馈和数据安全

提交问题时请不要上传 `data/AccountBook.db`、`data/webview`、`backups` 中的真实备份或任何真实账单文件。
