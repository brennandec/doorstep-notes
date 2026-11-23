// Writes the real-browser checks that could not run as misses (measurement task 10, H9).
// Two checks need the cloud service: H2 part B and the network drop in the middle of a cloud
// call. The project is refused the provider's unpaid tier (browser-on-this-computer document,
// "The AI service on the project"), so both wait. A miss is recorded with its reason and is
// never a pass. A file that already holds anything but a miss is left alone.
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { makeHeader, readResults, writeResults } from "./results";

export const SCRIPT_NAME = "scripts/recordMisses.ts";
export const SCRIPT_VERSION = "1";

const WHY =
  "The cloud is not connected. The project is refused the provider's unpaid tier, and the product owner has not set up billing. " +
  "Until the cloud service answers, this check cannot run, and the page and README keep saying \"not yet checked against the real service\".";

export const MISSES: { name: string; check: string }[] = [
  { name: "h2-part-b", check: "H2 part B: a full run against the real cloud service with invented people, every request recorded." },
  { name: "draft-network-drop", check: "Drafting: the network drops in the middle of a cloud draft call; what the SDK did is recorded." },
];

/** Returns the names of the files it wrote. */
export function recordMisses(root = process.cwd(), now: Date = new Date()): string[] {
  const written: string[] = [];
  for (const m of MISSES) {
    const earlier = existsSync(join(resolve(root, "results"), `${m.name}.json`)) ? readResults(m.name, root) : undefined;
    if (earlier && earlier["status"] !== "miss") continue;
    const header = makeHeader({ browser: "not run", script: SCRIPT_NAME, scriptVersion: SCRIPT_VERSION, now });
    writeResults(m.name, header, { status: "miss", check: m.check, reason: WHY }, root);
    written.push(m.name);
  }
  return written;
}

export function main(): void {
  const names = recordMisses();
  console.log(names.length ? `Recorded as misses: ${names.join(", ")}.` : "Nothing to record.");
}
