import { invoke } from "@tauri-apps/api/core";

export interface DatabaseExecuteResult {
  rowsAffected: number;
  lastInsertId: number;
}

export interface PortableDatabaseInfo {
  applicationDir: string;
  dataDir: string;
  backupsDir: string;
  databasePath: string;
}

export interface PortableDatabaseClient {
  select<T>(sql: string, bindValues?: unknown[]): Promise<T>;
  execute(sql: string, bindValues?: unknown[]): Promise<DatabaseExecuteResult>;
}

const client: PortableDatabaseClient = {
  select: <T>(sql: string, bindValues: unknown[] = []) =>
    invoke<T>("database_select", { sql, bindValues }),
  execute: (sql: string, bindValues: unknown[] = []) =>
    invoke<DatabaseExecuteResult>("database_execute", { sql, bindValues }),
};

let databasePromise: Promise<PortableDatabaseClient> | null = null;

export function getDatabase(): Promise<PortableDatabaseClient> {
  if (!databasePromise) {
    databasePromise = invoke<PortableDatabaseInfo>("portable_database_info").then(() => client);
  }
  return databasePromise;
}

export function getPortableDatabaseInfo(): Promise<PortableDatabaseInfo> {
  return invoke<PortableDatabaseInfo>("portable_database_info");
}

export function resetDatabaseConnection(): void {
  databasePromise = null;
}
