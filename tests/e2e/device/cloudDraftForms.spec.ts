// DEVICE MODEL, with the real cloud. H34a: what the cloud model's replies look like, measured, not judged.
//
// The invented visit becomes a record and masks on the device. The same record is then drafted 10 times in the cloud
// (Draft, then Send). Per draft the record keeps the forms of the reply (every square-bracket and brace group, cut to 60
// characters, at most 20; the count of each pronoun outside those groups; the reply's length), the count of the characters
// [ ] { } in the sheet that was shown, and the lines under the note. Never the reply text itself.
//
// This spec asserts nothing about the model. It fails only when the page does not open, a draft does not come back, or
// the cap of 12 generateContent calls is passed. Run it with `npm run measure:cloud-draft`.
// Invented people only. The config and the debug token are read into memory; no value is printed or written.
import { expect, test } from "@playwright/test";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import { findBareColonMarks } from "../../../src/drafting/restoreDraft";
import { normalizeTokens, TOKEN_ROLES } from "../../../src/masking/tokenForms";
import { nextFreeRecord, writeNewRecord } from "../fixtures/deviceModel";
import { acceptAll, openCloudDevice, recordHeader, replyText, watchCloudReplies, type CloudReplyForms } from "./hybridSupport";
import { strings } from "../../../src/app/strings";
import { waitEnabled, waitVisible } from "./named";
import { appReady, press, recordAndMask, seconds, settleShell } from "./support";

/**
 * H34b amendment E, structure only. Per reply: the pronoun tokens whose tag equals the nearest tag before them in the
 * same sentence, with no other tag between (`tokensNamingThePreviousTag`), split by role word. A tag is a bare tag or the
 * tag of an earlier token. A sentence ends at . ! ? followed by a space, or at a line break. Counts only; the reply text
 * is never kept. The same function stands in hostedRun.spec.ts.
 */
export interface TokensNamingThePreviousTag {
  total: number;
  byRole: Record<string, number>;
}
function tokensNamingThePreviousTag(text: string): TokensNamingThePreviousTag {
  const byRole: Record<string, number> = Object.fromEntries(TOKEN_ROLES.map((r) => [r, 0]));
  let total = 0;
  const mention = new RegExp(String.raw`\{(${TOKEN_ROLES.join("|")}):((?:Person|Place|Date|Detail) \d+)\}|\[((?:Person|Place|Date|Detail) \d+)\]`, "gi");
  for (const sentence of normalizeTokens(text).split(/(?<=[.!?])\s+|\r?\n+/)) {
    let previous: string | null = null;
    for (const m of sentence.matchAll(mention)) {
      const label = (m[2] ?? m[3])!.toLowerCase();
      if (m[1] !== undefined && previous === label) {
        byRole[m[1].toLowerCase()]!++;
        total++;
      }
      previous = label;
    }
  }
  return { total, byRole };
}

const parsedCount = Number.parseInt(process.env["CLOUD_DRAFT_COUNT"] ?? "", 10);
const DRAFTS = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 10;
const parsedCap = Number.parseInt(process.env["CLOUD_DRAFT_CAP"] ?? "", 10);
const CAP = Number.isFinite(parsedCap) && parsedCap > 0 ? parsedCap : Math.max(12, DRAFTS + 4);
const SUFFIX = process.env["CLOUD_DRAFT_SUFFIX"]?.trim() || undefined;
const BRACKETS = ["[", "]", "{", "}"] as const;

const SHOWN_PLACEHOLDERS = [
  strings.drafting.shownName,
  strings.drafting.shownPlace,
  strings.drafting.shownDate,
  strings.drafting.shownDetail,
  strings.drafting.shownPronoun,
] as const;
const NOT_PUT_BACK_PREFIX = strings.drafting.notPutBack.split("{what}")[0]!;
const bareColonMarksInReply = (text: string): string[] =>
  findBareColonMarks(text.replace(/\[[^\]]*\]|\{[^}]*\}/g, " "));

const bracketCounts = (text: string): Record<(typeof BRACKETS)[number], number> => ({
  "[": text.split("[").length - 1,
  "]": text.split("]").length - 1,
  "{": text.split("{").length - 1,
  "}": text.split("}").length - 1,
});
const bracketTotal = (text: string): number => BRACKETS.reduce((n, b) => n + bracketCounts(text)[b], 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Draft {
  draft: number;
  repliesInStep: number;
  reply: CloudReplyForms | null;
  /** H39: bare word:Role marks outside {} and [] in the cloud reply; null when unreadable */
  replyBareColonMarks: string[] | null;
  /** H34b amendment E: pronoun tokens naming the nearest tag before them in the same sentence; null when the reply could not be read */
  tokensNamingThePreviousTag: TokensNamingThePreviousTag | null;
  label: string;
  sheetLength: number;
  sheetBrackets: Record<(typeof BRACKETS)[number], number>;
  sheetBracketTotal: number;
  sheetColonMarks: string[];
  sheetColonMarkTotal: number;
  sheetHasShownPronoun: boolean;
  sheetShownPlaceholders: string[];
  sheetHasAnyVisibleMark: boolean;
  repairedMarks: number;
  hasUnreadMarkLine: boolean;
  hasNotPutBackLine: boolean;
  linesUnderTheNote: string[];
  linesUnderTheNoteBracketTotal: number;
  outgoingChars: number;
  seconds: number;
}

test("H34a/H39: cloud drafts of one record, their forms measured", async () => {
  const timeoutMs = DRAFTS <= 10 ? 560_000 : 900_000;
  test.setTimeout(timeoutMs);
  const out = await openCloudDevice(CAP);
  const target = nextFreeRecord("cloud-draft-forms", process.cwd(), SUFFIX).file;
  if (!out.ok) {
    writeNewRecord(target, { status: "miss", ...recordHeader(out.browser), reason: out.reason });
    test.skip(true, out.reason);
    return;
  }
  const s = out.session;
  const page = s.page;
  const watch = watchCloudReplies(s.context);
  // The same replies, read once more for amendment E and H39 raw bare-colon marks. Slot i here is slot i of watch.replies: both listen to the same event.
  const naming: (TokensNamingThePreviousTag | null)[] = [];
  const rawBareColonMarks: (string[] | null)[] = [];
  const namingReads: Promise<void>[] = [];
  s.context.on("response", (res) => {
    const url = res.url();
    if (!url.includes(`//${CLOUD_MODEL_HOST}/`) || !url.includes(":generateContent")) return;
    const slot = naming.length;
    naming.push(null);
    rawBareColonMarks.push(null);
    namingReads.push(
      res.text().then(
        (body) => {
          const text = replyText(body);
          naming[slot] = text === null ? null : tokensNamingThePreviousTag(text);
          rawBareColonMarks[slot] = text === null ? null : bareColonMarksInReply(text);
        },
        () => undefined,
      ),
    );
  });
  const problems: string[] = [];
  const drafts: Draft[] = [];
  let observed: Record<string, unknown> = {};
  const deadline = Date.now() + timeoutMs - 40_000;
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await appReady(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await settleShell(page);
    await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready", { timeout: 30_000 });
    await expect(page.locator('[data-state="cloud"] .state-words')).toHaveText("ready, not used yet", { timeout: 30_000 });
    await expect(page.locator('[data-state="network"] .state-words')).toHaveText("online", { timeout: 30_000 });

    const made = await recordAndMask(page);
    const accepted = await acceptAll(page);
    observed = { recordLabel: made.recordLabel, suggestionsAccepted: accepted };

    const sheet = page.locator('[data-zone="finished"] .sheet-text');
    for (let i = 1; i <= DRAFTS; i++) {
      if (Date.now() > deadline) {
        problems.push(`the run stopped before draft ${i}: the time was used up.`);
        break;
      }
      const started = Date.now();
      const settledBefore = watch.settled();
      watch.step = `draft ${i}`;
      await press(page, "#draft");
      await waitEnabled(page.locator("#send"), "the Send button (#send)", 60_000);
      const outgoingChars = (await page.locator("[data-outgoing]").innerText()).length;
      await press(page, "#send");
      const end = Date.now() + 150_000;
      while (watch.settled() <= settledBefore && Date.now() < end) await sleep(200);
      if (watch.settled() <= settledBefore) {
        problems.push(`draft ${i} did not come back within 150 s.`);
        break;
      }
      await waitEnabled(page.locator("#draft"), "the Draft button (#draft)", 60_000);
      await waitVisible(sheet.first(), 'the finished note ([data-zone="finished"] .sheet-text)', 60_000);
      // The page may still be writing the note after the reply: wait until the shown text holds still.
      let text = await sheet.innerText();
      for (let n = 0; n < 20; n++) {
        await sleep(300);
        const again = await sheet.innerText();
        if (again === text) break;
        text = again;
      }
      const label = (await page.locator('[data-zone="finished"] .source-label').allInnerTexts()).join(" + ").replace(/\s+/g, " ").trim();
      const lines = (await page.locator('[data-zone="finished"] .sheet-notes li').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim().slice(0, 160));
      const mine = watch.replies.filter((r) => r.step === `draft ${i}`);
      const sheetColonMarks = findBareColonMarks(text);
      const sheetBracketCount = bracketTotal(text);
      const sheetHasShownPronoun = text.includes(strings.drafting.shownPronoun);
      const sheetShownPlaceholders = SHOWN_PLACEHOLDERS.filter((p) => text.includes(p));
      const repairedMarks = Number((await page.locator('[data-zone="finished"] [data-sheet]').getAttribute("data-repaired-marks")) ?? "0");
      const hasUnreadMarkLine = lines.includes(strings.drafting.unreadMark);
      const hasNotPutBackLine = lines.some((l) => l.startsWith(NOT_PUT_BACK_PREFIX));
      drafts.push({
        draft: i,
        repliesInStep: mine.length,
        reply: mine[0] ?? null,
        replyBareColonMarks: null,
        tokensNamingThePreviousTag: null,
        label,
        sheetLength: text.length,
        sheetBrackets: bracketCounts(text),
        sheetBracketTotal: sheetBracketCount,
        sheetColonMarks,
        sheetColonMarkTotal: sheetColonMarks.length,
        sheetHasShownPronoun,
        sheetShownPlaceholders,
        sheetHasAnyVisibleMark: sheetBracketCount > 0 || sheetColonMarks.length > 0 || sheetShownPlaceholders.length > 0,
        repairedMarks,
        hasUnreadMarkLine,
        hasNotPutBackLine,
        linesUnderTheNote: lines,
        linesUnderTheNoteBracketTotal: lines.reduce((n, l) => n + bracketTotal(l), 0),
        outgoingChars,
        seconds: seconds(Date.now() - started),
      });
    }
  } catch (error) {
    const said = String((error as Error).message).replace(/\u001b\[[0-9;]*m/g, "").split("\n").slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
    problems.push(`The run stopped: ${said}`);
  } finally {
    await watch.done().catch(() => undefined);
    await Promise.all(namingReads).catch(() => undefined);
    // The replies were read after the pass above: take each draft's reply again so a late read is not lost.
    for (const d of drafts) {
      const mine = watch.replies.filter((r) => r.step === `draft ${d.draft}`);
      d.repliesInStep = mine.length;
      d.reply = mine[0] ?? null;
      const slot = mine[0] === undefined ? -1 : watch.replies.indexOf(mine[0]);
      d.tokensNamingThePreviousTag = slot >= 0 ? (naming[slot] ?? null) : null;
      d.replyBareColonMarks = slot >= 0 ? (rawBareColonMarks[slot] ?? null) : null;
    }
    const calls = s.recorder.generateContentCount();
    const stoppedAtCap = s.recorder.stoppedAtCap();
    if (stoppedAtCap) problems.push(`the cap of ${CAP} generateContent calls was passed and a request was stopped.`);
    const readable = drafts.filter((d) => d.reply?.readable === true);
    const sum = (f: (d: Draft) => number) => readable.reduce((n, d) => n + f(d), 0);
    const lengths = readable.map((d) => d.reply!.length);
    const pronounTotals: Record<string, number> = {};
    for (const p of ["he", "she", "him", "her", "his", "hers", "himself", "herself"] as const) pronounTotals[p] = sum((d) => d.reply!.pronouns[p]);
    const namingByRole: Record<string, number> = Object.fromEntries(TOKEN_ROLES.map((r) => [r, 0]));
    for (const d of drafts) for (const r of TOKEN_ROLES) namingByRole[r]! += d.tokensNamingThePreviousTag?.byRole[r] ?? 0;
    const totals = {
      draftsAsked: DRAFTS,
      draftsBack: drafts.length,
      tokensNamingThePreviousTag: {
        total: drafts.reduce((n, d) => n + (d.tokensNamingThePreviousTag?.total ?? 0), 0),
        byRole: namingByRole,
        draftsWithOne: drafts.filter((d) => (d.tokensNamingThePreviousTag?.total ?? 0) > 0).length,
      },
      repliesRead: readable.length,
      repliesWithAGroup: readable.filter((d) => d.reply!.groupCount > 0).length,
      groupsInReplies: sum((d) => d.reply!.groupCount),
      rawRepliesWithBareColonMark: drafts.filter((d) => (d.replyBareColonMarks?.length ?? 0) > 0).length,
      bareColonMarksInReplies: drafts.reduce((n, d) => n + (d.replyBareColonMarks?.length ?? 0), 0),
      pronounsOutsideGroups: pronounTotals,
      repliesWithAPronounOutsideGroups: readable.filter((d) => Object.values(d.reply!.pronouns).some((n) => n > 0)).length,
      replyLength: lengths.length === 0 ? null : { min: Math.min(...lengths), max: Math.max(...lengths), mean: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length) },
      shownSheetsWithABracketCharacter: drafts.filter((d) => d.sheetBracketTotal > 0).length,
      bracketCharactersInShownSheets: drafts.reduce((n, d) => n + d.sheetBracketTotal, 0),
      shownSheetsWithColonMark: drafts.filter((d) => d.sheetColonMarkTotal > 0).length,
      colonMarksInShownSheets: drafts.reduce((n, d) => n + d.sheetColonMarkTotal, 0),
      shownSheetsWithShownPronoun: drafts.filter((d) => d.sheetHasShownPronoun).length,
      shownSheetsWithNotPutBackPlaceholder: drafts.filter((d) => d.sheetShownPlaceholders.length > 0).length,
      shownSheetsWithAnyVisibleMark: drafts.filter((d) => d.sheetHasAnyVisibleMark).length,
      repairedMarks: drafts.reduce((n, d) => n + d.repairedMarks, 0),
      draftsWithRepairedMarks: drafts.filter((d) => d.repairedMarks > 0).length,
      draftsWithUnreadMarkLine: drafts.filter((d) => d.hasUnreadMarkLine).length,
      draftsWithNotPutBackLine: drafts.filter((d) => d.hasNotPutBackLine).length,
      draftsWithABracketCharacterUnderTheNote: drafts.filter((d) => d.linesUnderTheNoteBracketTotal > 0).length,
      draftsWithPronounWrongPersonLine: drafts.filter((d) =>
        d.linesUnderTheNote.some((l) => l.startsWith(strings.drafting.pronounWrongPerson)),
      ).length,
      labelsInTheCloud: drafts.filter((d) => d.label.includes("in the cloud")).length,
    };
    const status = problems.length === 0 && drafts.length === DRAFTS ? "pass" : "fail";
    writeNewRecord(target, {
      ...recordHeader(s.browser),
      status,
      what: `The same invented record drafted in the cloud ${DRAFTS} times. The forms of each reply and shown note are measured; nothing about the model is asserted. The reply text is never kept.`,
      cloudCalls: { generateContent: calls, cap: CAP, stoppedAtCap },
      observed,
      totals,
      drafts,
      problems,
    });
    await s.close();
  }
  expect(problems).toEqual([]);
});
