"use strict";

const { version } = require("../package.json");

const tag = String(process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || "").trim();
const stableTag = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

if (!stableTag.test(tag)) {
  console.error(`Некорректный release tag: ${tag || "<не задан>"}. Ожидается стабильный SemVer вида v3.0.0.`);
  process.exitCode = 1;
} else if (tag !== `v${version}`) {
  console.error(`Release tag ${tag} не совпадает с package.json version ${version}.`);
  process.exitCode = 1;
} else {
  console.log(`Release tag OK: ${tag}`);
}
