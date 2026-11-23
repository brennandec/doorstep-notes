// Seeded builder for the synthetic set of rough notes (measurement R1).
// Every person is invented. The same seed gives the same set. Each note has its
// own client list and a record of every known identifier with its position.
//
// How identifiers are recorded:
//   - A full name used as a whole is one identifier (the exact pass has a term for it).
//   - A name split across a line, or a hyphenated surname used on its own, is
//     recorded as one identifier per name part. The line break and the hyphen
//     do not name anyone, and the exact pass works on name parts there.
//   - A near variant is a listed name part with one letter changed, added or
//     dropped (edit distance 1), for parts of five letters or more.
import { SYNTHETIC_SEED, SYNTHETIC_SET_SIZE } from "../src/constants";
import type { ClientEntry } from "../src/masking/clientList";
import { nameParts } from "../src/masking/exact";
import { fold } from "../src/masking/fold";
import { levenshtein } from "../src/masking/near";
import { makeHeader, nodeRuntime, writeMeasured } from "./results";

export type IdentifierKind = "listedName" | "otherName" | "nearVariant" | "place" | "dob" | "phrase";

export interface KnownIdentifier {
  kind: IdentifierKind;
  text: string;
  start: number;
  end: number;
}

export interface SyntheticNote {
  id: string;
  text: string;
  clientList: ClientEntry[];
  identifiers: KnownIdentifier[];
}

export const SCRIPT_VERSION = "1";

// Fixed lists of invented people (measurement R1.2).
export const INVENTED_FIRST_NAMES = [
  "Beatrice", "Tomas", "Maria", "Daniel", "Imani", "Oskar", "Priya", "Hana", "Gideon", "Grace", "Rose",
  "Nadia", "Felix", "Mirela", "Anselm", "Ines", "Corin", "Yusuf", "Lucia", "Gabriela", "Nicolas", "Francesca",
];
export const INVENTED_NICKNAMES: Record<string, string> = {
  Beatrice: "Bea", Daniel: "Danny", Mirela: "Mira", Gabriela: "Gabby", Nicolas: "Nico", Francesca: "Fran",
};
export const INVENTED_SURNAMES = [
  "Brandvald", "Okonkwo", "Reyes", "Halvorsen", "Petrakis", "Nakamura", "Whitlock", "Delacroix", "Ferreira",
  "Ashworth", "Lindqvist", "Mbeki", "Castellan", "Dunmore", "Varga", "Sorensen", "Oyelaran", "Kowalczyk",
];
/** People who are in a note but never on a client list. */
export const INVENTED_OTHER_FIRST_NAMES = ["Joan", "Walter", "Alina", "Kofi", "Pavel", "Marta", "Jonas", "Eilidh", "Rashid", "Sylvie"];
export const INVENTED_OTHER_SURNAMES = ["Teague", "Calloway", "Moreau", "Brisco", "Adeyemi", "Lindgren", "Pryce", "Szabo"];

const STREETS = [
  "Larkfield Road", "Whinmoor Lane", "Pellam Close", "Tarn Street", "Haverly Gardens", "Ostler Way",
  "Brindle Road", "Marrow Lane", "Fenwick Terrace", "Cobbold Avenue",
];
const BUILDINGS = ["Eddlecombe House", "Harrow Lodge", "Quillon Heights", "Sallow House"];
const AREAS = ["Hollin Estate", "Westmarsh", "Northgate", "Ridding Green"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const PHRASES = [
  "her twin brother", "his brother-in-law the taxi driver", "the lady with the green door", "her daughter's teacher",
  "his employer at the bakery", "the man from the flat upstairs", "her sister who lives by the canal",
  "his old friend from the allotment",
];

// Small seeded generator (mulberry32).
class Rng {
  private a: number;
  constructor(seed: number) {
    this.a = seed >>> 0;
  }
  next(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)]!;
  }
  sample<T>(items: readonly T[], k: number): T[] {
    const copy = [...items];
    const out: T[] = [];
    for (let i = 0; i < k && copy.length > 0; i++) out.push(copy.splice(this.int(copy.length), 1)[0]!);
    return out;
  }
  weighted<T>(options: readonly (readonly [T, number])[]): T {
    const total = options.reduce((s, [, w]) => s + w, 0);
    let x = this.next() * total;
    for (const [v, w] of options) {
      x -= w;
      if (x < 0) return v;
    }
    return options[options.length - 1]![0];
  }
}

interface Ident {
  kind: IdentifierKind;
  text: string;
}
type Piece = string | Ident;
const ident = (kind: IdentifierKind, text: string): Ident => ({ kind, text });
const pad = (n: number) => String(n).padStart(2, "0");

/** True when a word is a listed name part, or one edit from a part of five letters or more. */
function clashes(text: string, listedParts: string[]): boolean {
  return nameParts(text).some((w) => {
    const f = fold(w);
    return listedParts.some((p) => f === p || ([...p].length >= 5 && Math.abs([...f].length - [...p].length) <= 1 && levenshtein(f, p) === 1));
  });
}

/** One letter changed, added or dropped inside the word. Never equal to a listed part. */
function variantOf(word: string, avoid: Set<string>, r: Rng): string {
  const letters = "abcdefghijklmnoprstuvwy";
  for (let attempt = 0; attempt < 60; attempt++) {
    const chars = [...word];
    const at = 1 + r.int(chars.length - 1);
    const op = r.int(3);
    if (op === 0) chars[at] = r.pick([...letters]);
    else if (op === 1) chars.splice(at, 1);
    else chars.splice(at, 0, r.pick([...letters]));
    const out = chars.join("");
    const f = fold(out);
    if (f !== fold(word) && levenshtein(f, fold(word)) === 1 && !avoid.has(f)) return out;
  }
  return word.slice(0, -1);
}

interface Ctx {
  r: Rng;
  clients: ClientEntry[];
  present: ClientEntry[];
  listedParts: string[];
  ref(c: ClientEntry): Piece[];
  place(): Piece;
  dob(): Ident;
  phrase(): Piece;
  other(): Piece[] | null;
  pronoun(c: ClientEntry): string;
}

function title(c: ClientEntry): string {
  return c.pronouns === "she/her" ? "Ms" : c.pronouns === "he/him" ? "Mr" : "Mx";
}

interface Token {
  text: string;
  kind: IdentifierKind;
  sep: string;
}

function tokensToPieces(tokens: Token[]): Piece[] {
  const out: Piece[] = [];
  tokens.forEach((t, k) => {
    out.push(ident(t.kind, t.text));
    if (k < tokens.length - 1) out.push(t.sep);
  });
  return out;
}

function makeCtx(r: Rng, clients: ClientEntry[], present: ClientEntry[]): Ctx {
  const listedParts = clients.flatMap((c) => [c.fullName, ...c.otherNames].flatMap(nameParts)).map(fold);
  const avoid = new Set(listedParts);
  const nameTokens = (c: ClientEntry): Token[] => {
    const [first = "", ...rest] = c.fullName.split(" ");
    const sur = rest.join(" ").split("-");
    return [
      { text: first, kind: "listedName", sep: " " },
      ...sur.map((s, k): Token => ({ text: s, kind: "listedName", sep: k < sur.length - 1 ? "-" : "" })),
    ];
  };
  const surnameTokens = (c: ClientEntry, f: (s: string) => string = (s) => s): Token[] =>
    nameTokens(c).slice(1).map((t) => ({ ...t, text: f(t.text) }));

  return {
    r,
    clients,
    present,
    listedParts,
    pronoun: (c) => c.pronouns.split("/")[0] || "they",
    ref(c) {
      const hasNick = c.otherNames.length > 0;
      const mode = r.weighted<string>([
        ["full", 28], ["first", 20], ["title", 15], ["nick", hasNick ? 12 : 0], ["lower", 8], ["near", 12], ["split", 5], ["upper", 3],
      ]);
      const tokens = nameTokens(c);
      switch (mode) {
        case "first":
          return [ident("listedName", tokens[0]!.text)];
        case "title":
          return [`${title(c)} `, ...tokensToPieces(surnameTokens(c))];
        case "nick":
          return [ident("listedName", c.otherNames[0]!)];
        case "lower":
          return [ident("listedName", c.fullName.toLowerCase())];
        case "upper":
          return [`${title(c)} `, ...tokensToPieces(surnameTokens(c, (s) => s.toUpperCase()))];
        case "split":
          return [ident("listedName", tokens[0]!.text), "\n", ...tokensToPieces(surnameTokens(c))];
        case "near": {
          const candidates = tokens.map((_, k) => k).filter((k) => [...tokens[k]!.text].length >= 5);
          if (candidates.length === 0) return [ident("listedName", c.fullName)];
          const k = r.pick(candidates);
          const changed = tokens.map((t, j): Token => (j === k ? { ...t, kind: "nearVariant", text: variantOf(t.text, avoid, r) } : t));
          return tokensToPieces(changed);
        }
        default:
          return [ident("listedName", c.fullName)];
      }
    },
    place() {
      for (let attempt = 0; attempt < 20; attempt++) {
        const text = r.weighted<() => string>([
          [() => `${1 + r.int(98)} ${r.pick(STREETS)}`, 5],
          [() => `Flat ${1 + r.int(30)}, ${r.pick(BUILDINGS)}`, 3],
          [() => r.pick(AREAS), 2],
        ])();
        if (!clashes(text, listedParts)) return ident("place", text);
      }
      return "the flat";
    },
    dob() {
      const y = 1935 + r.int(70);
      const d = 1 + r.int(28);
      const m = 1 + r.int(12);
      const text = r.weighted<string>([
        [`${pad(d)}/${pad(m)}/${y}`, 4],
        [`${d} ${MONTHS[m - 1]} ${y}`, 3],
        [`${pad(d)}.${pad(m)}.${String(y).slice(2)}`, 2],
      ]);
      return ident("dob", text);
    },
    phrase() {
      for (let attempt = 0; attempt < 20; attempt++) {
        const p = r.pick(PHRASES);
        if (!clashes(p, listedParts)) return ident("phrase", p);
      }
      return "a relative";
    },
    other() {
      for (let attempt = 0; attempt < 30; attempt++) {
        const first = r.pick(INVENTED_OTHER_FIRST_NAMES);
        const last = r.pick(INVENTED_OTHER_SURNAMES);
        const text = r.weighted<string>([[`${first} ${last}`, 4], [first, 3], [`Mr ${last}`, 2]]);
        const bare = text.startsWith("Mr ") ? last : text;
        if (!clashes(bare, listedParts)) return text.startsWith("Mr ") ? ["Mr ", ident("otherName", last)] : [ident("otherName", bare)];
      }
      return null;
    },
  };
}

type Line = (x: Ctx) => Piece[] | null;

const one = (x: Ctx) => x.r.pick(x.present);

const HOUSING: Line[] = [
  () => ["Damp in the back bedroom, window frame rotten. Landlord told twice, no reply."],
  (x) => [...x.ref(one(x)), " says the repair request went in last month, no date given."],
  (x) => ["Agreed: I chase the housing office by Friday; ", ...x.ref(one(x)), " to photograph the damp."],
  () => ["Rent arrears checked on the portal, balance still showing."],
  () => ["Garden tidy, the rose bushes by the path have been cut back."],
  (x) => ["Also there: ", x.phrase(), ", who said the same about the hallway."],
  (x) => ["DOB ", x.dob(), " confirmed against the tenancy letter."],
  (x) => {
    const o = x.other();
    return o ? ["Neighbour ", ...o, " says the hallway light has been out for a month."] : null;
  },
  () => ["Smoke alarm tested, battery replaced. Heating on and working."],
  () => ["Next visit in two weeks. Bring the housing form."],
];

const MISSED: Line[] = [
  (x) => [...x.ref(one(x)), " did not attend the 2pm slot at the clinic. Rang twice, no answer."],
  (x) => ["Went to ", x.place(), ", curtains shut, left a card."],
  (x) => ["Told by ", x.phrase(), " that ", x.pronoun(one(x)), " had gone to a relative for a few days."],
  () => ["Rebooked for Thursday. Text sent to confirm."],
  (x) => ["Checked DOB ", x.dob(), " before rebooking."],
  (x) => {
    const o = x.other();
    return o ? ["Spoke to ", ...o, " at the front desk, who will pass on the new time."] : null;
  },
  () => ["Third missed appointment this year, noted for the team meeting."],
  () => ["Left the leaflet about the bus pass with the neighbour."],
];

const BENEFITS: Line[] = [
  (x) => ["Helped ", ...x.ref(one(x)), " with the benefits renewal form, sections 3 and 4 left to do."],
  (x) => ["Needs proof of address; the bank letter is at ", x.place(), "."],
  (x) => [...x.ref(one(x)), " unsure about the earnings box. Explained it twice."],
  () => ["Form to go in by the 30th. I will post it."],
  () => ["Asked for a grace period on the arrears."],
  (x) => ["DOB on the form is ", x.dob(), ", matches the passport."],
  (x) => {
    const o = x.other();
    return o ? ["Landlord is ", ...o, ", number is on the old letter."] : null;
  },
  (x) => [x.phrase(), " will help with the postage."],
];

const stamp = (x: Ctx) => `${pad(1 + x.r.int(28))}/${pad(1 + x.r.int(12))}`;

interface Scenario {
  header: Line;
  pool: Line[];
}

const SCENARIOS: Scenario[] = [
  {
    header: (x) => [`Visit ${stamp(x)} ${10 + x.r.int(6)}.${x.r.pick(["00", "15", "30", "45"])}. Home visit at `, x.place(), " to see ", ...x.ref(x.present[0]!), "."],
    pool: HOUSING,
  },
  {
    header: (x) => [`Missed appt ${stamp(x)}. Client: `, ...x.ref(x.present[0]!), "."],
    pool: MISSED,
  },
  {
    header: (x) => [`Benefits form visit ${stamp(x)}. With `, ...x.ref(x.present[0]!), " at ", x.place(), "."],
    pool: BENEFITS,
  },
];

function makeClients(r: Rng): ClientEntry[] {
  const count = 4 + r.int(5);
  const firsts = r.sample(INVENTED_FIRST_NAMES, count);
  const surnamePool = [...INVENTED_SURNAMES];
  const takeSurname = () => surnamePool.splice(r.int(surnamePool.length), 1)[0]!;
  return firsts.map((first, k) => {
    const surname = r.chance(0.25) ? `${takeSurname()}-${takeSurname()}` : takeSurname();
    const nick = INVENTED_NICKNAMES[first];
    return {
      id: `c${k + 1}`,
      fullName: `${first} ${surname}`,
      otherNames: nick && r.chance(0.7) ? [nick] : [],
      pronouns: r.pick(["she/her", "he/him", "they/them", ""] as const),
    };
  });
}

function assemble(lines: Piece[][]): { text: string; identifiers: KnownIdentifier[] } {
  let text = "";
  const identifiers: KnownIdentifier[] = [];
  lines.forEach((line, k) => {
    if (k > 0) text += "\n";
    for (const p of line) {
      if (typeof p === "string") text += p;
      else {
        identifiers.push({ kind: p.kind, text: p.text, start: text.length, end: text.length + p.text.length });
        text += p.text;
      }
    }
  });
  return { text, identifiers };
}

function buildNote(r: Rng, index: number): SyntheticNote {
  const clients = makeClients(r);
  const present = r.sample(clients, r.chance(0.3) ? 2 : 1);
  const x = makeCtx(r, clients, present);
  const scenario = r.pick(SCENARIOS);
  const lines: Piece[][] = [scenario.header(x) ?? []];
  const wanted = 4 + r.int(4);
  for (const line of r.sample(scenario.pool, wanted)) {
    const made = line(x);
    if (made) lines.push(made);
  }
  const { text, identifiers } = assemble(lines);
  return { id: `n${String(index + 1).padStart(3, "0")}`, text, clientList: clients, identifiers };
}

export function buildSet(seed: number = SYNTHETIC_SEED, size: number = SYNTHETIC_SET_SIZE): SyntheticNote[] {
  const r = new Rng(seed);
  return Array.from({ length: size }, (_, k) => buildNote(r, k));
}

export function setFile(notes: SyntheticNote[], seed: number) {
  return { seed, count: notes.length, notes };
}

export function main(): void {
  const notes = buildSet();
  const header = makeHeader({ browser: nodeRuntime(), script: "scripts/buildSet.ts", scriptVersion: SCRIPT_VERSION });
  const file = writeMeasured("synthetic-set", header, setFile(notes, SYNTHETIC_SEED), ["seed", "count", "notes"]);
  console.log(`Wrote ${file} (${notes.length} invented notes, seed ${SYNTHETIC_SEED}).`);
}
