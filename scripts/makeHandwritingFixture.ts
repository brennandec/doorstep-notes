// H03. Builds the two picture fixtures in tests/fixtures/handwriting/ and their manifest:
//   handwriting-note.png  an invented caseworker's rough note, drawn in a handwriting typeface
//   printed-note.png      the same words in printed type, on the same paper, same size
// Run: npm run fixture:handwriting
//
// What "handwriting" means here, and what it does not: no pen touched paper. The words are drawn in
// a handwriting typeface that ships with macOS (Bradley Hand), and each word is moved and tilted a
// little by a seeded random draw so the page is not set type. It is a stand-in for a person's hand,
// not a person's own hand, and the manifest, the README and the results file say so.
//
// The drawing runs in Playwright's bundled Chromium, headless. No page is served and no request is made.
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

export const FIXTURE_DIR = "tests/fixtures/handwriting";
export const WIDTH = 1000;
export const HEIGHT = 520;

/** Invented. Nobody here is on the invented visit's client list. No year, so there is nothing for a model to complete. */
export const PEOPLE = ["Odalys Brennan-Webb", "Ione"];
export const LINES = [
  "Thurs 12/11 visit, 2pm, flat 9",
  "Present: Odalys Brennan-Webb, her sister Ione",
  "Saw: heating on now, post piled by the door",
  "Agreed: Odalys posts the benefits form Mon",
  "Next: I ring Fri to check it went",
];

const HAND_HOW =
  "Drawn in a handwriting typeface (Bradley Hand, installed with macOS) in dark blue ink on lined paper, " +
  "each word moved and tilted a little by a seeded random draw. It is a typeface, not a person's own hand.";
const PRINTED_HOW = "The same words in printed type (Georgia, black) on the same lined paper, set straight. Printed, with no movement or tilt.";

type Style = "hand" | "printed";

/** Runs in the page. Plain function: it is serialised, so it may use nothing from this module. */
function drawPage(args: { style: Style; lines: string[]; width: number; height: number }): string {
  const { style, lines, width, height } = args;
  // A small seeded generator, so the same page comes out every time.
  let seed = 20261113;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const between = (a: number, b: number) => a + (b - a) * rand();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext("2d")!;
  g.fillStyle = "#fbf8ee";
  g.fillRect(0, 0, width, height);
  // Ruled lines and a margin line.
  g.strokeStyle = "#c9d6e8";
  g.lineWidth = 2;
  const first = 100;
  const step = 82;
  for (let y = first; y < height; y += step) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(width, y);
    g.stroke();
  }
  g.strokeStyle = "#e3b7b7";
  g.beginPath();
  g.moveTo(52, 0);
  g.lineTo(52, height);
  g.stroke();

  const hand = style === "hand";
  g.textBaseline = "alphabetic";
  g.fillStyle = hand ? "#1c2f78" : "#111111";
  lines.forEach((line, i) => {
    const baseline = first + i * step - 8;
    const words = line.split(" ");
    let x = 76 + (hand ? between(-4, 4) : 0);
    const slope = hand ? between(-0.012, 0.004) : 0;
    for (const word of words) {
      const size = hand ? Math.round(between(38, 43)) : 36;
      g.font = hand ? `bold ${size}px "Bradley Hand", "Bradley Hand Bold"` : `${size}px Georgia`;
      const w = g.measureText(word).width;
      g.save();
      const y = baseline + (hand ? between(-4, 4) : 0) + (x - 76) * slope;
      g.translate(x, y);
      if (hand) g.rotate(between(-0.03, 0.03));
      g.fillText(word, 0, 0);
      g.restore();
      x += w + g.measureText(" ").width * (hand ? between(0.9, 1.5) : 1);
    }
  });
  return canvas.toDataURL("image/png").split(",")[1]!;
}

export async function main(): Promise<void> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent("<!doctype html><title>fixture</title>");
    const hand = await page.evaluate(drawPage, { style: "hand" as Style, lines: LINES, width: WIDTH, height: HEIGHT });
    const printed = await page.evaluate(drawPage, { style: "printed" as Style, lines: LINES, width: WIDTH, height: HEIGHT });
    mkdirSync(FIXTURE_DIR, { recursive: true });
    const handBytes = Buffer.from(hand, "base64");
    const printedBytes = Buffer.from(printed, "base64");
    writeFileSync(`${FIXTURE_DIR}/handwriting-note.png`, handBytes);
    writeFileSync(`${FIXTURE_DIR}/printed-note.png`, printedBytes);
    const entry = (file: string, b: Buffer, how: string) => ({
      file,
      mimeType: "image/png",
      width: WIDTH,
      height: HEIGHT,
      sha256: createHash("sha256").update(b).digest("hex"),
      how,
    });
    const manifest = {
      note: "Invented people only. Written by scripts/makeHandwritingFixture.ts; do not edit by hand.",
      invented: true,
      people: PEOPLE,
      lines: LINES,
      handwriting: entry("handwriting-note.png", handBytes, HAND_HOW),
      printed: entry("printed-note.png", printedBytes, PRINTED_HOW),
    };
    // The manifest's "note" key above is a comment for people; the words on the page are joined below.
    const out = { ...manifest, note: LINES.join("\n"), comment: manifest.note };
    writeFileSync(`${FIXTURE_DIR}/manifest.json`, JSON.stringify(out, null, 2) + "\n");
    console.log(`handwriting ${handBytes.length} bytes, printed ${printedBytes.length} bytes, ${WIDTH} x ${HEIGHT}`);
  } finally {
    await browser.close();
  }
}
