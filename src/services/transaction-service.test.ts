import { describe, expect, it, vi } from "vitest";
import type { OptionRepository, TransactionRepository } from "@/services/contracts";
import { TransactionService } from "@/services/transaction-service";
import type { Category, Tag, Transaction, TransactionInput } from "@/types/domain";

const publicCategory: Category = {
  id: "public",
  bookId: "book-default",
  kind: "expense",
  name: "公费垫付",
  systemKey: "public_expense",
  defaultTagId: null,
  sortOrder: 0,
  isActive: true,
};
const expenseTag: Tag = { id: "tag", bookId: "book-default", kind: "expense", name: "生存刚需", sortOrder: 0, isActive: true };

function makeRepositories() {
  const created: TransactionInput[] = [];
  const transactions = {
    create: vi.fn(async (_bookId: string, input: TransactionInput) => { created.push(input); return { id: String(created.length), ...input } as Transaction; }),
    update: vi.fn(),
    bulkUpdate: vi.fn(),
    list: vi.fn(),
    listAvailableMonths: vi.fn(),
    get: vi.fn(),
    softDelete: vi.fn(),
    commitImport: vi.fn(),
  } as unknown as TransactionRepository;
  const options = {
    getCategory: vi.fn(async (id: string) => id === publicCategory.id ? publicCategory : null),
    getTag: vi.fn(async (id: string) => id === expenseTag.id ? expenseTag : null),
  } as unknown as OptionRepository;
  return { created, service: new TransactionService(transactions, options) };
}

const baseInput: TransactionInput = {
  occurredAt: "2026-08-08 10:20:30",
  accountId: "cash",
  tradeType: "expense",
  amountMinor: 1234,
  categoryId: null,
  tagId: null,
  statusCode: null,
  remark: "午餐",
  counterparty: "餐厅",
  paymentChannel: "现金",
};

describe("TransactionService", () => {
  it("normalizes expense signs", async () => {
    const { created, service } = makeRepositories();
    await service.createManual("book-default", baseInput);
    expect(created[0].amountMinor).toBe(-1234);
  });

  it("locks tags and defaults the status for public expenses", async () => {
    const { created, service } = makeRepositories();
    await service.createManual("book-default", { ...baseInput, categoryId: "public", tagId: "tag" });
    expect(created[0].tagId).toBeNull();
    expect(created[0].statusCode).toBe("pending_reimbursement");
  });

  it("allows public expense refunds and keeps their settled status", async () => {
    const { created, service } = makeRepositories();
    await service.createManual("book-default", {
      ...baseInput,
      tradeType: "refund",
      categoryId: "public",
      tagId: "tag",
      statusCode: "settled",
    });
    expect(created[0].amountMinor).toBe(1234);
    expect(created[0].tagId).toBeNull();
    expect(created[0].statusCode).toBe("settled");
  });

  it("allows two manual transactions with identical content", async () => {
    const { created, service } = makeRepositories();
    await service.createManual("book-default", baseInput);
    await service.createManual("book-default", baseInput);
    expect(created).toHaveLength(2);
  });

  it("rejects an invalid date before writing", async () => {
    const { created, service } = makeRepositories();
    await expect(service.createManual("book-default", { ...baseInput, occurredAt: "2026-02-30 10:20:30" })).rejects.toThrow("请输入合法的 YYYY-MM-DD HH:MM:SS");
    expect(created).toHaveLength(0);
  });
});

