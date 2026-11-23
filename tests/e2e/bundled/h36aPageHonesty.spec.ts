// BUNDLED. H36a page honesty checks in Playwright's headless Chromium (0 cloud calls):
//   - Draft 0.1: [data-halves] never says "The cloud half is connected" while offline.
//   - Draft 0.2 & H36c: 0-weight sessions (inputQuota === 0, failing measureInputUsage, or failed/unanswered prompt)
//                never become "ready" and show "did not start"; failed #make-record demotes device to "did not start".
//   - A2 · N1: failed #get-model and #make-record render [role="alert"] and ONE "Fill in by hand" button
//              with 0 <= rect.top and rect.bottom <= 900 at 1440 x 900.
//   - A3 · N2: the lab-note panel is absent. The audience line sits in the first viewport
//              (< 900 at 1440 x 900) and the first two viewports (< 1688 at 390 x 844), with 0 px overlap.
//   - A4 · N3: [data-keep-likely] is a .btn.secondary button at least 44 px tall.
//   - A5 · W: subject/possessive pronouns from fixed sample trigger no warning line and leave Copy enabled.
import type { Locator, Page } from "@playwright/test";
import { collectBoxes, findCut } from "../fixtures/cutText";
import { detail, expect, press, record, serveForFile, task, test, useStandIn } from "../fixtures/base";

const site = serveForFile("dist-e2e");

/** A Present entry is already tagged. The same sentence in the note and the record is an unlisted word, not a name the record added. */
async function addUnlisted(page: Page): Promise<void> {
  const noteFold = page.locator("#fold-note");
  if ((await noteFold.count()) > 0 && (await noteFold.getAttribute("aria-expanded")) !== "true") await noteFold.click();
  const note = page.locator("#note");
  await expect(note).toBeVisible();
  await note.fill(`${await note.inputValue()}\nThen Glenda arrived.`);
  const fold = page.locator("#fold-seen");
  if ((await fold.count()) > 0 && (await fold.getAttribute("aria-expanded")) !== "true") await fold.click();
  const seen = page.locator("#record-seen");
  await expect(seen).toBeVisible();
  await seen.fill(`${await seen.inputValue()}\nThen Glenda arrived.`);
}

async function overlapCheck(page: Page): Promise<{ overlaps: Array<{ a: string; b: string; px: number }>; cuts: ReturnType<typeof findCut> }> {
  const boxes = await page.evaluate(collectBoxes);
  const cuts = findCut(boxes);
  const overlaps = await page.evaluate(() => {
    const items: Array<{ label: string; rect: DOMRect; el: HTMLElement }> = [];
    const seen = new Set<HTMLElement>();
    const push = (el: HTMLElement, label: string) => {
      if (seen.has(el)) return;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      seen.add(el);
      items.push({ label, rect: r, el });
    };
    const bar = document.querySelector("header.status-bar") as HTMLElement | null;
    if (bar) push(bar, "header.status-bar");
    for (const child of Array.from(document.querySelectorAll("[data-zone] > *"))) {
      const e = child as HTMLElement;
      push(e, e.id ? `#${e.id}` : e.getAttribute("data-zone") ?? e.className ?? e.tagName);
    }
    for (const lbl of Array.from(document.querySelectorAll(".boundary .label"))) {
      push(lbl as HTMLElement, (lbl as HTMLElement).className);
    }
    const hits: Array<{ a: string; b: string; px: number }> = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i]!;
        const B = items[j]!;
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        const ox = Math.min(A.rect.right, B.rect.right) - Math.max(A.rect.left, B.rect.left);
        const oy = Math.min(A.rect.bottom, B.rect.bottom) - Math.max(A.rect.top, B.rect.top);
        if (ox > 0.5 && oy > 0.5) hits.push({ a: A.label, b: B.label, px: Math.round(Math.min(ox, oy)) });
      }
    }
    return hits;
  });
  return { overlaps, cuts };
}

async function rect(locator: Locator) {
  return locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
  });
}

test("N1 & Draft 0.2: failed #get-model shows alert and single Fill in by hand inside 1440x900; 0-weight session stays downloadable", async ({ page, context }, info) => {
  task(info, "H36a N1", "H36a 0.2");
  await useStandIn(context);
  await page.addInitScript(() => {
    let calls = 0;
    (window as unknown as Record<string, unknown>).LanguageModel = {
      async availability() {
        calls++;
        // Initially claim "available" with a 0-weight session (Chromium 153 bug);
        // probe() must demote it to downloadable rather than ready.
        return calls === 1 ? "available" : "downloadable";
      },
      async create() {
        return { inputQuota: 0, destroy() {} };
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = site.get().url;
  const rec = record(context);
  await page.goto(origin);

  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("did not start");
  await expect(page.locator("#get-model")).toBeVisible();
  await press(page, "#get-model");
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("did not start");

  const alert = page.locator('[role="alert"]');
  await expect(alert).toBeVisible();
  const handButtons = page.locator("button", { hasText: /^Fill in by hand$/ });
  await expect(handButtons).toHaveCount(1);
  await expect(page.locator("#start-by-hand")).toHaveCount(0);

  const alertBox = await rect(alert);
  const handBox = await rect(handButtons.first());
  await expect(page.locator("[data-author-device-panel]")).toHaveCount(0);
  const layout = await overlapCheck(page);
  await detail(info, { alertBox, handBox, overlaps: layout.overlaps });

  expect(alertBox.top).toBeGreaterThanOrEqual(0);
  expect(alertBox.bottom).toBeLessThanOrEqual(900);
  expect(handBox.top).toBeGreaterThanOrEqual(0);
  expect(handBox.bottom).toBeLessThanOrEqual(900);
  expect(layout.overlaps).toEqual([]);
  expect(layout.cuts).toEqual([]);
  expect(rec.outside(origin)).toEqual([]);
});

test("H36c no-weights: downloadable before press, did not start after #get-model, 0 occurrences of ready", async ({ page, context }, info) => {
  task(info, "H36c");
  await useStandIn(context);
  await page.addInitScript(() => {
    const seen: string[] = [];
    const quota = () => new DOMException("The model could not be loaded.", "QuotaExceededError");
    (window as unknown as Record<string, unknown>).__h36cDeviceSeen = seen;
    (window as unknown as Record<string, unknown>).LanguageModel = {
      async availability() {
        return "downloadable";
      },
      async create() {
        // Chromium 153/158 empty session: no inputQuota, no measureInputUsage, prompt throws QuotaExceededError.
        return {
          async prompt() {
            throw quota();
          },
          destroy() {},
        };
      },
    };
    const watch = () => {
      const el = document.querySelector('[data-state="device"] .state-words');
      if (!el) return requestAnimationFrame(watch);
      const recordText = () => {
        const text = (el.textContent ?? "").trim();
        if (text && seen[seen.length - 1] !== text) seen.push(text);
      };
      recordText();
      new MutationObserver(recordText).observe(el, { childList: true, characterData: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
    else watch();
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = site.get().url;
  const rec = record(context);
  await page.goto(origin);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("can be downloaded");
  await page.locator("#start-visit").click();
  await expect(page.locator("#get-model")).toBeVisible();
  await press(page, "#get-model");

  const alert = page.locator('[role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("QuotaExceededError");
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("did not start");
  await expect(page.locator("#get-model")).toBeVisible();
  await expect(page.locator("button", { hasText: /^Fill in by hand$/ })).toHaveCount(1);
  await press(page, "#try-example");
  await expect(page.locator("#make-record")).toContainText("example's record");

  const seenWords = await page.evaluate(() => (window as unknown as Record<string, string[]>).__h36cDeviceSeen ?? []);
  const readyCount = seenWords.filter((w) => w === "ready").length;
  await detail(info, { seenWords, readyCount });
  expect(readyCount).toBe(0);
  expect(rec.outside(origin)).toEqual([]);
});

test("N1 & Draft 0.2: failed #make-record demotes device model, keeps alert + single Fill in by hand <= 900 at 1440x900", async ({ page, context }, info) => {
  task(info, "H36a N1", "H36a 0.2", "H36c");
  await useStandIn(context);
  await page.addInitScript(() => {
    const quota = () => new DOMException("The model could not be loaded.", "QuotaExceededError");
    const session = {
      prompt: async (input?: unknown) => {
        if (typeof input === "string" && input.includes('{"ok":true}')) return '{"ok":true}';
        throw quota();
      },
      promptStreaming: () => {
        throw quota();
      },
      destroy() {},
    };
    (window as unknown as Record<string, unknown>).LanguageModel = {
      async availability() {
        return "available";
      },
      async create() {
        return session;
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = site.get().url;
  const rec = record(context);
  await page.goto(origin);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("ready");
  await press(page, "#try-example");
  await expect(page.locator("#make-record")).toHaveText("Make the record");
  await press(page, "#make-record");

  const alert = page.locator('[role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("QuotaExceededError");
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("did not start");
  await expect(page.locator("#get-model")).toBeVisible();
  await expect(page.locator("#make-record")).toContainText("example's record");

  const handButtons = page.locator("button", { hasText: /^Fill in by hand$/ });
  await expect(handButtons).toHaveCount(1);
  const alertBox = await rect(alert);
  const handBox = await rect(handButtons.first());
  const layout = await overlapCheck(page);
  await detail(info, { alertBox, handBox, overlaps: layout.overlaps });

  expect(alertBox.top).toBeGreaterThanOrEqual(0);
  expect(alertBox.bottom).toBeLessThanOrEqual(900);
  expect(handBox.top).toBeGreaterThanOrEqual(0);
  expect(handBox.bottom).toBeLessThanOrEqual(900);
  expect(layout.overlaps).toEqual([]);
  expect(layout.cuts).toEqual([]);
  expect(rec.outside(origin)).toEqual([]);
});

test("Draft 0.2 & H36c: failing measureInputUsage demotes available session to did not start", async ({ page, context }, info) => {
  task(info, "H36a 0.2");
  await useStandIn(context);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).LanguageModel = {
      async availability() {
        return "available";
      },
      async create() {
        return {
          inputQuota: 4096,
          async measureInputUsage() {
            throw new DOMException("No weights", "QuotaExceededError");
          },
          destroy() {},
        };
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(site.get().url);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("did not start");
});

test("N2: audience line sits in the first viewport and the lab-note panel is absent, with 0 overlap", async ({ page, context }, info) => {
  task(info, "H36a N2");
  await useStandIn(context);
  const origin = site.get().url;

  for (const vp of [
    { width: 1440, height: 900, maxTop: 900 },
    { width: 390, height: 844, maxTop: 1688 },
  ]) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto(origin);
    await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
    await expect(page.locator("[data-author-device-panel]")).toHaveCount(0);
    await page.locator("#start-visit").click();
    const audience = page.locator("[data-audience]");
    await expect(audience).toBeVisible();
    await expect(audience).toContainText("home-visit caseworkers");
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("author's computer");
    expect(body).not.toContain("results/");
    const box = await rect(audience);
    const layout = await overlapCheck(page);
    await detail(info, { viewport: vp, audienceBox: box, overlaps: layout.overlaps, cuts: layout.cuts });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeLessThan(vp.maxTop);
    expect(layout.overlaps).toEqual([]);
    expect(layout.cuts).toEqual([]);

    if (vp.width === 390) {
      const makeTop = (await rect(page.locator("#make-record"))).top;
      expect(makeTop).toBeGreaterThanOrEqual(844);
    }
  }
});

test("N3 & A5·W & Draft 0.1: Keep is a secondary >=44px button, offline [data-halves] is honest, and fixed draft enables Copy", async ({ page, context }, info) => {
  task(info, "H36a N3", "H36a A5·W", "H36a 0.1");
  await useStandIn(context);
  const origin = site.get().url;
  const rec = record(context);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin);
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
  await page.locator("#start-visit").click();

  // Offline check for [data-halves]
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const halvesOffline = await page.locator("[data-halves]").innerText();
  expect(halvesOffline).not.toMatch(/The cloud half is connected/i);
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await press(page, "#try-example");
  await press(page, "#make-record");
  await expect(page.locator("[data-record]")).toBeVisible();
  await addUnlisted(page);
  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");

  const keep = page.locator("[data-keep-likely]").first();
  await expect(keep).toBeVisible();
  const keepMeta = await keep.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      hasBtn: el.classList.contains("btn"),
      hasSecondary: el.classList.contains("secondary"),
      kind: el.getAttribute("data-kind"),
      height: r.height,
    };
  });
  expect(keepMeta.tag).toBe("button");
  expect(keepMeta.hasBtn).toBe(true);
  expect(keepMeta.hasSecondary).toBe(true);
  expect(keepMeta.kind).toBe("secondary");
  expect(keepMeta.height).toBeGreaterThanOrEqual(44);

  while ((await page.locator("[data-keep-likely]").count()) > 0) {
    await page.locator("[data-keep-likely]").first().click();
  }
  await expect(page.locator("[data-outgoing]")).toContainText("Visit date:");
  await press(page, "#send");
  await expect(page.locator('[data-zone="finished"] .sheet-text')).toBeVisible();
  await expect(page.locator("#copy")).toBeEnabled();
  const notes = await page.locator('[data-zone="finished"] .sheet-notes li').allInnerTexts();
  // H44 item 2 (4045f98): the stand-in's record form starts sentences with record
  // labels. "Her sister was there." is an untagged pronoun, so that check comes first.
  const shown283 = await page.locator('[data-zone="finished"] .sheet-text').innerText();
  const labelLines283 = shown283
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /^(?:Visit date|Present|Seen|Agreed|Risks|Next steps):/.test(s))
    .map((s) => `Check this sentence: it starts with a record label. ${s}`);
  expect(notes.filter((n) => n.startsWith("Check this sentence:"))).toEqual([
    "Check this sentence: a pronoun may point at the wrong person. Her sister was there.",
    ...labelLines283,
  ]);
  expect(rec.outside(origin)).toEqual([]);
});

test("A5·W: object-form pronoun matching nearest prior tag adds plain line under finished note without holding Copy", async ({ page, context }, info) => {
  task(info, "H36a A5·W");
  await useStandIn(context);
  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = site.get().url;
  const rec = record(context);
  await page.goto(origin);
  await expect(page.locator('[data-state="device"] .state-words')).not.toHaveText("");
  await page.locator("#start-visit").click();

  await page.locator("#client-list").fill("Maria Okonkwo-Reyes; Maria; she/her\nTomas Brandvold; Tom; he/him");
  await press(page, "#start-by-hand");
  await press(page, "#edit-record");
  await page.locator("#record-date").fill("2026-11-12");
  for (const label of ["Maria Okonkwo-Reyes", "Tomas Brandvold"]) {
    await page.locator("#tag-label").fill(label);
    await page.locator("#tag-role").selectOption("client");
    await press(page, "#add-tag");
  }
  await page.locator("#record-seen").fill(
    "Met at the door. Maria Okonkwo-Reyes met Tomas Brandvold and handed {him:Person 2} the letter.",
  );
  await page.locator("#record-agreed").fill("First note. Maria Okonkwo-Reyes agreed that {she:Person 1} posts the form.");

  await press(page, "#mask");
  await expect(page.locator("[data-mask-view] [data-chip]").first()).toBeVisible();
  await press(page, "#draft");
  while ((await page.locator("[data-keep-likely]").count()) > 0) {
    await page.locator("[data-keep-likely]").first().click();
  }
  await press(page, "#send");

  const sheet = page.locator('[data-zone="finished"] .sheet');
  await expect(sheet.locator(".sheet-text")).toBeVisible();
  const text = await sheet.locator(".sheet-text").innerText();
  const notes = (await sheet.locator("[data-note] li").allInnerTexts()).map((n) => n.trim());
  const warning =
    "Check this sentence: a pronoun may point at the wrong person. Maria Okonkwo-Reyes met Tomas Brandvold and handed him the letter.";

  expect(text).toContain("Maria Okonkwo-Reyes met Tomas Brandvold and handed him the letter.");
  expect(text).toContain("Maria Okonkwo-Reyes agreed that she posts the form.");
  expect(notes.filter((n) => n === warning)).toHaveLength(1);
  // H44 item 2 (4045f98): exactly the pronoun line plus the stand-in record's
  // three copied-label lines, and no other "Check this sentence:" line.
  expect(notes.filter((n) => n.startsWith("Check this sentence:"))).toEqual([
    warning,
    "Check this sentence: it starts with a record label. Present: Maria Okonkwo-Reyes, Tomas Brandvold.",
    "Check this sentence: it starts with a record label. Seen: Met at the door.",
    "Check this sentence: it starts with a record label. Agreed: First note.",
  ]);
  await expect(page.locator("[data-copy-held]")).toHaveCount(0);
  await expect(page.locator("#copy")).toBeEnabled();
  expect(rec.outside(origin)).toEqual([]);
});

test("H36d Chromium EchoAILanguageModel: echo at load when available reads starting, never ready, ends did not start", async ({ page, context }, info) => {
  task(info, "H36d");
  await useStandIn(context);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as Record<string, unknown>).__h36dDeviceSeen = seen;
    const sample = () => {
      const el = document.querySelector('[data-state="device"] .state-words');
      const text = (el?.textContent ?? "").trim();
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    };
    const watch = () => {
      sample();
      new MutationObserver(sample).observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    };
    if (document.documentElement) watch();
    else document.addEventListener("DOMContentLoaded", watch, { once: true });

    (window as unknown as Record<string, unknown>).LanguageModel = {
      async availability() {
        return "available";
      },
      async create() {
        return {
          prompt: (input?: unknown) =>
            new Promise<string>((resolve) => {
              setTimeout(
                () =>
                  resolve(
                    `On-device model is not available in Chromium, this API is just echoing back the input:\n${String(input)}\n\nRemember to respond in JSON.`,
                  ),
                120,
              );
            }),
          destroy() {},
        };
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = site.get().url;
  const rec = record(context);
  await page.goto(origin);

  const alert = page.locator('[role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("NotSupportedError");
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("did not start");
  await expect(page.locator("#get-model")).toBeVisible();
  await expect(page.locator("button", { hasText: /^Fill in by hand$/ })).toHaveCount(1);

  const seenWords = await page.evaluate(() => (window as unknown as Record<string, string[]>).__h36dDeviceSeen ?? []);
  await detail(info, { seenWords });
  expect(seenWords).toContain("starting");
  expect(seenWords.filter((w) => w === "ready")).toHaveLength(0);
  expect(rec.outside(origin)).toEqual([]);
});

test("H36d Chromium EchoAILanguageModel: #get-model from downloadable reads starting, never ready, ends did not start", async ({ page, context }, info) => {
  task(info, "H36d");
  await useStandIn(context);
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as Record<string, unknown>).__h36dDeviceSeen = seen;
    const sample = () => {
      const el = document.querySelector('[data-state="device"] .state-words');
      const text = (el?.textContent ?? "").trim();
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    };
    const watch = () => {
      sample();
      new MutationObserver(sample).observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    };
    if (document.documentElement) watch();
    else document.addEventListener("DOMContentLoaded", watch, { once: true });

    let current = "downloadable";
    (window as unknown as Record<string, unknown>).LanguageModel = {
      async availability() {
        return current;
      },
      async create() {
        current = "available";
        return {
          prompt: (input?: unknown) =>
            new Promise<string>((resolve) => {
              setTimeout(
                () =>
                  resolve(
                    `On-device model is not available in Chromium, this API is just echoing back the input:\n${String(input)}`,
                  ),
                120,
              );
            }),
          destroy() {},
        };
      },
    };
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  const origin = site.get().url;
  const rec = record(context);
  await page.goto(origin);
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("can be downloaded");
  await page.locator("#start-visit").click();

  await page.evaluate(() => {
    const seen = (window as unknown as Record<string, string[]>).__h36dDeviceSeen;
    if (seen) seen.length = 0;
  });

  await press(page, "#get-model");

  const alert = page.locator('[role="alert"]');
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("NotSupportedError");
  await expect(page.locator('[data-state="device"] .state-words')).toHaveText("did not start");
  await expect(page.locator("#get-model")).toBeVisible();
  await expect(page.locator("button", { hasText: /^Fill in by hand$/ })).toHaveCount(1);

  const seenWords = await page.evaluate(() => (window as unknown as Record<string, string[]>).__h36dDeviceSeen ?? []);
  await detail(info, { seenWords });
  expect(seenWords).toContain("starting");
  expect(seenWords.filter((w) => w === "ready")).toHaveLength(0);
  expect(seenWords).not.toContain("can be downloaded");
  expect(seenWords).not.toContain("not on this computer");
  expect(rec.outside(origin)).toEqual([]);
});
