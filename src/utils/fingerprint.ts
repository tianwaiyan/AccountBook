import type { ImportCandidate } from "@/types/domain";

export const FINGERPRINT_VERSION = 1;

export async function createImportFingerprint(
  input: Pick<ImportCandidate, "source" | "accountName" | "occurredAt" | "amountMinor" | "counterparty" | "remark">,
): Promise<string> {
  const content = [
    `v${FINGERPRINT_VERSION}`,
    input.source,
    input.accountName.trim(),
    input.occurredAt,
    input.amountMinor,
    input.counterparty.trim(),
    input.remark.trim(),
  ].join("|");
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

