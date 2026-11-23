// Caseworker shorthand (D-R6). Expansion is deterministic and runs before either
// model. The fact check runs after. An invented number, date, name tag or
// content word is not shown: the caller gets the expanded note, unchanged.

const TAG = /\[(Person|Place|Date|Detail) \d+\]/gi;
const TOKEN = /\[(?:Person|Place|Date|Detail) \d+\]|\d+[ap]m|[A-Za-z]+(?:[-/'][A-Za-z]+)*|\d+/gi;

/** Longer keys are listed first so appts, docs and wks are not cut short. */
export const SHORTHAND_ENTRIES: readonly (readonly [string, string])[] = [
  ["appts", "appointments"],
  ["appt", "appointment"],
  ["docs", "documents"],
  ["doc", "document"],
  ["wks", "weeks"],
  ["wk", "week"],
  ["bldg", "building"],
  ["apt", "apartment"],
  ["mgr", "manager"],
  ["info", "information"],
  ["msg", "message"],
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
  ["jan", "January"],
  ["feb", "February"],
  ["mar", "March"],
  ["apr", "April"],
  ["jun", "June"],
  ["jul", "July"],
  ["aug", "August"],
  ["sep", "September"],
  ["oct", "October"],
  ["nov", "November"],
  ["dec", "December"],
  ["bc", "because"],
  ["yr", "year"],
  ["mo", "month"],
  ["id", "identification"],
  ["f/u", "follow-up"],
];

const LONG_OF = new Map(SHORTHAND_ENTRIES.map(([key, long]) => [key, long]));
const KEYS = new Set(SHORTHAND_ENTRIES.map(([key]) => key));

/** Closed function words. A content word is anything else. */
export const STOPWORDS = new Set(
  "a an the of to for and or on in at by with from that this was were is are be been as not no her his she he they their them it its has have had will would but if so than then into over after before about up off yet both old also just there here".split(" "),
);

const VERBS = new Set("is are was were has had have will did does needs due sticks goes said left got get".split(" "));

export function tokensOf(text: string): string[] {
  return text.match(TOKEN) ?? [];
}

function cased(matched: string, long: string): string {
  const first = matched[0] ?? "";
  if (first !== first.toLowerCase() && first === first.toUpperCase()) return long[0]!.toUpperCase() + long.slice(1);
  return long;
}

/** Spell the house dictionary. Tags are left as written. Unknown words stay. */
export function expandShorthand(note: string): string {
  const tags: string[] = [];
  let out = note.replace(TAG, (tag) => {
    tags.push(tag);
    return `\u0000${tags.length - 1}\u0000`;
  });
  for (const [key, long] of SHORTHAND_ENTRIES) {
    const body = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|[^A-Za-z0-9])(${body})(?=[^A-Za-z0-9]|$)`, "gi");
    out = out.replace(re, (_all, pre: string, matched: string) => pre + cased(matched, long));
  }
  return out.replace(/\u0000(\d+)\u0000/g, (_all, index: string) => tags[Number(index)] ?? "");
}

/**
 * Closed synonyms of words that already appear in a note. A reply word in the
 * same group is the same fact. A new number, date, name or object is not here.
 */
export const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["said", "stated", "told", "reported"],
  ["came", "arrived"],
  ["reply", "answer", "response"],
  ["asked", "requested", "inquired"],
  ["ring", "call", "phone"],
  ["needs", "requires"],
  ["get", "receive"],
  ["left", "messaged"],
  ["sticks", "stuck"],
  ["hall", "hallway"],
  ["out", "off"],
  ["come", "came"],
  ["not", "didn't", "didnt"],
  ["no", "lacks"],
];

function stem(word: string): string {
  for (const suffix of ["ing", "es", "ed", "s"]) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  }
  return word;
}

function bare(word: string): string {
  return word.replace(/'s$/i, "");
}

function sameWord(word: string, allowed: string): boolean {
  const leftWord = bare(word);
  const rightWord = bare(allowed);
  if (leftWord === rightWord) return true;
  for (const suffix of ["s", "es", "ed", "ing"]) {
    if (leftWord === rightWord + suffix || rightWord === leftWord + suffix) return true;
  }
  const left = stem(leftWord);
  const right = stem(rightWord);
  return left === right && left.length >= 4 && (left !== leftWord || right !== rightWord);
}

/** True when the reply word is the note word, its inflection, or a listed synonym. */
function related(word: string, allowed: string): boolean {
  if (sameWord(word, allowed)) return true;
  return SYNONYM_GROUPS.some((group) => group.some((item) => sameWord(allowed, item)) && group.some((item) => sameWord(word, item)));
}

/** "month payment" can be said "monthly". "this month" cannot. */
function monthAsModifier(note: string): boolean {
  const expanded = expandShorthand(note).toLowerCase();
  if (/\b(?:this|last|next|every)\s+month\b/.test(expanded)) return false;
  return /\bmonth\s+[a-z]/.test(expanded);
}

function relatedInNote(word: string, allowed: string, note: string): boolean {
  if (related(word, allowed)) return true;
  const monthly = (word === "monthly" && (allowed === "month" || allowed === "mo"))
    || (allowed === "monthly" && (word === "month" || word === "mo"));
  return monthly && monthAsModifier(note);
}

function allowedWords(note: string): string[] {
  const words: string[] = [];
  for (const raw of tokensOf(note)) {
    if (raw.startsWith("[")) continue;
    const word = raw.toLowerCase();
    words.push(word);
    const long = LONG_OF.get(word);
    if (long) words.push(long.toLowerCase());
  }
  return words;
}

function digitRuns(text: string): string[] {
  return text.match(/\d+/g) ?? [];
}

/**
 * Numbers, dates, name tags and content words in the reply that are not in the
 * note and not the long form of a dictionary word that the note actually uses.
 * A dictionary word the note did not use (Saturday when the note says Fri) counts.
 */
export function inventedFacts(note: string, reply: string): string[] {
  const allowed = allowedWords(note);
  const noteTags = new Set(tokensOf(note).filter((token) => token.startsWith("[")));
  const noteNums = new Set(digitRuns(note));
  const invented: string[] = [];
  const tokens = tokensOf(reply);
  for (let i = 0; i < tokens.length; i++) {
    const raw = tokens[i] ?? "";
    if (raw.startsWith("[")) {
      if (!noteTags.has(raw)) invented.push(raw);
      continue;
    }
    if (/^\d+$/.test(raw)) {
      if (!noteNums.has(raw)) invented.push(raw);
      continue;
    }
    const word = raw.toLowerCase();
    if (word === "s") continue;
    if ((word === "st" || word === "nd" || word === "rd" || word === "th") && i > 0 && /^\d+$/.test(tokens[i - 1] ?? "")) continue;
    if (STOPWORDS.has(word)) continue;
    if (allowed.some((item) => relatedInNote(word, item, note))) continue;
    invented.push(raw);
  }
  return invented;
}

export function shorthandRemains(text: string): boolean {
  return tokensOf(text).some((token) => KEYS.has(token.toLowerCase()));
}

export function tagsEqual(note: string, reply: string): boolean {
  const left = tokensOf(note).filter((token) => token.startsWith("["));
  const right = tokensOf(reply).filter((token) => token.startsWith("["));
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

/** Trimmed text ends with . ! or ?, has no bullet line, and has a finite verb. */
export function completeSentence(text: string): boolean {
  const trimmed = text.trim();
  if (!/[.!?]$/.test(trimmed)) return false;
  if (trimmed.split("\n").some((line) => /^\s*(?:[-*\u2022]|\d+[.)])\s/.test(line))) return false;
  return tokensOf(trimmed).some((token) => {
    const word = token.toLowerCase();
    return VERBS.has(word) || /ed$/i.test(word);
  });
}

function noteFactsKept(note: string, reply: string): boolean {
  const replyWords = tokensOf(reply).map((token) => token.toLowerCase());
  const replyNums = new Set(digitRuns(reply));
  for (const raw of tokensOf(note)) {
    if (raw.startsWith("[")) {
      if (!reply.includes(raw)) return false;
      continue;
    }
    if (/^\d/.test(raw)) {
      const digits = raw.match(/\d+/)?.[0] ?? raw;
      if (!replyNums.has(digits) && !reply.toLowerCase().includes(raw.toLowerCase())) return false;
      continue;
    }
    const word = raw.toLowerCase();
    if (STOPWORDS.has(word) && word !== "no" && word !== "not") continue;
    const long = LONG_OF.get(word)?.toLowerCase();
    const targets = long ? [word, long] : [word];
    if (!targets.some((target) => replyWords.some((item) => relatedInNote(item, target, note)))) return false;
  }
  return true;
}

/** A slot matches a reply word, or a digit run in the reply. */
export function factsKept(reply: string, facts: readonly (readonly string[])[]): boolean {
  const words = tokensOf(reply).map((token) => token.toLowerCase());
  const nums = digitRuns(reply);
  return facts.every((group) => group.every((slot) => slot.split("|").some((alt) => {
    const wanted = alt.toLowerCase();
    if (/^\d+$/.test(wanted)) return nums.includes(wanted);
    return words.some((word) => sameWord(word, wanted));
  })));
}

export function allFive(note: string, reply: string, facts: readonly (readonly string[])[]): boolean {
  return factsKept(reply, facts)
    && inventedFacts(note, reply).length === 0
    && tagsEqual(note, reply)
    && !shorthandRemains(reply)
    && completeSentence(reply);
}

/**
 * What the screen shows after the model. An invented fact, a leftover short
 * form, a dropped note fact, a changed tag or a fragment returns the expanded
 * note. The expanded note is not rewritten again.
 */
export function shownText(note: string, reply: string): string {
  const expanded = expandShorthand(note);
  if (reply.trim() === "") return expanded;
  return replyPasses(note, reply) ? reply.trim() : expanded;
}

/** The fact check the screen uses. A passing reply is shown as written. */
export function replyPasses(note: string, reply: string): boolean {
  const trimmed = reply.trim();
  if (trimmed === "") return false;
  return inventedFacts(note, trimmed).length === 0
    && !shorthandRemains(trimmed)
    && tagsEqual(note, trimmed)
    && completeSentence(trimmed)
    && noteFactsKept(note, trimmed);
}
