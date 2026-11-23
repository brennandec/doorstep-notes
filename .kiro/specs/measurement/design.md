# Measurement: design

Refined by rulings 6, 7, 20, 22 and the browser on this computer.

## Modules

- `scripts/buildSet.ts` seeded synthetic set builder.
- `scripts/score.ts` caught, missed and false masks, per kind, per pass.
- `scripts/measureExact.ts` Node: exact and near passes from `src/masking` on each raw note.
- `scripts/measureDevice.ts` DEVICE MODEL: through `tests/e2e/fixtures/deviceModel.ts`, runs the propose-masks job on each raw note in the page, time-boxed.
- `scripts/measureColdStart.ts` DEVICE MODEL: page load to first record.
- `scripts/writeReadme.ts` fills README figures from `results/`.
- `src/app/figures.ts` reads `results/*.json` and returns a figure or "not measured".
- `tests/unit/scripts/` tests for the builder, scoring, figure text.

## Data shapes

```ts
interface KnownIdentifier { kind: "listedName" | "otherName" | "nearVariant" | "place" | "dob" | "phrase"; text: string; start: number; end: number }

interface SyntheticNote { id: string; text: string; clientList: ClientEntry[]; identifiers: KnownIdentifier[] }

interface ResultsHeader { date: string; browser: string; script: string; scriptVersion: string }

interface PassScore { caught: number; total: number; falseMasks: number; byKind: Record<string, { caught: number; total: number }> }

interface CatchRate extends ResultsHeader {
  setSize: number; seed: number;
  exact: PassScore;
  near: PassScore;
  device: (PassScore & { n: number; notesPerMinute: number; stoppedAtLimit: boolean; model?: string })
        | { status: "not measured"; reason: string };
  merged: (PassScore & { n: number }) | { status: "not measured"; reason: string };
}

interface MissItem { noteId: string; kind: string; text: string }
interface Misses extends ResultsHeader {
  exact: MissItem[]; near: MissItem[];
  device: MissItem[] | "not measured"; merged: MissItem[] | "not measured";
  falseMasks: { exact: MissItem[]; near: MissItem[]; device: MissItem[] | "not measured" };
}

type ColdStart = ResultsHeader & ({ status: "pass" | "fail"; seconds: number; machine: string } | { status: "fail"; reason: string; machine: string });
```

## Flow

1. `buildSet` writes the set to `results/synthetic-set.json`.
2. `measureExact` runs exact and near on each raw note separately, writes those parts of `catch-rate.json` and `misses.json`.
3. `measureDevice` launches the fixture. If availability is not `available`, it writes "not measured" with the reason and stops. Otherwise it runs the propose job on each raw note in set order, stops at 30 minutes, records n, throughput and whether it stopped at the limit, then scores device alone and the merge on the same n notes.
4. `measureColdStart` writes `cold-start.json`.
5. `writeReadme` and `figures.ts` read the files.

Scoring: an identifier is caught if every character of its span lies inside a masked span. A partial cover is a miss. A masked span covering no known identifier is a false mask, for every pass.

## Inference mode

The device pass uses the propose-masks job, `ONLY_ON_DEVICE`, on the raw note (ruling 6). It never uses the test double for a reported figure.

## Commands and limits

- `npm run measure:exact` under the 300 second wrapper.
- `npm run measure:device` under `perl -e 'alarm 1900; exec @ARGV'`: the 30 minute time box plus launch and write time. Never part of `npm test`.
- `npm run measure:cold-start` under the 300 second wrapper.

## Device and network states

| State | Behaviour |
|---|---|
| Chrome absent | "not measured", reason "Google Chrome is not installed on this computer" |
| Model unavailable or no answer in 15 s | "not measured", reason as read |
| Downloadable or downloading | "not measured"; the fixture never starts a download |
| Available | measured, time-boxed |
| Network off | measurement unaffected |

## Page and README

A "Figures" section reads each file. Format: "Exact match caught X of Y identifiers on the invented set (date, browser)." Device figures add "on n of N invented notes". X, Y, n and N come from the file at run time; the spec gives no sample numbers. H8 reads "on the author's computer (date, browser)" or "not measured".
