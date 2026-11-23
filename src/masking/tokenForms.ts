// Every form of a redaction token, in one place (drafting R14.1).
//
// The masker writes a tag: [Person 1], [Place 1], [Date 1], [Detail 1].
// The draft is asked to write a pronoun token for a person: {him:Person 1}.
// A model writes these back in other shapes: the same token in square or round
// brackets, with the tag in its own brackets, or with a space after the colon.
// One expression reads all of them, so the restore step and the tests name the
// same forms. This file imports nothing from the model or the app.

export const TOKEN_ROLES = ["he", "she", "they", "him", "her", "them", "his", "hers", "their"] as const;
export const REFLEXIVE_TOKEN_ROLES = ["himself", "herself", "themselves", "themself"] as const;
export const TOKEN_KINDS = ["Person", "Place", "Date", "Detail"] as const;

const ALL_TOKEN_ROLES = [...TOKEN_ROLES, ...REFLEXIVE_TOKEN_ROLES] as const;
const REFLEXIVE_SET = new Set<string>(REFLEXIVE_TOKEN_ROLES);
const CLOSE: Record<string, string> = { "[": "]", "{": "}", "(": ")" };

/** Bare pronoun:Tag forms without surrounding brackets, e.g. she:Person 1. */
const BARE_PRONOUN_TOKEN = new RegExp(
  String.raw`(?<![{\[(\w:])(${ALL_TOKEN_ROLES.join("|")})[ \t]*:[ \t]*(${TOKEN_KINDS.join("|")})[ \t]+(\d+)(?![\]})\w])`,
  "gi",
);

/**
 * One token in any bracket, with or without a role prefix and with or without the tag in its own
 * brackets. Groups: 1 open, 2 role, 3 inner open, 4 kind, 5 number, 6 inner close, 7 close.
 */
export const TOKEN_FORM_SOURCE =
  String.raw`([\[{(])[ \t]*(?:(${ALL_TOKEN_ROLES.join("|")})[ \t]*:[ \t]*)?(\[?)[ \t]*(${TOKEN_KINDS.join("|")})[ \t]+(\d+)[ \t]*(\]?)[ \t]*([\]})])`;

const properKind = (kind: string): string => kind[0]!.toUpperCase() + kind.slice(1).toLowerCase();

/**
 * Rewrite every pronoun token and every odd bracket form into the two shapes the restore step reads:
 * {role:Kind N} for a token with a role prefix, and [Kind N] for a bare tag. A bare tag in its
 * plain square brackets, and anything that is not a token, is left as it is. Round brackets that
 * wrapped a bare tag stay round. Idempotent.
 */
export function normalizeTokens(text: string): string {
  const once = text.replace(new RegExp(TOKEN_FORM_SOURCE, "gi"), (whole, open: string, role: string | undefined, innerOpen: string, kind: string, n: string, innerClose: string, close: string) => {
    // The inner close is read greedily: in [[she:Person 1]] it takes the first "]". When nothing opened the tag
    // inside, that character closes the token and the last one stays where it was, to be unwrapped below.
    const stray = innerOpen === "" && innerClose !== "" && whole.endsWith(innerClose + close) ? close : "";
    const closing = stray !== "" ? innerClose : close;
    if (CLOSE[open] !== closing || (stray === "" && innerOpen.length !== innerClose.length)) return whole;
    if (role !== undefined) {
      if (REFLEXIVE_SET.has(role.toLowerCase()) && kind.toLowerCase() !== "person") return whole;
      return `{${role}:${properKind(kind)} ${n}}${stray}`;
    }
    // A bare tag in its own plain brackets is the shape the masker writes; odd case or spacing is read as that shape.
    if (open === "[" && innerOpen === "") return `[${properKind(kind)} ${n}]${stray}`;
    const tag = `[${properKind(kind)} ${n}]`;
    return (open === "(" ? `(${tag})` : tag) + stray;
  });
  return unwrap(once).replace(
    new RegExp(BARE_PRONOUN_TOKEN.source, "gi"),
    (whole, role: string, kind: string, n: string) => {
      if (REFLEXIVE_SET.has(role.toLowerCase()) && kind.toLowerCase() !== "person") return whole;
      return `{${role}:${properKind(kind)} ${n}}`;
    },
  );
}

/** A pronoun token in the shape normalizeTokens writes, wrapped once more in square or curly brackets. */
const WRAPPED_TOKEN = new RegExp(String.raw`[\[{][ \t]*(\{(?:${ALL_TOKEN_ROLES.join("|")}):(?:${TOKEN_KINDS.join("|")}) \d+\})[ \t]*[\]}]`, "g");
/** A bare tag wrapped once more in square or curly brackets. Round brackets around a tag are left alone. */
const WRAPPED_TAG = new RegExp(String.raw`[\[{][ \t]*(\[(?:${TOKEN_KINDS.join("|")}) \d+\])[ \t]*[\]}]`, "g");

/** A token or tag wrapped twice, or in mixed brackets, is the token (drafting R14.1). Repeats until nothing changes. */
function unwrap(text: string): string {
  let out = text;
  for (let next = out.replace(WRAPPED_TOKEN, "$1").replace(WRAPPED_TAG, "$1"); next !== out; next = out.replace(WRAPPED_TOKEN, "$1").replace(WRAPPED_TAG, "$1")) out = next;
  return out;
}

/** The forms of one token, for tests and for the list in drafting R14.1. */
export function tokenForms(kind: string, n: number, role = "him"): string[] {
  const label = `${kind} ${n}`;
  return [
    `[${label}]`,
    `{${role}:${label}}`,
    `[${role}:${label}]`,
    `(${role}:${label})`,
    `{${role}:[${label}]}`,
    `[${role}:[${label}]]`,
    `[${role}: ${label}]`,
    `{${label}}`,
    `[[${label}]]`,
    `([${label}])`,
    `{{${role}:${label}}}`,
    `[[${role}:${label}]]`,
    `{[${role}:${label}]}`,
    `{{${label}}}`,
  ];
}
