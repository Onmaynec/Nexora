"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const packageFile = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
packageJson.version = "3.2.0";
fs.writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`);

const sync = spawnSync(process.execPath, [path.join(__dirname, "sync-release-metadata.cjs")], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});
if (sync.status !== 0) process.exit(sync.status || 1);
const check = spawnSync(process.execPath, [path.join(__dirname, "sync-release-metadata.cjs"), "--check"], {
  cwd: root,
  stdio: "inherit",
  shell: false,
});
if (check.status !== 0) process.exit(check.status || 1);

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
fs.writeFileSync(path.join(root, ".github", "workflows", "ci.yml"), cleanCi);
fs.rmSync(__filename, { force: true });
