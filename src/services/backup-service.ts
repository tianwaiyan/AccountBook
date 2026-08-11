import { invoke, isTauri } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { getPortableDatabaseInfo } from "@/db/client";
import type { BackupReport } from "@/types/domain";

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export class BackupService {
  async exportCsv(contents: string): Promise<string | null> {
    if (!isTauri()) throw new Error("CSV 导出需要在桌面应用中运行");
    const path = await save({
      defaultPath: `AccountBook-${timestamp()}.csv`,
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (!path) return null;
    await invoke("write_text_file", { path, contents });
    return path;
  }

  async createBackup(): Promise<BackupReport | null> {
    if (!isTauri()) throw new Error("完整备份需要在桌面应用中运行");
    const { backupsDir } = await getPortableDatabaseInfo();
    const targetPath = await save({
      defaultPath: `${backupsDir.replace(/[\\/]+$/, "")}\\AccountBook-${timestamp()}.accountbook-backup`,
      filters: [{ name: "AccountBook 备份", extensions: ["accountbook-backup"] }],
    });
    if (!targetPath) return null;
    return invoke<BackupReport>("create_backup", { targetPath });
  }

  async restoreBackup(): Promise<boolean> {
    if (!isTauri()) throw new Error("备份恢复需要在桌面应用中运行");
    const backupPath = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "AccountBook 备份", extensions: ["accountbook-backup"] }],
    });
    if (!backupPath || Array.isArray(backupPath)) return false;
    await invoke("stage_restore", { backupPath });
    await relaunch();
    return true;
  }

}
