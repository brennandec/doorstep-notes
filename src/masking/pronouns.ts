// Pronoun tokens and restore (masking R8, ruling 13, drafting R6).
// Only tokens the draft was asked to use are replaced. A token names the role
// and the tag: {he:Person 1} is the subject form, {him:Person 1} the object
// form, {his:Person 1} the possessive form, for the person behind that tag.
// The token name only picks the role; the words come from the client list entry.
// Free text is never re-read, except what joins two tokens for one tag and the one
// character after them (drafting R19, H25). Verb agreement is not adjusted.
import { fill, strings } from "../app/strings";
import type { ClientEntry } from "./clientList";
import { restoreTags } from "./restore";
import { normalizeTokens, REFLEXIVE_TOKEN_ROLES, TOKEN_KINDS, TOKEN_ROLES } from "./tokenForms";
import type { MaskResult } from "./types";

type Role = "subject" | "object" | "possessive" | "reflexive";

const ROLE_BY_NAME: Record<string, Role> = {
  he: "subject", she: "subject", they: "subject",
  him: "object", her: "object", them: "object",
  his: "possessive", hers: "possessive", their: "possessive",
  himself: "reflexive", herself: "reflexive", themselves: "reflexive", themself: "reflexive",
};

const WORDS: Record<"he/him" | "she/her" | "they/them", Record<Role, string>> = {
  "he/him": { subject: "he", object: "him", possessive: "his", reflexive: "himself" },
  "she/her": { subject: "she", object: "her", possessive: "her", reflexive: "herself" },
  "they/them": { subject: "they", object: "them", possessive: "their", reflexive: "themselves" },
};

const ALL_TOKEN_ROLES = [...TOKEN_ROLES, ...REFLEXIVE_TOKEN_ROLES] as const;
const REFLEXIVE_SET = new Set<string>(REFLEXIVE_TOKEN_ROLES);
const TOKEN = new RegExp(String.raw`\{(${ALL_TOKEN_ROLES.join("|")}):(\[?[A-Za-z]+ \d+\]?)\}`, "gi");

export interface RestoreOutcome {
  text: string;
  /** plain lines to show with the finished note */
  notes: string[];
  /** how many pronoun tokens were replaced */
  tokensReplaced: number;
}

/** The token text a draft is asked to use, for example {he:Person 1}. */
export function pronounToken(name: string, tag: string): string {
  return `{${name}:${tag.replace(/^\[|\]$/g, "")}}`;
}

/** True when the text before a token ends where a sentence starts: the start, a line start, or . ! ? (with any closing quote or bracket) and a space. Drafting R18. */
const SENTENCE_START = /(?:^[ \t]*|\n[ \t]*|[.!?]["'\u201D\u2019)\]]*[ \t]+)$/;
const startsSentence = (before: string): boolean => SENTENCE_START.test(before);

/** The slots a token name can fill. "her" fills two: object and possessive. Drafting R19. */
const SLOTS: Record<string, readonly Role[]> = {
  he: ["subject"], she: ["subject"], they: ["subject"],
  him: ["object"], them: ["object"], her: ["object", "possessive"],
  his: ["possessive"], hers: ["possessive"], their: ["possessive"],
};

/** One token in the shape normalizeTokens writes. Groups: 1 role, 2 tag label. */
const PAIR_TOKEN = new RegExp(String.raw`\{(${TOKEN_ROLES.join("|")}):((?:${TOKEN_KINDS.join("|")}) \d+)\}`, "gi");
/** What may stand between the two tokens of a hedge: or, / or and/or, any case, with spaces or tabs around it. */
const PAIR_JOINER = /^[ \t]*(?:and\/or|or|\/)[ \t]*$/i;
/** Strict function words and unambiguous non-noun adverbs/auxiliaries that may follow a hedged "her"/possessive pair. Excludes noun-ambiguous words like home, back, can, may, will. */
const NON_NOUN_BOUNDARY =
  /^[ \t]*(?:with|to|on|in|at|by|from|for|of|about|around|before|after|since|until|while|when|where|who|whom|whose|which|that|if|as|than|because|although|though|unless|and|or|but|nor|so|yet|the|a|an|this|these|those|again|already|also|always|never|often|once|twice|soon|today|tomorrow|yesterday|later|now|then|here|there|too|instead|together|alone|away|is|are|was|were|be|been|being|has|have|had|do|does|did|would|could|should|might|must|shall)\b/i;

const PAIR_PUNCT = /^[ \t]*(?:$|[\r\n.,;:!?)\]"'\u201D\u2019])/;
const isPairEnd = (next: string): boolean => PAIR_PUNCT.test(next) || NON_NOUN_BOUNDARY.test(next);

/**
 * The token name kept for a hedge, or null when two tokens for one tag are not a hedge. A hedge names two words
 * for one slot for the same tag: identical pairs ({her:Person 1} or {her:Person 1}), or alternatives ({he} or {she},
 * {him}/{her}, {his} or {her}). Words for different slots ({she} or {her} daughter, {him} or {his} sister) are two
 * mentions and stay. Non-identical "her" with an object word is a hedge only when the pair ends the text or a clause,
 * because a word after it may make "her" possessive ({him} or {her} son).
 * The first token's word and capital are kept, except that non-identical "her" gives way to a possessive partner.
 */
function hedgeName(first: string, second: string, next: string): string | null {
  const a = first.toLowerCase();
  const b = second.toLowerCase();
  if (a === b) {
    if (!SLOTS[a]) return null;
    if (a === "her" && !isPairEnd(next)) return null;
    return first;
  }
  const common = (SLOTS[a] ?? []).filter((slot) => (SLOTS[b] ?? []).includes(slot));
  if (common.length === 0) return null;
  if ((a === "her" || b === "her") && common.includes("object") && !PAIR_PUNCT.test(next)) return null;
  const keep = a === "her" && !common.includes("object") ? b : a;
  return first[0] !== first[0]!.toLowerCase() ? keep[0]!.toUpperCase() + keep.slice(1) : keep;
}

const LITERAL_PAIR_WORDS =
  "he|she|they|him|her|them|his|hers|their|theirs|himself|herself|themselves|themself";
const NON_DETERMINER_PAIR_WORDS = new Set([
  "he",
  "she",
  "they",
  "hers",
  "theirs",
  "himself",
  "herself",
  "themselves",
  "themself",
]);
const LITERAL_PAIR = new RegExp(
  String.raw`\b(${LITERAL_PAIR_WORDS})\b[ \t]*(?:and\/or|or|\/)[ \t]*\b\1\b`,
  "gi",
);
const BRACKETED_TOKEN_OR_TAG = /(\{[^}]*\}|\[[^\]]*\])/g;
/** Plain-text pairs collapse only when standing alone (clause-end or punctuation, never before a noun or name). */
const LITERAL_PAIR_PUNCT = /^[ \t]*(?:$|[\r\n.,;:!?)\]"'\u201D]|['\u2019](?![A-Za-z]))/;
/** Lowercase modals and finite clause verbs allowed immediately after non-determiner pronoun pairs ("she or she will", "she/she agreed", "he/he went"). Rejects capitalized names and nouns. */
const SUBJECT_CLAUSE_VERB =
  /^[ \t]*(?:will|can|may|(?!(?:bed|red|shed|sled|wed|need|seed|feed|deed|weed|greed|speed|creed|steed|bleed|breed|shred|hundred)\b)[a-z]{2,}ed|went|came|said|told|made|took|gave|got|saw|knew|thought|felt|left|kept|met|ran|rang|sent|spoke|wrote|put|set|let|sat|stood|found|brought|posts|rings|lives|needs|wants|goes|says|helps|checks|visits|calls|asks|agrees|confirms|explains|offers|replies|stays)\b/;
const isLiteralPairEnd = (word: string, after: string): boolean =>
  LITERAL_PAIR_PUNCT.test(after) ||
  NON_NOUN_BOUNDARY.test(after) ||
  (NON_DETERMINER_PAIR_WORDS.has(word.toLowerCase()) && SUBJECT_CLAUSE_VERB.test(after));

/** Collapse literal identical pronoun pairs ("Her or her", "her/her", "her and/or her") outside tokens/tags when standing alone. */
export function collapseLiteralPronounPairs(text: string): string {
  const parts = text.split(BRACKETED_TOKEN_OR_TAG);
  for (let i = 0; i < parts.length; i += 2) {
    let seg = parts[i]!;
    const tail = parts[i + 1] ?? "";
    for (;;) {
      let replaced = false;
      const matches = [...seg.matchAll(LITERAL_PAIR)];
      for (const m of matches) {
        const start = m.index ?? 0;
        const end = start + m[0].length;
        const after = seg.slice(end) + tail;
        if (!isLiteralPairEnd(m[1]!, after)) continue;
        seg = seg.slice(0, start) + m[1]! + seg.slice(end);
        replaced = true;
        break;
      }
      if (!replaced) break;
    }
    parts[i] = seg;
  }
  return parts.join("");
}

/**
 * A model that does not know a person's pronouns may hedge with two tokens for one tag: {he:Person 1} or {she:Person 1}.
 * Both name the same person in the same slot, so they become one token (hedgeName). Tokens for two different tags,
 * and a pair joined by any other word, are left as they are. Repeats until nothing changes. Drafting R19.
 */
export function mergeTokenPairs(text: string): string {
  let out = text;
  for (let changed = true; changed; ) {
    changed = false;
    const tokens = [...out.matchAll(PAIR_TOKEN)];
    for (let i = 0; i + 1 < tokens.length; i += 1) {
      const a = tokens[i]!;
      const b = tokens[i + 1]!;
      const aStart = a.index ?? 0;
      const bStart = b.index ?? 0;
      const bEnd = bStart + b[0].length;
      if (a[2] !== b[2] || !PAIR_JOINER.test(out.slice(aStart + a[0].length, bStart))) continue;
      const name = hedgeName(a[1]!, b[1]!, out.slice(bEnd));
      if (name === null) continue;
      out = `${out.slice(0, aStart)}{${name}:${a[2]}}${out.slice(bEnd)}`;
      changed = true;
      break;
    }
  }
  return out;
}

export function restoreAll(rawDraft: string, result: MaskResult, clients: ClientEntry[]): RestoreOutcome {
  const draft = collapseLiteralPronounPairs(mergeTokenPairs(normalizeTokens(rawDraft)));
  const byId = new Map(clients.map((c) => [c.id, c]));
  const notes: string[] = [];
  let replaced = 0;

  const withPronouns = draft.replace(TOKEN, (whole, rawName: string, rawTag: string, offset: number) => {
    const lowerName = rawName.toLowerCase();
    const role = ROLE_BY_NAME[lowerName];
    if (!role) return whole;
    const stripped = rawTag.replace(/^\[|\]$/g, "");
    if (REFLEXIVE_SET.has(lowerName) && !/^person[ \t]+\d+$/i.test(stripped)) return whole;
    const tag = `[${stripped}]`;
    const clientId = result.clientByTag[tag];
    const client = clientId ? byId.get(clientId) : undefined;
    let set: keyof typeof WORDS = "they/them";
    if (client && client.pronouns !== "") {
      set = client.pronouns;
    } else {
      const who = result.map[tag] ?? tag.replace(/^\[|\]$/g, "");
      const line = fill(strings.masking.pronounFallback, { name: who });
      if (!notes.includes(line)) notes.push(line);
    }
    let word = WORDS[set][role];
    if (rawName[0] !== rawName[0]!.toLowerCase() || startsSentence(draft.slice(0, offset))) word = word[0]!.toUpperCase() + word.slice(1);
    replaced += 1;
    return word;
  });

  if (replaced === 0) notes.push(strings.masking.noPronounTokens);
  return { text: restoreTags(withPronouns, result.map), notes, tokensReplaced: replaced };
}
