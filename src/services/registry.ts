import { isTauri } from "@tauri-apps/api/core";
import { SqliteAnalyticsRepository } from "@/db/repositories/analytics";
import { SqliteOptionRepository, SqliteSourceMappingRepository } from "@/db/repositories/options";
import { SqliteTransactionRepository } from "@/db/repositories/transactions";
import { SqliteSettingsRepository } from "@/db/repositories/settings";
import {
  DemoAnalyticsRepository,
  DemoOptionRepository,
  DemoSettingsRepository,
  DemoSourceMappingRepository,
  DemoTransactionRepository,
} from "@/db/demo";
import { LocalOnlySyncService } from "@/services/sync-service";
import { TransactionService } from "@/services/transaction-service";

const useDemo = import.meta.env.DEV && !isTauri();

export const transactionRepository = useDemo ? new DemoTransactionRepository() : new SqliteTransactionRepository();
export const optionRepository = useDemo ? new DemoOptionRepository() : new SqliteOptionRepository();
export const analyticsRepository = useDemo ? new DemoAnalyticsRepository() : new SqliteAnalyticsRepository();
export const sourceMappingRepository = useDemo ? new DemoSourceMappingRepository() : new SqliteSourceMappingRepository();
export const settingsRepository = useDemo ? new DemoSettingsRepository() : new SqliteSettingsRepository();
export const transactionService = new TransactionService(transactionRepository, optionRepository);
export const syncService = new LocalOnlySyncService();
