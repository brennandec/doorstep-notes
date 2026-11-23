// Client list parser (masking task 1, R1.1, R1.4).
// One line per client: full name; other names separated by commas; pronouns.
// Other names and pronouns may be empty; the semicolons stay.

export interface ClientEntry {
  id: string;
  fullName: string;
  otherNames: string[];
  pronouns: "he/him" | "she/her" | "they/them" | "";
}

export interface ParseResult {
  entries: ClientEntry[];
  /** Each error names its line number (counting from 1). */
  errors: { line: number; message: string }[];
}

const PRONOUNS = ["he/him", "she/her", "they/them", ""] as const;

export function parseClientList(text: string): ParseResult {
  const entries: ClientEntry[] = [];
  const errors: ParseResult["errors"] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (line === "") return;
    const n = index + 1;
    const parts = line.split(";").map((p) => p.trim());
    if (parts.length !== 3) {
      errors.push({ line: n, message: `Line ${n}: use three parts separated by semicolons: full name; other names; pronouns.` });
      return;
    }
    const [fullName = "", others = "", rawPronouns = ""] = parts;
    const pronouns = rawPronouns.toLowerCase();
    if (fullName === "") {
      errors.push({ line: n, message: `Line ${n}: the full name is empty.` });
      return;
    }
    if (!(PRONOUNS as readonly string[]).includes(pronouns)) {
      errors.push({ line: n, message: `Line ${n}: pronouns must be he/him, she/her, they/them or empty.` });
      return;
    }
    entries.push({
      id: `c${entries.length + 1}`,
      fullName,
      otherNames: others === "" ? [] : others.split(",").map((o) => o.trim()).filter(Boolean),
      pronouns: pronouns as ClientEntry["pronouns"],
    });
  });
  return { entries, errors };
}
