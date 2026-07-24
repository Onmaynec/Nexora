# Nexora 3.4.0 Security Verification Summary

**Дата документа:** 24 июля 2026  
**Текущая версия:** `3.4.0`  
**Классификация:** Stable Core release candidate  
**Официальная публикация:** blocked until all stable gates complete  
**Signed production baseline:** `3.1.2`

## 1. Область

Документ суммирует automated security, architecture and reliability verification Nexora 3.4.0 Stable Core. Он не является independent penetration test, cryptographic certification, supply-chain audit или production approval.

Авторитетные материалы:

- [Security Review 3.4.0](SECURITY_REVIEW_3.4.0.md);
- [Release Verification 3.4.0](docs/releases/3.4.0/RELEASE_VERIFICATION.md);
- [Release Notes 3.4.0](docs/releases/3.4.0/RELEASE_NOTES.md);
- [Security Model](docs/SECURITY_MODEL.md);
- [Release Checklist](docs/RELEASE_CHECKLIST.md).

## 2. Версионная база

| Параметр | Значение |
|---|---|
| Version | `3.4.0` |
| Application API | v3 |
| Writable messaging | ordinary server-readable messaging |
| Trust/MLS runtime | retired |
| Legacy secure history | read-only compatibility layer |
| Local Server database | SQLite schema 8 |
| Upgrade prerequisite | published verified `v3.3.4` |
| Stable signed Windows approval | blocked pending external evidence |

## 3. Stable Core security boundary

- executable Trust Core, MLS recovery/transport, Trust routes and encrypted-upload write runtime are removed;
- `ts-mls` is absent from package and lockfile;
- schema 8 retains legacy IDs, epochs, timestamps, ciphertext and audit provenance;
- retained ciphertext is never converted into server-readable plaintext;
- legacy export records `serverDecrypted: false`;
- Trust/E2EE HTTP mutations return `410/LEGACY_READ_ONLY`;
- MLS Socket.IO mutations return terminal `LEGACY_READ_ONLY` acknowledgements;
- legacy UI contains no composer, upload, record, edit or delete actions;
- ordinary conversations do not depend on local MLS state.

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
- size, actual MIME type, safe filename, chunk/file hashes and quota controls remain active;
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
- official `v3.4.0` requires complete Authenticode identity/timestamp verification;
- official stable workflow has no unsigned fallback path;
- baseline `v3.3.4` assets/checksums are verified before packaging;
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

## 10. Automated verification gates

Required release-commit commands:

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

Focused regressions and both website pipelines are also mandatory.

## 11. External stable blockers

Machine-readable blockers are stored in:

- `release-evidence/independent-security-review-3.4.0.json`;
- `release-evidence/windows-acceptance-3.4.0.json`;
- `release-evidence/current.json`.

Official merge/tag/release remains blocked until:

1. immutable published `v3.3.4` tag/release/assets exist;
2. complete Authenticode signing policy is available;
3. real Windows 10 and Windows 11 installed `3.3.4 → 3.4.0` acceptance passes;
4. independent security review approves the reviewed ancestor commit;
5. unresolved high and critical findings equal zero;
6. final CI, release evidence and post-publication smoke pass.

## 12. Residual risks

- Local Server cannot decrypt retained legacy ciphertext;
- readable historical plaintext depends on a pre-existing local Client cache;
- Client/OS/browser compromise can expose plaintext during authorized use;
- public deployment depends on external TLS proxy, firewall, monitoring and DDoS controls;
- Android/PWA production promotion requires physical/installed runtime evidence;
- automated verification does not replace independent review.

До завершения external evidence этот документ подтверждает только проверенный release-candidate source, а не опубликованный stable `v3.4.0`.
