// Numbers for the /about agency section. The sentences live in strings.about.
// Chrome floor: docs/sdk-facts.md items 1 and 5, read 2026-11-12.
// Policy values: Chromium GenAILocalFoundationalModelSettings, range 0 to 1.
// Installed build named in the WO-14 draft: Google Chrome 158.0.8127.36.
// Paid terms date: Gemini API terms, effective 23 March 2026, read 2026-11-21.
// Catch counts: results/catch-rate.json exactAndNear and merged, 2026-11-13.

export const aboutFacts = {
  version: "139",
  item: "1",
  floorItem: "5",
  sdkRead: "2026-11-12",
  freeGb: "22",
  vramGb: "4",
  ramGb: "16",
  download: "0",
  remove: "1",
  build: "158.0.8127.36",
  effective: "23 March 2026",
  termsRead: "2026-11-21",
  notes: "200",
  listCaught: "509",
  total: "1,141",
  modelCaught: "1,032",
  browser: "157.0.8103.79",
  when: "2026-11-13",
} as const;
