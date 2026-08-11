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

备份测试会加载全部迁移。发布前运行 `npm.cmd run portable`，由 `scripts/build-portable.ps1` 生成根目录 `AccountBook.exe`。数据库、备份和真实账单不属于发布文件。
