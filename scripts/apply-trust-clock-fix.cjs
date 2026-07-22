"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const trustCorePath = path.join(root, "server", "trust-core.cjs");
const ciPath = path.join(root, ".github", "workflows", "ci.yml");
const obsoleteDiagnosticPath = path.join(root, ".github", "workflows", "diagnose-3.2.0-unit.yml");

function replaceExact(source, before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${label}: expected exactly one matching source fragment.`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let source = fs.readFileSync(trustCorePath, "utf8");
source = replaceExact(
  source,
  `function nowIso(clock = Date) {\n  return new clock().toISOString();\n}`,
  `function clockDate(clock = Date) {\n  let value;\n  if (clock === Date) {\n    value = new Date();\n  } else if (typeof clock === "function") {\n    try { value = clock(); }\n    catch (callError) {\n      try { value = Reflect.construct(clock, []); }\n      catch { throw callError; }\n    }\n  } else {\n    value = clock;\n  }\n  const date = value instanceof Date ? value : new Date(value);\n  if (!Number.isFinite(date.getTime())) throw new TypeError("TrustCore clock must return a valid Date or timestamp.");\n  return date;\n}\n\nfunction nowIso(clock = Date) {\n  return clockDate(clock).toISOString();\n}`,
  "clock reader",
);
source = replaceExact(
  source,
  `const expiresAt = new this.clock(Date.parse(createdAt) + CHALLENGE_TTL_MS).toISOString();`,
  `const expiresAt = new Date(Date.parse(createdAt) + CHALLENGE_TTL_MS).toISOString();`,
  "challenge expiry",
);
source = replaceExact(
  source,
  `const expiresAt = new this.clock(String(item?.expiresAt || ""));`,
  `const expiresAt = new Date(String(item?.expiresAt || ""));`,
  "KeyPackage expiry parsing",
);
source = replaceExact(
  source,
  `const expiresAt = new this.clock(Date.parse(now) + WELCOME_TTL_MS).toISOString();`,
  `const expiresAt = new Date(Date.parse(now) + WELCOME_TTL_MS).toISOString();`,
  "Welcome expiry",
);
source = replaceExact(
  source,
  `const expiresAt = new this.clock(Date.parse(now) + REPLAY_TTL_MS).toISOString();`,
  `const expiresAt = new Date(Date.parse(now) + REPLAY_TTL_MS).toISOString();`,
  "replay expiry",
);
if (source.includes("new this.clock")) {
  throw new Error("Unsafe constructor-style Trust Core clock usage remains.");
}
fs.writeFileSync(trustCorePath, source);

const cleanCi = `name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  verify:
    runs-on: windows-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.16.0
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run test:unit
      - run: npm run audit:security

  linux-tests:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22.16.0
          cache: npm
      - run: npm ci
      - run: npm test

  android-source:
    runs-on: ubuntu-latest
    timeout-minutes: 25
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
      - uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: "8.13"
      - run: gradle -p android :app:assembleDebug --no-daemon
`;
fs.writeFileSync(ciPath, cleanCi);
fs.rmSync(obsoleteDiagnosticPath, { force: true });
fs.rmSync(__filename, { force: true });
