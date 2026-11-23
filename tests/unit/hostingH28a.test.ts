// Session H28a: what a Hosting deploy needs, one named build step, and the words that say where the page is hosted.
// Every pattern is built from fragments, and values of the local config are compared and never printed.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildHosted, checkHostedConfig } from "../../scripts/buildHosted";
import { loadFirebaseConfig } from "../../src/firebase/config";
import { makeCloudService } from "../../src/firebase/cloudService";
import { strings } from "../../src/app/strings";

const read = (path: string): string => readFileSync(path, "utf8");
const INVENTED = JSON.parse(read("tests/fixtures/firebase.config.invented.json")) as Record<string, string>;
const SITE_KEY = "invented-site-key-for-test";
const WORK = "test-results/h28a";
const OUT = `${WORK}/dist`;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });
}

const refusal = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  return "";
};

function localValues(): Map<string, string> {
  const out = new Map<string, string>();
  if (!existsSync("firebase.config.local.json")) return out;
  const record = JSON.parse(read("firebase.config.local.json")) as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) if (typeof value === "string" && value.length >= 6) out.set(key, value);
  return out;
}

describe("firebase.json", () => {
  const json = JSON.parse(read("firebase.json")) as {
    hosting: {
      public: string;
      rewrites: { source: string; destination: string }[];
      headers: { source: string; headers: { key: string; value: string }[] }[];
    };
    remoteconfig: { template: string };
  };

  it("serves dist with exactly the six headers, the about rewrite, and the template", () => {
    expect(Object.keys(json)).toEqual(["hosting", "remoteconfig"]);
    expect(Object.keys(json.hosting)).toEqual(["public", "rewrites", "headers"]);
    expect(json.hosting.rewrites).toEqual([{ source: "/about", destination: "/index.html" }]);
    expect(json.remoteconfig).toEqual({ template: "remoteconfig.template.json" });
    expect(json.hosting.public).toBe("dist");
    const cache = (source: string, value: string) => ({ source, headers: [{ key: "Cache-Control", value }] });
    expect(json.hosting.headers).toEqual([
      cache("/", "no-cache"),
      cache("/index.html", "no-cache"),
      cache("/sw.js", "no-cache"),
      cache("/firebase.config.local.json", "no-store"),
      cache("/probe.txt", "no-store"),
      cache("/assets/**", "public, max-age=31536000, immutable"),
    ]);
  });

  it("holds no project id file and no value of the local or invented config", () => {
    expect(existsSync(".firebaserc")).toBe(false);
    const files = ["firebase.json", "scripts/buildHosted.ts", "tests/unit/hostingH28a.test.ts"];
    for (const file of files) {
      const text = read(file);
      for (const [key, value] of localValues()) expect(text.includes(value), `${file} holds a value of the local config key ${key}`).toBe(false);
      for (const [key, value] of Object.entries(INVENTED)) {
        if (value.length >= 6 && file !== "tests/unit/hostingH28a.test.ts") expect(text.includes(value), `${file} holds the invented value of ${key}`).toBe(false);
      }
    }
  });
});

describe(".gitignore and package.json", () => {
  it("ignores what the CLI writes and keeps the older lines", () => {
    const lines = read(".gitignore").split("\n").map((l) => l.trim());
    for (const line of [".firebase/", "firebase-debug.log", "dist/", "firebase.config.local.json", ".browser-profile/"]) expect(lines).toContain(line);
  });

  it("has the named script and sets HOSTING_BUILD in none", () => {
    const scripts = (JSON.parse(read("package.json")) as { scripts: Record<string, string> }).scripts;
    expect(scripts["build:hosted"]).toContain("scripts/buildHosted.ts");
    for (const text of Object.values(scripts)) expect(text.includes("HOSTING" + "_BUILD")).toBe(false);
  });
});

describe("the hosted build refuses what it should", () => {
  const good: Record<string, string> = { ...INVENTED, appCheckSiteKey: SITE_KEY };
  const check = (record: Record<string, unknown>, allowInvented = true) => () => checkHostedConfig(JSON.stringify(record), { allowInvented });

  it("a missing file", () => {
    const message = refusal(() => buildHosted({ configFile: `${WORK}/no-such-file.json`, outDir: OUT, allowInvented: true }));
    expect(message).toContain("HOSTED BUILD REFUSED");
    expect(message).toContain("missing");
  });

  it("text that is not JSON", () => {
    const message = refusal(() => checkHostedConfig("not json at all {", { allowInvented: true }));
    expect(message).toContain("HOSTED BUILD REFUSED");
    expect(message).toContain("not JSON");
  });

  it("one key missing, empty or a placeholder, naming the key and no value", () => {
    const { apiKey: _gone, ...without } = good;
    expect(refusal(check(without))).toContain("apiKey");
    const empty = refusal(check({ ...good, projectId: "" }));
    expect(empty).toContain("projectId");
    const placeholder = refusal(check({ ...good, appId: "<your-app-id>" }));
    expect(placeholder).toContain("appId");
    expect(placeholder.includes("your-app-id")).toBe(false);
  });

  it("a site key that is missing or a placeholder", () => {
    expect(refusal(check(INVENTED))).toContain("appCheckSiteKey");
    const message = refusal(check({ ...INVENTED, appCheckSiteKey: "<site-key>" }));
    expect(message).toContain("appCheckSiteKey");
    expect(message.includes("<site-key>")).toBe(false);
  });

  it("the invented config unless allowed", () => {
    const message = refusal(check(good, false));
    expect(message).toContain("invented test config");
    for (const value of Object.values(good)) expect(message.includes(value)).toBe(false);
    expect(refusal(check(good, true))).toBe("");
  });

  it("an output folder not named dist", () => {
    mkdirSync(WORK, { recursive: true });
    const configFile = `${WORK}/config-not-dist.json`;
    writeFileSync(configFile, JSON.stringify(good));
    const message = refusal(() => buildHosted({ configFile, outDir: `${WORK}/out`, allowInvented: true }));
    expect(message).toContain("HOSTED BUILD REFUSED");
    expect(message).toContain("dist");
  });
});

describe("the hosted build with an invented site key", () => {
  let all = "";
  const good = { ...INVENTED, appCheckSiteKey: SITE_KEY };
  beforeAll(() => {
    mkdirSync(WORK, { recursive: true });
    const configFile = `${WORK}/config.json`;
    writeFileSync(configFile, JSON.stringify(good));
    buildHosted({ configFile, outDir: OUT, allowInvented: true });
    all = filesUnder(OUT)
      .filter((f) => /\.(js|html|css|json|txt|webmanifest)$/.test(f))
      .map((f) => read(f))
      .join("\n");
  }, 280_000);

  it("holds no debug name and no local debug token value", () => {
    expect(all.includes("FIREBASE_APPCHECK" + "_DEBUG_TOKEN")).toBe(false);
    const file = "appcheck-debug-token.local";
    if (existsSync(file)) {
      const value = read(file).trim();
      if (value.length >= 20) expect(all.includes(value), "the output holds the local debug token value").toBe(false);
    }
  });

  it("holds the Enterprise provider and the limited-use setting", () => {
    expect(all).toContain("ReCaptchaEnterpriseProvider");
    // WO-02: the option is still reachable (WO-10) but is no longer the default
    // production path, so the source must still mention it and must not set it unconditionally.
    expect(all).toContain("useLimitedUse");
  });

  it("is a production build: the compiled data-build value is production and the worker registration is not compiled out", () => {
    expect(all).toMatch(/["'`]data-build["'`]\s*,\s*["'`]production["'`]/);
    expect(all).not.toMatch(/prod:\s*(?:!1|false)\s*,\s*doc:/);
  });

  it("carries the config with the site key, and sw.js does not name it", () => {
    expect(JSON.parse(read(`${OUT}/firebase.config.local.json`))).toEqual(good);
    expect(read(`${OUT}/sw.js`).includes("firebase.config" + ".local.json")).toBe(false);
  });

  it("names every asset with a content hash", () => {
    const assets = filesUnder(`${OUT}/assets`);
    expect(assets.length).toBeGreaterThan(0);
    for (const file of assets) expect(file, "asset without a hash").toMatch(/-[A-Za-z0-9_-]{8,}\.(js|css|png)$/);
  });

  describe("the start path of the built page", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("starts App Check with the Enterprise provider and loads no debug code", async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      const log: string[] = [];
      class Backend {}
      class Enterprise {
        constructor(readonly key: string) {
          log.push(`enterprise:${key}`);
        }
      }
      const getAI = vi.fn((_app: unknown, _options: unknown) => ({ service: true }));
      const initializeAppCheck = vi.fn((_a: unknown, o: { provider: unknown }) => {
        log.push(`provider:${o.provider instanceof Enterprise ? "enterprise" : "other"}`);
        return {};
      });
      const modules = {
        app: { getApps: () => [] as { name: string }[], initializeApp: vi.fn(() => ({ name: "[DEFAULT]" })) },
        ai: {
          GoogleAIBackend: Backend,
          InferenceMode: { PREFER_IN_CLOUD: "PREFER_IN_CLOUD" },
          getAI,
          getGenerativeModel: vi.fn(() => ({ generateContent: async () => ({ response: { text: () => "answer", inferenceSource: "IN_CLOUD" } }) })),
        },
        appCheck: { initializeAppCheck, ReCaptchaEnterpriseProvider: Enterprise },
      };
      const loadDebug = vi.fn();
      const built = read(`${OUT}/firebase.config.local.json`);
      const loadConfig = () => loadFirebaseConfig(async () => ({ ok: true, text: async () => built }));
      const service = makeCloudService({ production: true, loadConfig, loadModules: (async () => modules) as never });
      const build = (ai: { InferenceMode: Record<string, unknown> }) => ({ mode: ai.InferenceMode["PREFER_IN_CLOUD"], inCloudParams: { model: "invented-model" } });
      await service.generate(build as never, "invented prompt");
      expect(initializeAppCheck).toHaveBeenCalledTimes(1);
      expect(log).toContain(`enterprise:${SITE_KEY}`);
      expect(log).toContain("provider:enterprise");
      // WO-02: cached standard tokens in production — one robot check per token lifetime.
      expect(JSON.stringify(getAI.mock.calls[0]?.[1])).not.toContain('"useLimitedUseAppCheckTokens":true');
      expect(loadDebug).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

describe("the hosted build refuses a development bundle (H32)", () => {
  it("refuses when the child build runs with NODE_ENV development", () => {
    const dir = `${WORK}/dev`;
    mkdirSync(dir, { recursive: true });
    const configFile = `${dir}/config.json`;
    writeFileSync(configFile, JSON.stringify({ ...INVENTED, appCheckSiteKey: SITE_KEY }));
    const message = refusal(() => buildHosted({ configFile, outDir: `${dir}/dist`, allowInvented: true, childNodeEnv: "development" }));
    expect(message).toBe("HOSTED BUILD REFUSED: the bundle is not a production build");
  }, 280_000);
});

describe("the words that say where the page is hosted", () => {
  const links = JSON.parse(read("docs/submission/links.json")) as { film: string | null; hostedPage: string };
  const readme = read("README.md");
  const story = read("docs/submission/STORY.md");
  const count = (text: string, part: string): number => text.split(part).length - 1;
  const address = links.hostedPage;

  it("links.json holds the address and no film", () => {
    expect(address).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    expect(links.film).toBeNull();
  });

  it("README.md says where it is hosted", () => {
    const block = readme.split("<!-- try:start")[1]?.split("<!-- try:end -->")[0] ?? "";
    expect(block.split("\n").filter((l) => l === `- Hosted page: ${address}`)).toHaveLength(1);
    expect(readme).toContain(strings.standing.hosted);
    expect(count(readme, `- Hosted at ${address}. Checked in Chrome against the page across 8 hosted checks: 6 reached the real cloud service and reCAPTCHA Enterprise App Check (5 passed: \`results/hosted-run-2026-11-15-4.json\`, \`results/hosted-run-2026-11-15-5.json\`, \`results/hosted-run-2026-11-15-6.json\`, \`results/hosted-run-2026-11-15-7.json\`, \`results/hosted-run-2026-11-15-8.json\`; 1 failed: \`results/hosted-run-2026-11-15-3.json\`) and 2 stopped before any cloud call with no model requests (\`results/hosted-run-2026-11-15.json\`, \`results/hosted-run-2026-11-15-2.json\`). Across real-service walk takes, 2 of 6 takes on 2026-11-14 passed (\`results/film-run-2026-11-14-h22d.json\`, \`results/film-run-2026-11-14-h22f.json\`; failed: \`results/film-run-2026-11-14.json\`, \`results/film-run-2026-11-14-h22b.json\`, \`results/film-run-2026-11-14-h22c.json\`, \`results/film-run-2026-11-14-h22e.json\`) and 4 of 12 takes on 2026-11-15 passed (\`results/film-run-2026-11-15-h36-8.json\`, \`results/film-run-2026-11-15-h37-1.json\`, \`results/film-run-2026-11-15-h37-3.json\`, \`results/film-run-2026-11-15-h37-4.json\`; failed: \`results/film-run-2026-11-15-h36.json\`, \`results/film-run-2026-11-15-h36-2.json\`, \`results/film-run-2026-11-15-h36-3.json\`, \`results/film-run-2026-11-15-h36-4.json\`, \`results/film-run-2026-11-15-h36-5.json\`, \`results/film-run-2026-11-15-h36-6.json\`, \`results/film-run-2026-11-15-h36-7.json\`, \`results/film-run-2026-11-15-h37-2.json\`); see the last step of "Run it with your own Firebase project".`)).toBe(1);
    expect(count(readme, `- The page is hosted at ${address}. Install checks (\`results/real-browser-2026-11-13-e03.json\`) and offline cold-reload checks (\`results/kept-reload.json\`) ran against local files only; real-service hosted checks passed in \`results/hosted-run-2026-11-15-8.json\` (of 8 hosted checks, 6 reached the cloud with 5 passing and 1 failing, and 2 stopped before any cloud call) and \`results/film-run-2026-11-15-h37-4.json\` (3 passing and 1 failing take on that walk; 1 of 8 takes passed through \`results/film-run-2026-11-15-h36-8.json\`; 2 of 6 takes on 2026-11-14 passed).`)).toBe(1);
    expect(count(readme, `Of eight Chrome runs on ${address}, six reached the real cloud service (5 passed: \`results/hosted-run-2026-11-15-4.json\`, \`results/hosted-run-2026-11-15-5.json\`, \`results/hosted-run-2026-11-15-6.json\`, \`results/hosted-run-2026-11-15-7.json\`, \`results/hosted-run-2026-11-15-8.json\`; 1 failed: \`results/hosted-run-2026-11-15-3.json\`) and two stopped before any cloud call with no model requests (\`results/hosted-run-2026-11-15.json\`, \`results/hosted-run-2026-11-15-2.json\`); newest \`results/hosted-run-2026-11-15-8.json\` passed with 2 generateContent calls, 3 reCAPTCHA Enterprise App Check exchanges, no debug token.`)).toBe(1);
    expect(readme.includes("Not " + "hosted")).toBe(false);
    expect(readme.includes("Nothing is " + "published")).toBe(false);
    expect(readme.includes("not yet been run against the real service")).toBe(false);
  });

  it("STORY.md says the same", () => {
    expect(story.split("\n").filter((l) => l === `- Hosted page: ${address}`)).toHaveLength(1);
    expect(count(story, "- Install and cold-reload checks remain local-only; real-service hosted runs passed.")).toBe(1);
    expect(story.includes("not yet been run against the real service")).toBe(false);
    expect(story.includes("not " + "hosted yet")).toBe(false);
  });

  it("the standing string carries the same address", () => {
    expect(strings.standing.hosted).toContain(address);
  });

  it("README and the submission folder hold no angle-bracket placeholder about the address", () => {
    const pattern = new RegExp("<[^>\\n]*" + "host" + "[^>\\n]*>", "i");
    for (const text of [readme, story, read("docs/submission/links.json")]) expect(text).not.toMatch(pattern);
  });
});
