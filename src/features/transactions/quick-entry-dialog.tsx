import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateTimeInput } from "@/components/ui/date-time-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { transactionService } from "@/services/registry";
import type { ReferenceData } from "@/hooks/use-reference-data";
import type { StatusCode, TradeType } from "@/types/domain";
import { DEFAULT_BOOK_ID, statusLabels, tradeTypeLabels } from "@/types/domain";
import { formatLocalDateTime } from "@/utils/date";
import { signedMinor } from "@/utils/money";

const schema = z.object({
  occurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, "请输入 YYYY-MM-DD HH:MM:SS"),
  accountId: z.string().min(1, "请选择账户"),
  tradeType: z.enum(["expense", "refund", "income"]),
  amount: z.string().min(1, "请输入金额"),
  categoryId: z.string(),
  tagId: z.string(),
  statusCode: z.string(),
  remark: z.string(),
  counterparty: z.string(),
  paymentChannel: z.string(),
});

type FormValues = z.infer<typeof schema>;

const statusOptions: Record<string, StatusCode[]> = {
  public_expense: ["pending_reimbursement", "settled"],
  reimbursement: ["settled"],
  pass_through_income: ["pending_transfer", "transferred"],
  pass_through_expense: ["transferred"],
};

const statusDefaults: Record<string, StatusCode> = {
  public_expense: "pending_reimbursement",
  reimbursement: "settled",
  pass_through_income: "pending_transfer",
  pass_through_expense: "transferred",
};

export function QuickEntryDialog({
  open,
  onOpenChange,
  referenceData,
  onSaved,
  initial,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceData: ReferenceData;
  onSaved: () => void;
  initial?: Partial<FormValues>;
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      occurredAt: formatLocalDateTime(),
      accountId: referenceData.accounts[0]?.id ?? "",
      tradeType: "expense",
      amount: "",
      categoryId: "",
      tagId: "",
      statusCode: "",
      remark: "",
      counterparty: "",
      paymentChannel: "",
      ...initial,
    },
  });
  const tradeType = form.watch("tradeType");
  const categoryId = form.watch("categoryId");
  const categoryKind = tradeType === "income" ? "income" : "expense";
  const categories = referenceData.categories.filter((category) => category.kind === categoryKind && category.isActive);
  const tags = referenceData.tags.filter((tag) => tag.kind === categoryKind && tag.isActive);
  const category = referenceData.categories.find((item) => item.id === categoryId);
  const statuses = category?.systemKey ? statusOptions[category.systemKey] ?? [] : [];

  const changeCategory = (value: string) => {
    form.setValue("categoryId", value === "none" ? "" : value);
    const selected = referenceData.categories.find((item) => item.id === value);
    if (selected?.systemKey) {
      form.setValue("tagId", "");
      form.setValue("statusCode", statusDefaults[selected.systemKey] ?? "");
    } else {
      form.setValue("statusCode", "");
      form.setValue("tagId", selected?.defaultTagId ?? "");
    }
  };

  const submit = form.handleSubmit(async (values) => {
    try {
      await transactionService.createManual(DEFAULT_BOOK_ID, {
        occurredAt: values.occurredAt,
        accountId: values.accountId,
        tradeType: values.tradeType as TradeType,
        amountMinor: signedMinor(values.amount, values.tradeType as TradeType),
        categoryId: values.categoryId || null,
        tagId: values.tagId || null,
        statusCode: (values.statusCode || null) as StatusCode | null,
        remark: values.remark,
        counterparty: values.counterparty,
        paymentChannel: values.paymentChannel,
      });
      form.reset({
        occurredAt: formatLocalDateTime(),
        accountId: values.accountId,
        tradeType: values.tradeType,
        amount: "",
        categoryId: values.categoryId,
        tagId: values.tagId,
        statusCode: values.statusCode,
        remark: "",
        counterparty: "",
        paymentChannel: values.paymentChannel,
      });
      onOpenChange(false);
      onSaved();
    } catch (reason) {
      form.setError("root", { message: reason instanceof Error ? reason.message : String(reason) });
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none">
        <DialogHeader>
          <DialogTitle>快速记账</DialogTitle>
          <DialogDescription>{tradeTypeLabels[tradeType as TradeType]}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="交易时间" error={form.formState.errors.occurredAt?.message}>
              <Controller name="occurredAt" control={form.control} render={({ field }) => <DateTimeInput value={field.value} onChange={field.onChange} onBlur={field.onBlur} />} />
            </Field>
            <Field label="账户" error={form.formState.errors.accountId?.message}>
              <Controller name="accountId" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue placeholder="选择账户" /></SelectTrigger>
                  <SelectContent>{referenceData.accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="收支" error={form.formState.errors.tradeType?.message}>
              <Controller name="tradeType" control={form.control} render={({ field }) => (
                <Select value={field.value} onValueChange={(value) => { field.onChange(value); form.setValue("categoryId", ""); form.setValue("tagId", ""); form.setValue("statusCode", ""); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(tradeTypeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="金额" error={form.formState.errors.amount?.message}>
              <Input {...form.register("amount")} type="text" inputMode="decimal" placeholder="0.00" />
            </Field>
            <Field label="分类">
              <Select value={categoryId || "none"} onValueChange={changeCategory}>
                <SelectTrigger><SelectValue placeholder="待分类" /></SelectTrigger>
                <SelectContent><SelectItem value="none">待分类</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="标签">
              <Controller name="tagId" control={form.control} render={({ field }) => (
                <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)} disabled={Boolean(category?.systemKey)}>
                  <SelectTrigger><SelectValue placeholder="未设置" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">未设置</SelectItem>{tags.map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="状态">
              <Controller name="statusCode" control={form.control} render={({ field }) => (
                <Select value={field.value || "none"} onValueChange={(value) => field.onChange(value === "none" ? "" : value)} disabled={!statuses.length}>
                  <SelectTrigger><SelectValue placeholder="无" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">无</SelectItem>{statuses.map((status) => <SelectItem key={status} value={status}>{statusLabels[status]}</SelectItem>)}</SelectContent>
                </Select>
              )} />
            </Field>
            <Field label="交易对方"><Input {...form.register("counterparty")} /></Field>
            <Field label="支付方式"><Input {...form.register("paymentChannel")} /></Field>
          </div>
          <Field label="备注"><Textarea {...form.register("remark")} rows={2} /></Field>
          {form.formState.errors.root?.message && <p className="text-sm text-destructive">{form.formState.errors.root.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}><Save className="size-4" />保存</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><Label>{label}</Label>{children}{error && <p className="text-xs text-destructive">{error}</p>}</div>;
}
