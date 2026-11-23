// H43c c2 sweep: device detector vs independent audit over every stored draft in
// results/h42-*.json and results/h43-*.json. Stored drafts only; no network, no cloud calls.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectWrongPersonSentences, prepareRawDraftForPronounCheck } from "../../src/drafting/restoreDraft";
import { evaluateWrongPersonPronouns } from "../e2e/device/n3Audit";

const FILES = [
  "results/h42-n3-cloud-drafts-2026-11-15.json",
  "results/h42-n3-cloud-drafts-2026-11-16.json",
  "results/h43-n3-cloud-drafts-2026-11-16.json",
  "results/h43-n3-cloud-drafts-2026-11-16-2.json",
];

interface Sample {
  fixtureId?: string;
  attempt?: number;
  id?: string;
  outgoingSent?: string;
  rawCloudReply?: string | null;
  sheetNotes?: string[];
}

function recordPart(outgoingSent: string): string {
  const at = outgoingSent.indexOf("\n\nInstructions:");
  return at >= 0 ? outgoingSent.slice(0, at) : outgoingSent;
}

function shapeOf(sentence: string): string {
  const token = /\{([a-z]+):[ \t]*(Person[ \t]+\d+)\}/i.exec(sentence);
  if (token) {
    const label = token[2]!.replace(/[ \t]+/g, " ");
    const bareAt = sentence.toLowerCase().indexOf(`[${label.toLowerCase()}]`, token.index + token[0].length);
    if (bareAt > token.index) return "b";
  }
  const stripped = sentence
    .replace(/\{[a-z]+:[ \t]*(?:Person|Place|Date|Detail)[ \t]+\d+\}/gi, (m) => " ".repeat(m.length))
    .replace(/\[(?:Person|Place|Date|Detail)[ \t]+\d+\]/gi, (m) => " ".repeat(m.length));
  if (/\b(he|she|him|her|his|hers)\b/i.test(stripped)) return "a";
  return "111f0f3";
}

describe("H43c c2 sweep: device vs audit over stored drafts", () => {
  it("has 0 disagreements and lists every warning", () => {
    const rows: string[] = [];
    let disagreements = 0;
    let total = 0;
    for (const file of FILES) {
      const data = JSON.parse(readFileSync(file, "utf8")) as { samples?: Sample[]; drafts?: Sample[] };
      const samples = data.samples ?? data.drafts ?? [];
      for (const s of samples) {
        total++;
        const raw = s.rawCloudReply ?? "";
        const outgoing = s.outgoingSent ?? "";
        const rec = recordPart(outgoing);
        const recTags = [...new Set([...rec.matchAll(/\[Person[ \t]+\d+\]/gi)].map((m) => m[0]))];
        const recMap = Object.fromEntries(recTags.map((t) => [t, t]));
        const prepared = prepareRawDraftForPronounCheck(raw, recMap);
        const deviceHits = detectWrongPersonSentences(prepared.text, {
          personKeysInContext: recTags,
          isAllowedPluralTag: (t) => recMap[t] !== undefined,
        }).map((h) => h.sentence.trim());
        const audit = evaluateWrongPersonPronouns({ rawCloudReply: raw, outgoingSent: outgoing, sheetNotes: [] });
        const auditHits = audit.wrongPersonPronounHits.map((h) => h.trim());
        const norm = (x: string) => x.replace(/\s+/g, " ").trim();
        const deviceSet = new Set(deviceHits.map(norm));
        const auditSet = new Set(auditHits.map(norm));
        const draftId = `${s.fixtureId ?? s.id ?? "?"}#${s.attempt ?? "?"}`;
        for (const h of deviceHits) {
          if (!auditSet.has(norm(h))) {
            disagreements++;
            rows.push(`DISAGREE device-only | ${file} | ${draftId} | ${h} | ${shapeOf(h)}`);
          }
        }
        for (const h of auditHits) {
          if (!deviceSet.has(norm(h))) {
            disagreements++;
            rows.push(`DISAGREE audit-only | ${file} | ${draftId} | ${h} | ${shapeOf(h)}`);
          }
        }
        for (const h of auditHits) {
          if (deviceSet.has(norm(h))) rows.push(`WARN | ${file} | ${draftId} | ${h} | ${shapeOf(h)}`);
        }
      }
    }
    console.log(`SWEEP total=${total} disagreements=${disagreements}\n${rows.join("\n")}`);
    expect(total).toBeGreaterThan(0);
    expect(disagreements).toBe(0);
  });
});
