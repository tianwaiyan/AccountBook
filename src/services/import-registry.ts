import { optionRepository, sourceMappingRepository, transactionRepository } from "@/services/registry";
import { BackupService } from "@/services/backup-service";
import { ImportService } from "@/services/import-service";

export const importService = new ImportService(transactionRepository, optionRepository, sourceMappingRepository);
export const backupService = new BackupService();

