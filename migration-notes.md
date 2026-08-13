# 数据库迁移说明

## 当前迁移

- `0001_initial.sql`：基础账本、账户、分类、标签、流水和应用设置。
- `0002_seed_defaults.sql`：默认账本和默认选项。
- `0003_legacy_hash_index.sql`：历史导入哈希索引兼容。
- `0004_monthly_presets.sql`：固定账目预设、预设月份运行记录和生成流水关联。

## 月度预设数据

月度预设保存在 `monthly_presets`，日期规则以经过服务层校验的结构化 JSON 保存在 `rule_json`，界面不直接编辑 Cron 或 RRULE。批量生成使用 `monthly_preset_runs` 防止同一预设同一月份重复执行，具体流水关联在 `monthly_preset_run_items`。

生成的流水仍写入现有 `transactions` 表，并使用 `source = 'preset'`。已生成流水可以像普通流水一样编辑，修改预设不会回写历史流水。

## 备份与发布

备份测试会加载全部迁移。便携发布由开发者手动执行，不需要随着 Git commit 一起发布。首次从源码构建前先执行 `npm.cmd ci`，然后运行发布脚本；脚本会先询问本次发布版本号，直接回车表示使用当前版本：

```powershell
npm.cmd run portable
```

自动化执行时追加 `-NoPause` 会跳过询问并沿用当前版本：

```powershell
npm.cmd run portable -- -NoPause
```

需要发布新版本时，使用严格三段式版本号同步应用版本并构建：

```powershell
npm.cmd run portable -- -Version 2.1.0
```

脚本只更新应用版本字段，不修改依赖包版本、数据库迁移版本、资源格式版本、备份格式版本或历史更新记录；自动化执行可追加 `-NoPause`。输出为 `release/staging/AccountBook/` 和 `release/AccountBook-v<version>-windows-x64.zip`。发布包中的 EXE 只作为启动入口，前端资源由 `resources/web/` 提供；数据库、备份和真实账单不属于发布文件，staging 和 ZIP 也不加入 Git commit。
