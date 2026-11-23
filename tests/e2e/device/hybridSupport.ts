// Shared parts of the two H15 DEVICE MODEL checks (hybridRun.spec.ts, draftNetworkDrop.spec.ts).
// Google Chrome with the built-in model and the real cloud. Invented people only.
//
// The Firebase web config and the App Check debug token are read from the local files into memory by
// `readCloudInputs` and handed to the page. Nothing here prints, logs or writes a value of either.
// A record holds hosts, methods, paths without the query, byte counts, hashes and statuses; never a full address.
import type { BrowserContext, Page } from "@playwright/test";
import { inventedVisit } from "../../../src/app/example/inventedVisit";
import { CLOUD_MODEL_HOST } from "../../../src/constants";
import {
  buildCommit,
  decodeWithSourceSpans,
  describeMachine,
  describeRequest,
  openDevice,
  readCloudInputs,
  redactPathItems,
  redactPathValues,
  redactedPath,
  scanWire,
  wireTexts,
  type DeviceOutcome,
  type RecordedRequest,
  type RequestRecord,
  type WireFinding,
} from "../fixtures/deviceModel";
import { lineCarriesValue, noteLinesLeaked } from "./leakRule";

/** Calls to the cloud model this session may make in total (the order's cap); each spec takes its share. */
export const SESSION_GENERATE_CONTENT_CAP = 5;

export type CloudOpen = { ok: true; session: Extract<DeviceOutcome, { ok: true }>["session"] } | { ok: false; reason: string; browser: string };

/** Opens Google Chrome on the profile with the real config, the debug token and the allow list. Never starts a download. */
export async function openCloudDevice(
  cap: number,
  ledger?: { spec?: string; title?: string; file?: string },
): Promise<CloudOpen> {
  const inputs = readCloudInputs();
  if ("missing" in inputs) return { ok: false, reason: inputs.missing, browser: "none" };
  const out = await openDevice({
    files: inputs.files,
    debugToken: inputs.debugToken,
    allowOutside: true,
    generateContentCap: cap,
    cloudLedger: { spec: ledger?.spec ?? "hybridSupport.openCloudDevice", title: ledger?.title ?? "cloud run", ...(ledger?.file ? { file: ledger.file } : {}) },
  });
  return out.ok ? { ok: true, session: out.session } : { ok: false, reason: out.reason, browser: out.browser };
}

// ---- the invented values a request must not carry ------------------------------------------------------------

interface Listed {
  full: string[];
  others: string[];
  parts: string[];
}

function listed(): Listed {
  const full: string[] = [];
  const others: string[] = [];
  for (const line of inventedVisit.clientList.split("\n")) {
    const [name, alt] = line.split(";").map((s) => s.trim());
    if (name) full.push(name);
    for (const o of (alt ?? "").split(",").map((s) => s.trim()).filter(Boolean)) others.push(o);
  }
  const parts = [...new Set([...full, ...others].flatMap((n) => n.split(/[\s-]+/)).filter((p) => [...p].length >= 3))];
  return { full, others, parts };
}

/** Originals in the raw note that the app may mask. Whether one was masked at a send is read from the text sent. */
export const MASKABLE_ORIGINALS = ["Bea", "3/3/87", "14 Alder Court", "Alder Court", "Brandvald", "Maria O-R", "Okonkwo-Reyes"];

export const NOTE_LINES = inventedVisit.note.split("\n").map((l) => l.trim()).filter((l) => l.length >= 12);

export type LeakCategory = "listedName" | "otherName" | "namePart" | "maskedOriginal";

export interface CheckedLeakEntry {
  value: string;
  categories: LeakCategory[];
}

export interface RedactedLeakFinding extends WireFinding {
  categories: LeakCategory[];
}

export interface NoteLineFinding {
  lineIndex: number;
  lineLength: number;
  requestIndex: number;
  host: string;
  path: string;
  field: "address" | "body";
  byteOffset: number;
}

export interface LeakResult {
  stops: RedactedLeakFinding[];
  observations: RedactedLeakFinding[];
  /** raw note lines found in a request that still carry a name or masked original (H16 rule), redacted for record safety */
  noteLinesFound: NoteLineFinding[];
  /** count of unmasked remainder lines found in requests without identifying values */
  noteLineRemainderCount: number;
  imageBytesFound: boolean;
  checkedCount: number;
  maskedOriginalsCheckedCount: number;
}

/** Deterministic, deduplicated list of values checked against request addresses and bodies (H37a). */
export function buildCheckedLeakList(sentText: string): { entries: CheckedLeakEntry[]; maskedOriginalsCheckedCount: number } {
  const l = listed();
  const sent = sentText.toLowerCase();
  const maskedOriginalsChecked = MASKABLE_ORIGINALS.filter(
    (o) => inventedVisit.note.toLowerCase().includes(o.toLowerCase()) && !sent.includes(o.toLowerCase()),
  );
  const byLower = new Map<string, CheckedLeakEntry>();
  const add = (value: string, category: LeakCategory): void => {
    if (value.trim() === "") return;
    const key = value.toLowerCase();
    const existing = byLower.get(key);
    if (existing !== undefined) {
      if (!existing.categories.includes(category)) existing.categories.push(category);
      return;
    }
    byLower.set(key, { value, categories: [category] });
  };
  for (const v of l.full) add(v, "listedName");
  for (const v of l.others) add(v, "otherName");
  for (const v of l.parts) add(v, "namePart");
  for (const v of maskedOriginalsChecked) add(v, "maskedOriginal");
  return { entries: [...byLower.values()], maskedOriginalsCheckedCount: maskedOriginalsChecked.length };
}

/** Finds raw, percent-decoded, or `+`-decoded occurrence of a lowercase line in wire text (H37d). */
export function findNoteLineInWire(text: string, lineLow: string): number | null {
  const rawIdx = text.toLowerCase().indexOf(lineLow);
  if (rawIdx !== -1) return rawIdx;
  for (const plusAsSpace of [false, true]) {
    if (plusAsSpace && !text.includes("+")) continue;
    const { decoded, starts } = decodeWithSourceSpans(text, plusAsSpace);
    const decIdx = decoded.toLowerCase().indexOf(lineLow);
    if (decIdx !== -1) return starts[decIdx] ?? 0;
  }
  return null;
}

/** The leak assertions over the requests of one step. `sentText` is the outgoing text of the step, or "" when none was sent. */
export function leakCheck(requests: RecordedRequest[], sentText: string): LeakResult {
  const l = listed();
  const { entries, maskedOriginalsCheckedCount } = buildCheckedLeakList(sentText);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
  const wire = wireTexts(requests);
  const bodyTexts = requests.map((r) => (r.body ? r.body.toString("utf8") : ""));
  const wireForLines = [
    ...wire,
    ...requests.flatMap((r, i) => [
      decodeWithSourceSpans(r.url, false).decoded,
      decodeWithSourceSpans(r.url, true).decoded,
      decodeWithSourceSpans(bodyTexts[i]!, false).decoded,
      decodeWithSourceSpans(bodyTexts[i]!, true).decoded,
    ]),
  ];
  const carried = [...l.full, ...l.others, ...l.parts, ...MASKABLE_ORIGINALS];
  const matchedRawLines = noteLinesLeaked(wireForLines, NOTE_LINES, carried);
  const checkedValues = entries.map((e) => e.value);
  const noteLineItems = NOTE_LINES.map((text, lineIndex) => ({ text, marker: `[line#${lineIndex}]` }));
  const redactLeakPath = (rawUrl: string): string => redactPathValues(redactPathItems(redactedPath(rawUrl), noteLineItems, false), checkedValues);
  const scan = scanWire(requests, checkedValues);
  const attachCategories = (f: WireFinding): RedactedLeakFinding => ({
    ...f,
    path: requests[f.requestIndex] ? redactLeakPath(requests[f.requestIndex]!.url) : f.path,
    categories: [...(entries[f.valueIndex]?.categories ?? [])],
  });

  const noteLinesFound: NoteLineFinding[] = [];
  let noteLineRemainderCount = 0;
  for (let lineIndex = 0; lineIndex < NOTE_LINES.length; lineIndex++) {
    const line = NOTE_LINES[lineIndex]!;
    const lineLow = line.toLowerCase();
    const carries = matchedRawLines.includes(line) && lineCarriesValue(line, carried);
    for (let requestIndex = 0; requestIndex < requests.length; requestIndex++) {
      const r = requests[requestIndex]!;
      let host = "";
      try {
        host = new URL(r.url).host;
      } catch {
        host = "";
      }
      const path = redactLeakPath(r.url);
      const bodyText = bodyTexts[requestIndex]!;
      for (const [field, text] of [["address", r.url], ["body", bodyText]] as const) {
        const srcOffset = findNoteLineInWire(text, lineLow);
        if (srcOffset === null) continue;
        if (carries) {
          noteLinesFound.push({
            lineIndex,
            lineLength: line.length,
            requestIndex,
            host,
            path,
            field,
            byteOffset: Buffer.byteLength(text.slice(0, srcOffset), "utf8"),
          });
        } else {
          noteLineRemainderCount++;
        }
      }
    }
  }

  return {
    stops: scan.stops.map(attachCategories),
    observations: scan.observations.map(attachCategories),
    noteLinesFound,
    noteLineRemainderCount,
    imageBytesFound: requests.some((r) => r.body !== undefined && (r.body.includes(png) || r.body.includes(jpeg))),
    checkedCount: entries.length,
    maskedOriginalsCheckedCount,
  };
}

const primaryLeakLabel = (cats: readonly LeakCategory[]): string => {
  if (cats.includes("listedName")) return "a listed name was in a request";
  if (cats.includes("otherName")) return "another name of a listed person was in a request";
  if (cats.includes("namePart")) return "a name part was in a request";
  return "a masked original was in a request";
};

export const leakProblems = (r: LeakResult): string[] => [
  ...r.stops.map(
    (f) =>
      `${primaryLeakLabel(f.categories)} (index=${f.valueIndex}, length=${f.valueLength}, host=${f.host}, path=${f.path}, field=${f.field}, byteOffset=${f.byteOffset}, runClass=${f.runClass}${f.runLength !== undefined ? `, runLength=${f.runLength}` : ""}, before=${f.beforeClass ?? "null"}, after=${f.afterClass ?? "null"})`,
  ),
  ...r.noteLinesFound.map(
    (n) => `a raw line of the note that carries a name or a masked original was in a request (lineIndex=${n.lineIndex}, length=${n.lineLength}, host=${n.host}, path=${n.path}, field=${n.field}, byteOffset=${n.byteOffset})`,
  ),
  ...(r.imageBytesFound ? ["image bytes were in a request"] : []),
];

/** What a finished note must not hold (the order, item 5): double asterisks, a heading line, a tag or a token. */
export function draftProblems(label: string, text: string): string[] {
  const out: string[] = [];
  if (text.includes("**")) out.push(`${label} holds a pair of double asterisks`);
  if (text.split("\n").some((l) => /^#{1,6}\s/.test(l))) out.push(`${label} holds a heading line`);
  const tag = text.match(/\[[^\]\n]{1,40}\]/)?.[0] ?? text.match(/[[{(][^\]})\n]{0,30}(?:Person|Place|Date|Detail)[ \t]*\d+/i)?.[0];
  if (tag !== undefined) out.push(`${label} holds a tag (${tag})`);
  if (/<<[^>]*>>|\{\{[^}]*\}\}|%%[^%]*%%|\bPRONOUN\b|\bTOKEN\b/i.test(text)) out.push(`${label} holds a token`);
  return out;
}

// ---- reading the page --------------------------------------------------------------------------------------

/**
 * H17, drafting R16. The finished zone (sheet, flags, buttons, Copy's reason) shows no token syntax, and Copy is
 * disabled exactly while a flag is open. Returns the problems, the flags and Copy's state for the record.
 */
export async function finishedZoneCheck(page: Page, label: string): Promise<{ problems: string[]; flags: string[]; copyDisabled: boolean; putBackButtons: string[] }> {
  const zone = page.locator('[data-zone="finished"]');
  const flags = (await zone.locator(".sheet-notes li").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const putBackButtons = (await zone.locator("[data-put-back]").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  const copy = zone.locator("#copy");
  const copyDisabled = await copy.isDisabled();
  const copyTitle = (await copy.getAttribute("title")) ?? "";
  // H34a: each part is named, so the problem line says where the first token character stands.
  const parts: { part: string; text: string }[] = [
    { part: "sheet", text: await zone.locator("[data-sheet]").innerText() },
    { part: "Copy title", text: copyTitle },
    ...putBackButtons.map((text) => ({ part: "a put-back button", text })),
    ...(await zone.locator("[data-copy-held]").allInnerTexts()).map((text) => ({ part: "a held note", text })),
  ];
  const problems: string[] = [];
  for (const { part, text } of parts) {
    const at = text.search(/[[\]{}]/);
    if (at === -1) continue;
    const around = text.slice(Math.max(0, at - 30), at + 31).replace(/\r?\n/g, " / ");
    problems.push(`${label}: the ${part} shows token syntax (${text[at]}) in "${around}".`);
    break;
  }
  const open = flags.some((f) => f.startsWith("Not put back:") || f.startsWith("Added by the model:"));
  if (open && !copyDisabled) problems.push(`${label}: a flag is open and Copy is enabled.`);
  if (!open && copyDisabled) problems.push(`${label}: no flag is open and Copy is disabled.`);
  return { problems, flags, copyDisabled, putBackButtons };
}

// ---- the forms of the cloud replies (H34a) -------------------------------------------------------------------

const PRONOUNS = ["he", "she", "him", "her", "his", "hers", "himself", "herself"] as const;

export interface CloudReplyForms {
  step: string;
  /** false when the body could not be read or held no text; the other fields are then empty */
  readable: boolean;
  /** every square-bracket and brace group of the reply, each cut to 60 characters, at most 20 */
  groups: string[];
  groupCount: number;
  /** each pronoun as a whole word outside those groups */
  pronouns: Record<(typeof PRONOUNS)[number], number>;
  length: number;
}

/** The forms of one reply text. The text itself is never returned. */
export function replyForms(step: string, text: string | null): CloudReplyForms {
  const empty = Object.fromEntries(PRONOUNS.map((p) => [p, 0])) as CloudReplyForms["pronouns"];
  if (text === null) return { step, readable: false, groups: [], groupCount: 0, pronouns: empty, length: 0 };
  const found = text.match(/\[[^\]]*\]|\{[^}]*\}/g) ?? [];
  const outside = text.replace(/\[[^\]]*\]|\{[^}]*\}/g, " ").toLowerCase();
  const pronouns = { ...empty };
  for (const p of PRONOUNS) pronouns[p] = outside.match(new RegExp(`(?<![\\p{L}\\p{N}_])${p}(?![\\p{L}\\p{N}_])`, "gu"))?.length ?? 0;
  return { step, readable: true, groups: found.slice(0, 20).map((g) => g.slice(0, 60)), groupCount: found.length, pronouns, length: text.length };
}

/** The text of a generateContent answer: the parts of the first candidate that are not thoughts. Null when it cannot be read. */
export function replyText(body: string): string | null {
  try {
    const json = JSON.parse(body) as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
    const parts = json.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    return parts.filter((p) => p.thought !== true && typeof p.text === "string").map((p) => p.text).join("");
  } catch {
    return null;
  }
}

export interface ReplyWatch {
  /** the name given to each reply that arrives from now on */
  step: string;
  replies: CloudReplyForms[];
  /** replies whose body has been read (or has failed to read) */
  settled(): number;
  /** waits for every body read in flight */
  done(): Promise<void>;
}

/**
 * Reads each generateContent answer the context receives, through the response bodies, and keeps only its forms.
 * The recorder keeps lengths for App Check only, so this reads the cloud model's answers itself. Never the reply text.
 */
export function watchCloudReplies(context: BrowserContext): ReplyWatch {
  const reads: Promise<void>[] = [];
  let settled = 0;
  const watch: ReplyWatch = {
    step: "",
    replies: [],
    settled: () => settled,
    done: () => Promise.all(reads).then(() => undefined),
  };
  context.on("response", (res) => {
    const url = res.url();
    if (!url.includes(`//${CLOUD_MODEL_HOST}/`) || !url.includes(":generateContent")) return;
    const step = watch.step;
    const slot = watch.replies.length;
    watch.replies.push(replyForms(step, null));
    reads.push(
      res.text().then(
        (body) => {
          watch.replies[slot] = replyForms(step, replyText(body));
          settled++;
        },
        () => {
          settled++;
        },
      ),
    );
  });
  return watch;
}

export const words = async (page: Page, state: "network" | "device" | "cloud"): Promise<string> =>
  (await page.locator(`[data-state="${state}"] .state-words`).innerText()).trim();

/** The card: verdict and rows as text, one row per line. */
export async function readCard(page: Page): Promise<{ verdict: string; rows: Record<string, string>; kind: string | null }> {
  const line = page.locator("[data-egress-line]");
  const kind = await line.getAttribute("data-kind");
  const verdict = (await line.locator(".egress-headline").first().innerText()).replace(/\s+/g, " ").trim();
  const rows: Record<string, string> = {};
  const trs = line.locator(".egress-row");
  for (let i = 0; i < (await trs.count()); i++) {
    const label = (await trs.nth(i).locator("th").innerText()).replace(/\s+/g, " ").trim();
    rows[label] = (await trs.nth(i).locator("td").innerText()).replace(/\s+/g, " ").trim();
  }
  return { verdict, rows, kind };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ChipLocatorLike {
  count(): Promise<number>;
  first(): { click(): Promise<void>; getAttribute(name: string): Promise<string | null> };
}

export interface ChipAcceptPage {
  locator(selector: string): ChipLocatorLike;
}

/** Accept every dashed suggestion, one press each, until none is left. Returns how many were accepted. */
export async function acceptAll(page: ChipAcceptPage, timeoutMs = 5_000): Promise<number> {
  let accepted = 0;
  for (let i = 0; i < 100; i++) {
    const left = page.locator('[data-mask-view] [data-chip="proposed"]');
    const n = await left.count();
    if (n === 0) break;
    const target = left.first();
    const start = await target.getAttribute("data-start");
    const end = await target.getAttribute("data-end");
    await target.click();
    accepted++;
    const clicked =
      start !== null && end !== null
        ? page.locator(`[data-mask-view] [data-chip="proposed"][data-start="${start}"][data-end="${end}"]`)
        : null;
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = await left.count();
      const clickedGone = clicked === null || (await clicked.count()) === 0;
      if (clickedGone && remaining < n) break;
      if (Date.now() >= deadline) {
        throw new Error(`acceptAll: clicked chip (${start}..${end}) did not leave proposed with count < ${n} (remaining=${remaining})`);
      }
      await wait(25);
    }
  }
  return accepted;
}

/** Counts the calls the page makes on the device model (sessions made and prompts), so a device step can be seen. */
export async function countDeviceModelCalls(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const w = window as unknown as { __lm: { creates: number; prompts: number }; LanguageModel?: { create: (...a: unknown[]) => Promise<Record<string, unknown>> } };
    w.__lm = { creates: 0, prompts: 0 };
    const lm = w.LanguageModel;
    if (!lm || typeof lm.create !== "function") return;
    const create = lm.create.bind(lm);
    lm.create = async (...args: unknown[]) => {
      w.__lm.creates += 1;
      const session = await create(...args);
      for (const method of ["prompt", "promptStreaming"]) {
        const original = session[method] as ((...a: unknown[]) => unknown) | undefined;
        if (typeof original === "function") {
          session[method] = (...a: unknown[]) => {
            w.__lm.prompts += 1;
            return original.apply(session, a);
          };
        }
      }
      return session;
    };
  });
}

export const deviceModelCalls = (page: Page): Promise<{ creates: number; prompts: number }> =>
  page.evaluate(() => (window as unknown as { __lm?: { creates: number; prompts: number } }).__lm ?? { creates: 0, prompts: 0 });

// ---- the record --------------------------------------------------------------------------------------------

export interface RecordHeader {
  date: string;
  time: string;
  browser: string;
  machine: string;
  buildCommit: string;
}

export function recordHeader(browser: string): RecordHeader {
  const now = new Date().toISOString();
  return { date: now.slice(0, 10), time: now, browser, machine: describeMachine(), buildCommit: buildCommit() };
}

export interface RequestsSection {
  /** every request to a host outside the served page, one entry each */
  outside: RequestRecord[];
  sameOriginRequests: number;
  sameOriginWithBody: number;
  generateContentCalls: number;
  appCheckExchanges: number;
  stoppedAtCap: boolean;
}

export function requestsSection(requests: RecordedRequest[], origin: string, counts: { generateContent: number; appCheck: number; stoppedAtCap: boolean }): RequestsSection {
  const inside = requests.filter((r) => r.url.startsWith(origin));
  return {
    outside: requests.filter((r) => !r.url.startsWith(origin)).map((r) => describeRequest(r, origin)),
    sameOriginRequests: inside.length,
    sameOriginWithBody: inside.filter((r) => r.bodyBytes > 0).length,
    generateContentCalls: counts.generateContent,
    appCheckExchanges: counts.appCheck,
    stoppedAtCap: counts.stoppedAtCap,
  };
}
