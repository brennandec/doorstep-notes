// Build the masked text, the mask map and the surface forms (masking R2.3, R6, R11).
// The map, the surface forms and the listed names stay on this device. Only the
// masked text may leave, and only through forOutgoing().
import type { ClientEntry } from "./clientList";
import { assignTags } from "./tags";
import { fold } from "./fold";
import type { MaskEntry, MaskMap, MaskResult, MaskSpan } from "./types";

export function applyMask(raw: string, spans: MaskSpan[], clients: ClientEntry[]): MaskResult {
  const tagged = assignTags(spans);
  const accepted = tagged.filter((s) => s.accepted);
  const byId = new Map(clients.map((c) => [c.id, c]));

  const map: MaskMap = {};
  const clientByTag: Record<string, string> = {};
  for (const s of accepted) {
    if (map[s.tag] !== undefined) continue;
    const client = s.clientId ? byId.get(s.clientId) : undefined;
    map[s.tag] = client ? client.fullName : s.surfaceForm;
    if (client) clientByTag[s.tag] = client.id;
  }

  let maskedText = "";
  let at = 0;
  for (const s of accepted) {
    if (s.start < at) continue; // spans never overlap; this keeps the text sound if a caller errs
    maskedText += raw.slice(at, s.start) + s.tag;
    at = s.end;
  }
  maskedText += raw.slice(at);

  const surfaceForms = [...new Set(accepted.map((s) => s.surfaceForm))];
  const listedNames = [...new Set(clients.flatMap((c) => [c.fullName, ...c.otherNames]))];
  const listedGroups = clients.map((c) => [...new Set([c.fullName, ...c.otherNames])]);
  const onPurpose = tagged.filter((s) => s.sentOnPurpose);
  const sentOnPurpose = [
    ...new Set(
      onPurpose.flatMap((s) => {
        const client = s.clientId ? byId.get(s.clientId) : undefined;
        return client ? [client.fullName, s.surfaceForm] : [s.surfaceForm];
      }),
    ),
  ];

  // One entry for each tag: the mapped original, then every surface form found for it.
  const entries: MaskEntry[] = Object.keys(map).map((tag) => {
    const forms: string[] = [];
    for (const f of [map[tag]!, ...accepted.filter((s) => s.tag === tag).map((s) => s.surfaceForm)]) {
      if (!forms.some((x) => fold(x) === fold(f))) forms.push(f);
    }
    return { tag, forms };
  });

  return { maskedText, spans: tagged, map, clientByTag, surfaceForms, listedNames, listedGroups, sentOnPurpose, entries };
}

/**
 * The only part of a mask result that may be built into outgoing text. It holds
 * no map, no surface form and no listed name (masking R6.2, R11.1).
 */
export function forOutgoing(result: MaskResult): { text: string } {
  return { text: result.maskedText };
}
