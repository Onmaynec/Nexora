"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch target not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let app = read("client/src/App.jsx");
app = replaceOnce(
  app,
  `import { useCallback, useEffect, useRef, useState } from "react";`,
  `import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";`,
  "React layout effect import",
);
app = replaceOnce(
  app,
  `  useEffect(() => {\n    const serverId = bootstrap?.server?.id;\n    if (!me?.id || !serverId || me.mustChangePassword) return undefined;\n    let cancelled = false;\n    configureTrust({ serverId, user: me });\n    setTrustState((current) => ({ ...current, status: "initializing", error: null }));\n    ensureTrustDevice()\n      .then((device) => {\n        if (!cancelled) setTrustState({ status: device.trustState === "verified" ? "ready" : "verification_required", device, error: null });\n      })\n      .catch((error) => {\n        if (!cancelled) setTrustState({ status: "error", device: null, error: error.code || error.message });\n      });\n    return () => { cancelled = true; };\n  }, [bootstrap?.server?.id, me?.id, me?.mustChangePassword]);`,
  `  useLayoutEffect(() => {\n    const serverId = bootstrap?.server?.id;\n    if (!me?.id || !serverId || me.mustChangePassword) return undefined;\n    configureTrust({ serverId, user: me });\n    return undefined;\n  }, [bootstrap?.server?.id, me?.id, me?.mustChangePassword]);\n\n  useEffect(() => {\n    const serverId = bootstrap?.server?.id;\n    if (!me?.id || !serverId || me.mustChangePassword) return undefined;\n    let cancelled = false;\n    setTrustState((current) => ({ ...current, status: "initializing", error: null }));\n    ensureTrustDevice()\n      .then((device) => {\n        if (!cancelled) setTrustState({ status: device.trustState === "verified" ? "ready" : "verification_required", device, error: null });\n      })\n      .catch((error) => {\n        if (!cancelled) setTrustState({ status: "error", device: null, error: error.code || error.message });\n      });\n    return () => { cancelled = true; };\n  }, [bootstrap?.server?.id, me?.id, me?.mustChangePassword]);`,
  "Trust lifecycle ordering",
);
write("client/src/App.jsx", app);

let trustClient = read("client/src/crypto/trust-client.js");
trustClient = replaceOnce(
  trustClient,
  `export function saveE2eeDraft(conversationId, text) {\n  return saveEncryptedDraft(current().serverId, current().userId, conversationId, text);\n}\n\nexport function loadE2eeDraft(conversationId) {\n  return loadEncryptedDraft(current().serverId, current().userId, conversationId);\n}`,
  `export function saveE2eeDraft(conversationId, text) {\n  if (!trustConfigured()) {\n    return Promise.reject(Object.assign(new Error("Trust Core ещё не настроен для этого пользователя."), { code: "TRUST_NOT_CONFIGURED" }));\n  }\n  const { serverId, userId } = current();\n  return saveEncryptedDraft(serverId, userId, conversationId, text);\n}\n\nexport function loadE2eeDraft(conversationId) {\n  if (!trustConfigured()) return Promise.resolve("");\n  const { serverId, userId } = current();\n  return loadEncryptedDraft(serverId, userId, conversationId);\n}`,
  "draft helper pre-configuration contract",
);
write("client/src/crypto/trust-client.js", trustClient);

const packageFile = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
if (packageJson.version !== "3.2.1") throw new Error(`Expected 3.2.1 before patch, got ${packageJson.version}`);
packageJson.version = "3.2.2";
fs.writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
require("./sync-release-metadata.cjs");

let changelog = read("CHANGELOG.md");
const changelogAnchor = "Формат основан на Keep a Changelog. Версии следуют Semantic Versioning.\n\n";
const changelogEntry = `## [3.2.2] — 2026-07-22\n\n### Fixed\n\n- устранён renderer crash \`TRUST_NOT_CONFIGURED\` при холодном входе в Web/PWA и Electron Client;\n- Trust scope теперь конфигурируется до запуска дочерних passive effects, читающих локальные E2EE-черновики;\n- чтение encrypted draft в коротком pre-configuration окне возвращает пустое состояние вместо синхронного исключения;\n- реальные ошибки Trust platform, регистрации устройства и IndexedDB по-прежнему отображаются явно.\n\n### Changed\n\n- версия Client, Server, Android metadata, package и lockfile синхронизирована как \`3.2.2\`;\n- schema 8, API v3 и Trust/MLS API v4 сохранены без миграции и breaking changes.\n\n### Tests\n\n- добавлена регрессия порядка parent layout effect / child passive effect при первичной Trust-настройке;\n- добавлен контракт безопасного чтения E2EE-черновиков до завершения Trust configuration.\n\n`;
if (!changelog.includes("## [3.2.2]")) {
  changelog = replaceOnce(changelog, changelogAnchor, `${changelogAnchor}${changelogEntry}`, "changelog anchor");
  write("CHANGELOG.md", changelog);
}

write("RELEASE_NOTES_3.2.2.md", `# Nexora 3.2.2\n\n## Исправлено\n\nNexora больше не переходит на экран \`CLIENT RECOVERY\` с ошибкой \`TRUST_NOT_CONFIGURED\` сразу после входа.\n\nПричиной была гонка React lifecycle: дочерний компонент начинал читать локальные E2EE-черновики раньше, чем родительский passive effect вызывал \`configureTrust()\`. Теперь Trust scope фиксируется в layout phase до дочерних passive effects. Чтение черновика дополнительно безопасно обрабатывает короткое окно до конфигурации.\n\n## Совместимость\n\n- Local Server schema: 8;\n- application API: v3;\n- Trust/MLS/encrypted-media API: v4;\n- миграция базы данных не требуется;\n- обновление совместимо с данными 3.2.0 и 3.2.1.\n\n## Безопасность\n\nИсправление не отключает Trust validation и не скрывает ошибки создания устройства, отсутствия WebCrypto/IndexedDB, отзыва ключей или регистрации. Только безопасное чтение локального черновика до готовности scope возвращает пустое значение.\n`);

console.log("Applied Nexora 3.2.2 Trust bootstrap race fix.");
