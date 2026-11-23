// Hosted cloud task 2 (R2.2): the site key comes from the same config file; placeholders and empty values are no key.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadFirebaseConfig, readSiteKey, SITE_KEY_FIELD } from "../../src/firebase/config";

const BASE = { apiKey: "k", authDomain: "a", projectId: "p", storageBucket: "s", messagingSenderId: "m", appId: "i" };
const serve = (body: unknown) => async () => ({ ok: true, text: async () => JSON.stringify(body) });

describe("site key", () => {
  it("is read from the config as a string", () => {
    expect(SITE_KEY_FIELD).toBe("appCheckSiteKey");
    expect(readSiteKey({ appCheckSiteKey: "invented-site-key" })).toBe("invented-site-key");
    expect(readSiteKey({ appCheckSiteKey: "  invented-site-key  " })).toBe("invented-site-key");
  });
  it("is absent for missing, empty, non-string and angle-bracket placeholder values", () => {
    for (const v of [undefined, "", "   ", 5, null, true, "<appCheckSiteKey>", "<anything>"]) {
      expect(readSiteKey({ appCheckSiteKey: v })).toBeUndefined();
    }
    expect(readSiteKey({})).toBeUndefined();
  });
  it("loadFirebaseConfig returns it beside the config, and keeps it out of the config object", async () => {
    const r = await loadFirebaseConfig(serve({ ...BASE, appCheckSiteKey: "invented-site-key" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.siteKey).toBe("invented-site-key");
      expect(Object.keys(r.config)).not.toContain("appCheckSiteKey");
    }
  });
  it("loadFirebaseConfig gives no siteKey when the file has none, and the config is still valid", async () => {
    const r = await loadFirebaseConfig(serve(BASE));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.siteKey).toBeUndefined();
  });
  it("the example config carries a placeholder for it, which counts as no key", () => {
    const example = JSON.parse(readFileSync("firebase.config.example.json", "utf8")) as Record<string, unknown>;
    expect(example["appCheckSiteKey"]).toBe("<appCheckSiteKey>");
    expect(readSiteKey(example)).toBeUndefined();
  });
});
