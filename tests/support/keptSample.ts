// A kept document with something in every part, for tests. Invented people only.
import { inventedVisit } from "../../src/app/example/inventedVisit";
import type { KeptData } from "../../src/storage/kept";

/** A visit with something in every part, using the invented people only. */
export function fullData(): KeptData {
  return {
    example: true,
    clientList: inventedVisit.clientList,
    opened: { note: true, list: false, scans: false, reader: false, ledger: false, measured: false, date: false, present: true, seen: false, agreed: false, risks: false, nextSteps: false },
    visit: {
      noteText: inventedVisit.note,
      photo: { mimeType: "image/png", base64: "aGVsbG8=" },
      record: structuredClone(inventedVisit.preparedRecord),
      recordSource: "ON_DEVICE",
      mask: {
        raw: "Present: Maria Okonkwo-Reyes, Bea.",
        spans: [
          { start: 9, end: 30, surfaceForm: "Maria Okonkwo-Reyes", tag: "[Person 1]", kind: "listed", clientId: "c1", tagKind: "Person", key: "client:c1", accepted: true, sentOnPurpose: false },
          { start: 32, end: 35, surfaceForm: "Bea", tag: "[Person 2]", kind: "proposed", tagKind: "Person", key: "text:bea", accepted: false, sentOnPurpose: false },
        ],
        line: "The device model proposed more.",
        proposals: { source: "ON_DEVICE", connected: true },
      },
      outgoingText: "Present: [Person 1], Bea.",
      previewOnly: false,
      rewrites: [{ from: "A long sentence.", to: "Short.", nth: 0 }],
      dateChoice: { words: "12/11", mode: "confirmed" },
      dateFlags: [],
      dateLine: null,
      finished: { text: "Maria Okonkwo-Reyes was seen.", source: "IN_CLOUD", connected: false, notes: [], shortLine: null, added: [] },
      step: "finished",
    },
  };
}

