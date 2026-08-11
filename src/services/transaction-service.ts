import type { OptionRepository, TransactionRepository } from "@/services/contracts";
import type {
  ImportCandidate,
  ImportCommitResult,
  StatusCode,
  Transaction,
  TransactionInput,
} from "@/types/domain";

const SPECIAL_RULES: Record<string, { tradeType: TransactionInput["tradeType"]; statuses: StatusCode[]; defaultStatus: StatusCode }> = {
  public_expense: { tradeType: "expense", statuses: ["pending_reimbursement", "settled"], defaultStatus: "pending_reimbursement" },
  reimbursement: { tradeType: "income", statuses: ["settled"], defaultStatus: "settled" },
  pass_through_income: { tradeType: "income", statuses: ["pending_transfer", "transferred"], defaultStatus: "pending_transfer" },
  pass_through_expense: { tradeType: "expense", statuses: ["transferred"], defaultStatus: "transferred" },
};

export class TransactionService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly options: OptionRepository,
  ) {}

  async createManual(bookId: string, input: TransactionInput): Promise<Transaction> {
    return this.transactions.create(bookId, await this.normalize(input, true));
  }

  async normalizeForBatch(input: TransactionInput): Promise<TransactionInput> {
    return this.normalize(input, true);
  }

  async update(id: string, input: TransactionInput): Promise<void> {
    await this.transactions.update(id, await this.normalize(input, false));
  }

  async bulkUpdate(entries: Array<{ id: string; input: TransactionInput }>): Promise<void> {
    const normalized: Array<{ id: string; input: TransactionInput }> = [];
    for (const entry of entries) {
      normalized.push({ id: entry.id, input: await this.normalize(entry.input, false) });
    }
    await this.transactions.bulkUpdate(normalized);
  }

  async copy(bookId: string, source: Transaction): Promise<Transaction> {
    return this.createManual(bookId, {
      occurredAt: source.occurredAt,
      accountId: source.accountId,
      tradeType: source.tradeType,
      amountMinor: source.amountMinor,
      categoryId: source.categoryId,
      tagId: source.tagId,
      statusCode: source.statusCode,
      remark: source.remark,
      counterparty: source.counterparty,
      paymentChannel: source.paymentChannel,
      source: "copy",
      sourceCategory: source.sourceCategory,
    });
  }

  async commitImport(bookId: string, candidates: ImportCandidate[]): Promise<ImportCommitResult> {
    const valid = candidates.filter((candidate) => !candidate.excludedReason);
    return this.transactions.commitImport(bookId, valid);
  }

  private async normalize(input: TransactionInput, allowDefaultTag: boolean): Promise<TransactionInput> {
    if (!input.accountId) throw new Error("请选择账户");
    if (!input.occurredAt) throw new Error("请输入交易时间");
    const magnitude = Math.abs(Math.round(input.amountMinor));
    if (!magnitude) throw new Error("金额必须大于 0");
    const amountMinor = input.tradeType === "expense" ? -magnitude : magnitude;

    let categoryId = input.categoryId;
    let tagId = input.tagId;
    let statusCode = input.statusCode;
    if (categoryId) {
      const category = await this.options.getCategory(categoryId);
      if (!category) throw new Error("分类不存在");
      const expectedKind = input.tradeType === "income" ? "income" : "expense";
      if (category.kind !== expectedKind) throw new Error("收支类型与分类不匹配");
      const rule = category.systemKey ? SPECIAL_RULES[category.systemKey] : undefined;
      if (rule) {
        if (rule.tradeType !== input.tradeType) throw new Error("特殊分类与收支类型不匹配");
        statusCode = statusCode && rule.statuses.includes(statusCode) ? statusCode : rule.defaultStatus;
        tagId = null;
      } else {
        statusCode = null;
        if (!tagId && allowDefaultTag) tagId = category.defaultTagId;
      }
    } else {
      statusCode = null;
      tagId = null;
    }

    if (tagId) {
      const tag = await this.options.getTag(tagId);
      const expectedKind = input.tradeType === "income" ? "income" : "expense";
      if (!tag || tag.kind !== expectedKind) throw new Error("标签与收支类型不匹配");
    }

    return {
      ...input,
      amountMinor,
      categoryId,
      tagId,
      statusCode,
      remark: input.remark.trim(),
      counterparty: input.counterparty.trim(),
      paymentChannel: input.paymentChannel.trim(),
      source: input.source ?? "manual",
    };
  }
}
