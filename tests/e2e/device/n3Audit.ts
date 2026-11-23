// H43c c2: this audit imports nothing from src/. The three helpers it used at 111f0f3 are copied here
// so the audit can disagree with the device: the warning words, the object-her follower test, and the
// missed-visit cue test. Their text is the 111f0f3 text.
const PRONOUN_WRONG_PERSON = "Check this sentence: a pronoun may point at the wrong person.";

const OBJECT_HER_FOLLOWERS =
  /^\s*(?:$|[,.;:!?)\]"'—–-]|(?:and|or|but|nor|so|yet|to|with|from|by|at|on|in|into|onto|of|for|about|around|before|after|since|until|while|when|where|who|whom|whose|which|that|if|as|than|because|although|though|unless|the|a|an|this|these|those|again|today|tomorrow|yesterday|now|then|soon|later|here|there|home|back|up|down|out|off|over|me|you|him|her|them|he|she|they|it|someone|everyone|nobody|is|are|was|were|be|has|have|had|can|could|should|may|might|must|mon|tue|wed|thu|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/i;

function isObjectHerAfter(afterToken: string): boolean {
  return OBJECT_HER_FOLLOWERS.test(afterToken);
}

const NON_VISIT_MISSED_CLAUSE =
  /\b(?:no\s+answer\s+(?:from|by)\s+(?:the\s+)?(?:landlord|gp|doctor|council|housing|office|solicitor|agency|service|manager|team|reception|clinic|number|email)\b|(?:landlord|gp|doctor|council|housing|office|solicitor|agency|service)\b[^.\n;]*\bno\s+answer\b|missed\s+(?:a\s+|the\s+|an\s+|her\s+|his\s+|their\s+|[\w-]+\s+)?(?:deadline|bus|train|call|payment|dose|medication)\b|missed\s+(?:the\s+)?(?:landlord|gp|doctor|council|housing|office|hospital|dental|school)[^.\n;]*\bapp(?:ointment|t)?\b)/gi;

const MISSED_VISIT_CUE =
  /\b(?:missed\s+app(?:ointment|t)?|did\s+not\s+attend|no\s+answer|unanswered\s+(?:knock|call|visit|door)|no\s+response\s+at\s+(?:the\s+)?(?:door|flat|house)|not\s+(?:at\s+)?home|curtains\s+shut|nobody\s+(?:at\s+home|home|in|answered)|no\s+one\s+(?:at\s+home|home|in|answered)|left\s+a\s+card)\b/i;

function isMissedVisitText(text: string): boolean {
  const cleaned = text.replace(NON_VISIT_MISSED_CLAUSE, " ");
  return MISSED_VISIT_CUE.test(cleaned);
}

const TOKEN_AND_TAG =
  /\{([a-z]+):[ \t]*((?:Person|Place|Date|Detail)[ \t]+\d+)\}|\[([a-z]+):[ \t]*((?:Person|Place|Date|Detail)[ \t]+\d+)\]|\(([a-z]+):[ \t]*((?:Person|Place|Date|Detail)[ \t]+\d+)\)|\[((?:Person|Place|Date|Detail)[ \t]+\d+)\]/gi;

const REPORTING_VERBS =
  /\b(reported|stated|noted|said|explained|advised|mentioned|confirmed|claimed|indicated|informed)\b/gi;

const INVENTED_OWNER_RE =
  /\b(?:sent\s+by\s+(?!the\s+worker\b)[A-Za-z][A-Za-z'-]*|(?:(?!worker\b)[A-Za-z][A-Za-z'-]*['’]s|his|her|their|its)\s+(?:benefits\s+)?(?:list|form)|(?:worker|record|note)\s+(?:says?|states?|shows?|lists?|indicates?))\b/i;

const BARE_PERSON_TAG_RE = /\[(?:Person)[ \t]+\d+\]/i;
const BARE_OBJECT_PRONOUN_RE = /\b(him|them|her)\b/gi;

const MISSED_VISIT_PRESENT_RE = /\b(?:(?:was|were)\s+present|present\s+(?:for|at|during)\b)\b/i;
const NEGATED_PRESENCE_RE =
  /\b(?:no\s+(?:household\s+members?|individuals?|people|persons?|residents?|clients?|one|body)|nobody|not\s+present|none\s+present|without\s+(?:the\s+)?(?:household|client|anyone))\b/i;
const VISIT_ACTION_RE =
  /\b(?:visited(?!\s+(?:a\s+)?relative\b)|attended\s+(?:the\s+)?visit|went\s+to\s+(?:\[Place[ \t]+\d+\]|Flat\b|Eddlecombe\b|the\s+(?:flat|address|property|home)\b))/i;
const WORKER_VISIT_ACTION_RE =
  /\b(?:the\s+)?worker\b[^.!?;,]*(?:visited|went\s+to\s+(?:\[Place[ \t]+\d+\]|Flat\b|Eddlecombe\b|the\s+(?:flat|address|property|home)\b))/i;

export const COPIED_LABEL_RE =
  /\bVisit[ \t]+date\b(?:\s*:)?|\b(?:Present|Seen|Agreed|Risks|Next[ \t]+steps)\s*:/i;

/** Returns true if restored draft prose copied a record field label, including bare `"Visit date"` with or without a colon. */
export function hasCopiedRecordLabel(text: string): boolean {
  return COPIED_LABEL_RE.test(text);
}

function recordPart(outgoingSent: string): string {
  const splitAt = outgoingSent.indexOf("\n\nInstructions:");
  return splitAt >= 0 ? outgoingSent.slice(0, splitAt) : outgoingSent;
}

/**
 * Returns the first invented speaker/owner attribution in `restoredDraft`, ignoring
 * `"worker's list"` (explicitly allowed for `"my list"`) and reporting verbs already in `outgoingSent`'s record.
 */
export function findInventedAttribution(restoredDraft: string, outgoingSent: string): string | null {
  const rec = recordPart(outgoingSent);
  const owner = INVENTED_OWNER_RE.exec(restoredDraft);
  if (owner) return owner[0];
  let m: RegExpExecArray | null;
  REPORTING_VERBS.lastIndex = 0;
  while ((m = REPORTING_VERBS.exec(restoredDraft)) !== null) {
    const verb = m[1]!;
    if (!new RegExp(`\\b${verb}\\b`, "i").test(rec)) return verb;
  }
  return null;
}

const WORKER_SUBJECT_RE = /^(?:(?:and|then|also|but|so|on\s+\S+,?)\s+)*(?:\[?I\]?|we|the\s+worker)?[\s,]*$/i;

/**
 * H44 item 1: a visit clause is a fact the record states when (a) the record's own text holds the same
 * action verb phrase (for example "Went to [Place 1]") and (b) the clause's subject is the worker: empty, "I", "[I]",
 * "we" or "the worker". A clause whose subject is a tagged person or a name is never exempt.
 */
/** H44b 2: the earlier clause names someone other than the worker (a person tag, or a name then a past-tense verb). */
function namesAnotherSubject(prev: string): boolean {
  if (BARE_PERSON_TAG_RE.test(prev)) return true;
  if (/^\s*(?:\[?I\]?|we|the\s+worker)\b/i.test(prev)) return false;
  return /^\s*[A-Z][\w'-]+(?:\s+[A-Z][\w'-]+)*\s+\w+ed\b/.test(prev);
}

function recordStatesWorkerVisit(clause: string, outgoingSent: string, prevClause: string | null = null): boolean {
  const m = VISIT_ACTION_RE.exec(clause);
  if (m === null) return false;
  const subject = clause.slice(0, m.index);
  if (!WORKER_SUBJECT_RE.test(subject) || BARE_PERSON_TAG_RE.test(subject)) return false;
  // H44b 2: an unstated subject after a conjunction is the subject of the clause before it.
  const unstated = !/(?:\[?I\]?|we|the\s+worker)/i.test(subject);
  if (unstated && prevClause !== null && namesAnotherSubject(prevClause)) return false;
  // The restored draft has the place's real words where the record has its tag, so compare the verb phrase only.
  const verb = /^(?:visited|attended\s+(?:the\s+)?visit|went\s+to)/i.exec(m[0])?.[0];
  if (verb === undefined) return false;
  const rec = recordPart(outgoingSent).toLowerCase().replace(/\s+/g, " ");
  return rec.includes(verb.toLowerCase().replace(/\s+/g, " "));
}

/**
 * Checks missed-visit / no-answer fixtures (`n001`, `n002`, etc.) for fabricated presence or
 * saying a household member/front-desk person visited, went to the property, or was present.
 */
export function findMissedVisitFabricatedPresence(input: {
  note: string;
  outgoingSent: string;
  rawCloudReply: string | null;
  restoredDraft: string;
}): string | null {
  if (!isMissedVisitText(input.note)) return null;
  const presentLine = /^Present:\s*(.+)$/im.exec(input.outgoingSent)?.[1]?.trim() ?? "";
  if (presentLine !== "" && !/^(?:none\b|no household member\b|worker\b)/i.test(presentLine)) {
    return `outgoing Present: ${presentLine}`;
  }
  for (const text of [input.rawCloudReply ?? "", input.restoredDraft]) {
    for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
      const s = sentence.trim();
      if (s === "") continue;
      if (MISSED_VISIT_PRESENT_RE.test(s) && !NEGATED_PRESENCE_RE.test(s) && !/^\s*(?:the\s+)?worker\s+(?:was|were)\s+present\b/i.test(s)) {
        return s;
      }
      let prevClause: string | null = null;
      for (const clause of s.split(/\s*(?:;|,(?=\s*(?:and|but|so)\b)|\band\b)\s*/i)) {
        const before: string | null = prevClause;
        prevClause = clause;
        if (!VISIT_ACTION_RE.test(clause)) continue;
        if (NEGATED_PRESENCE_RE.test(clause) || /\bdid\s+not\s+attend\b/i.test(clause)) continue;
        if (WORKER_VISIT_ACTION_RE.test(clause) && !BARE_PERSON_TAG_RE.test(clause)) continue;
        if (recordStatesWorkerVisit(clause, input.outgoingSent, before)) continue;
        return clause.trim();
      }
    }
  }
  return null;
}

export interface WrongPersonPronounAudit {
  hasWrongPersonPronoun: boolean;
  wrongPersonPronounHits: string[];
  hasWrongPersonWarning: boolean;
  silentWrongPersonPronoun: boolean;
}

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

/**
 * Programmatically checks `rawCloudReply` for ambiguous or wrong-referent pronouns matching `pronounWrongPersonSentences`:
 * - object `{him|them|her:Tag}` pointing at the nearest prior `[Tag]`
 * - subject `{he|she|they:Tag}` following a different closer Person/Detail tag in the same sentence
 * - 3rd-person `{role:Detail N}` when `[Person M]` tags exist in context
 * - bare untagged `him|them|object-her` after `[Person N]` when another `[Person M]` exists in the note/draft
 * - H43c c1 (a): an untagged `he|she|him|her|his|hers`, excused only by an earlier tagged token of
 *   the same family (she/her/hers, he/him/his) in the same sentence
 * - H43c c1 (b): a pronoun token for Person N followed later in the same sentence by bare `[Person N]`
 * and verifies whether the device emitted the pronoun-wrong-person warning in `sheetNotes`.
 * This function has its own code for every shape above; it calls no device detector.
 */
export function evaluateWrongPersonPronouns(input: {
  rawCloudReply: string | null;
  outgoingSent: string;
  sheetNotes: readonly string[];
}): WrongPersonPronounAudit {
  const hits: string[] = [];
  const rec = recordPart(input.outgoingSent);
  const reply = input.rawCloudReply ?? "";
  const contextPersons = new Set(
    [...`${rec}\n${reply}`.matchAll(/\[Person[ \t]+\d+\]/gi)].map((m) => m[0].toLowerCase().replace(/\s+/g, " ")),
  );
  const hasPersonInContext = contextPersons.size > 0;
  const hasMultiplePersons = contextPersons.size > 1;
  // The audit's one preprocessing step, kept because a stored draft needs it (see the built
  // note): a first/second-person token such as {I:Person 1} is the worker's own word, so the
  // audit reads it as that word before checking, as the device does.
  const replyFirstSecond = reply.replace(
    /\{(I|me|my|mine|myself|we|us|our|ours|ourselves|you|your|yours|yourself|yourselves):[ \t]*(?:Person|Place|Date|Detail)[ \t]+\d+\}/gi,
    (_whole: string, role: string) => role,
  );
  // The audit's own sentence split: break on line ends first, then on sentence-final punctuation.
  const sentences = replyFirstSecond
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?]) +/))
    .map((s) => s.trim())
    .filter((s) => s !== "");
  const firstBareTagSentence = new Map<string, number>();
  const barePersonPositions: Array<Array<{ label: string; index: number }>> = sentences.map(() => []);
  for (let i = 0; i < sentences.length; i++) {
    TOKEN_AND_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_AND_TAG.exec(sentences[i]!)) !== null) {
      const bareTag = m[7];
      if (bareTag === undefined) continue;
      const norm = bareTag.toLowerCase().replace(/\s+/g, " ");
      if (/^person \d+$/i.test(norm)) {
        barePersonPositions[i]!.push({ label: norm, index: m.index });
        if (!firstBareTagSentence.has(norm)) {
          firstBareTagSentence.set(norm, i);
        }
      }
    }
  }
  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i]!;
    let previous = new Set<string>();
    let previousPersonOrDetail = new Set<string>();
    let matchedInSentence = false;
    const taggedInSentence: Array<{ at: number; word: string }> = [];
    TOKEN_AND_TAG.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_AND_TAG.exec(s)) !== null) {
      const bareTag = m[7];
      if (bareTag !== undefined) {
        const norm = bareTag.toLowerCase().replace(/\s+/g, " ");
        previous = new Set([norm]);
        if (/^(?:person|detail) \d+$/i.test(norm)) {
          previousPersonOrDetail = new Set([norm]);
        }
        continue;
      }
      const role = (m[1] ?? m[3] ?? m[5] ?? "").toLowerCase();
      const label = (m[2] ?? m[4] ?? m[6] ?? "").toLowerCase().replace(/\s+/g, " ");
      taggedInSentence.push({ at: m.index, word: role });
      const after = s.slice(m.index + m[0].length);
      const isObj = role === "him" || role === "them" || (role === "her" && isObjectHerAfter(after));
      const firstBare = firstBareTagSentence.get(label);
      const tokenIndex = m.index;
      const bareLaterSameSentence =
        /^person \d+$/i.test(label) &&
        barePersonPositions[i]!.some((p) => p.label === label && p.index > tokenIndex);
      if (
        (isObj && previous.has(label)) ||
        (SUBJECT_ROLES.has(role) && previousPersonOrDetail.size > 0 && !previousPersonOrDetail.has(label)) ||
        (THIRD_PERSON_ROLES.has(role) && /^detail \d+$/i.test(label) && hasPersonInContext) ||
        (/^person \d+$/i.test(label) && firstBare !== undefined && firstBare > i) ||
        bareLaterSameSentence
      ) {
        hits.push(s);
        matchedInSentence = true;
        break;
      }
      previous = new Set([label]);
      if (/^(?:person|detail) \d+$/i.test(label)) {
        previousPersonOrDetail = new Set([label]);
      }
    }
    if (!matchedInSentence) {
      // The audit's own family table, from the order's words: she/her/hers are one family,
      // he/him/his another. A bare pronoun is excused only by an earlier tagged token of its
      // own family in this sentence; every other bare pronoun counts.
      const familyOfWord: Record<string, string> = {
        she: "family-she",
        her: "family-she",
        hers: "family-she",
        he: "family-he",
        him: "family-he",
        his: "family-he",
      };
      const withoutTokensA = s.replace(TOKEN_AND_TAG, (match) => " ".repeat(match.length));
      const bareA = /\b(he|she|him|her|his|hers)\b/gi;
      let ba: RegExpExecArray | null;
      while ((ba = bareA.exec(withoutTokensA)) !== null) {
        const bareFamily = familyOfWord[ba[1]!.toLowerCase()];
        const excused = taggedInSentence.some(
          (t) => t.at < ba!.index && bareFamily !== undefined && familyOfWord[t.word] === bareFamily,
        );
        if (excused) continue;
        hits.push(s);
        matchedInSentence = true;
        break;
      }
    }
    if (!matchedInSentence && hasMultiplePersons && BARE_PERSON_TAG_RE.test(s)) {
      const withoutTokens = s.replace(TOKEN_AND_TAG, (match) => " ".repeat(match.length));
      BARE_OBJECT_PRONOUN_RE.lastIndex = 0;
      let b: RegExpExecArray | null;
      while ((b = BARE_OBJECT_PRONOUN_RE.exec(withoutTokens)) !== null) {
        const word = b[1]!.toLowerCase();
        const afterBare = s.slice(b.index + b[0].length);
        if (word === "her" && !isObjectHerAfter(afterBare)) continue;
        const firstTagPos = s.search(BARE_PERSON_TAG_RE);
        if (firstTagPos >= 0 && b.index > firstTagPos && !new RegExp(`\\b${word}\\b`, "i").test(rec)) {
          hits.push(s);
          break;
        }
      }
    }
  }
  const hasWrongPersonPronoun = hits.length > 0;
  const hasWrongPersonWarning = input.sheetNotes.some((n) => n.startsWith(PRONOUN_WRONG_PERSON));
  return {
    hasWrongPersonPronoun,
    wrongPersonPronounHits: hits,
    hasWrongPersonWarning,
    silentWrongPersonPronoun: hasWrongPersonPronoun && !hasWrongPersonWarning,
  };
}

export interface AuditedDraftMetrics {
  n4CopiedLabelFail: boolean;
  n5AttributionHit: string | null;
  n6PronounHedgeHit: string | null;
  n7TokenLeakHit: string | null;
  missedVisitFabricatedPresence: string | null;
  hasWrongPersonPronoun: boolean;
  hasWrongPersonWarning: boolean;
  silentWrongPersonPronoun: boolean;
}

/** Computes aggregate N3/H42b summary metrics and strict `"pass" | "fail"` status across all measured drafts. */
export function summarizeMeasuredDrafts(samples: readonly (AuditedDraftMetrics & { fixtureIsMissedVisit: boolean })[]): {
  status: "pass" | "fail";
  summary: {
    totalDrafts: number;
    n4LabelFreeCount: number;
    n5InventedAttributionCount: number;
    n6HedgedPronounPairCount: number;
    n7RestoredPairAndTokenLeakCounts: { hedgedPronounPairs: number; tokenSyntaxLeaks: number };
    missedVisitDraftCount: number;
    missedVisitFabricatedPresenceCount: number;
    wrongPersonPronounDraftCount: number;
    wrongPersonWarningDraftCount: number;
    silentWrongPersonPronounCount: number;
  };
} {
  const totalDrafts = samples.length;
  const n4LabelFreeCount = samples.filter((d) => !d.n4CopiedLabelFail).length;
  const n5InventedAttributionCount = samples.filter((d) => d.n5AttributionHit !== null).length;
  const n6HedgedPronounPairCount = samples.filter((d) => d.n6PronounHedgeHit !== null).length;
  const tokenSyntaxLeaks = samples.filter((d) => d.n7TokenLeakHit !== null).length;
  const missedVisitDraftCount = samples.filter((d) => d.fixtureIsMissedVisit).length;
  const missedVisitFabricatedPresenceCount = samples.filter((d) => d.missedVisitFabricatedPresence !== null).length;
  const wrongPersonPronounDraftCount = samples.filter((d) => d.hasWrongPersonPronoun).length;
  const wrongPersonWarningDraftCount = samples.filter((d) => d.hasWrongPersonWarning).length;
  const silentWrongPersonPronounCount = samples.filter((d) => d.silentWrongPersonPronoun).length;
  const ok =
    totalDrafts === 12 &&
    n4LabelFreeCount === totalDrafts &&
    n5InventedAttributionCount === 0 &&
    n6HedgedPronounPairCount === 0 &&
    tokenSyntaxLeaks === 0 &&
    missedVisitFabricatedPresenceCount === 0 &&
    silentWrongPersonPronounCount === 0;
  return {
    status: ok ? "pass" : "fail",
    summary: {
      totalDrafts,
      n4LabelFreeCount,
      n5InventedAttributionCount,
      n6HedgedPronounPairCount,
      n7RestoredPairAndTokenLeakCounts: {
        hedgedPronounPairs: n6HedgedPronounPairCount,
        tokenSyntaxLeaks,
      },
      missedVisitDraftCount,
      missedVisitFabricatedPresenceCount,
      wrongPersonPronounDraftCount,
      wrongPersonWarningDraftCount,
      silentWrongPersonPronounCount,
    },
  };
}
