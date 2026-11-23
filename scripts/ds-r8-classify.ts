// D-R8 classification only. Reads the saved shorter replies. No network.
import { readFileSync } from "node:fs";
import { checkEgress } from "../src/egress/check";
import { rewriteText } from "../src/inference/rewrite/instructions";
import { REGRESSION_NOTES } from "../src/inference/rewrite/regressionSet";
import { singleSentence, tagsKept } from "../src/inference/rewrite/rewrite.real";
import { expandShorthand, inventedFacts, replyPasses, shownText } from "../src/inference/rewrite/shorthand";
import { tagsIn } from "../src/masking/tags";
import { INVENTED_NAMES } from "../tests/e2e/fixtures/pageHelpers";

interface Row {
  n: number;
  kind: string;
  ms: number;
  model: string;
  shown: string;
}

export interface Classified {
  n: number;
  note: string;
  model: string;
  deviceMs: number;
  pass: boolean;
  expanded: string;
  /** words in the failed reply that the expanded sentence does not already contain */
  forbidden: string[];
}

export function loadPlan(file = "results/ds-r6-return.json"): Classified[] {
  const saved = JSON.parse(readFileSync(file, "utf8")) as { rows: Row[] };
  const shorter = saved.rows.filter((row) => row.kind === "shorter");
  return REGRESSION_NOTES.map((note) => {
    const row = shorter.find((item) => item.n === note.n);
    if (!row) throw new Error(`missing shorter row ${note.n}`);
    const expanded = expandShorthand(note.note);
    const sentence = singleSentence(row.model);
    const jobOk = sentence !== null && tagsKept(tagsIn(note.note), sentence);
    const pass = jobOk && replyPasses(note.note, sentence ?? "");
    const expandedWords = new Set(expanded.toLowerCase().match(/[a-z0-9]+/g) ?? []);
    const forbidden = pass ? [] : inventedFacts(note.note, row.model).map((word) => word.toLowerCase()).filter((word) => !expandedWords.has(word));
    return { n: note.n, note: note.note, model: row.model, deviceMs: row.ms, pass, expanded, forbidden };
  });
}

export async function main(): Promise<void> {
  const plan = loadPlan();
  const lines: string[] = [];
  let device = 0;
  let spelled = 0;
  let fail = 0;
  for (const row of plan) {
    const shown = row.pass ? shownText(row.note, singleSentence(row.model) ?? "") : row.expanded;
    const invented = inventedFacts(row.note, shown).length;
    if (row.pass) device += 1;
    else fail += 1;
    if (row.pass && shown === row.expanded) spelled += 1;
    lines.push([
      row.n,
      row.pass ? "device" : "cloud",
      shown === row.expanded ? "expansion" : "model",
      invented,
      row.deviceMs,
    ].join("\t"));
  }
  console.log(lines.join("\n"));
  let listed = 0;
  let fullName = 0;
  let exactHits = 0;
  for (const row of plan) {
    if (row.pass) continue;
    const text = rewriteText("shorter", row.expanded);
    const check = checkEgress({
      captured: [{ url: "", body: new TextEncoder().encode(text) }],
      listedNames: [...INVENTED_NAMES],
      surfaceForms: [],
      sentOnPurpose: [],
    });
    listed += check.listedFound.length;
    const low = text.toLowerCase();
    for (const name of INVENTED_NAMES) if (low.includes(name.toLowerCase())) fullName += 1;
    const words = new Set(low.match(/[a-z0-9]+/g) ?? []);
    exactHits += row.forbidden.filter((word) => words.has(word)).length;
  }
  console.log(`device=${device} sameAsExpansion=${spelled} fail=${fail} n=${plan.length} listedParts=${listed} fullNames=${fullName} forbiddenInPrompt=${exactHits}`);
}
