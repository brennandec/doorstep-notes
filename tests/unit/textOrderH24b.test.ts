// Session H24b: the seven text fixes. Reads files only.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_CLOUD_MODEL } from "../../src/constants";
import { emptyLedger } from "../e2e/fixtures/cloudCalls";

const ROOT = join(__dirname, "../..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const json = (p: string) => JSON.parse(read(p));
const count = (text: string, part: string) => text.split(part).length - 1;

const readme = read("README.md");

const A = "The second is from the run recorded in `results/third-review-device.json` and, as the same file, `results/real-browser-2026-11-13-g03-device.json`: two suggestions were accepted";
const A2 = "The first was taken again in a later run, named in the bullet on pictures taken again below.";
const B1 = "and the page made a real cloud draft of the invented visit:";
const B2 = "The same check ran twice more that day, each answered with the same status on the same model: `results/cloud-draft-2026-11-14-2.json` and `results/cloud-draft-2026-11-14-h20.json`. The status line above counts the first file only.";
const C = "`docs/screens/08-device-record.png` and `docs/screens/09-device-masks.png` were taken in Google Chrome with the built-in model on the built page served with an invented Firebase config, so the cloud half was not set up (`results/h1-2026-11-14-h20.json`). The page there shows the notice \"Not connected. Nothing is sent, a test double answers. Invented people only.\" The device record in that run held one Seen line.";
const D = "These figures run the passes on each raw invented note. In the app the passes read only the record the device model made, so a fact the record leaves out is not checked: in the twelve replies of the invented visit recorded in `results/film-rehearsal-2026-11-14-h22b.json`, `results/film-run-2026-11-14-h22b.json`, `results/film-run-2026-11-14-h22c.json`, `results/film-run-2026-11-14-h22d.json` and `results/film-run-2026-11-14-h22f.json`, the record left out the date of birth in four.";
const E = "- After \"Make the record\" on the device, the page lists each sentence of the typed note that has no match in the record, word for word, with \"Add to Seen\" beside it.";
const RETRY = "When the first record leaves sentences out, the page asks the device model once more, naming them, keeps the record that leaves out fewer, and says that it asked twice. The film was made before this second try.";
const CORRECTION = "Correction, ";
const CORRECTION_TAIL = "(session H24b): No Kiro session ran for H26. The helper edited README.md and .kiro/specs/OPEN-QUESTIONS.md by hand; the desk verified the edit equals the order; a driver checked and committed it. The H26 commit f2bda2b, whose message read \"Written by the H26 driver. The session did not commit.\" and which landed docs/kiro-sessions/2026-11-14-session-H26.log, was reset away and recommitted as f5d9ac8 without that log; the f5d9ac8 message says the edit was by hand.";

const FILM_FILES = [
  "film-rehearsal-2026-11-14-h22b",
  "film-run-2026-11-14-h22b",
  "film-run-2026-11-14-h22c",
  "film-run-2026-11-14-h22d",
  "film-run-2026-11-14-h22f",
].map((f) => `results/${f}.json`);

describe("H24b text order", () => {
  it("(1) README holds the old wording nowhere and each new sentence once", () => {
    expect(readme).not.toContain("one real cloud draft of the invented visit");
    expect(readme).not.toContain("one suggestion was accepted");
    for (const s of [A, A2, B1, B2, C, D, E]) expect(count(readme, s)).toBe(1);
  });

  it("(2) the two device files both hold two accepted suggestions", () => {
    expect(json("results/third-review-device.json").shot11.suggestionsAccepted).toBe(2);
    expect(json("results/real-browser-2026-11-13-g03-device.json").shot11.suggestionsAccepted).toBe(2);
  });

  it("(3) three cloud-draft records answered 200 on the default model", () => {
    for (const f of ["cloud-draft-2026-11-14", "cloud-draft-2026-11-14-2", "cloud-draft-2026-11-14-h20"]) {
      const j = json(`results/${f}.json`);
      expect(j.status).toBe(200);
      expect(j.model).toBe(DEFAULT_CLOUD_MODEL);
    }
    expect(readme).toContain("Cloud draft: one run answered");
  });

  it("(4) the h1 record matches the notice sentence", () => {
    const h1 = json("results/h1-2026-11-14-h20.json");
    // The record is kept as it was, with the words the page used then; the page now says "The cloud is off.".
    const RECORDED_NOTICE = "Not connected. Nothing is sent, a test double answers. Invented people only.";
    expect(h1.noticeShown).toBe(RECORDED_NOTICE);
    expect(C).toContain(RECORDED_NOTICE);
    expect(readme).toContain(C);
    expect(h1.recordSeenLines).toBe(1);
  });

  it("(5) the counts of the twelve replies", () => {
    let replies = 0;
    let noDob = 0;
    for (const f of FILM_FILES) {
      for (const a of json(f).attempts as { structureReply?: string }[]) {
        if (!a.structureReply) continue;
        replies += 1;
        const seen: string[] = JSON.parse(a.structureReply).seen ?? [];
        if (!seen.some((s) => s.includes("3/3/87"))) noDob += 1;
        expect(a.structureReply).not.toContain("14:00");
        expect(a.structureReply).not.toContain("Alder");
        expect(a.structureReply).not.toContain("sister");
      }
    }
    expect(replies).toBe(12);
    expect(noDob).toBe(4);
  });

  it("(6) the retry sentence is in the README only if RETRY_TEXT is in the code", () => {
    const landed = read("src/inference/structure/structure.real.ts").includes("RETRY_TEXT");
    expect(readme.includes(RETRY)).toBe(landed);
  });

  it("(7) the stale task line names both runs", () => {
    const tasks = read(".kiro/specs/drafting/tasks.md");
    expect(tasks).toContain("38 shown (session H02");
    expect(tasks).toContain("29 shown");
    const r = json("results/rewrite-real-service.json");
    expect(r.sentenceShownChars).toBe(29);
    expect(r.sentenceSentChars).toBe(41);
  });

  it("(8) the ledger string names no session and no date", () => {
    const what = emptyLedger().what;
    expect(what).not.toMatch(/\bH\d+\b/);
    expect(what).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(what).not.toContain("one session");
  });

  it("(9) the H26 correction is written once and no H26 log exists", () => {
    const oq = read(".kiro/specs/OPEN-QUESTIONS.md");
    expect(count(oq, CORRECTION_TAIL)).toBe(1);
    expect(oq).toContain(CORRECTION);
    expect(existsSync(join(ROOT, "docs/kiro-sessions/2026-11-14-session-H26.log"))).toBe(false);
  });
});
