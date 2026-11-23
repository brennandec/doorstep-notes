// Pure CLI argument parser for scripts/measureN3CloudDrafts.ts (no Playwright dependency).

/** Parses `--out <path>` or `--out=<path>` flags for `scripts/measureN3CloudDrafts.ts`. */
export function parseMeasureArgs(argv: readonly string[]): { outPath?: string } {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--out=")) {
      const value = a.slice("--out=".length).trim();
      if (value !== "") return { outPath: value };
    }
    if (a === "--out" && i + 1 < argv.length) {
      const value = argv[i + 1]!.trim();
      if (value !== "") return { outPath: value };
    }
  }
  return {};
}
