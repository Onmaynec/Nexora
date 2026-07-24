# Nexora Security Verification Summary

**Дата документа:** 24 июля 2026  
**Текущая версия:** `3.3.4`  
**Канал:** release candidate; signed when policy exists, otherwise explicit `UNSIGNED-TEST` prerelease  
**Signed production baseline:** `3.1.2`

## 1. Область

Документ суммирует automated security, architecture и reliability verification Nexora 3.3.4 Post-MLS Baseline. Он не является independent penetration test, cryptographic certification, supply-chain audit или production approval.

Авторитетные материалы:

- [Security Review 3.3.4](SECURITY_REVIEW_3.3.4.md);
- [Release Verification 3.3.4](docs/releases/3.3.4/RELEASE_VERIFICATION.md);
- [Release Notes 3.3.4](docs/releases/3.3.4/RELEASE_NOTES.md);
- [Security Model](docs/SECURITY_MODEL.md);
- [Release Checklist](docs/RELEASE_CHECKLIST.md).

## 2. Версионная база

| Параметр | Значение |
|---|---|
| Version | `3.3.4` |
| Application API | v3 |
| Writable messaging | ordinary server-readable messaging |
| Trust/MLS runtime | retired |
| Legacy secure history | read-only compatibility layer |
| Local Server database | SQLite schema 8 |
| Stable signed Windows approval | не предоставлен для prerequisite release |

## 3. Post-MLS security boundary

- executable Trust Core, MLS recovery/transport, Trust routes and encrypted-upload write runtime are removed;
- `ts-mls` is absent from package and lockfile;
- schema 8 retains legacy IDs, epochs, timestamps, ciphertext and audit provenance;
- retained ciphertext is never converted into server-readable plaintext;
- legacy export records `serverDecrypted: false`;
- Trust/E2EE HTTP mutations return `410/LEGACY_READ_ONLY`;
- MLS Socket.IO mutations return terminal `LEGACY_READ_ONLY` acknowledgements;
- legacy UI contains no composer, upload, record, edit or delete actions;
- ordinary conversations no longer depend on local MLS state and cannot be blocked by corrupt/missing MLS data.

## 4. Authentication, authorization and sessions

Проверяемая реализация включает:

- secure session cookie, exact Origin and CSRF validation;
- server-side resource existence, membership, role, permission, ban and room-policy checks;
- active-ban precedence over stale membership;
- immediate REST/realtime access loss after removal, ban or session revocation;
- session-owned device ID, name, platform, Client version, creation and last-seen timestamps;
- targeted remote session revoke;
- immediate `session.revoked` event and Socket.IO disconnect;
- `device.updated` refresh;
- current-device remote revoke rejection with `STATE_CONFLICT`;
- stable request correlation through `X-Request-ID` and response `requestId`.

## 5. Stable errors

Expected failures are separated by stable code and safe message, including:

- `AUTH_REQUIRED`;
- `FORBIDDEN`;
- `RESOURCE_NOT_FOUND`;
- `VALIDATION_FAILED`;
- `STATE_CONFLICT`;
- `RATE_LIMITED` with `Retry-After`;
- `LEGACY_READ_ONLY`;
- `BACKUP_INTEGRITY_FAILED`;
- `UPDATE_SIGNATURE_INVALID`;
- `TEMPORARY_UNAVAILABLE`.

Stack traces, SQL, tokens, cookies, passwords, certificate material and private payloads are not exposed through the public error envelope.

## 6. Uploads and media

- authorization and room restrictions are checked server-side on every upload/action;
- size, actual MIME type, safe filename, hash and quota controls remain active;
- dangerous/executable content is rejected;
- temporary data is removed after failed or cancelled operations;
- corrupt images fail safely;
- microphone denial/unsupported format paths do not crash the Client;
- ordinary voice messages retain recording, cancellation, preview, send, amplitude and playback behavior;
- retired encrypted-upload routes cannot reserve, upload or claim new data.

## 7. Backup, restore and migration reliability

- source database integrity and WAL checkpoint are checked before migration-sensitive operations;
- free-space failure occurs before mutation;
- backup verification is available without replacing live DB/files;
- selected backup IDs are allowlisted against the controlled backup directory;
- encrypted temporary material is removed after success and failure;
- restore replacement failure rolls back database and files;
- future schema versions fail before mutation;
- schema 8 compatibility migration remains idempotent;
- fault-injection tests cover disk-full and replacement failure paths.

## 8. Updater and release integrity

- Client and Server use separate update channels (`latest` and `server`);
- downgrade and prerelease upgrade consumption are disabled;
- signature/checksum failures map to `UPDATE_SIGNATURE_INVALID`;
- partial signing configuration is rejected;
- complete signing policy verifies expected Authenticode subject, thumbprint and timestamp;
- without signing credentials, `v3.3.4` is an explicit `UNSIGNED-TEST` prerelease;
- unsigned publication forbids `latest.yml`, `server.yml` and blockmaps;
- source, PWA, Android, SPDX SBOM, release evidence and SHA-256 checksums are produced;
- published assets are re-downloaded and verified;
- official tag is immutable.

## 9. Electron, Android and browser boundaries

- renderer Node integration, arbitrary shell execution and remote debugging remain disabled;
- Server console executes only registered commands;
- Client/Server profiles remain isolated by Server identity/certificate context;
- Android rejects cleartext, mixed content and TLS errors;
- deep links accept valid HTTPS only;
- Service Worker/offline cache must not bypass authorization or cache API/Socket.IO traffic as public content.

## 10. Verification gates

Required final release-commit evidence:

```bash
npm ci
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Дополнительно обязательны focused 3.3 regressions, introductory/advanced website validation, installed Windows package smoke and post-publication asset verification.

## 11. Residual risks and deferred 3.4.0 gates

- Local Server cannot decrypt retained legacy ciphertext;
- readable historical plaintext depends on a pre-existing local Client cache;
- Client/OS/browser compromise can expose plaintext during authorized use;
- public deployment depends on external TLS proxy, firewall, monitoring and DDoS controls;
- Android/PWA production promotion requires physical/installed runtime evidence;
- automated verification does not replace independent application-security review;
- Authenticode-backed stable Windows promotion, independent review and signed 3.3.4 → 3.4.0 acceptance remain mandatory Nexora 3.4.0 gates.

Evidence другой revision не является release evidence. До merge, post-merge CI, annotated tag, GitHub Release и re-download smoke версия 3.3.4 остаётся release candidate.
