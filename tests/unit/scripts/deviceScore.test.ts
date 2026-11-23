// Measurement task 7: the scoring side of the device pass, tested without a browser.
// Invented people only.
import { describe, expect, it } from "vitest";
import {
  applyDeviceRun,
  deviceNotMeasured,
  limitMinutes,
  parseDeviceReply,
  scoreDeviceRun,
  type NoteReply,
} from "../../../scripts/deviceScore";
import type { SyntheticNote } from "../../../scripts/buildSet";
import { DEVICE_MEASURE_LIMIT_MIN } from "../../../src/constants";
import { DEFAULT_POLICY } from "../../../src/masking/policy";

const text = "Visited Grace Reyes at 4 Mill Lane. Her twin brother was there. Asked about the form.";
const at = (s: string) => ({ start: text.indexOf(s), end: text.indexOf(s) + s.length });
const note = (id: string): SyntheticNote => ({
  id,
  text,
  clientList: [{ id: "c1", fullName: "Grace Reyes", otherNames: [], pronouns: "she/her" }],
  identifiers: [
    { kind: "listedName", text: "Grace Reyes", ...at("Grace Reyes") },
    { kind: "place", text: "4 Mill Lane", ...at("4 Mill Lane") },
    { kind: "phrase", text: "Her twin brother", ...at("Her twin brother") },
  ],
});

const answered = (noteId: string, candidates: { text: string; kind: "name" | "place" | "dob" | "phrase" }[]): NoteReply => ({
  noteId,
  ok: true,
  candidates,
  ms: 1000,
});

describe("parseDeviceReply", () => {
  it("reads a clean reply", () => {
    const r = parseDeviceReply('{"candidates":[{"text":"4 Mill Lane","kind":"place"}]}');
    expect(r).toEqual({ ok: true, candidates: [{ text: "4 Mill Lane", kind: "place" }] });
  });
  it("strips a code fence, as the job does", () => {
    const r = parseDeviceReply('```json\n{"candidates":[]}\n```');
    expect(r).toEqual({ ok: true, candidates: [] });
  });
  it("gives a reason for text that is not JSON and for JSON of the wrong shape", () => {
    expect(parseDeviceReply("here you go")).toMatchObject({ ok: false });
    expect(parseDeviceReply('{"candidates":[{"text":"x","kind":"colour"}]}')).toMatchObject({ ok: false });
    const bad = parseDeviceReply("nope");
    expect(bad.ok === false && bad.reason.length).toBeGreaterThan(5);
  });
});

describe("limitMinutes", () => {
  it("uses the constant when the variable is absent", () => {
    expect(limitMinutes({})).toBe(DEVICE_MEASURE_LIMIT_MIN);
  });
  it("lets a session set a shorter limit", () => {
    expect(limitMinutes({ DEVICE_MEASURE_LIMIT_MIN: "15" })).toBe(15);
  });
  it("ignores values that are not a positive number, and anything above the constant", () => {
    for (const v of ["", "abc", "0", "-3", "NaN"]) expect(limitMinutes({ DEVICE_MEASURE_LIMIT_MIN: v })).toBe(DEVICE_MEASURE_LIMIT_MIN);
    expect(limitMinutes({ DEVICE_MEASURE_LIMIT_MIN: "90" })).toBe(DEVICE_MEASURE_LIMIT_MIN);
  });
});

describe("scoreDeviceRun", () => {
  const notes = [note("n1"), note("n2"), note("n3")];
  const replies: NoteReply[] = [
    answered("n1", [
      { text: "4 Mill Lane", kind: "place" },
      { text: "Her twin brother", kind: "phrase" },
      { text: "the form", kind: "phrase" },
    ]),
    answered("n2", []),
    { noteId: "n3", ok: false, reason: "The device model could not answer.", ms: 500 },
  ];
  const run = scoreDeviceRun(notes, replies, DEFAULT_POLICY);

  it("counts answered notes as n and every tried note as attempted", () => {
    expect(run.n).toBe(2);
    expect(run.attempted).toBe(3);
    expect(run.failed).toEqual([{ noteId: "n3", reason: "The device model could not answer." }]);
  });

  it("scores the device pass alone on the raw note, over the answered notes only", () => {
    expect(run.device.score.total).toBe(6);
    expect(run.device.score.caught).toBe(2);
    expect(run.device.score.falseMasks).toBe(1);
    expect(run.device.misses.map((m) => m.kind).sort()).toEqual(["listedName", "listedName", "phrase", "place"]);
    expect(run.device.falseMaskItems).toEqual([{ noteId: "n1", kind: "falseMask", text: "the form" }]);
  });

  it("scores exact alone on the same notes", () => {
    expect(run.exact.score.total).toBe(6);
    expect(run.exact.score.caught).toBe(2);
  });

  it("scores all passes together on the same notes, and they catch at least what each catches alone", () => {
    expect(run.merged.score.total).toBe(6);
    expect(run.merged.score.caught).toBe(4);
    expect(run.merged.score.caught).toBeGreaterThanOrEqual(run.device.score.caught);
    expect(run.merged.score.caught).toBeGreaterThanOrEqual(run.exactAndNear.score.caught);
    expect(run.merged.misses.map((m) => m.noteId)).toEqual(["n2", "n2"]);
  });

  it("scores nothing when no note was answered", () => {
    const none = scoreDeviceRun(notes, [{ noteId: "n1", ok: false, reason: "x", ms: 1 }], DEFAULT_POLICY);
    expect(none.n).toBe(0);
    expect(none.device.score.total).toBe(0);
  });
});

describe("applyDeviceRun", () => {
  const notes = [note("n1"), note("n2")];
  const run = scoreDeviceRun(notes, [answered("n1", [{ text: "4 Mill Lane", kind: "place" }]), answered("n2", [])], DEFAULT_POLICY);
  const header = { date: "2026-11-13T09:00:00.000Z", browser: "Google Chrome 157.0.8103.79", script: "scripts/measureDevice.ts", scriptVersion: "1" };
  const earlierCatch = { date: "d", browser: "Node", script: "scripts/measureExact.ts", scriptVersion: "1", setSize: 200, seed: 7, exact: { caught: 1, total: 2, falseMasks: 0, byKind: {} } };
  const earlierMisses = { date: "d", browser: "Node", exact: [], near: [], exactAndNear: [], device: "not measured", merged: "not measured", falseMasks: { exact: [], near: [], exactAndNear: [], device: "not measured" } };
  const timing = { elapsedMs: 120_000, limitMin: 15, stoppedAtLimit: true };

  it("writes device and merged with their own date, browser, n, throughput and limit, and keeps the exact part", () => {
    const out = applyDeviceRun(earlierCatch, earlierMisses, run, header, timing);
    expect(out.catchRate["exact"]).toEqual(earlierCatch.exact);
    expect(out.catchRate["setSize"]).toBe(200);
    const device = out.catchRate["device"] as Record<string, unknown>;
    expect(device).toMatchObject({ n: 2, attempted: 2, caught: 1, total: 6, falseMasks: 0, stoppedAtLimit: true, limitMinutes: 15 });
    expect(device["date"]).toBe(header.date);
    expect(device["browser"]).toBe(header.browser);
    expect(device["notesPerMinute"]).toBe(1);
    expect(out.catchRate["merged"]).toMatchObject({ n: 2, date: header.date, browser: header.browser });
    expect(out.catchRate["exactOnDeviceNotes"]).toMatchObject({ n: 2 });
  });

  it("lists the device misses and false masks in the misses file", () => {
    const out = applyDeviceRun(earlierCatch, earlierMisses, run, header, timing);
    expect(Array.isArray(out.misses["device"])).toBe(true);
    expect((out.misses["device"] as unknown[]).length).toBe(5);
    expect(Array.isArray(out.misses["merged"])).toBe(true);
    expect((out.misses["falseMasks"] as { device: unknown })["device"]).toEqual([]);
    expect(out.misses["deviceNotesFailed"]).toEqual([]);
  });

  it("gives the not-measured form with a reason and no number", () => {
    const out = deviceNotMeasured(earlierCatch, earlierMisses, "The device model reported: downloadable");
    expect(out.catchRate["device"]).toEqual({ status: "not measured", reason: "The device model reported: downloadable" });
    expect(out.catchRate["merged"]).toEqual({ status: "not measured", reason: "The device model reported: downloadable" });
    expect(out.misses["device"]).toBe("not measured");
    expect(out.catchRate["exact"]).toEqual(earlierCatch.exact);
  });

  it("gives the not-measured form when no note was answered", () => {
    const none = scoreDeviceRun(notes, [{ noteId: "n1", ok: false, reason: "x", ms: 1 }], DEFAULT_POLICY);
    const out = applyDeviceRun(earlierCatch, earlierMisses, none, header, timing);
    expect((out.catchRate["device"] as { status: string }).status).toBe("not measured");
  });
});
