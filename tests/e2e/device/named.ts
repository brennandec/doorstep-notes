// Named waits for the real-browser specs (measurement R18, session H18). A wait that fails says which element it waited for and for how long,
// so a record never reads only "toBeVisible failed". They poll isVisible and isEnabled, which never raise a strict-mode error when two
// elements match, so the order of the names is the only tie-break.

export interface Probe {
  isVisible(): Promise<boolean>;
  isEnabled(): Promise<boolean>;
}

const secondsText = (ms: number): string => String(Math.round(ms) / 1000);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => Promise<boolean>, timeoutMs: number, stepMs: number): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    if (await check().catch(() => false)) return true;
    if (Date.now() >= end) return false;
    await sleep(stepMs);
  }
}

export async function waitVisible(locator: Probe, name: string, timeoutMs: number, stepMs = 200): Promise<void> {
  if (!(await until(() => locator.isVisible(), timeoutMs, stepMs))) throw new Error(`${name} was not visible within ${secondsText(timeoutMs)} s`);
}

export async function waitEnabled(locator: Probe, name: string, timeoutMs: number, stepMs = 200): Promise<void> {
  if (!(await until(() => locator.isEnabled(), timeoutMs, stepMs))) throw new Error(`${name} was not enabled within ${secondsText(timeoutMs)} s`);
}

/** Resolves with the name of the first listed element that is visible. Fails naming all of them. */
export async function waitForOneOf(items: { name: string; locator: Probe }[], timeoutMs: number, stepMs = 200): Promise<string> {
  let found = "";
  const ok = await until(async () => {
    for (const item of items) {
      if (await item.locator.isVisible().catch(() => false)) {
        found = item.name;
        return true;
      }
    }
    return false;
  }, timeoutMs, stepMs);
  if (!ok) throw new Error(`none of: ${items.map((i) => i.name).join(", ")}, was visible within ${secondsText(timeoutMs)} s`);
  return found;
}
