import type { SyncResult, SyncService, SyncStatus } from "@/services/contracts";

export class LocalOnlySyncService implements SyncService {
  async getStatus(): Promise<SyncStatus> {
    return { mode: "local-only", lastSyncedAt: null };
  }

  async sync(): Promise<SyncResult> {
    return { pushed: 0, pulled: 0, conflicts: 0 };
  }
}

