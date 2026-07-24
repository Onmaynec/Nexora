"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const changelogPath = path.join(root, "CHANGELOG.md");
const source = fs.readFileSync(changelogPath, "utf8");
const heading = "## [3.3.4] - Unreleased";

if (source.includes(heading)) {
  throw new Error("Nexora 3.3.4 changelog entry already exists; refusing duplicate insertion.");
}

const anchor = "## [3.3.3] - 2026-07-23";
if (!source.includes(anchor)) throw new Error("Unable to locate the 3.3.3 changelog anchor.");

const entry = `${heading}\n\n### Changed\n- Ordinary server-readable messaging is now the sole writable messaging core; Client bootstrap and ordinary chats no longer depend on Trust enrollment, MLS epochs or Welcome recovery.\n- Executable Trust/MLS routes, recovery workers, Socket.IO transport, encrypted-upload write paths, Client MLS engine and the \`ts-mls\` dependency are removed.\n- SQLite schema 8 remains an idempotent compatibility layer preserving legacy conversation IDs, epochs, timestamps, ciphertext and audit provenance without plaintext conversion.\n\n### Added\n- Dedicated immutable legacy-history viewer and export endpoints with \`serverDecrypted: false\`.\n- Session-derived device inventory, targeted remote session revocation and immediate realtime disconnect through \`session.revoked\`.\n- Non-restoring backup verification and stable request-correlated error envelopes.\n- Official \`v3.3.4\` release pipeline supporting verified signed assets or explicit \`UNSIGNED-TEST\` prerelease assets without updater metadata.\n\n### Security\n- Legacy Trust/E2EE HTTP writes and MLS Socket.IO mutations terminate with \`410/LEGACY_READ_ONLY\`.\n- Current-device remote revocation fails with \`STATE_CONFLICT\`; revoked sessions are removed and disconnected immediately.\n- Client/Server updater channels reject downgrade and signature/checksum failures; complete signing policy validates subject, thumbprint and timestamp.\n- Unsigned publication forbids \`latest.yml\`, \`server.yml\` and blockmaps.\n\n### Fixed\n- Removed dangling Client imports and stale runtime contracts after post-MLS retirement.\n- Updated introductory and advanced documentation, website content, focused regressions and release metadata to the 3.3.4 post-MLS boundary.\n\n### Compatibility\n- Supported upgrade path is published Nexora \`3.3.3\` → \`3.3.4\`.\n- Application API v3 and ordinary room/message contracts remain available.\n- No schema version bump is introduced; future schemas still fail before mutation.\n- Independent review and signed Windows 3.3.4→3.4.0 acceptance remain Nexora 3.4.0 gates.\n\n`;

fs.writeFileSync(changelogPath, source.replace(anchor, `${entry}${anchor}`), "utf8");
fs.rmSync(__filename, { force: true });
console.log("Inserted canonical Nexora 3.3.4 changelog entry.");
