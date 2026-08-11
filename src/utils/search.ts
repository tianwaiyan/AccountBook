export function parseKeywordExpression(keyword: string): string[][] {
  const expression = keyword.trim();
  if (!expression) return [];
  return expression
    .split(/\s+OR\s+|或/i)
    .map((group) => group.split(/\s+AND\s+|且/i).map((term) => term.trim()).filter(Boolean))
    .filter((group) => group.length > 0);
}

export function matchesKeyword(fields: unknown[], keyword: string): boolean {
  const groups = parseKeywordExpression(keyword);
  if (!groups.length) return true;
  const values = fields.map((value) => String(value ?? "").toLocaleLowerCase());
  return groups.some((terms) =>
    terms.every((term) => values.some((value) => value.includes(term.toLocaleLowerCase()))),
  );
}

