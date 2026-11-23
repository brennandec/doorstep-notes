// Restore names in a returned draft, on this device only (drafting R6, ruling 13).
//   1. Pronoun tokens such as {she:Person 1} become words from the client list entry.
//      Free text is never re-read. No token at all gives a plain line and no change.
//   2. Tags are replaced from the mask map.
//   3. A tag in the draft with no map entry stays visible and is flagged.
//      A tag that was sent and is missing or changed in the draft is flagged the same way.
// Makes no network request.
import { fill, strings } from "../app/strings";
import type { ClientEntry } from "../masking/clientList";
import { RELATION_WORDS, ROLE_WORDS } from "../masking/notNeeded";
import { restoreAll } from "../masking/pronouns";
import { normalizeTokens, REFLEXIVE_TOKEN_ROLES, TOKEN_KINDS, TOKEN_ROLES } from "../masking/tokenForms";
import { tagsIn } from "../masking/tags";
import type { MaskResult } from "../masking/types";
import { repairUnclearPronoun } from "./caseNote";
import type { AddedName, Screened } from "./screenDraft";

const TOKEN_TAG = new RegExp(
  String.raw`\{(?:(?:${TOKEN_ROLES.join("|")})|(?:${REFLEXIVE_TOKEN_ROLES.join("|")})(?=:Person \d+)):((?:${TOKEN_KINDS.join("|")}) \d+)\}`,
  "gi",
);

export interface RestoreInput {
  draft: string;
  /** the outgoing text that was sent, or the part of it that holds tags */
  outgoing: { text: string; maskedRecord: string; mask: MaskResult; addedNames?: AddedName[] };
  clients: ClientEntry[];
  /** the draft after screening (ruling 24); names the model added are left as tags */
  screened?: Screened;
}

export interface Restored {
  /**
   * The working text. A tag or token that could not be put back is still in it as a tag, so a later press can put
   * a name back (R16.6). It is never shown and never copied: `shown` is.
   */
  text: string;
  /** The text on the sheet and on the clipboard, one string (R15.1). It holds no token syntax (R16.1). */
  shown: string;
  /** plain lines shown with the finished note, in order, without repeats */
  notes: string[];
  tokensReplaced: number;
  /** H47: how many mask tags (names in tag form, outside pronoun tokens) were in the draft and put back on this device */
  tagsRestored?: number;
  /** number of broken marks repaired while making the finished note (H39b) */
  repairedMarks: number;
  /** names the model added: shown as a plain phrase until she presses to put one back */
  added: AddedName[];
  /** true while any flag is open: a tag or token is still in the working text, a name the model added included. Copy is held (R16.4) */
  copyHeld: boolean;
}

/** Any bracket or brace form that still names a tag, even one that is not closed (drafting R15.4). */
const NAMES_A_TAG = /[[{(][^\]})\n]{0,30}?\b(Person|Place|Date|Detail)[ \t]*(\d+)(?![\d/:-])/gi;
/** The same with the closing bracket it may have, for taking the whole form out of the shown text. */
const NAMES_A_TAG_WHOLE = new RegExp(`${NAMES_A_TAG.source}[ \\t]*[\\]})]?`, "gi");

const properKind = (k: string): "Person" | "Place" | "Date" | "Detail" => (k[0]!.toUpperCase() + k.slice(1).toLowerCase()) as "Person";

const WHAT_TAG = {
  Person: () => strings.drafting.whatName,
  Place: () => strings.drafting.whatPlace,
  Date: () => strings.drafting.whatDate,
  Detail: () => strings.drafting.whatDetail,
} as const;
const SHOWN_TAG = {
  Person: () => strings.drafting.shownName,
  Place: () => strings.drafting.shownPlace,
  Date: () => strings.drafting.shownDate,
  Detail: () => strings.drafting.shownDetail,
} as const;

/** "a name (Person 9)" for `[Person 9]`: what a flag says a tag stands for. */
function whatTag(tag: string): string {
  const label = tag.replace(/^\[|\]$/g, "");
  return fill(WHAT_TAG[properKind(label.split(" ")[0]!)](), { label });
}

/** True while a tag or a pronoun token that names a tag is still in the text. */
export function holdsToken(text: string): boolean {
  return tagsNamedIn(text).length > 0 || new RegExp(TOKEN_TAG.source, "i").test(text);
}

/**
 * The text she sees and copies: every tag and pronoun token that is still in the working text becomes a phrase of
 * words in round brackets (R16.2). A tag that was put back is not in the working text any more.
 */
export function plainShown(working: string): string {
  return shownOf(working).shown;
}

/** True when the text before ends where a sentence starts (the same rule the pronoun tokens use, drafting R18). */
const SENTENCE_START = /(?:^[ \t]*|\n[ \t]*|[.!?]["'\u201D\u2019)\]]*[ \t]+)$/;
const ROLE_WORD = new RegExp(`^(?:${TOKEN_ROLES.join("|")})$`, "i");
/** `{word:words}` with a thing word first: the model used the token shape for a thing, as in {it:Mould}. */
const THING_GROUP = /^(it|its|itself)[ \t]*:[ \t]*\S.*$/i;
const THING_WORDS = new Set(["it", "its", "itself"]);
const FIRST_SECOND_PERSON_PRONOUNS = [
  "I", "me", "my", "mine", "myself",
  "we", "us", "our", "ours", "ourselves",
  "you", "your", "yours", "yourself", "yourselves",
] as const;
const FIRST_SECOND_SET = new Set(FIRST_SECOND_PERSON_PRONOUNS.map((p) => p.toLowerCase()));
const REPAIRABLE_PRONOUNS = [
  ...FIRST_SECOND_PERSON_PRONOUNS,
  "he", "him", "his", "himself",
  "she", "her", "hers", "herself",
  "they", "them", "their", "theirs", "themselves", "themself",
  "it", "its", "itself",
] as const;
const PRONOUN_WORD_SET = new Set(REPAIRABLE_PRONOUNS.map((p) => p.toLowerCase()));
const TOKEN_ROLE_SET = new Set<string>(TOKEN_ROLES);
const POSSESSIVE_DETERMINER: Readonly<Record<string, string>> = {
  i: "my", me: "my", my: "my", mine: "my",
  we: "our", us: "our", our: "our", ours: "our",
  you: "your", your: "your", yours: "your",
  he: "his", him: "his", his: "his",
  she: "her", her: "her", hers: "her",
  they: "their", them: "their", their: "their", theirs: "their",
  it: "its", its: "its",
};
const POSSESSIVE_SUFFIX_SRC = String.raw`(?:'s|\u2019s)(?![A-Za-z])`;
const POSSESSIVE_SUFFIX_START = /^(?:'s|\u2019s)(?![A-Za-z])/;
/** True for repairable pronouns; matches all 1st/2nd/3rd-person words case-insensitively except "I" (uppercase only). */
export const isPronounWord = (word: string): boolean => {
  const lower = word.toLowerCase();
  return lower === "i" ? word === "I" : PRONOUN_WORD_SET.has(lower);
};
const isFirstSecondPronoun = (word: string): boolean => isPronounWord(word) && FIRST_SECOND_SET.has(word.toLowerCase());
const PERSON_TAG_RE = /^Person[ \t]+\d+$/i;
const TAG_LABEL_RE = new RegExp(String.raw`^(?:${TOKEN_KINDS.join("|")})[ \t]+\d+$`, "i");
const TOKEN_KIND_SET = new Set(TOKEN_KINDS.map((k) => k.toLowerCase()));

const SCHEMA_ROLE_PHRASES = [
  ...ROLE_WORDS,
  ...RELATION_WORDS,
  "other",
  "social worker",
  "support worker",
  "case worker",
  "housing officer",
  "outreach worker",
  "visit worker",
  "property manager",
  "letting agent",
  "family member",
  "unknown person",
  "unlisted person",
  "unknown",
  "author",
] as const;
const SCHEMA_ROLES = new Set<string>(SCHEMA_ROLE_PHRASES);
const normalizeRolePhrase = (raw: string): string =>
  raw.trim().replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase().replace(/[_-]+/g, " ").replace(/[ \t]+/g, " ");
export const isSchemaRole = (raw: string): boolean => {
  const trimmed = raw.trim();
  if (trimmed === "" || TAG_LABEL_RE.test(trimmed)) return false;
  const norm = normalizeRolePhrase(trimmed);
  return SCHEMA_ROLES.has(norm) || SCHEMA_ROLES.has(norm.replace(/[ \t]+\d+$/, ""));
};
const SCHEMA_ROLE_ALT = [...new Set(SCHEMA_ROLE_PHRASES)]
  .sort((a, b) => b.length - a.length)
  .map((p) => p.replace(/[ \t]+/g, "[ _-]*"))
  .join("|");
const BARE_PRONOUN_ROLE = new RegExp(
  String.raw`(?<![A-Za-z0-9_/:{\[(])(${REPAIRABLE_PRONOUNS.join("|")}):(?:the[ \t]+)?(${SCHEMA_ROLE_ALT})(?:[ \t]+\d+)?(?![A-Za-z0-9_\]})])(${POSSESSIVE_SUFFIX_SRC})?`,
  "gi",
);
const BARE_FIRST_SECOND_PERSON_TAG = new RegExp(
  String.raw`(?<![{\[(\w/:])(${FIRST_SECOND_PERSON_PRONOUNS.join("|")})[ \t]*:[ \t]*Person[ \t]+\d+(?![\]})\w])(${POSSESSIVE_SUFFIX_SRC})?`,
  "gi",
);
const BARE_THING_WORD = new RegExp(
  String.raw`(?<![A-Za-z0-9_/:{\[(])(it|its|itself):([A-Za-z][A-Za-z0-9_-]*)(?![A-Za-z0-9_\]})])(${POSSESSIVE_SUFFIX_SRC})?`,
  "gi",
);
const DELIMITED_FIRST_SECOND_INNER_TAG = new RegExp(
  String.raw`(\{\{|\[\[|\{\[|\[\{|\{|\(|\[)[ \t]*(${FIRST_SECOND_PERSON_PRONOUNS.join("|")})[ \t]*:[ \t]*\[[ \t]*(Person[ \t]+\d+)[ \t]*\][ \t]*(\}\}|\]\]|\]\}|\}\]|\}|\)|\])(${POSSESSIVE_SUFFIX_SRC})?`,
  "gi",
);
const DELIMITED_MARK = new RegExp(
  String.raw`(\{\{|\[\[|\{\[|\[\{|\{|\(|\[)([^{}[\]()\n]{1,60})(\}\}|\]\]|\]\}|\}\]|\}|\)|\])(${POSSESSIVE_SUFFIX_SRC})?`,
  "g",
);
const MARK_PAIR_CLOSE: Record<string, string> = {
  "{": "}",
  "[": "]",
  "(": ")",
  "{{": "}}",
  "[[": "]]",
  "{[": "]}",
  "[{": "}]",
};
const PLURAL_TAG_ITEM_SRC = String.raw`(?:\[[ \t]*(?:${TOKEN_KINDS.join("|")})[ \t]+\d+[ \t]*\]|(?:${TOKEN_KINDS.join("|")})[ \t]+\d+)`;
const PLURAL_MULTI_PRONOUN_ALT = "they|them|their|theirs|themselves|themself|we|us|our|ours|ourselves|you|your|yours|yourself|yourselves";
const PLURAL_MULTI_TAG = new RegExp(
  String.raw`(\{\{|\[\[|\{\[|\[\{|\{|\(|\[)[ \t]*(${PLURAL_MULTI_PRONOUN_ALT})[ \t]*:[ \t]*(${PLURAL_TAG_ITEM_SRC}(?:(?:[ \t]*,[ \t]*(?:and[ \t]+)?|[ \t]+(?:and|&)[ \t]+)${PLURAL_TAG_ITEM_SRC})+)[ \t]*(\}\}|\]\]|\]\}|\}\]|\}|\)|\])(${POSSESSIVE_SUFFIX_SRC})?`,
  "gi",
);
const COLON_TAG_MARK = new RegExp(
  String.raw`([\[{(])[ \t]*[^\]})\[{(\n:]{1,40}:[^\]})\n]{0,30}?\b(Person|Place|Date|Detail)[ \t]*(\d+)(?![\d/:-])[ \t]*([\]})])(${POSSESSIVE_SUFFIX_SRC})?`,
  "gi",
);
const PAREN_UNREAD_MARK = /\(([^()\n]{1,60})\)/g;
const BARE_TAG_MARK = new RegExp(
  String.raw`(?<![A-Za-z0-9_/:{[])([A-Za-z]+)[ \t]*:[ \t]*((?:${TOKEN_KINDS.join("|")})[ \t]+\d+)(?![A-Za-z0-9_])`,
  "gi",
);
const BARE_SCHEMA_ROLE_MARK = new RegExp(
  String.raw`(?<![A-Za-z0-9_/:{[])([A-Za-z]+):(?:the[ \t]+)?(${SCHEMA_ROLE_ALT})(?:[ \t]+\d+)?(?![A-Za-z0-9_])`,
  "gi",
);
const BARE_PRONOUN_CAPITAL_MARK = /(?<![A-Za-z0-9_/:{[])([A-Za-z]+):([A-Z][A-Za-z0-9_-]*)(?![A-Za-z0-9_])/g;
const BARE_SPACED_PRONOUN_PASCAL = /(?<![A-Za-z0-9_/:{[])([A-Za-z]+)[ \t]*:[ \t]+([A-Z][a-z]+[A-Z][A-Za-z0-9_-]*)(?![A-Za-z0-9_])/g;
const BARE_PRONOUN_BEFORE_POSSESSIVE = new RegExp(
  String.raw`(?<![A-Za-z0-9_/:{[])(${REPAIRABLE_PRONOUNS.join("|")}):([A-Za-z][A-Za-z0-9_-]*)(?=${POSSESSIVE_SUFFIX_SRC})`,
  "gi",
);
/** A `{...}` or `[...]` group on one line with at most 60 characters inside and no bracket of the four kinds inside it. */
const GROUP = /\{([^{}[\]\n]{0,60})\}|\[([^{}[\]\n]{0,60})\]/g;

function formatPronoun(word: string, before: string): string {
  const lower = word.toLowerCase();
  const base = lower === "i" ? "I" : lower;
  return word[0] !== word[0]!.toLowerCase() || SENTENCE_START.test(before) ? base[0]!.toUpperCase() + base.slice(1) : base;
}

function formatRepairedPronoun(word: string, possSuffix: string | undefined, before: string): string | null {
  if (!possSuffix) return formatPronoun(word, before);
  const lower = word.toLowerCase();
  const poss = POSSESSIVE_DETERMINER[lower];
  if (poss === undefined) return null;
  const keepUpper = lower !== "i" && word[0] !== word[0]!.toLowerCase();
  return keepUpper || SENTENCE_START.test(before) ? poss[0]!.toUpperCase() + poss.slice(1) : poss;
}

function repairPronounRoleMarksWithCount(text: string): { text: string; count: number } {
  let out = text;
  let count = 0;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = prev.replace(
      DELIMITED_FIRST_SECOND_INNER_TAG,
      (whole, open: string, word: string, _tag: string, close: string, possSuffix: string | undefined, offset: number, source: string) => {
        if (MARK_PAIR_CLOSE[open] !== close || !isPronounWord(word)) return whole;
        const next = formatRepairedPronoun(word, possSuffix, source.slice(0, offset));
        if (next === null) return whole;
        count += 1;
        return next;
      },
    );
    const before = out;
    out = before.replace(
      DELIMITED_MARK,
      (whole, open: string, rawInner: string, close: string, possSuffix: string | undefined, offset: number) => {
        if (MARK_PAIR_CLOSE[open] !== close) return whole;
        const inner = rawInner.trim();
        const colon = inner.indexOf(":");
        if (colon <= 0) return whole;
        const left = inner.slice(0, colon).trim();
        const right = inner.slice(colon + 1).trim();
        if (!isPronounWord(left) || right === "") return whole;
        const repairable = PERSON_TAG_RE.test(right)
          ? isFirstSecondPronoun(left)
          : !TAG_LABEL_RE.test(right) && (isSchemaRole(right) || (THING_WORDS.has(left.toLowerCase()) && !right.startsWith("//")));
        if (!repairable) return whole;
        const next = formatRepairedPronoun(left, possSuffix, before.slice(0, offset));
        if (next === null) return whole;
        count += 1;
        return next;
      },
    );
  }
  out = out.replace(
    BARE_FIRST_SECOND_PERSON_TAG,
    (whole, word: string, possSuffix: string | undefined, offset: number, source: string) => {
      if (!isPronounWord(word)) return whole;
      const next = formatRepairedPronoun(word, possSuffix, source.slice(0, offset));
      if (next === null) return whole;
      count += 1;
      return next;
    },
  );
  out = out.replace(
    BARE_PRONOUN_ROLE,
    (whole, word: string, _role: string, possSuffix: string | undefined, offset: number, source: string) => {
      if (!isPronounWord(word)) return whole;
      const next = formatRepairedPronoun(word, possSuffix, source.slice(0, offset));
      if (next === null) return whole;
      count += 1;
      return next;
    },
  );
  out = out.replace(
    BARE_THING_WORD,
    (whole, word: string, right: string, possSuffix: string | undefined, offset: number, source: string) => {
      const after = source.slice(offset + whole.length);
      if (TOKEN_KIND_SET.has(right.toLowerCase()) && /^[ \t]+\d+(?![A-Za-z0-9_])/.test(after)) return whole;
      const next = formatRepairedPronoun(word, possSuffix, source.slice(0, offset));
      if (next === null) return whole;
      count += 1;
      return next;
    },
  );
  return { text: out, count };
}

/**
 * H39: reconstruct pronoun:Role marks (with or without braces) and 1st/2nd-person pronoun:Person N marks into the
 * pronoun alone without triggering `unreadMark`, while leaving `{word:Tag}` for 3rd-person pronouns, `[it:Place 1]`,
 * and ordinary prose colons untouched.
 */
export function repairPronounRoleMarks(text: string): string {
  return repairPronounRoleMarksWithCount(text).text;
}

export interface TextRange {
  start: number;
  end: number;
}

/**
 * Character ranges of existing tags (`[Person 1]`), pronoun tokens (`{she:Person 1}`), thing groups (`{it:Mould}`),
 * and repairable `pronoun:Role` / `pronoun:Person N` marks that draft screening must never slice into or overwrite.
 */
export function protectedTokenSpans(text: string): TextRange[] {
  const ranges: TextRange[] = [];
  const push = (start: number, end: number) => {
    if (end > start) ranges.push({ start, end });
  };
  const scan = (re: RegExp, onMatch: (m: RegExpExecArray) => void) => {
    const r = new RegExp(re.source, re.flags);
    for (let m = r.exec(text); m !== null; m = r.exec(text)) onMatch(m);
  };
  scan(/\[[ \t]*(?:Person|Place|Date|Detail)[ \t]+\d+[ \t]*\]/gi, (m) => push(m.index, m.index + m[0].length));
  scan(DELIMITED_FIRST_SECOND_INNER_TAG, (m) => {
    if (MARK_PAIR_CLOSE[m[1]!] === m[4] && isPronounWord(m[2]!)) push(m.index, m.index + m[0].length);
  });
  scan(PLURAL_MULTI_TAG, (m) => {
    if (MARK_PAIR_CLOSE[m[1]!] === m[4]) push(m.index, m.index + m[0].length);
  });
  scan(
    new RegExp(
      String.raw`(\{\{|\[\[|\{\[|\[\{|\{|\(|\[)[ \t]*(${REPAIRABLE_PRONOUNS.join("|")})[ \t]*:[ \t]*\[[ \t]*(?:${TOKEN_KINDS.join("|")})[ \t]+\d+[ \t]*\][ \t]*(\}\}|\]\]|\]\}|\}\]|\}|\)|\])`,
      "gi",
    ),
    (m) => {
      if (MARK_PAIR_CLOSE[m[1]!] === m[3] && isPronounWord(m[2]!)) push(m.index, m.index + m[0].length);
    },
  );
  scan(DELIMITED_MARK, (m) => {
    if (MARK_PAIR_CLOSE[m[1]!] !== m[3]) return;
    const rawInner = m[2]!;
    const inner = rawInner.trim();
    const colon = inner.indexOf(":");
    if (colon < 0) {
      if (ROLE_WORD.test(inner) || TAG_LABEL_RE.test(inner)) push(m.index, m.index + m[0].length);
      return;
    }
    const left = inner.slice(0, colon).trim();
    const right = inner.slice(colon + 1).trim();
    if (!isPronounWord(left) && !ROLE_WORD.test(left)) {
      if (TAG_LABEL_RE.test(right) || isSchemaRole(right)) {
        const colonAt = m.index + m[1]!.length + rawInner.indexOf(":");
        push(colonAt, m.index + m[0].length);
      }
      return;
    }
    if (
      TAG_LABEL_RE.test(right) ||
      isSchemaRole(right) ||
      isSchemaRole(right.replace(/^the[ \t]+/i, "")) ||
      THING_WORDS.has(left.toLowerCase()) ||
      /^[A-Z][A-Za-z0-9_-]*$/.test(right)
    ) {
      push(m.index, m.index + m[0].length);
    } else {
      const colonAt = m.index + m[1]!.length + rawInner.indexOf(":");
      push(m.index, colonAt + 1);
    }
  });
  scan(BARE_FIRST_SECOND_PERSON_TAG, (m) => {
    if (isPronounWord(m[1]!)) push(m.index, m.index + m[0].length);
  });
  scan(BARE_PRONOUN_ROLE, (m) => {
    if (isPronounWord(m[1]!)) push(m.index, m.index + m[0].length);
  });
  scan(BARE_THING_WORD, (m) => {
    if (isPronounWord(m[1]!)) push(m.index, m.index + m[0].length);
  });
  scan(BARE_TAG_MARK, (m) => {
    if (isPronounWord(m[1]!)) push(m.index, m.index + m[0].length);
    else push(m.index + m[1]!.length, m.index + m[0].length);
  });
  scan(BARE_SCHEMA_ROLE_MARK, (m) => {
    if (isPronounWord(m[1]!)) push(m.index, m.index + m[0].length);
    else push(m.index + m[1]!.length, m.index + m[0].length);
  });
  scan(BARE_PRONOUN_CAPITAL_MARK, (m) => {
    if (isPronounWord(m[1]!)) push(m.index, m.index + m[0].length);
  });
  scan(BARE_SPACED_PRONOUN_PASCAL, (m) => {
    if (isPronounWord(m[1]!)) push(m.index, m.index + m[0].length);
  });
  return ranges;
}

/** Bare `word:Role` and `word:TagKind N` marks outside brackets/braces that should never show on the sheet. */
export function findBareColonMarks(text: string): string[] {
  const hits: Array<{ index: number; text: string }> = [];
  const collect = (re: RegExp, filter?: (m: RegExpExecArray) => boolean) => {
    const r = new RegExp(re.source, re.flags);
    for (let m = r.exec(text); m !== null; m = r.exec(text)) {
      if (filter && !filter(m)) continue;
      if (hits.some((h) => m!.index < h.index + h.text.length && m!.index + m![0].length > h.index)) continue;
      hits.push({ index: m.index, text: m[0] });
    }
  };
  collect(BARE_TAG_MARK);
  collect(BARE_SCHEMA_ROLE_MARK);
  collect(BARE_PRONOUN_CAPITAL_MARK, (m) => isPronounWord(m[1]!));
  collect(BARE_SPACED_PRONOUN_PASCAL, (m) => isPronounWord(m[1]!));
  return hits
    .sort((a, b) => a.index - b.index)
    .slice(0, 20)
    .map((h) => h.text.slice(0, 60));
}

/**
 * Step 2 of the shown text (H34b, R16.7): a mark the app cannot read never shows. Tags and tokens that name a tag
 * are already phrases when this runs. A group that is one role word shows the pronoun phrase; `{it:Mould}` shows
 * the thing word alone and is not counted as a mark, because the app read it; any other group shows its inner words
 * without the brackets; an empty group shows nothing; a lone bracket character is dropped; unrepairable
 * `word:Role` or unmapped `word:Kind N` marks never leave raw `:Role` syntax on the sheet while ordinary prose
 * colons (`Present:Name`, `Seen:Mould`, `Re:Benefits`, `10:30`, `(Note:Mould)`, `https://...`) stay untouched.
 * `changed` is true when anything but a thing word was rewritten.
 */
export function hideMarks(text: string): { text: string; changed: boolean } {
  let changed = false;
  let removed = false;
  let out = text;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    const before = prev;
    out = before.replace(GROUP, (_whole, curly: string | undefined, square: string | undefined, offset: number) => {
      const inner = (curly ?? square ?? "").trim();
      const colon = inner.indexOf(":");
      const first = (colon < 0 ? inner : inner.slice(0, colon)).trim();
      const rest = colon < 0 ? "" : inner.slice(colon + 1).trim();
      const after = before.slice(offset + _whole.length);
      if (
        THING_GROUP.test(inner) &&
        !TAG_LABEL_RE.test(rest) &&
        !(first.toLowerCase() === "itself" && POSSESSIVE_SUFFIX_START.test(after))
      ) {
        return formatPronoun(first, before.slice(0, offset));
      }
      changed = true;
      if (ROLE_WORD.test(inner) || (colon >= 0 && (ROLE_WORD.test(first) || isPronounWord(first)))) {
        return strings.drafting.shownPronoun;
      }
      if (colon >= 0 && (isSchemaRole(rest) || TAG_LABEL_RE.test(rest))) {
        if (first === "") removed = true;
        return first;
      }
      if (inner === "") removed = true;
      return inner;
    });
  }
  out = out.replace(PAREN_UNREAD_MARK, (whole, inner: string) => {
    const colon = inner.indexOf(":");
    if (colon <= 0 || inner.includes("://")) return whole;
    const left = inner.slice(0, colon).trim();
    const right = inner.slice(colon + 1).trim();
    if (right === "") return whole;
    if (
      isPronounWord(left) &&
      (!/[ \t]/.test(inner.slice(colon + 1, colon + 2)) || isSchemaRole(right) || TAG_LABEL_RE.test(right) || /^[A-Z][A-Za-z0-9_-]*$/.test(right))
    ) {
      changed = true;
      return strings.drafting.shownPronoun;
    }
    if (isSchemaRole(right) || TAG_LABEL_RE.test(right)) {
      changed = true;
      return left;
    }
    return whole;
  });
  if (/[{}[\]]/.test(out)) {
    changed = true;
    removed = true;
    out = out.replace(/[{}[\]]/g, "");
  }
  const stripBareMark = (_whole: string, left: string) => {
    changed = true;
    return isPronounWord(left) ? strings.drafting.shownPronoun : left;
  };
  out = out.replace(BARE_TAG_MARK, stripBareMark);
  out = out.replace(BARE_SCHEMA_ROLE_MARK, stripBareMark);
  out = out.replace(BARE_PRONOUN_CAPITAL_MARK, (whole, left: string) => (isPronounWord(left) ? stripBareMark(whole, left) : whole));
  out = out.replace(BARE_SPACED_PRONOUN_PASCAL, (whole, left: string) => (isPronounWord(left) ? stripBareMark(whole, left) : whole));
  out = out.replace(BARE_PRONOUN_BEFORE_POSSESSIVE, stripBareMark);
  if (removed) out = out.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+([.,;:!?])/g, "$1");
  return { text: out, changed };
}

function shownOf(working: string): { shown: string; markHidden: boolean } {
  let pluralMarkHidden = false;
  let tokenPossHidden = false;
  const phrased = working
    .replace(PLURAL_MULTI_TAG, (whole, open: string, _pronoun: string, _list: string, close: string) => {
      if (MARK_PAIR_CLOSE[open] !== close) return whole;
      pluralMarkHidden = true;
      return strings.drafting.shownPronoun;
    })
    .replace(/\(\s*(\[(?:Person|Place|Date|Detail) \d+\])\s*\)/gi, "$1")
    .replace(
      new RegExp(String.raw`${TOKEN_TAG.source}(${POSSESSIVE_SUFFIX_SRC})?`, "gi"),
      (_w, _label: string, possSuffix: string | undefined) => {
        if (possSuffix) tokenPossHidden = true;
        return strings.drafting.shownPronoun;
      },
    )
    .replace(
      COLON_TAG_MARK,
      (whole, open: string, kind: string, _n: string, close: string, possSuffix: string | undefined) => {
        if (MARK_PAIR_CLOSE[open] !== close) return whole;
        if (possSuffix) tokenPossHidden = true;
        return SHOWN_TAG[properKind(kind)]();
      },
    )
    .replace(/\[(Person|Place|Date|Detail) \d+\]/gi, (_w, kind: string) => SHOWN_TAG[properKind(kind)]())
    .replace(NAMES_A_TAG_WHOLE, (_w, kind: string) => SHOWN_TAG[properKind(kind)]());
  const hidden = hideMarks(phrased);
  return { shown: hidden.text, markHidden: hidden.changed || pluralMarkHidden || tokenPossHidden };
}

/** The tags that stand in a text in any bracket form, as `[Kind N]`, without repeats. */
export function tagsNamedIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(NAMES_A_TAG)) out.add(`[${properKind(m[1]!)} ${m[2]}]`);
  for (const m of text.matchAll(PLURAL_MULTI_TAG)) {
    if (MARK_PAIR_CLOSE[m[1]!] !== m[4]) continue;
    for (const t of m[3]!.matchAll(new RegExp(String.raw`\b(${TOKEN_KINDS.join("|")})[ \t]+(\d+)`, "gi"))) {
      out.add(`[${properKind(t[1]!)} ${t[2]}]`);
    }
  }
  return [...out];
}

/**
 * Markdown marks, taken out once when the finished note is made (drafting R15.5): a pair of double asterisks
 * keeps the words between them, and a line-start run of one to six # followed by a space goes.
 */
export function stripMarkdown(text: string): string {
  return text.replace(/\*\*([^*\n]+)\*\*/g, "$1").replace(/^#{1,6}[ \t]+/gm, "");
}

const OBJECT_HER_FOLLOWERS =
  /^\s*(?:$|[,.;:!?)\]"'—–-]|(?:and|or|but|nor|so|yet|to|with|from|by|at|on|in|into|onto|of|for|about|around|before|after|since|until|while|when|where|who|whom|whose|which|that|if|as|than|because|although|though|unless|the|a|an|this|these|those|again|today|tomorrow|yesterday|now|then|soon|later|here|there|home|back|up|down|out|off|over|me|you|him|her|them|he|she|they|it|someone|everyone|nobody|is|are|was|were|be|has|have|had|can|could|should|may|might|must|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i;

/** Returns true when a `{her:Tag}` token sits in object position rather than possessive before a noun phrase. */
export function isObjectHerAfter(afterToken: string): boolean {
  return OBJECT_HER_FOLLOWERS.test(afterToken);
}

/** The tags in the masked record that was sent. The instructions are left out: their example tag is not a sent tag. */
export function sentTags(maskedRecord: string): string[] {
  return tagsIn(maskedRecord);
}

const notPutBack = (what: string) => fill(strings.drafting.notPutBack, { what });

const SENTENCE_SPLIT = /(?<=[.!?])\s+|\r?\n+/;

const SUBJECT_ROLES = new Set(["he", "she", "they"]);
const THIRD_PERSON_ROLES = new Set([
  "he",
  "she",
  "they",
  "him",
  "her",
  "them",
  "his",
  "hers",
  "their",
  "theirs",
  "himself",
  "herself",
  "themselves",
  "themself",
]);
const BARE_ANY_TAG_RE = new RegExp(String.raw`\[[ \t]*(?:${TOKEN_KINDS.join("|")})[ \t]+\d+[ \t]*\]`, "gi");
const BARE_PERSON_TAG = /\[Person[ \t]+\d+\]/i;
const BARE_OBJECT_PRONOUN = /\b(him|them|her)\b/gi;

/**
 * Replaces ONLY recognized tag/mention forms (`PLURAL_MULTI_TAG`, `{role:Kind N}`, and `[Kind N]`)
 * with spaces of identical length so offsets stay exact while non-tag brackets like `[she saw him]`
 * remain visible to bare-pronoun detection.
 */
export function stripTagMentions(sentence: string): string {
  return sentence
    .replace(PLURAL_MULTI_TAG, (whole, open: string, _pronoun: string, _list: string, close: string) =>
      MARK_PAIR_CLOSE[open] === close ? " ".repeat(whole.length) : whole,
    )
    .replace(new RegExp(TOKEN_TAG.source, "gi"), (whole) => " ".repeat(whole.length))
    .replace(BARE_ANY_TAG_RE, (whole) => " ".repeat(whole.length));
}

/**
 * Shared raw-draft preprocessing before wrong-person pronoun detection:
 * `stripMarkdown` -> `normalizeTokens` -> `repairPronounRoleMarks` -> `rewriteMappedTokenPossessives`.
 */
export function prepareRawDraftForPronounCheck(
  rawDraft: string,
  mappedTags: Readonly<Record<string, string>>,
): { text: string; repairedMarks: number; repairedPossessives: number } {
  const repaired = repairPronounRoleMarksWithCount(normalizeTokens(stripMarkdown(rawDraft)));
  const singlePoss = rewriteMappedTokenPossessives(repaired.text, mappedTags);
  return {
    text: singlePoss.text,
    repairedMarks: repaired.count,
    repairedPossessives: singlePoss.repaired,
  };
}

export interface WrongPersonSentenceHit {
  index: number;
  sentence: string;
}

/**
 * Single source of truth for wrong-person pronoun detection across `pronounWrongPersonSentences`
 * and `evaluateWrongPersonPronouns`. Operates on text preprocessed by `prepareRawDraftForPronounCheck`.
 */
export function detectWrongPersonSentences(
  prePlural: string,
  options: {
    personKeysInContext: readonly string[];
    isAllowedPluralTag?: (tag: string) => boolean;
    ignoreBareObjectWord?: (bareWord: string) => boolean;
  },
): WrongPersonSentenceHit[] {
  const mention = new RegExp(
    String.raw`${PLURAL_MULTI_TAG.source}|\{(${TOKEN_ROLES.join("|")}):((?:${TOKEN_KINDS.join("|")}) \d+)\}|\[((?:${TOKEN_KINDS.join("|")}) \d+)\]`,
    "gi",
  );
  const hasPersonInMask = options.personKeysInContext.length > 0;
  const hasMultiplePersons = options.personKeysInContext.length > 1;
  const draftSentences = prePlural.split(SENTENCE_SPLIT);
  const bareTagLocations = new Map<string, { sentence: number; index: number }[]>();
  for (let i = 0; i < draftSentences.length; i++) {
    const s = draftSentences[i]!;
    for (const m of s.matchAll(mention)) {
      if (m[8] === undefined) continue;
      const bare = m[8].toLowerCase().replace(/\s+/g, " ");
      if (/^person \d+$/i.test(bare)) {
        const list = bareTagLocations.get(bare) ?? [];
        list.push({ sentence: i, index: m.index ?? 0 });
        bareTagLocations.set(bare, list);
      }
    }
  }
  const firstBareTagSentence = new Map<string, number>();
  for (const [label, locs] of bareTagLocations) {
    const first = Math.min(...locs.map((l) => l.sentence));
    firstBareTagSentence.set(label, first);
  }
  const hasBarePersonLaterInSentence = (label: string, sentence: number, offset: number): boolean => {
    const locs = bareTagLocations.get(label);
    if (locs === undefined) return false;
    return locs.some((l) => l.sentence === sentence && l.index > offset);
  };
  const hits: WrongPersonSentenceHit[] = [];

  for (let i = 0; i < draftSentences.length; i++) {
    const s = draftSentences[i]!;
    let previous = new Set<string>();
    let previousPersonOrDetail = new Set<string>();
    let triggered = false;
    const taggedTokens: { offset: number; role: string }[] = [];
    for (const m of s.matchAll(mention)) {
      if (m[1] !== undefined) {
        if (MARK_PAIR_CLOSE[m[1]!] !== m[4]) continue;
        const pronoun = m[2]!;
        const tags = [...m[3]!.matchAll(/Person[ \t]+(\d+)/gi)].map((t) => `[Person ${t[1]}]`);
        if (tags.length < 2 || isFirstSecondPronoun(pronoun)) continue;
        if (options.isAllowedPluralTag && !tags.every((t) => options.isAllowedPluralTag!(t))) continue;
        const possSuffix = m[5];
        const lower = pronoun.toLowerCase();
        if (possSuffix && POSSESSIVE_DETERMINER[lower] === undefined) continue;
        const labels = new Set(tags.map((t) => t.slice(1, -1).toLowerCase()));
        if (!possSuffix && lower === "them" && [...labels].some((l) => previous.has(l))) {
          triggered = true;
          break;
        }
        previous = labels;
        previousPersonOrDetail = labels;
        continue;
      }
      const label = (m[7] ?? m[8])!.toLowerCase().replace(/\s+/g, " ");
      const role = m[6]?.toLowerCase();
      const offset = m.index ?? 0;
      if (role !== undefined) taggedTokens.push({ offset, role });
      if (role !== undefined) {
        const isObjectPronoun =
          role === "him" ||
          role === "them" ||
          (role === "her" && isObjectHerAfter(m.input.slice(offset + m[0].length)));
        if (isObjectPronoun && previous.has(label)) {
          triggered = true;
          break;
        }
        if (SUBJECT_ROLES.has(role) && previousPersonOrDetail.size > 0 && !previousPersonOrDetail.has(label)) {
          triggered = true;
          break;
        }
        if (THIRD_PERSON_ROLES.has(role) && /^detail \d+$/i.test(label) && hasPersonInMask) {
          triggered = true;
          break;
        }
        const firstBare = firstBareTagSentence.get(label);
        if (/^person \d+$/i.test(label) && firstBare !== undefined && firstBare > i) {
          triggered = true;
          break;
        }
        if (/^person \d+$/i.test(label) && hasBarePersonLaterInSentence(label, i, offset)) {
          triggered = true;
          break;
        }
      }
      previous = new Set([label]);
      if (/^(?:person|detail) \d+$/i.test(label)) {
        previousPersonOrDetail = new Set([label]);
      }
    }
    if (!triggered) {
      const bareOnly = stripTagMentions(s);
      const bareRe = /\b(he|she|him|her|his|hers)\b/gi;
      const familyOf = (w: string): string | undefined =>
        w === "she" || w === "her" || w === "hers" ? "she/her/hers" : w === "he" || w === "him" || w === "his" ? "he/him/his" : undefined;
      let bareM: RegExpExecArray | null;
      while ((bareM = bareRe.exec(bareOnly)) !== null) {
        const bareFamily = familyOf(bareM[1]!.toLowerCase());
        if (taggedTokens.some((t) => t.offset < bareM!.index && familyOf(t.role) === bareFamily && bareFamily !== undefined)) continue;
        triggered = true;
        break;
      }
    }
    if (!triggered && hasMultiplePersons && BARE_PERSON_TAG.test(s)) {
      const firstPersonIndex = s.search(BARE_PERSON_TAG);
      const bareOnly = stripTagMentions(s);
      BARE_OBJECT_PRONOUN.lastIndex = 0;
      let bare: RegExpExecArray | null;
      while ((bare = BARE_OBJECT_PRONOUN.exec(bareOnly)) !== null) {
        if (bare.index <= firstPersonIndex) continue;
        const word = bare[1]!.toLowerCase();
        if (word === "her" && !isObjectHerAfter(s.slice(bare.index + bare[0].length))) continue;
        if (options.ignoreBareObjectWord?.(word)) continue;
        triggered = true;
        break;
      }
    }
    if (triggered) hits.push({ index: i, sentence: s });
  }
  return hits;
}

/**
 * H36a A5 + H42b + H43c c1: plain warning lines for the 111f0f3 ambiguous-pronoun shapes, plus
 * (a) an untagged `he|she|him|her|his|hers`, exempt only after an earlier tagged token of the same
 * family (she/her/hers, he/him/his) in the same sentence, and
 * (b) a pronoun token for Person N followed later in the same sentence by bare `[Person N]`.
 * A tagged pronoun with no earlier bare `[Person N]` does not warn on that ground alone.
 * Does not hold Copy or change the note.
 */
function pronounWrongPersonSentences(
  prePlural: string,
  guarded: string,
  shown: string,
  held: readonly string[],
  mask: Parameters<typeof restoreAll>[1],
  clients: Parameters<typeof restoreAll>[2],
  addedTags: Set<string>,
): string[] {
  const personKeysInContext = Object.keys(mask.map).filter((k) => /^\[Person[ \t]+\d+\]$/i.test(k));
  const draftSentences = prePlural.split(SENTENCE_SPLIT);
  const guardedSentences = guarded.split(SENTENCE_SPLIT);
  const shownSentences = shown.split(SENTENCE_SPLIT);
  const out: string[] = [];
  const hits = detectWrongPersonSentences(prePlural, {
    personKeysInContext,
    isAllowedPluralTag: (t) => mask.map[t] !== undefined && !addedTags.has(t),
  });
  for (const hit of hits) {
    const i = hit.index;
    const rawShown =
      shownSentences.length === draftSentences.length && shownSentences[i] !== undefined
        ? shownSentences[i]!
        : shownOf(
            restoreAll(guardedSentences[i] ?? "", mask, clients).text.replace(
              /\u0000(\d+)\u0000/g,
              (_, idx: string) => held[Number(idx)]!,
            ),
          ).shown;
    const shownSentence = rawShown.trim();
    if (shownSentence !== "") out.push(`${strings.drafting.pronounWrongPerson} ${shownSentence}`);
  }
  return out;
}

/** H44 item 2: the record labels the sheet is not meant to copy (the same six as the draft instruction). */
const RECORD_LABEL_START = /^[\s"'“”‘’(\[*_\-–—#>]*(?:Visit[ \t]+date|Present|Seen|Agreed|Risks|Next[ \t]+steps)[ \t]*[*_]*:/i;

/**
 * H44 item 2: one plain line per shown sentence that starts with a record label. The model's words are not
 * changed and Copy is not held.
 */
export function copiedLabelSentences(shown: string): string[] {
  const out: string[] = [];
  for (const sentence of shown.split(SENTENCE_SPLIT)) {
    const s = sentence.trim();
    if (RECORD_LABEL_START.test(s)) out.push(`${strings.drafting.copiedLabel} ${s}`);
  }
  return out;
}

const MAPPED_TOKEN_POSSESSIVE = new RegExp(
  String.raw`\{(${TOKEN_ROLES.join("|")}):(Person[ \t]+\d+)\}(${POSSESSIVE_SUFFIX_SRC})`,
  "gi",
);

function rewriteMappedTokenPossessives(
  text: string,
  map: Readonly<Record<string, string>>,
): { text: string; repaired: number } {
  let repaired = 0;
  const next = text.replace(MAPPED_TOKEN_POSSESSIVE, (whole, _role: string, rawLabel: string, possSuffix: string) => {
    const label = rawLabel.replace(/[ \t]+/g, " ");
    if (map[`[${label}]`] === undefined) return whole;
    repaired += 1;
    return `[${label}]${possSuffix}`;
  });
  return { text: next, repaired };
}

const PLURAL_ITEM_TAG_RE = new RegExp(String.raw`\b(${TOKEN_KINDS.join("|")})[ \t]+(\d+)`, "gi");

function pluralItemsIn(list: string): string[] {
  return [...list.matchAll(PLURAL_ITEM_TAG_RE)].map((m) => `[${properKind(m[1]!)} ${m[2]}]`);
}

function replacePluralMultiTagTokens(
  text: string,
  isAllowedTag: (tag: string) => boolean,
): { text: string; replaced: number; labels: string[] } {
  let replaced = 0;
  const labels: string[] = [];
  const next = text.replace(
    PLURAL_MULTI_TAG,
    (whole, open: string, pronoun: string, list: string, close: string, possSuffix: string | undefined, offset: number, source: string) => {
      if (MARK_PAIR_CLOSE[open] !== close) return whole;
      const tags = pluralItemsIn(list);
      if (tags.length < 2) return whole;
      if (!tags.every((t) => PERSON_TAG_RE.test(t.slice(1, -1)) && isAllowedTag(t))) return whole;
      const rendered = formatRepairedPronoun(pronoun, possSuffix, source.slice(0, offset));
      if (rendered === null) return whole;
      replaced += 1;
      if (!isFirstSecondPronoun(pronoun)) {
        for (const t of tags) labels.push(t.slice(1, -1));
      }
      return rendered;
    },
  );
  return { text: next, replaced, labels };
}

/**
 * Mapped non-added Person tags that appear ONLY inside un-replaced plural multi-tag marks alongside another
 * culprit (an unmapped tag, an added tag, or a non-Person tag) so R15.4 flags the actual missing/invalid item
 * without noisily claiming a known Person in the group could not be identified.
 */
function explainedPluralPersonTags(
  text: string,
  map: Record<string, string>,
  addedTags: Set<string>,
): Set<string> {
  const inPlural = new Set<string>();
  const outsideRanges: TextRange[] = [];
  let cursor = 0;
  for (const m of text.matchAll(PLURAL_MULTI_TAG)) {
    const idx = m.index ?? 0;
    if (MARK_PAIR_CLOSE[m[1]!] !== m[4]) continue;
    outsideRanges.push({ start: cursor, end: idx });
    cursor = idx + m[0].length;
    const tags = pluralItemsIn(m[3]!);
    const hasCulprit = tags.some((t) => !PERSON_TAG_RE.test(t.slice(1, -1)) || map[t] === undefined || addedTags.has(t));
    if (hasCulprit) {
      for (const t of tags) {
        if (PERSON_TAG_RE.test(t.slice(1, -1)) && map[t] !== undefined && !addedTags.has(t)) inPlural.add(t);
      }
    }
  }
  outsideRanges.push({ start: cursor, end: text.length });
  const outsideText = outsideRanges.map((r) => text.slice(r.start, r.end)).join("\n");
  const outsideTags = new Set(tagsNamedIn(outsideText));
  for (const t of [...inPlural]) if (outsideTags.has(t)) inPlural.delete(t);
  return inPlural;
}

export function restoreDraft(input: RestoreInput): Restored {
  // Any bracket form of a token is read as the form the masker and the instructions use (R14),
  // and brace-less or braced pronoun:Role marks are repaired before restore/flagging (H39).
  const { outgoing, clients } = input;
  const byTag = new Map<string, ClientEntry>();
  for (const [tag, id] of Object.entries(outgoing.mask.clientByTag)) {
    const client = clients.find((c) => c.id === id);
    if (client !== undefined) byTag.set(tag, client);
  }
  const repaired = repairPronounRoleMarksWithCount(
    repairUnclearPronoun(normalizeTokens(stripMarkdown(input.draft)), byTag),
  );
  // Names the model put in the record, and names it added in the draft: both wait for her press.
  const added = [...(outgoing.addedNames ?? [])];
  for (const a of input.screened?.added ?? []) if (!added.some((x) => x.tag === a.tag)) added.push(a);
  const addedTags = new Set(added.map((a) => a.tag));
  // The added tags are taken out of the map used to restore, so they stay visible.
  const base = input.screened?.mask ?? outgoing.mask;
  const mask: MaskResult = {
    ...base,
    map: Object.fromEntries(Object.entries(base.map).filter(([tag]) => !addedTags.has(tag))),
    clientByTag: Object.fromEntries(Object.entries(base.clientByTag).filter(([tag]) => !addedTags.has(tag))),
  };
  const map = mask.map;
  const outsideTokens = repaired.text.replace(/\{[^{}]*\}/g, "");
  const tagsRestored = Object.keys(map).filter((t) => outsideTokens.includes(t)).length;
  const singlePoss = rewriteMappedTokenPossessives(repaired.text, map);
  const plural = replacePluralMultiTagTokens(singlePoss.text, (t) => map[t] !== undefined && !addedTags.has(t));
  const draft = plural.text;
  const notes: string[] = [];
  const add = (line: string) => {
    if (!notes.includes(line)) notes.push(line);
  };

  // Hold unmapped tokens, non-Person tokens, unrepairable reflexive+'s tokens, and added-tag plural marks
  // so restoreAll never partially alters them before Put back or R15.4 flagging.
  const held: string[] = [];
  const pluralGuarded = draft.replace(PLURAL_MULTI_TAG, (whole, open: string, _pronoun: string, list: string, close: string) => {
    if (MARK_PAIR_CLOSE[open] !== close) return whole;
    const tags = pluralItemsIn(list);
    if (!tags.some((t) => addedTags.has(t))) return whole;
    held.push(whole);
    return `\u0000${held.length - 1}\u0000`;
  });
  const guarded = pluralGuarded.replace(
    new RegExp(String.raw`${TOKEN_TAG.source}(${POSSESSIVE_SUFFIX_SRC})?`, "gi"),
    (whole, label: string, possSuffix: string | undefined) => {
      const mapped = map[`[${label}]`] !== undefined;
      const tokenEnd = whole.length - (possSuffix?.length ?? 0);
      const token = whole.slice(0, tokenEnd);
      const colon = token.indexOf(":");
      const role = token.slice(1, colon).trim().toLowerCase();
      const unrepairablePossessive = Boolean(possSuffix && (!TOKEN_ROLE_SET.has(role) || !PERSON_TAG_RE.test(label)));
      if (mapped && !unrepairablePossessive) return whole;
      held.push(token);
      return `\u0000${held.length - 1}\u0000${possSuffix ?? ""}`;
    },
  );

  const restored = restoreAll(guarded, mask, clients);
  for (const n of restored.notes) {
    if ((plural.replaced > 0 || singlePoss.repaired > 0) && n === strings.masking.noPronounTokens) continue;
    add(n);
  }
  const text = restored.text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => held[Number(i)]!);

  // A pronoun token still in the text names a tag with no map entry (or could not be repaired): flag it.
  const tokenTags = new Set<string>();
  for (const m of text.matchAll(new RegExp(TOKEN_TAG.source, "gi"))) {
    const tag = `[${m[1]}]`;
    tokenTags.add(tag);
    if (!addedTags.has(tag)) add(notPutBack(fill(strings.drafting.whatPronoun, { label: m[1]! })));
  }
  // A tag still in the text after restoring has no map entry (or was changed): flag it.
  for (const tag of tagsIn(text)) if (map[tag] === undefined && !addedTags.has(tag)) add(notPutBack(whatTag(tag)));
  const namedInText = new Set(tagsNamedIn(text));
  if (added.some((a) => text.includes(a.tag) || namedInText.has(a.tag))) add(strings.drafting.addedByModel);

  // Any form that still names a tag and is not a name the model added is flagged too (R15.4).
  const skipPluralMapped = explainedPluralPersonTags(text, map, addedTags);
  const leftovers = tagsNamedIn(text).filter(
    (tag) => !addedTags.has(tag) && !tokenTags.has(tag) && !skipPluralMapped.has(tag),
  );
  for (const tag of leftovers) add(notPutBack(whatTag(tag)));

  // A tag that was sent and is not in the draft, as a tag or as a pronoun token, is a plain line. It is not an open flag.
  const tokenLabels = new Set([...[...draft.matchAll(new RegExp(TOKEN_TAG.source, "gi"))].map((m) => m[1]!), ...plural.labels]);
  for (const tag of sentTags(outgoing.maskedRecord)) {
    const inDraft = draft.includes(tag) || tokenLabels.has(tag.slice(1, -1));
    if (!inDraft) add(fill(strings.drafting.leftOut, { what: whatTag(tag) }));
  }

  const shownNow = shownOf(text);
  // A mark the app could not read was hidden from the sheet: one plain line says so. It is not a flag (R16.8).
  if (shownNow.markHidden) add(strings.drafting.unreadMark);
  for (const warning of pronounWrongPersonSentences(singlePoss.text, guarded, shownNow.shown, held, mask, clients, addedTags)) {
    add(warning);
  }
  for (const warning of copiedLabelSentences(shownNow.shown)) add(warning);

  return {
    text,
    shown: shownNow.shown,
    notes,
    tokensReplaced: restored.tokensReplaced + plural.replaced + singlePoss.repaired,
    tagsRestored,
    repairedMarks: repaired.count + singlePoss.repaired + plural.replaced,
    added: added.filter((a) => text.includes(a.tag) || namedInText.has(a.tag)),
    copyHeld: holdsToken(text),
  };
}

/**
 * Her press: put one added name back. Pronoun tokens that were held for it are
 * restored from the list entry when there is one, otherwise as they/them.
 */
export function restoreAddedTag(restored: Restored, tag: string, clients: ClientEntry[] = []): Restored {
  const item = restored.added.find((a) => a.tag === tag);
  if (!item) return restored;
  const remainingAdded = new Set(restored.added.filter((a) => a.tag !== tag).map((a) => a.tag));
  const notPutBackPrefix = strings.drafting.notPutBack.split("{what}")[0]!;
  const flaggedUnmapped = new Set<string>();
  for (const n of restored.notes) {
    if (!n.startsWith(notPutBackPrefix)) continue;
    for (const m of n.matchAll(PLURAL_ITEM_TAG_RE)) flaggedUnmapped.add(`[${properKind(m[1]!)} ${m[2]}]`);
  }
  const plural = replacePluralMultiTagTokens(
    restored.text,
    (t) => !remainingAdded.has(t) && !flaggedUnmapped.has(t),
  );
  const mini: MaskResult = {
    maskedText: "",
    spans: [],
    map: { [tag]: item.name },
    clientByTag: item.clientId ? { [tag]: item.clientId } : {},
    surfaceForms: [],
    listedNames: [],
    sentOnPurpose: [],
  };
  const poss = rewriteMappedTokenPossessives(plural.text, mini.map);
  const out = restoreAll(poss.text, mini, clients);
  const added = restored.added.filter((a) => a.tag !== tag);
  const totalReplacedHere = out.tokensReplaced + plural.replaced + poss.repaired;
  // The one line about added names stays while another added name is still waiting.
  const kept = restored.notes.filter(
    (n) =>
      (n !== strings.drafting.addedByModel || added.length > 0) &&
      (totalReplacedHere === 0 || n !== strings.masking.noPronounTokens),
  );
  for (const n of out.notes) {
    if ((n === strings.masking.noPronounTokens && (plural.replaced > 0 || poss.repaired > 0)) || kept.includes(n)) continue;
    kept.push(n);
  }
  const shownNow = shownOf(out.text);
  const notes = kept.filter((n) => n !== strings.drafting.unreadMark);
  if (shownNow.markHidden) notes.push(strings.drafting.unreadMark);
  return {
    text: out.text,
    shown: shownNow.shown,
    notes,
    tokensReplaced: restored.tokensReplaced + totalReplacedHere,
    tagsRestored: (restored.tagsRestored ?? 0) + (restored.text.includes(tag) ? 1 : 0),
    repairedMarks: restored.repairedMarks + poss.repaired + plural.replaced,
    added,
    copyHeld: holdsToken(out.text),
  };
}
