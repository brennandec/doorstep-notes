// BUNDLED. shell-and-offline task 26 (R3.2, R3.3, R4.2, R5.1 to R5.3, R5.6): the interface rules,
// measured from computed styles and boxes in a real browser.
import type { Page } from "@playwright/test";
import { detail, expect, openInventedVisit, press, serveForFile, task, test, useStandIn } from "../fixtures/base";

const site = serveForFile("dist-e2e");

const NEUTRAL = new Set([
  "rgb(250, 248, 243)", // paper
  "rgb(241, 238, 230)", // darker paper
  "rgb(28, 27, 25)", // ink
  "rgb(94, 90, 82)", // second ink
  "rgb(217, 212, 199)", // hairline
]);
const ACCENT = "rgb(30, 107, 82)";
const ACCENT_TINT = "rgb(227, 235, 229)";
const FAILURE = "rgb(179, 38, 30)";

/** Every colour used by a visible element, with the property that used it. */
async function colours(page: Page): Promise<{ colour: string; where: string }[]> {
  return page.evaluate(() => {
    const out: { colour: string; where: string }[] = [];
    const add = (colour: string, el: Element, prop: string) => {
      if (!colour || colour === "rgba(0, 0, 0, 0)" || colour === "transparent") return;
      const cls = typeof el.className === "string" && el.className ? "." + el.className.split(" ")[0] : "";
      out.push({ colour, where: `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${cls} ${prop}` });
    };
    for (const el of document.querySelectorAll("body, body *")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || (r.width <= 1 && r.height <= 1)) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
      if (hasText) add(cs.color, el, "color");
      add(cs.backgroundColor, el, "background");
      for (const side of ["top", "right", "bottom", "left"]) {
        if (parseFloat(cs.getPropertyValue(`border-${side}-width`)) > 0 && cs.getPropertyValue(`border-${side}-style`) !== "none") {
          add(cs.getPropertyValue(`border-${side}-color`), el, `border-${side}`);
        }
      }
      if (el instanceof SVGElement && el.tagName.toLowerCase() !== "svg") {
        if (cs.stroke !== "none") add(cs.stroke, el, "stroke");
        if (cs.fill !== "none") add(cs.fill, el, "fill");
      }
    }
    return out;
  });
}

function assertPalette(list: { colour: string; where: string }[], allowFailure: boolean): string[] {
  const bad = list.filter((c) => !NEUTRAL.has(c.colour) && c.colour !== ACCENT && c.colour !== ACCENT_TINT && !(allowFailure && c.colour === FAILURE));
  expect(bad, `colours outside the palette: ${JSON.stringify(bad.slice(0, 5))}`).toEqual([]);
  if (!allowFailure) {
    const f = list.filter((c) => c.colour === FAILURE);
    expect(f, `failure colour on a page with no error: ${JSON.stringify(f.slice(0, 5))}`).toEqual([]);
  }
  return [...new Set(list.map((c) => c.colour))];
}

test("Interface rules: colours, type, controls, targets, focus, motion", async ({ page, context, browser }, info) => {
  task(info, "shell-and-offline 26");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventedVisit(page, site.get().url);
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  // H35a D8: Draft stops at a word that looks like an unlisted name (Bea) until she keeps it, and then goes on.
  while ((await page.locator("[data-keep-likely]").count()) > 0) await page.locator("[data-keep-likely]").first().click();
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();

  // R3.2 and R3.3: with no error on the page, only the palette, the accent and its tint appear, and no failure colour.
  const distinct = assertPalette(await colours(page), false);
  expect(distinct).toContain(ACCENT);

  // An error on the page (a file that is not a JPEG or PNG): the failure colour appears, with an icon and words.
  await page.setInputFiles("#photo-input", { name: "page.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") });
  const err = page.locator('[data-zone="note"] .error');
  await expect(err).toBeVisible();
  expect(await err.evaluate((e) => getComputedStyle(e).color)).toBe(FAILURE);
  expect(await err.locator("svg").count()).toBeGreaterThan(0);
  expect((await err.textContent())!.trim().length).toBeGreaterThan(10);
  const withError = await colours(page);
  assertPalette(withError, true);
  const failureUsers = withError.filter((c) => c.colour === FAILURE).map((c) => c.where);
  expect(failureUsers.length).toBeGreaterThan(0);

  // R4.2 No visible text under 16 px; body 18 px; note text 20 px. The note is folded once a record exists
  // (shell-and-offline R20.3), so Edit unfolds it first.
  await page.locator('[data-fold="note"] button').click();
  await expect(page.locator("#note")).toBeVisible();
  const type = await page.evaluate(() => {
    const small: { text: string; px: number }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? "").trim();
      const el = n.parentElement;
      if (!t || !el) continue;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || r.width <= 1 || r.height <= 1) continue;
      const px = parseFloat(cs.fontSize);
      if (px < 16) small.push({ text: t.slice(0, 30), px });
    }
    return {
      small,
      body: getComputedStyle(document.body).fontSize,
      note: getComputedStyle(document.querySelector("#note")!).fontSize,
      line: getComputedStyle(document.body).lineHeight,
    };
  });
  expect(type.small).toEqual([]);
  expect(type.body).toBe("18px");
  expect(type.note).toBe("20px");
  expect(type.line).toBe("27px");

  // R5.1 Drawn buttons: 48 px high, 1.5 px ink border, 10 px radius. The small inline controls and the
  // chips are not these buttons; they are measured under R5.2.
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll(".btn:not(.inline)")]
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 1 && r.height > 1; })
      .map((b) => {
        const cs = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        return { id: b.id || b.textContent?.trim().slice(0, 20), h: r.height, border: cs.borderTopWidth, style: cs.borderTopStyle, colour: cs.borderTopColor, radius: cs.borderTopLeftRadius };
      }),
  );
  expect(buttons.length).toBeGreaterThan(4);
  for (const b of buttons) {
    expect(b.h, `${b.id} height`).toBe(48);
    // Chromium rounds a border down to whole device pixels, so at a scale of 1 the 1.5 px border computes to 1 px.
    expect(["1px", "1.5px"], `${b.id} border`).toContain(b.border);
    expect(b.style).toBe("solid");
    expect(b.colour, `${b.id} border colour`).toBe("rgb(28, 27, 25)");
    expect(b.radius, `${b.id} radius`).toBe("10px");
  }
  // The declared border of the drawn button is read from the style rules. Chromium rounds a computed
  // border down to whole device pixels, so the computed value is 1 px here (see the detail and OPEN-QUESTIONS).
  const declared = await page.evaluate(() => {
    const found: string[] = [];
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSStyleRule && rule.selectorText === ".btn") found.push(rule.style.getPropertyValue("border"));
      }
    }
    return found;
  });
  expect(declared.length).toBe(1);
  expect(declared[0]).toMatch(/^1\.5px solid/);
  const primaries = await page.evaluate(() => [...document.querySelectorAll(".btn.primary")].filter((b) => !(b as HTMLButtonElement).disabled).map((b) => getComputedStyle(b).backgroundColor));
  expect(primaries.length).toBeLessThanOrEqual(1);
  for (const p of primaries) expect(p).toBe(ACCENT);

  // R5.2 Every target is at least 44 by 44 px. The visually hidden file input is reached through its drawn label.
  const small = await page.evaluate(() =>
    [...document.querySelectorAll("button, a[href], input, select, textarea, [tabindex], label.file-btn")]
      // Ordinary words in the record text are exempt from the 44 px rule by name (masking R14.5): their target is the text line.
      .filter((e) => !e.classList.contains("file-input") && !e.classList.contains("word") && (e as HTMLInputElement).type !== "hidden")
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 1 && r.height > 1)
      .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
      .map(({ e, r }) => `${e.tagName.toLowerCase()}#${e.id} ${Math.round(r.width)}x${Math.round(r.height)} ${(e.textContent ?? "").trim().slice(0, 20)}`),
  );
  expect(small).toEqual([]);
  const targetCount = await page.locator("button, input, select, textarea, label.file-btn").count();

  // R5.3 Focus ring: tab through every control; 3 px, accent, 2 px away.
  await page.evaluate(() => { (document.activeElement as HTMLElement | null)?.blur(); window.scrollTo(0, 0); });
  const seen = new Set<string>();
  const wrong: string[] = [];
  let fileFocused = false;
  for (let i = 0; i < 600; i++) {
    await page.keyboard.press("Tab");
    const got = await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null;
      if (!a || a === document.body) return null;
      // The hidden file input shows its ring on the drawn label that follows it.
      const target = a.classList.contains("file-input") ? (a.nextElementSibling as HTMLElement) : a;
      const cs = getComputedStyle(target);
      const key = `${a.tagName.toLowerCase()}#${a.id}[${a.getAttribute("data-start") ?? ""}${(a.textContent ?? "").trim().slice(0, 12)}]`;
      return { key, file: a.classList.contains("file-input"), width: cs.outlineWidth, colour: cs.outlineColor, offset: cs.outlineOffset, style: cs.outlineStyle };
    });
    if (!got) break;
    if (seen.has(got.key)) break;
    seen.add(got.key);
    if (got.file) fileFocused = true;
    if (got.width !== "3px" || got.colour !== ACCENT || got.offset !== "2px" || got.style !== "solid") wrong.push(`${got.key} ${got.width} ${got.colour} ${got.offset} ${got.style}`);
  }
  expect(seen.size).toBeGreaterThan(8);
  expect(fileFocused).toBe(true);
  expect(wrong).toEqual([]);

  // R5.6 Reduced motion: every computed transition and animation duration is 0.
  const ctx = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
  const quiet = await ctx.newPage();
  await openInventedVisit(quiet, site.get().url);
  await press(quiet, "#mask");
  const durations = await quiet.evaluate(() =>
    [...document.querySelectorAll("*")].map((e) => getComputedStyle(e)).flatMap((cs) => [...cs.transitionDuration.split(","), ...cs.animationDuration.split(",")]).map((d) => d.trim()),
  );
  await ctx.close();
  expect(durations.length).toBeGreaterThan(0);
  for (const d of new Set(durations)) expect(d).toBe("0s");

  // Normal motion: the longest duration is at most 120 ms.
  const normal = await page.evaluate(() =>
    [...document.querySelectorAll("*")].flatMap((e) => getComputedStyle(e).transitionDuration.split(",")).map((d) => (d.trim().endsWith("ms") ? parseFloat(d) : parseFloat(d) * 1000)),
  );
  expect(Math.max(...normal)).toBeLessThanOrEqual(120);

  await detail(info, {
    distinctColoursNoError: distinct, buttonsMeasured: buttons.length, computedBorderAtScale1: [...new Set(buttons.map((b) => b.border))], declaredBorder: declared[0], targetsListed: targetCount,
    tabStopsChecked: seen.size, longestTransitionMsNormal: Math.max(...normal), reducedMotionDurations: [...new Set(durations)],
  });
});
