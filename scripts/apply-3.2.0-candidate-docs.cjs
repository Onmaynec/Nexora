"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function patch(relativePath, replacements) {
  const file = path.join(root, relativePath);
  let source = fs.readFileSync(file, "utf8");
  for (const { before, after, label } of replacements) {
    const first = source.indexOf(before);
    const second = first < 0 ? -1 : source.indexOf(before, first + before.length);
    if (first < 0 || second >= 0) throw new Error(`${relativePath}: expected exactly one ${label}`);
    source = source.slice(0, first) + after + source.slice(first + before.length);
  }
  fs.writeFileSync(file, source, "utf8");
}

patch("CHANGELOG.md", [
  {
    label: "3.2.0 release heading",
    before: "## [3.2.0] — Unreleased",
    after: "## [3.2.0] — 2026-07-22 (Source/PWA prerelease)",
  },
  {
    label: "realtime and soak additions",
    before: "- реальные REST/Socket.IO plaintext-downgrade и attachment transport regression tests;\n- migration/rollback, administrator/tester и Trust Core readiness documentation.",
    after: "- реальные REST/Socket.IO plaintext-downgrade и attachment transport regression tests;\n- device-scoped secure realtime: socket-to-device binding, verified MLS member rooms, targeted revoke disconnect и local Trust wipe;\n- schema 8 soak gate с повторными mutations, backup и SQLite integrity checks;\n- migration/rollback, administrator/tester и Trust Core readiness documentation.",
  },
  {
    label: "security audit scope",
    before: "- release security audit проверяет Trust challenge-response, non-extractable device keys, AES-GCM local wrapping, replay protection, plaintext guards и encrypted-media boundary.",
    after: "- release security audit проверяет Trust challenge-response, non-extractable device keys, AES-GCM local wrapping, socket-to-device binding, verified-device-only MLS delivery, targeted revoke disconnect, replay protection, plaintext guards и encrypted-media boundary.",
  },
  {
    label: "verified device delivery security",
    before: "- устройство должно быть active и verified для KeyPackage/Welcome/commit/ciphertext delivery;",
    after: "- устройство должно быть active и verified для KeyPackage/Welcome/commit/ciphertext delivery, а secure Socket.IO event отправляется только в его device-scoped room;\n- legacy, unverified и mismatched-device sockets не получают MLS ciphertext; отзыв доверия немедленно отключает целевой socket и инициирует локальную очистку Trust state;",
  },
  {
    label: "promotion blockers",
    before: "### Unreleased blockers\n\n- metadata minimization/traffic-analysis review;\n- расширенная multi-device concurrency/revoke/re-add/corruption matrix и runtime E2E;\n- load/soak и long-offline recovery;\n- signing-machine checks, финальный verification report и независимый cryptographic/application-security review.",
    after: "### Stable promotion blockers\n\n- metadata minimization/traffic-analysis review beyond the documented boundary;\n- расширенная simultaneous-commit/re-add/corrupted-state platform matrix и packaged runtime E2E;\n- longer-duration load/soak и extended offline field evidence;\n- Authenticode signing-machine checks и независимый cryptographic/application-security review.\n\nSource/PWA prerelease не содержит unsigned updater assets и не заявляется как stable или independently audited E2EE.",
  },
]);

patch("docs/TRUST_CORE_3.2.0.md", [
  {
    label: "readiness status",
    before: "This document covers the development branch `agent/nexora-3.2.0-trust-core-mls`. It is an implementation record and release-readiness checklist, not a security certification.",
    after: "This document covers the `3.2.0` source/PWA prerelease candidate on branch `agent/nexora-3.2.0-trust-core-mls`. It is an implementation and automated-verification record, not a security certification or stable signed-release approval.",
  },
  {
    label: "verified scope additions",
    before: "- ciphertext-only secure-message transport and persistence;\n- encrypted local MLS state, KeyPackages, decrypted cache and drafts;",
    after: "- ciphertext-only secure-message transport and persistence;\n- device-scoped Socket.IO binding and verified MLS-member-only ciphertext delivery;\n- immediate targeted disconnect plus client Trust-state wipe after revocation;\n- encrypted local MLS state, KeyPackages, decrypted cache and drafts;",
  },
  {
    label: "automated test scope",
    before: "- schema, Trust Core, recovery, plaintext-guard, media, store-queue and Alice/Bob interoperability tests.\n\nThe branch remains draft because the complete platform/runtime matrix, metadata/traffic-analysis review, load/soak, signing-machine checks and independent cryptographic review are not complete.",
    after: "- schema, Trust Core, recovery, plaintext-guard, media, store-queue, device-scoped realtime and Alice/Bob interoperability tests;\n- schema 8 soak with repeated mutations, backup creation and integrity checks.\n\nThe automated candidate is eligible for a clearly marked source/PWA prerelease. Stable promotion remains blocked by packaged/physical-device runtime evidence, signing-machine checks and independent cryptographic/application-security review.",
  },
  {
    label: "client boundary additions",
    before: "- complete local wipe after self-revocation;\n- attachment AES-256-GCM encryption/decryption and AAD binding;",
    after: "- complete local wipe after self-revocation or a remote revocation event targeting the current device;\n- Socket.IO authentication with the active Trust device ID and forced disconnect on Trust failure;\n- attachment AES-256-GCM encryption/decryption and AAD binding;",
  },
  {
    label: "server trust enforcement",
    before: "- replay hashes and expiration;\n- immediate delivery denial after device revocation.",
    after: "- replay hashes and expiration;\n- socket-to-device ownership and trust-state validation;\n- ciphertext emission only to active, verified MLS member device rooms;\n- immediate delivery denial and targeted Socket.IO disconnect after device revocation.",
  },
  {
    label: "revocation lifecycle",
    before: "6. Revocation uses a separate `revoke_device` challenge and immediately removes delivery rights.",
    after: "6. Revocation uses a separate `revoke_device` challenge, removes group delivery rights, disconnects the targeted socket and causes the affected client to clear its local Trust scope.",
  },
  {
    label: "application delivery lifecycle",
    before: "- Local Server validates account/device/conversation/group/epoch and replay state without decryption;\n- recipients decrypt only after group-state and authenticated-data checks;",
    after: "- Local Server validates account/device/conversation/group/epoch and replay state without decryption;\n- the sending socket must be bound to the same active verified device named by the MLS envelope;\n- ciphertext is emitted only to active verified devices in the current MLS group;\n- recipients decrypt only after group-state and authenticated-data checks;",
  },
  {
    label: "remaining blockers",
    before: "- metadata minimization and traffic-analysis review;\n- multi-device concurrency, simultaneous commits, removal/re-add and corrupted-state matrix;\n- browser/Electron/Android runtime integration tests beyond source/production build;\n- load/soak and long-offline recovery testing;\n- final signing-machine release checks and verification report;\n- independent cryptographic and application-security review.",
    after: "- metadata minimization and traffic-analysis review beyond the documented boundary;\n- broader simultaneous-commit, re-add and corrupted local-state platform matrix;\n- packaged Electron, installed PWA and physical Android runtime integration;\n- longer-duration load/soak and extended offline field evidence;\n- final Authenticode signing-machine release checks;\n- independent cryptographic and application-security review.",
  },
  {
    label: "required gates soak",
    before: "- Linux full test suite;\n- Android `assembleDebug` and release-source validation;",
    after: "- Linux full test suite;\n- schema 8 soak with repeated writes, backups and integrity checks;\n- Android `assembleDebug` and release-source validation;",
  },
]);

patch("ADMIN_GUIDE_3.2.0.md", [
  {
    label: "administrator title",
    before: "# Nexora 3.2.0 Administrator Guide — Development",
    after: "# Nexora 3.2.0 Administrator Guide — Source/PWA Prerelease",
  },
  {
    label: "administrator warning",
    before: "> This guide applies only to PR #12 / `agent/nexora-3.2.0-trust-core-mls`. Stable production administration remains documented in [ADMIN_GUIDE.md](ADMIN_GUIDE.md). Do not deploy this branch for real private conversations before the remaining release blockers and external review are closed.",
    after: "> This guide applies to the controlled-testing 3.2.0 source/PWA prerelease candidate from PR #12. Stable signed production administration remains documented in [ADMIN_GUIDE.md](ADMIN_GUIDE.md). Do not use this candidate for high-risk private communications or represent it as independently audited E2EE.",
  },
  {
    label: "administrator scope",
    before: "- MLS secure-message delivery;\n- ciphertext-only persistence for secure messages;",
    after: "- MLS secure-message delivery bound to active verified Trust devices;\n- device-scoped Socket.IO ciphertext delivery and immediate revoke disconnect;\n- ciphertext-only persistence for secure messages;",
  },
  {
    label: "administrator status",
    before: "The branch is still development-only. It does not claim metadata confidentiality, traffic-analysis resistance or independent cryptographic review.",
    after: "The candidate passed automated build/test/security/soak gates and may be used for controlled source/PWA testing. It does not claim metadata confidentiality, traffic-analysis resistance, signed Windows distribution or independent cryptographic review.",
  },
  {
    label: "revocation operations",
    before: "- removes it from active group delivery;\n- blocks new KeyPackage/Welcome/commit/ciphertext access;\n- records a Trust audit entry.",
    after: "- removes it from active group delivery;\n- blocks new KeyPackage/Welcome/commit/ciphertext access;\n- emits a targeted revocation event and disconnects every socket bound to that device;\n- causes the affected client to clear local Trust keys, MLS state, cache and drafts;\n- records a Trust audit entry.",
  },
  {
    label: "secure socket behavior",
    before: "- the server stores encrypted message envelopes only;\n- previews use a neutral protected-message label;",
    after: "- the server stores encrypted message envelopes only;\n- the secure socket must present the same active verified `deviceId` used by the MLS envelope;\n- ciphertext events go only to active verified device rooms for current MLS members;\n- previews use a neutral protected-message label;",
  },
  {
    label: "monitoring signals",
    before: "- revoked-device access attempts;\n- repeated lost-state or Welcome-pending errors;",
    after: "- revoked-device access attempts;\n- `TRUST_SOCKET_DEVICE_MISMATCH`, `TRUST_DEVICE_UNVERIFIED` or repeated secure-socket reconnect failures;\n- target sockets that remain connected after revocation;\n- repeated lost-state or Welcome-pending errors;",
  },
]);

patch("TESTER_GUIDE_3.2.0.md", [
  {
    label: "tester title",
    before: "# Nexora 3.2.0 Trust/MLS Tester Guide — Development",
    after: "# Nexora 3.2.0 Trust/MLS Tester Guide — Source/PWA Prerelease",
  },
  {
    label: "tester warning",
    before: "> Test only disposable installations and accounts. This branch is not an independently audited stable release. Stable testing remains documented in [TESTER_GUIDE.md](TESTER_GUIDE.md).",
    after: "> Test only disposable installations and accounts. This source/PWA prerelease candidate passed automated gates but is not a signed or independently audited stable release. Stable testing remains documented in [TESTER_GUIDE.md](TESTER_GUIDE.md).",
  },
  {
    label: "tester matrix soak",
    before: "- schema 7 fixture upgraded to schema 8;\n- Pulse sandbox and production-mode-disabled sandbox checks.",
    after: "- schema 7 fixture upgraded to schema 8;\n- schema 8 soak run with repeated writes, backups and integrity checks;\n- Pulse sandbox and production-mode-disabled sandbox checks.",
  },
  {
    label: "revoke other device test",
    before: "1. Revoke A2 from A1.\n2. Confirm A2 status revoked.\n3. On A2 attempt KeyPackage upload/claim, Welcome, commits and ciphertext delivery.\n\nExpected: all secure operations denied immediately.",
    after: "1. Connect A1 and A2 concurrently and confirm both socket sessions are visible.\n2. Revoke A2 from A1.\n3. Confirm A2 receives the revocation event and its socket disconnects immediately.\n4. Confirm A1 and unrelated devices remain connected.\n5. On A2 attempt KeyPackage upload/claim, Welcome, commits and ciphertext delivery.\n\nExpected: all secure operations are denied immediately, only the targeted socket is disconnected, and A2 removes its local Trust/MLS state.",
  },
  {
    label: "self revoke expected state",
    before: "Expected: wrapping key, device record, KeyPackages, group state, decrypted cache and drafts are removed; session logs out.\n\n## 5. Alice/Bob MLS lifecycle",
    after: "Expected: wrapping key, device record, KeyPackages, group state, decrypted cache and drafts are removed; secure socket disconnects and the session logs out.\n\n### 4.6 Device-scoped realtime isolation\n\n1. Connect three sessions for the same account: verified A1, unverified A2 and a legacy socket without `deviceId`.\n2. Make both A1 and A2 visible in an MLS membership fixture.\n3. Send a secure message from A1.\n4. Attempt secure sends from the legacy socket, A2 and A1 while naming A2 in the envelope.\n\nExpected:\n\n- only A1 receives `message:new`;\n- A2 and the legacy socket receive no ciphertext;\n- all three invalid sends return `TRUST_SOCKET_DEVICE_MISMATCH`;\n- account-wide user rooms are not used for MLS ciphertext delivery.\n\n## 5. Alice/Bob MLS lifecycle",
  },
]);
