#!/usr/bin/env node
// Fails when package.json:version does not match the latest released section
// heading in CHANGELOG.md (i.e. the first "## [X.Y.Z]" line, ignoring
// "[Unreleased]"). Also fails when either artifact is missing/malformed.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const pkgPath = resolve(root, "package.json");
const changelogPath = resolve(root, "CHANGELOG.md");
const gitMetadataPath = resolve(root, ".git");

function fail(message) {
  console.error(`\u2717 release:validate — ${message}`);
  process.exit(1);
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
} catch (err) {
  fail(`cannot read package.json (${err.message})`);
}

const pkgVersion = pkg.version;
if (!/^\d+\.\d+\.\d+/.test(pkgVersion || "")) {
  fail(`package.json version "${pkgVersion}" is not semver`);
}

let changelog;
try {
  changelog = readFileSync(changelogPath, "utf8");
} catch (err) {
  fail(`cannot read CHANGELOG.md (${err.message})`);
}

const headings = [...changelog.matchAll(/^##\s+\[([^\]]+)\]/gm)].map((m) => m[1]);
if (headings.length === 0) fail("no version headings found in CHANGELOG.md");

const released = headings.filter((h) => h.toLowerCase() !== "unreleased");
if (released.length === 0) fail("CHANGELOG.md has no released version section yet");

const latest = released[0];
if (latest !== pkgVersion) {
  fail(
    `package.json version (${pkgVersion}) does not match latest CHANGELOG.md heading ([${latest}])`,
  );
}

if (existsSync(gitMetadataPath)) {
  let envIsTracked = false;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", ".env"], {
      cwd: root,
      stdio: "ignore",
    });
    envIsTracked = true;
  } catch (err) {
    const status = typeof err === "object" && err !== null && "status" in err ? err.status : undefined;
    if (status !== 1) {
      fail("cannot prove whether .env is tracked because the Git index check failed");
    }
  }

  if (envIsTracked) {
    fail(".env is tracked by Git; rotate affected credentials and remove it through the approved incident-response flow");
  }
}

console.log(`\u2713 release:validate — package.json and CHANGELOG.md agree on ${pkgVersion}`);
