// The newest dated record of a check (session H15, measurement R17.5). Pure: no browser API and no Vite
// feature, so the README writer can use it in Node. It is re-exported from src/app/figures.ts.
import type { ResultFile, ResultsLookup } from "./figures";

/** A session suffix such as `h16` ranks above every numbered record of the same date (session H17). */
export const rankOf = (suffix: string | undefined): number => {
  if (suffix === undefined) return 1;
  // H35b: `h29-3` is run 3 of session 29; it ranks above `h29` and below `h30`. Every `h` suffix ranks above a plain number.
  const session = /^h(\d+)(?:-(\d+))?$/.exec(suffix);
  return session ? 1_000_000 + Number(session[1]) * 1_000 + Number(session[2] ?? 0) : Number(suffix);
};

/** Dated names for `base`, newest first. The pattern is the same one `newestResultName` uses. */
export function datedResultNames(lookup: ResultsLookup, base: string): string[] {
  const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}-(\\d{4}-\\d{2}-\\d{2})(?:-(h\\d+(?:-\\d+)?|\\d+))?$`);
  return (lookup.names?.() ?? [])
    .map((n) => ({ n, m: pattern.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => x.m !== null)
    .map((x) => ({ n: x.n, key: `${x.m[1]}#${String(rankOf(x.m[2])).padStart(8, "0")}` }))
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    .map((x) => x.n);
}

/**
 * `<base>-<date>.json`, then `<base>-<date>-2.json` and so on, then `<base>-<date>-h16.json` (a session suffix),
 * the later date and the higher rank winning. With no dated record, or a lookup that cannot list its files,
 * the old undated `<base>.json`.
 * The newest record wins even when it failed: an older pass is not shown over it.
 */
export function newestResultName(lookup: ResultsLookup, base: string): string {
  return datedResultNames(lookup, base)[0] ?? base;
}

export function newestResult(lookup: ResultsLookup, base: string): ResultFile | undefined {
  return lookup(newestResultName(lookup, base));
}
