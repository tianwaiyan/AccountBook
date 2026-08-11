INSERT OR IGNORE INTO books(id, name, currency_code, timezone, created_at, updated_at)
VALUES ('book-default', '我的账本', 'CNY', 'Asia/Hong_Kong', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO accounts(id, book_id, name, sort_order, created_at, updated_at) VALUES
('account-alipay', 'book-default', '支付宝', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('account-wechat', 'book-default', '微信', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('account-cash', 'book-default', '现金', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('account-beijing-bank', 'book-default', '北京银行卡', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('account-china-bank', 'book-default', '中国银行卡', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('account-communications-bank', 'book-default', '交通银行卡', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('account-meituan-credit', 'book-default', '美团月付', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO tags(id, book_id, kind, name, sort_order, created_at, updated_at) VALUES
('tag-expense-essential', 'book-default', 'expense', '生存刚需', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tag-expense-quality', 'book-default', 'expense', '品质生活', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tag-expense-growth', 'book-default', 'expense', '自我投资', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tag-expense-social', 'book-default', 'expense', '人情往来', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tag-income-labor', 'book-default', 'income', '劳动收入', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tag-income-property', 'book-default', 'income', '财产收入', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('tag-income-transfer', 'book-default', 'income', '转移收入', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO categories(id, book_id, kind, name, system_key, default_tag_id, sort_order, created_at, updated_at) VALUES
('category-expense-living', 'book-default', 'expense', '生活费用', NULL, NULL, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-food', 'book-default', 'expense', '伙食费用', NULL, 'tag-expense-quality', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-transport', 'book-default', 'expense', '交通出行', NULL, 'tag-expense-essential', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-leisure', 'book-default', 'expense', '休闲娱乐', NULL, 'tag-expense-quality', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-study', 'book-default', 'expense', '办公学习', NULL, NULL, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-travel', 'book-default', 'expense', '外出旅游', NULL, 'tag-expense-quality', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-health', 'book-default', 'expense', '医疗保健', NULL, 'tag-expense-essential', 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-clothing', 'book-default', 'expense', '服饰鞋帽', NULL, 'tag-expense-quality', 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-goods', 'book-default', 'expense', '非日用品', NULL, 'tag-expense-quality', 8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-other', 'book-default', 'expense', '其它支出', NULL, 'tag-expense-quality', 9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-pass-through', 'book-default', 'expense', '过手转出', 'pass_through_expense', NULL, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-expense-public', 'book-default', 'expense', '公费垫付', 'public_expense', NULL, 11, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-salary', 'book-default', 'income', '工资收入', NULL, 'tag-income-labor', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-bonus', 'book-default', 'income', '奖金收入', NULL, 'tag-income-labor', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-part-time', 'book-default', 'income', '兼职收入', NULL, 'tag-income-labor', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-interest', 'book-default', 'income', '银行利息', NULL, 'tag-income-property', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-transfer', 'book-default', 'income', '转账收入', NULL, 'tag-income-transfer', 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-other', 'book-default', 'income', '其它收入', NULL, 'tag-income-transfer', 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-pass-through', 'book-default', 'income', '过手转入', 'pass_through_income', NULL, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('category-income-reimbursement', 'book-default', 'income', '垫付报销', 'reimbursement', NULL, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO app_settings(key, value_json, updated_at)
VALUES ('current_book_id', '"book-default"', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at)
VALUES (2, 'seed_defaults', '0002-seed-defaults-v1', CURRENT_TIMESTAMP);

