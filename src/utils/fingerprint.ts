import type { ImportCandidate } from "@/types/domain";

export const FINGERPRINT_VERSION = 2;

export type ImportBusinessFields = Pick<ImportCandidate, "accountName" | "occurredAt" | "amountMinor" | "paymentChannel" | "counterparty">;

export function importBusinessKey(input: ImportBusinessFields, accountIdentity = input.accountName): string {
  return [
    accountIdentity.trim(),
    input.occurredAt.trim(),
    input.amountMinor,
    input.paymentChannel.trim(),
    input.counterparty.trim(),
  ].join("\u001f");
}

export async function createImportFingerprint(
  input: ImportBusinessFields,
  accountIdentity?: string,
): Promise<string> {
  const content = [`v${FINGERPRINT_VERSION}`, importBusinessKey(input, accountIdentity)].join("|");
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

