import type { ImportCandidate } from "@/types/domain";

export const FINGERPRINT_VERSION = 2;

export async function createImportFingerprint(
  input: Pick<ImportCandidate, "accountName" | "occurredAt" | "amountMinor" | "paymentChannel" | "counterparty">,
): Promise<string> {
  const content = [
    `v${FINGERPRINT_VERSION}`,
    input.accountName.trim(),
    input.occurredAt,
    input.amountMinor,
    input.paymentChannel.trim(),
    input.counterparty.trim(),
  ].join("|");
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

