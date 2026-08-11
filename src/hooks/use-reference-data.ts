import { useCallback, useEffect, useState } from "react";
import { optionRepository, transactionRepository } from "@/services/registry";
import type { Account, Category, Tag } from "@/types/domain";
import { DEFAULT_BOOK_ID } from "@/types/domain";

export interface ReferenceData {
  accounts: Account[];
  categories: Category[];
  tags: Tag[];
  months: string[];
}

const EMPTY: ReferenceData = { accounts: [], categories: [], tags: [], months: [] };

export function useReferenceData(refreshVersion: number) {
  const [data, setData] = useState<ReferenceData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [accounts, categories, tags, months] = await Promise.all([
        optionRepository.listAccounts(DEFAULT_BOOK_ID),
        optionRepository.listCategories(DEFAULT_BOOK_ID),
        optionRepository.listTags(DEFAULT_BOOK_ID),
        transactionRepository.listAvailableMonths(DEFAULT_BOOK_ID),
      ]);
      setData({ accounts, categories, tags, months });
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload, refreshVersion]);
  return { data, loading, error, reload };
}

