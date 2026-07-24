# Nexora Security Verification Summary

**Дата документа:** 23 июля 2026
**Текущая версия:** `3.3.2`
**Канал:** Published `UNSIGNED-TEST` prerelease
**Signed production baseline:** `3.1.2`

## 1. Область

Документ суммирует automated security и architecture verification текущего `main`. Он не является independent penetration test, cryptographic certification, supply-chain audit или production approval.

Авторитетные материалы:

- [Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md) — security boundary, unchanged by 3.3.2;
- [Release Verification 3.3.2](RELEASE_VERIFICATION_3.3.3.md);
- [Release Notes 3.3.2](RELEASE_NOTES_3.3.3.md);
- [Security Review 3.2.3](SECURITY_REVIEW_3.2.3.md);
- [Security Model](docs/SECURITY_MODEL.md).

## 2. Версионная база

| Параметр | Значение |
|---|---|
| Version | `3.3.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |
| Local Server migration from 3.2.0–3.3.1 | не требуется |
| Stable signed Windows approval | не предоставлен |

## 3. Release evidence

Для 3.3.2 обязательны стандартные Windows/Linux/release/soak/Android gates, version-consistency regression и post-publication asset smoke. Конкретные run IDs и digests записываются в `release-evidence/v3.3.2.json` и `release-evidence/post-release-main-gate.json`.

Проверены:

| Gate | Result |
|---|---|
| Windows `npm run check` | PASS |
| Windows `npm run test:unit` | PASS |
| Windows `npm run test:performance` | PASS |
| Windows `npm run audit:security` | PASS |
| Linux `npm test` | PASS |
| `npm run release:check` | PASS |
| Schema 8 soak | PASS |
| Android `assembleDebug` | PASS |

Acceptance contract, consistency gate и asset smoke описаны в [Release Verification 3.3.2](RELEASE_VERIFICATION_3.3.3.md). Выпуск 3.3.2 не расширяет security boundary и не изменяет runtime authorization, Trust/MLS или storage behavior.

## 4. Application security

Проверяемая реализация включает:

- secure session cookie, Origin и CSRF validation;
- persistent login limits/lock;
- local TOTP и one-time recovery codes;
- server-side roles, bans, restrictions и room-policy checks;
- immediate REST/realtime access loss после removal или ban;
- SQLite WAL/FULL, transactional mutation и integrity checks;
- schema 7 → 8 migration, backup и downgrade protection;
- upload size/hash/actual-MIME validation;
- bot token hashing/scopes/expiry;
- webhook HTTPS, destination validation, SSRF и HMAC controls;
- protected metrics, request IDs и recursive credential redaction;
- audited developer-command allowlist без shell/eval;
- Electron context/session isolation и certificate pinning;
- Android cleartext/mixed-content/TLS-error rejection.

## 5. Trust/MLS hardening inherited from 3.2.3

- exact MLS BasicCredential binding к `{ userId, deviceId }`;
- distinct Ed25519 identity и MLS signature keys;
- maximum 16 active devices per user;
- KeyPackage limits 25/request, 32/device и 256/user;
- atomic inventory enforcement;
- bounded Trust/recovery/E2EE rate limiting;
- stable `429 RATE_LIMITED` и `Retry-After`;
- action-specific primitive Trust audit allowlists;
- active-ban fail-closed behavior;
- strict recovery scope, epoch, hash и public-state validation;
- startup/hourly expired security-state cleanup.

## 6. Historical 3.2.4 patch verification

### Client updater

- packaged Client defaults to official GitHub Releases provider;
- custom feed requires explicit HTTPS configuration;
- downgrade и prerelease update channels disabled;
- code-signature verification retained;
- manual/automatic lifecycle exposes terminal states and stable errors;
- unsigned `.exe`, `.blockmap` и `latest.yml` не становятся trusted fallback.

### Server console

- only `DeveloperCommandService` registry executes;
- IPC returns stable `{ code, message }`;
- `<user>` и `[days]` placeholders treated as inert data;
- no shell, eval или arbitrary filesystem execution;
- mutations remain audited without argument values.

### MLS Welcome recovery

- endpoint requires session, Origin/CSRF, conversation access, active-ban check и verified device;
- request uses bounded recovery limiter;
- notifications go only to active verified MLS member devices;
- active Client creates RFC 9420 commit/Welcome;
- Server routes scoped identifiers и opaque artifacts only;
- no active member means fail-closed pending state, not plaintext fallback.

### Post-update и test mode

- official release-tag link only;
- dismissal stores version/display state only;
- test mode is opt-in;
- PowerShell tails existing local log;
- no DevTools, renderer Node integration, remote debugging or admin IPC is enabled.

## 7. Encrypted media

- AES-256-GCM Client encryption;
- AAD binding to conversation, attachment и media kind;
- exact ciphertext size и SHA-256 validation;
- pending data unavailable before atomic message claim;
- expiry/cancel cleanup;
- idempotent matching retry;
- scope/hash/size substitution rejection;
- one-time claim/reuse rejection;
- verified local decrypt, preview, playback и download;
- fail-closed room media restrictions.

## 8. Pulse и Cloud Identity

- scrypt Cloud passwords;
- encrypted Cloud TOTP secrets;
- hashed email/session/OAuth tokens;
- OAuth 2.1 Authorization Code + PKCE S256;
- exact redirect URI validation;
- one-time signed Local Account linking;
- Ed25519 envelope/entitlement verification;
- provider-event replay/idempotency controls;
- double-entry ledger/non-negative wallet invariant;
- Local sandbox isolated from production authority.

## 9. Server-visible metadata

Secure messaging does not provide metadata confidentiality. Local Server can observe account/device IDs, membership, sender/uploader, group/epoch, attachment IDs, ciphertext sizes, timestamps, IP/network context, delivery order, Welcome request timing и traffic patterns.

## 10. Residual risks

- Client/OS/browser/runtime compromise can expose plaintext during authorized use;
- complete loss of private device state may be unrecoverable;
- existing 3.1.x data is not retroactively encrypted;
- public deployment depends on external TLS proxy, firewall, monitoring и DDoS controls;
- signing and provider environments are external trust boundaries;
- installed Windows updater acceptance still requires signed assets and runtime testing;
- Android/PWA stable promotion requires physical/installed runtime evidence;
- automated verification does not replace independent cryptographic/application-security review.

## 11. Reproduction

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

Запускайте команды на exact release commit/tag. Evidence другой revision не является release evidence.
