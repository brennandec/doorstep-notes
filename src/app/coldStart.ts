// The H8 figure, shown only as a figure about the author's computer, with its
// date and browser. A measured record is kept. A newer attempt that did not
// measure does not replace it with "not measured": the measured sentence stays
// and the clause names that attempt (ruling 20, R9.3, and the 14:32Z rule).
import type { ResultFile, ResultsLookup } from "./figures";
import { laterAttemptClause, shortDate } from "./laterAttempt";
import { datedResultNames } from "./newest";
import { fill, strings } from "./strings";

function isMeasured(file: ResultFile | undefined): file is ResultFile {
  const seconds = file?.seconds;
  return !!file
    && (file.status === "pass" || file.status === "fail")
    && typeof seconds === "number" && Number.isFinite(seconds)
    && typeof file.date === "string" && file.date !== ""
    && typeof file.browser === "string" && file.browser !== "";
}

export function coldStartLine(results: ResultsLookup): string {
  const dated = datedResultNames(results, "cold-start")
    .map((name) => ({ name, file: results(name) }))
    .filter((row): row is { name: string; file: ResultFile } => row.file !== undefined);
  const base = results("cold-start");
  const measured = dated.find((row) => isMeasured(row.file))
    ?? (isMeasured(base) ? { name: "cold-start", file: base } : undefined);
  if (!measured) return strings.coldStart.notMeasured;
  const text = fill(strings.coldStart.measured, {
    seconds: measured.file.seconds as number,
    date: shortDate(String(measured.file.date)),
    browser: String(measured.file.browser),
  });
  const newer = dated[0];
  if (!newer || newer.name === measured.name) return text;
  return `${text}${laterAttemptClause(newer.name, newer.file)}`;
}
