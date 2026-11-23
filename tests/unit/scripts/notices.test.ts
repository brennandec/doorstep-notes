import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildNotices, packageName, productionPackages, readInstalledFrom, type InstalledPackage, type Lock } from "../../../scripts/notices.ts";

// An invented lock: one root, two production packages, one nested, one development package.
const lock: Lock = {
  packages: {
    "": { version: "0.0.0" },
    "node_modules/alpha": { version: "1.0.0", license: "MIT", resolved: "https://registry.example/alpha-1.0.0.tgz" },
    "node_modules/beta": { version: "2.1.0", license: "Apache-2.0", resolved: "https://registry.example/beta-2.1.0.tgz" },
    "node_modules/alpha/node_modules/gamma": { version: "0.3.0", license: "ISC", resolved: "https://registry.example/gamma-0.3.0.tgz" },
    "node_modules/devonly": { version: "9.9.9", license: "MIT", dev: true, resolved: "https://registry.example/devonly.tgz" },
    "node_modules/@scope/delta": { version: "4.0.0", license: "Apache-2.0", resolved: "https://registry.example/delta.tgz" },
  },
};

const MIT_TEXT = "MIT License\n\nCopyright (c) Invented Author\n\nPermission is hereby granted.";
const APACHE_TEXT = "Apache License\nVersion 2.0, January 2004\n\nTERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION\n\nfull invented terms";

const disk: Record<string, InstalledPackage> = {
  "node_modules/alpha": { licenseFiles: [{ name: "LICENSE", text: MIT_TEXT }], noticeFiles: [] },
  "node_modules/beta": { licenseFiles: [{ name: "LICENSE", text: APACHE_TEXT }], noticeFiles: [{ name: "NOTICE", text: "Beta product\nMade by Invented Author." }], repository: "git+https://example.test/beta.git" },
  "node_modules/alpha/node_modules/gamma": { licenseFiles: [{ name: "LICENSE", text: MIT_TEXT }], noticeFiles: [] },
  "node_modules/@scope/delta": { licenseFiles: [], noticeFiles: [] },
};
const read = (folder: string) => disk[folder] ?? null;

describe("notices builder", () => {
  it("names a nested package by what follows the last node_modules", () => {
    expect(packageName("node_modules/alpha/node_modules/gamma")).toBe("gamma");
    expect(packageName("node_modules/@scope/delta")).toBe("@scope/delta");
  });

  it("lists production packages only: not the root, not a development package", () => {
    const names = productionPackages(lock).map((p) => p.name);
    expect(names).toEqual(["@scope/delta", "alpha", "beta", "gamma"]);
  });

  it("writes name, version, licence and source address for each package", () => {
    const { text } = buildNotices(lock, read);
    expect(text).toContain("PACKAGE: alpha@1.0.0\n  Licence: MIT\n  Source: https://registry.example/alpha-1.0.0.tgz");
    expect(text).toContain("PACKAGE: beta@2.1.0");
    expect(text).toContain("Repository: git+https://example.test/beta.git");
    expect(text).not.toContain("devonly");
    expect(text).toContain("Production packages: 4");
  });

  it("writes each distinct licence text once, with every package that carries it", () => {
    const { text } = buildNotices(lock, read);
    expect(text.split("Permission is hereby granted.").length - 1).toBe(1);
    const block = text.slice(text.indexOf("LICENCE TEXT"));
    expect(block).toContain("alpha@1.0.0");
    expect(block).toContain("gamma@0.3.0");
  });

  it("includes the content of every NOTICE file", () => {
    const { text } = buildNotices(lock, read);
    expect(text).toContain("NOTICE: beta@2.1.0 (NOTICE)");
    expect(text).toContain("Beta product\nMade by Invented Author.");
  });

  it("gives a package with no licence file the standard Apache text, and says so", () => {
    const out = buildNotices(lock, read);
    expect(out.standIn).toEqual(["@scope/delta@4.0.0"]);
    expect(out.gaps).toEqual([]);
    expect(out.text).toContain("the package ships no licence file; the standard text of its licence is given below");
    expect(out.text.split("full invented terms").length - 1).toBe(1);
  });

  it("lists a package whose licence text cannot be found as a gap, and does not skip it", () => {
    const noApache = (folder: string) => (folder === "node_modules/beta" ? { licenseFiles: [], noticeFiles: [] } : read(folder));
    const out = buildNotices(lock, noApache);
    expect(out.gaps.sort()).toEqual(["@scope/delta@4.0.0", "beta@2.1.0"]);
    expect(out.text).toContain("PACKAGE: beta@2.1.0");
    expect(out.text).toContain("Licence text: not found in the installed package");
  });

  it("says when no package carries a NOTICE file", () => {
    const none = (folder: string) => ({ ...(read(folder) ?? { licenseFiles: [], noticeFiles: [] }), noticeFiles: [] });
    expect(buildNotices(lock, none).text).toContain("No production package carries a NOTICE file.");
  });

  it("reads from disk without the network: the reader only uses the file system", () => {
    const src = readFileSync("scripts/notices.ts", "utf8");
    expect(src).not.toMatch(/fetch\(|https?\.get|XMLHttpRequest|node:https?|node:net/);
    expect(readInstalledFrom("/nonexistent-folder")("node_modules/none")).toBeNull();
  });
});

describe("the committed notices file against the real lock", () => {
  const real = JSON.parse(readFileSync("package-lock.json", "utf8")) as Lock;
  const prod = productionPackages(real);

  it("exists", () => {
    expect(existsSync("THIRD-PARTY-NOTICES.txt")).toBe(true);
  });

  it("holds every production package of the lock, and the count equals the lock's", () => {
    const text = readFileSync("THIRD-PARTY-NOTICES.txt", "utf8");
    const listed = text.split("\n").filter((l) => l.startsWith("PACKAGE: ")).map((l) => l.slice("PACKAGE: ".length));
    expect(listed.length).toBe(prod.length);
    const missing = prod.map((p) => `${p.name}@${p.version}`).filter((n) => !listed.includes(n));
    expect(missing).toEqual([]);
    expect(text).toContain(`Production packages: ${prod.length}`);
  });

  it("holds no package that is only for development", () => {
    const text = readFileSync("THIRD-PARTY-NOTICES.txt", "utf8");
    for (const [key, p] of Object.entries(real.packages)) {
      if (key === "" || p.dev !== true) continue;
      expect(text, key).not.toContain(`PACKAGE: ${packageName(key)}@${p.version}\n`);
    }
  });

  it("holds the content of every NOTICE file a production package carries", () => {
    const text = readFileSync("THIRD-PARTY-NOTICES.txt", "utf8");
    const reader = readInstalledFrom(process.cwd());
    for (const p of prod) {
      for (const n of reader(p.folder)?.noticeFiles ?? []) expect(text, p.folder).toContain(n.text.replace(/\r\n/g, "\n").trim());
    }
  });

  it("is up to date: building it again gives the same text", () => {
    const again = buildNotices(real, readInstalledFrom(process.cwd())).text;
    expect(readFileSync("THIRD-PARTY-NOTICES.txt", "utf8").trimEnd()).toBe(again.trimEnd());
  });

  it("has no real project values and no emoji", () => {
    const text = readFileSync("THIRD-PARTY-NOTICES.txt", "utf8");
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
