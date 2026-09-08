function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortValue(record[key]);
      return result;
    }, {});
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}
