// The request number is the off-page rows stored on the ledger.
// The preflight number is how many of those rows are not CORS-safelisted.
// A row with no flag adds nothing to the preflight number.
// The number of entries is a different count and is not shown.

export function requestsOf(entry: object | null | undefined): number {
  if (entry == null || !("requests" in entry)) return 0;
  const rows = entry.requests;
  return Array.isArray(rows) ? rows.length : 0;
}

export function preflightsOf(entry: object | null | undefined): number {
  if (entry == null || !("requests" in entry)) return 0;
  const rows = entry.requests;
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const row of rows) {
    if (row !== null && typeof row === "object" && (row as { preflight?: unknown }).preflight === true) n += 1;
  }
  return n;
}

export function requestsOn(entries: readonly object[] | null | undefined): number {
  if (!entries) return 0;
  let n = 0;
  for (const entry of entries) n += requestsOf(entry);
  return n;
}
