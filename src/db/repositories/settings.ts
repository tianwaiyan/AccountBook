import { getDatabase } from "@/db/client";

export class SqliteSettingsRepository {
  async get<T>(key: string, fallback: T): Promise<T> {
    const database = await getDatabase();
    const rows = await database.select<Array<{ valueJson: string }>>(
      "SELECT value_json AS valueJson FROM app_settings WHERE key = ? LIMIT 1",
      [key],
    );
    if (!rows[0]) return fallback;
    try {
      return JSON.parse(rows[0].valueJson) as T;
    } catch {
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    const database = await getDatabase();
    await database.execute(
      `INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)],
    );
  }
}

