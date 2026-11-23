// Reads results files (measurement spec). The app shows a figure only when a
// file in results/ holds it; otherwise it reads "not measured".

export interface ResultFile {
  date?: string;
  browser?: string;
  status?: "pass" | "fail" | "miss";
  reason?: string;
  [key: string]: unknown;
}

/** Looks up a results file by its name without the folder or extension. `names` lists the files it can see, when it can. */
export type ResultsLookup = ((name: string) => ResultFile | undefined) & { names?: () => string[] };

// The synthetic set and the miss lists are large and the page does not show them,
// so they are left out of the bundle, as is the real-browser run report. The page reads figures only.
const files = import.meta.glob<ResultFile>(["/results/*.json", "!/results/synthetic-set.json", "!/results/misses.json", "!/results/real-browser-*.json"], {
  eager: true,
  import: "default",
});

export const bundledResults: ResultsLookup = Object.assign((name: string) => files[`/results/${name}.json`], {
  names: () => Object.keys(files).map((k) => k.replace(/^\/results\//, "").replace(/\.json$/, "")),
});

export const NOT_MEASURED = "not measured";

export function passed(lookup: ResultsLookup, name: string): boolean {
  return lookup(name)?.status === "pass";
}

export { newestResult, newestResultName } from "./newest";

export { figureLines, figureText, type FigureId } from "./figureText";
