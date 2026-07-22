"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const settingsPath = path.join(root, "client", "src", "components", "SettingsPage.jsx");
const workspacePath = path.join(root, "client", "src", "components", "Workspace.jsx");
const ciPath = path.join(root, ".github", "workflows", "ci.yml");

function replaceExact(source, before, after, label) {
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) throw new Error(`${label}: expected exactly one source fragment.`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let settings = fs.readFileSync(settingsPath, "utf8");
settings = replaceExact(
  settings,
  `import { Avatar } from "./ui";`,
  `import TrustDevicesCard from "./TrustDevicesCard";\nimport { Avatar } from "./ui";`,
  "SettingsPage TrustDevicesCard import",
);
settings = replaceExact(
  settings,
  `export default function SettingsPage({ me, blocked, version, server, preferences, passwordPolicy, onMeChanged, onOpenProfile, onUnblock, onLogout, showToast }) {`,
  `export default function SettingsPage({ me, blocked, version, server, preferences, passwordPolicy, trustState, onMeChanged, onOpenProfile, onUnblock, onLogout, showToast }) {`,
  "SettingsPage trustState prop",
);
settings = replaceExact(
  settings,
  `        <section className="settings-card sessions-card">`,
  `        <TrustDevicesCard serverId={server?.id} userId={me.id} trustState={trustState} onLogout={onLogout} showToast={showToast} />\n\n        <section className="settings-card sessions-card">`,
  "TrustDevicesCard placement",
);
fs.writeFileSync(settingsPath, settings);

let workspace = fs.readFileSync(workspacePath, "utf8");
workspace = replaceExact(
  workspace,
  `{section === "settings" && <AccountSettingsPage me={me} blocked={bootstrap.blocked} version={bootstrap.version} server={bootstrap.server} preferences={bootstrap.preferences} passwordPolicy={bootstrap.passwordPolicy}`,
  `{section === "settings" && <AccountSettingsPage me={me} blocked={bootstrap.blocked} version={bootstrap.version} server={bootstrap.server} preferences={bootstrap.preferences} passwordPolicy={bootstrap.passwordPolicy} trustState={trustState}`,
  "Workspace Trust settings prop",
);
fs.writeFileSync(workspacePath, workspace);

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
fs.rmSync(__filename, { force: true });
