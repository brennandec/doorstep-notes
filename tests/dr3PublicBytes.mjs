// D-R3: public-repository bytes. Node builtins only. Run from the repo root.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const pin = "b60da1ec9b2eafff3d41f890a107543b87bc2f5d322a6ca8cd2a1e7c6ed0fb48";
const noticePin = "cd0bd461d400c5df618cd51bef38f8fa4e1c8c7c58ea90ab3425aae3ed16f10c";
const secret = /AIza[0-9A-Za-z_-]{20,}|BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|xox[baprs]-|ghp_[A-Za-z0-9]{20,}/g;

const fail = (message) => {
  process.stderr.write(`DR3_FAIL ${message}\n`);
  process.exit(1);
};

const license = readFileSync(join(root, "LICENSE"));
if (license.length !== 1079) fail(`LICENSE bytes ${license.length}`);
const hash = createHash("sha256").update(license).digest("hex");
if (hash !== pin) fail(`LICENSE sha256 ${hash}`);

const notice = readFileSync(join(root, "NOTICE.md"));
if (notice.length !== 283) fail(`NOTICE bytes ${notice.length}`);
const noticeHash = createHash("sha256").update(notice).digest("hex");
if (noticeHash !== noticePin) fail(`NOTICE sha256 ${noticeHash}`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
if (pkg.license !== "MIT") fail(`package license ${pkg.license}`);

for (const banned of ["firebase.config.local.json", "dist", "dist-e2e", "node_modules", ".env"]) {
  if (existsSync(join(root, banned))) fail(`present ${banned}`);
}

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
};
walk(root);

const hits = [];
for (const path of files) {
  const text = readFileSync(path).toString("latin1");
  const found = text.match(secret);
  if (found) hits.push(`${relative(root, path)} ${found.length}`);
}
if (hits.length) fail(hits.join("; "));

// Markers are assembled so this file does not contain the string it rejects.
const homeMarks = [`/${"Users"}/`, `/${"home"}/`, `${"\\"}Users${"\\"}`];
const homeHits = [];
for (const path of files) {
  const text = readFileSync(path).toString("latin1");
  let n = 0;
  for (const mark of homeMarks) {
    let from = 0;
    while (from <= text.length) {
      const at = text.indexOf(mark, from);
      if (at < 0) break;
      n += 1;
      from = at + mark.length;
    }
  }
  if (n) homeHits.push(`${relative(root, path)} ${n}`);
}
if (homeHits.length) fail(`home-directory ${homeHits.join("; ")}`);

const must = (rel, needles) => {
  const text = readFileSync(join(root, rel), "utf8");
  for (const needle of needles) {
    if (!text.includes(needle)) fail(`${rel} missing ${needle}`);
  }
};
must("src/firebase/deviceApp.ts", ['import("firebase/ai")', "ai.getAI(app, { backend: new ai.GoogleAIBackend() })"]);
must("src/firebase/cloudService.ts", ['import("firebase/ai")', "ai.getAI(", "ai.getGenerativeModel("]);
must("src/firebase/deviceInit.ts", ["getGenerativeModel", "InferenceMode.ONLY_ON_DEVICE"]);
must("src/inference/source.ts", ['from "firebase/ai"']);
must("src/firebase/structureSdk.ts", ["getGenerativeModel("]);
must("src/firebase/draftSdk.ts", ["getGenerativeModel("]);
must("src/firebase/proposeSdk.ts", ["getGenerativeModel("]);
must("src/firebase/rewriteSdk.ts", ["getGenerativeModel("]);

const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
const tracked = git(["ls-files"]).split("\n").filter(Boolean);
if (tracked.length !== files.length) fail(`tracked ${tracked.length} files ${files.length}`);
const count = git(["rev-list", "--count", "HEAD"]);
if (count !== "1") fail(`history ${count}`);
const remotes = git(["remote"]);
if (remotes !== "") fail(`remote ${remotes}`);
const author = git(["log", "-1", "--format=%an"]);
const email = git(["log", "-1", "--format=%ae"]);
const committer = git(["log", "-1", "--format=%cn"]);
const committerEmail = git(["log", "-1", "--format=%ce"]);
if (author !== "Brennan William DeCrow" || email !== "dogfoodarchitect@users.noreply.github.com") fail("commit identity");
if (committer !== author || committerEmail !== email) fail("committer identity");

process.stdout.write(`DR3_OK files=${files.length} secrets=0 home=0 license=${hash} bytes=${license.length} notice=${noticeHash} history=1 remotes=0\n`);
