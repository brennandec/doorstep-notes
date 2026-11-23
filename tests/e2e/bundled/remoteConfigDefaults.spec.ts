// BUNDLED. Fetched settings unreachable: the judge path still finishes on the compiled defaults.
// No local config file is read. No model call is spent. Invented people only.
import { detail, expect, openInventedVisit, press, record, runToFinished, task, test, useStandIn } from "../fixtures/base";
import { serveForFile } from "../fixtures/base";

const site = serveForFile("dist-e2e");

test("unreachable fetched settings: the judge path finishes, and no note bytes leave", async ({ page, context }, info) => {
  task(info, "WO-10");
  await useStandIn(context);
  const seen = record(context);
  await page.route(/firebaseremoteconfig\.googleapis\.com|firebaseinstallations\.googleapis\.com|firebasevertexai\.googleapis\.com/, (route) => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await runToFinished(page);
  const note = "Harbour";
  const outside = seen.requests.filter((r) => /firebaseremoteconfig|firebaseinstallations|firebasevertexai/.test(r.url));
  for (const r of outside) {
    const raw = r.postData;
    const body = raw == null ? "" : typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    expect(body).not.toContain(note);
  }
  expect(outside.filter((r) => r.url.includes("firebasevertexai.googleapis.com"))).toHaveLength(0);
  await page.goto(`${site.get().url}/about`);
  await expect(page.locator("[data-policy-name]")).toHaveText("compiled");
  await expect(page.locator("[data-policy-version]")).toHaveText("1");
  await expect(page.locator("[data-fetch-time]")).not.toHaveText("");
  await detail(info, { outside: outside.length });
});
