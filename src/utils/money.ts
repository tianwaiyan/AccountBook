import type { TradeType } from "@/types/domain";

export function yuanToMinor(value: number | string): number {
  const numeric = typeof value === "string" ? Number(value.replace(/[,¥￥元\s]/g, "")) : value;
  if (!Number.isFinite(numeric)) {
    throw new Error("金额必须是有效数字");
  }
  return Math.round((numeric + Number.EPSILON) * 100);
}

export function signedMinor(value: number | string, tradeType: TradeType): number {
  const minor = Math.abs(yuanToMinor(value));
  if (minor <= 0) {
    throw new Error("金额必须大于 0");
  }
  return tradeType === "expense" ? -minor : minor;
}

export function minorToYuan(value: number): number {
  return value / 100;
}

export function formatMoney(valueMinor: number, options?: { sign?: boolean }): string {
  const formatted = new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: options?.sign ? "auto" : "never",
  }).format(options?.sign ? valueMinor / 100 : Math.abs(valueMinor) / 100);
  return formatted.replace("CN¥", "¥");
}

