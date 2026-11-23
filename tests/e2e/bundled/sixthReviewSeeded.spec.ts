// BUNDLED, e2e build (the test hook for the seeded leak is present).
//   egress-check 35   S3  the seeded fail card: the two rows of the sixth review and "Seeded for a test."
// Playwright's bundled Chromium, headless, 1440 by 900. The cloud is not connected, so the draft goes through the test double.
// Kept apart from sixthReview.spec.ts because that file serves the production build on the same port. Invented people only.
import { detail, expect, openInventedVisit, press, serveForFile, task, test } from "../fixtures/base";

const site = serveForFile("dist-e2e");

test("S3: the seeded fail card holds the two rows and \"Seeded for a test.\"", async ({ page }, info) => {
  task(info, "egress-check 35");
  {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(() => {
      (window as unknown as { __seedLeak: string }).__seedLeak = "Priya Halloran";
    });
    await openInventedVisit(page, site.get().url);
    await press(page, "#mask");
    await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
    await press(page, "#draft");
    // H35a D8: Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
    while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
    await press(page, "#send");
    const line = page.locator("[data-egress-line]");
    await expect(line).toHaveAttribute("data-kind", "fail");
    const card = page.locator("[data-egress-card]");
    const labels = (await card.locator("th").allInnerTexts()).map((t) => t.trim());
    expect(labels).toContain("What happened");
    expect(labels).toContain("What to do");
    const rows = await card.locator("tr").evaluateAll((trs) => trs.map((r) => (r as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
    const happened = rows.find((r) => r.startsWith("What happened"))!;
    const todo = rows.find((r) => r.startsWith("What to do"))!;
    expect(happened).toContain("this text has left this device.");
    expect(todo).toContain("report it to whoever runs this page; mask the name before the next send.");
    expect(rows.join(" ")).not.toContain("Mask them, then send again");
    await expect(card.locator("[data-egress-seeded]")).toHaveText("Seeded for a test.");
    expect(await card.locator("p").count()).toBe(0);
    // Without the seed there is no such mark: the control is the pass card of the S4 check.
    await detail(info, { labels, happened, todo, seeded: "Seeded for a test." });
  }
});

