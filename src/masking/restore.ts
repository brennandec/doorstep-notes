// Put values back (masking R11.2). Tags are replaced from the mask map, on this
// device only. Pronoun tokens are handled in pronouns.ts.
import type { MaskMap } from "./types";

export function restoreTags(text: string, map: MaskMap): string {
  const tags = Object.keys(map).sort((a, b) => b.length - a.length);
  let out = text;
  for (const tag of tags) out = out.split(tag).join(map[tag]!);
  return out;
}
