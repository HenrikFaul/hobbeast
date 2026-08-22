#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const lockfile = readFileSync(resolve(root, "bun.lock"));
const lockfileText = lockfile.toString("utf8");
const outputDirectory = resolve(root, "artifacts");
const outputPath = resolve(outputDirectory, "hobbeast-sbom.cdx.json");
const commitSha = process.env.GITHUB_SHA || process.env.BUILD_COMMIT_SHA || "local-uncommitted";
const buildTimestamp = process.env.BUILD_TIMESTAMP || new Date().toISOString();

const components = Object.entries({
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {}),
})
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name]) => resolvedComponent(name, Boolean(packageJson.dependencies?.[name])));

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${cryptoRandomUuid(commitSha, buildTimestamp)}`,
  version: 1,
  metadata: {
    timestamp: buildTimestamp,
    component: {
      type: "application",
      name: packageJson.name,
      version: packageJson.version,
      properties: [
        { name: "hobbeast:commit-sha", value: commitSha },
        {
          name: "hobbeast:bun-lock-sha256",
          value: createHash("sha256").update(lockfile).digest("hex"),
        },
      ],
    },
    tools: [{ vendor: "Hobbeast", name: "dependency-manifest-sbom", version: "1" }],
  },
  components,
};

mkdirSync(outputDirectory, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(sbom, null, 2)}\n`, "utf8");
console.log(`Generated CycloneDX SBOM: ${outputPath}`);

function cryptoRandomUuid(...seedParts) {
  const digest = createHash("sha256").update(seedParts.join(":"), "utf8").digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function resolvedComponent(name, runtimeDependency) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const packageLine = lockfileText.match(
    new RegExp(`^\\s*"${escapedName}": \\["([^"]+)"[^\\r\\n]*"(sha(?:256|384|512)-[A-Za-z0-9+/=]+)"\\],?\\s*$`, "m"),
  );
  if (!packageLine) throw new Error(`Cannot resolve ${name} and its integrity from bun.lock`);
  const locator = packageLine[1];
  const version = locator.slice(name.length + 1);
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error(`Invalid resolved version for ${name}: ${locator}`);
  const [algorithm, encodedDigest] = packageLine[2].split("-", 2);
  const purlName = name.startsWith("@")
    ? `${encodeURIComponent(name.split("/")[0])}/${encodeURIComponent(name.split("/")[1])}`
    : encodeURIComponent(name);
  const purl = `pkg:npm/${purlName}@${version}`;
  const installedManifestPath = resolve(root, "node_modules", ...name.split("/"), "package.json");
  let license;
  if (existsSync(installedManifestPath)) {
    const installedManifest = JSON.parse(readFileSync(installedManifestPath, "utf8"));
    if (typeof installedManifest.license === "string" && /^[A-Za-z0-9-.+() ]{1,100}$/.test(installedManifest.license)) {
      license = installedManifest.license;
    }
  }
  return {
    type: "library",
    "bom-ref": purl,
    name,
    version,
    purl,
    scope: runtimeDependency ? "required" : "excluded",
    ...(license ? { licenses: [{ license: { name: license } }] } : {}),
    hashes: [{
      alg: algorithm.toUpperCase().replace("SHA", "SHA-"),
      content: Buffer.from(encodedDigest, "base64").toString("hex"),
    }],
  };
}
