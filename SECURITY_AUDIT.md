# Nexora Security Verification Summary

**Дата документа:** 22 июля 2026  
**Текущая версия:** `3.2.3`  
**Канал:** Source/PWA prerelease  
**Signed production baseline:** `3.1.2`

## 1. Область

Документ суммирует автоматизированную security- и architecture-verification текущего `main`. Он не является независимым penetration test, cryptographic certification, supply-chain audit или production approval.

Авторитетные материалы:

- [Security Review 3.2.3](SECURITY_REVIEW_3.2.3.md);
- [Release Verification 3.2.3](RELEASE_VERIFICATION_3.2.3.md);
- [Security Model](docs/SECURITY_MODEL.md).

## 2. Threat model

Nexora не доверяет участнику только на основании LAN/VPN access. Local Server проверяет authentication, Origin/CSRF, membership, role, active ban/restriction, room policy, resource scope, route rate limit и resource ceilings.

Trust boundaries:

- Client управляет UI, device private keys, MLS private state и local decryption;
- Local Server управляет local identity, authorization, delivery order, public Trust state, limits, ciphertext storage и operations;
- Pulse Cloud управляет Cloud Identity, billing, ledger и production entitlements;
- payment provider управляет card/payment processing и provider events;
- OS, browser/Electron runtime и installed Client входят в trusted computing base.

## 3. Release evidence 3.2.3

Regression-first CI run `#290` (`29934225971`) ожидаемо выявил отсутствующие в `3.2.2` controls до изменения production code.

Verified implementation head: `a3586fe7d399dc03a990c939c31a3ceabcbad000`.  
Implementation CI: run `#308`, ID `29937445396`.

Final release documentation head: `5369263a3220e165d420615b53d770f7732a54b3`.  
Final CI: run `#309`, ID `29937694136`.

Оба полных candidates прошли:

| Gate | Результат |
|---|---|
| Windows `npm run check` | PASS |
| Windows `npm run test:unit` | PASS |
| Windows `npm run test:performance` | PASS |
| Windows `npm run audit:security` | PASS |
| Linux `npm test` | PASS |
| Dedicated `npm run release:check` | PASS |
| Schema 8 soak | PASS |
| Android `assembleDebug` | PASS |

## 4. Application security

| Область | Результат |
|---|---|
| Secure HttpOnly/SameSite sessions | PASS |
| Origin и CSRF validation | PASS |
| Socket.IO allowed-origin policy | PASS |
| Persistent login limiting и temporary lock | PASS |
| Local TOTP и one-time recovery codes | PASS |
| Certificate pinning, Server ID и Electron session isolation | PASS |
| Electron sandbox/context isolation/Node integration boundary | PASS |
| Android cleartext/mixed-content/TLS-error policy | PASS |
| SQLite WAL/FULL, integrity и transactional mutation | PASS |
| Schema 7 → 8 verified migration и downgrade protection | PASS |
| Active-ban fail-closed conversation access | PASS |
| Legacy upload size/hash/MIME validation | PASS |
| Bot token hash/scope/expiry/room authorization | PASS |
| Webhook HTTPS, SSRF/DNS validation и HMAC | PASS |
| Metrics protection, request IDs и credential redaction | PASS |
| Audited command allowlist без shell/eval | PASS |
| Windows updater signature/install policy | PASS |
| Unsigned updater asset exclusion | PASS |

## 5. Trust device security

| Область | Результат |
|---|---|
| One-time expiring Trust challenges | PASS |
| Ed25519 proof-of-possession registration | PASS |
| BasicCredential exact `{ userId, deviceId }` binding | PASS |
| Distinct identity и MLS signature keys | PASS |
| Signed verification/revocation | PASS |
| Active/verified device enforcement | PASS |
| 16-active-device account ceiling | PASS |
| Duplicate registration idempotency | PASS |
| Capacity release после revocation | PASS |
| Immediate targeted Socket.IO disconnect | PASS |
| Client Trust/MLS state wipe | PASS |
| Action-specific primitive audit allowlists | PASS |

## 6. KeyPackage и route governance

| Область | Результат |
|---|---|
| Maximum 25 KeyPackages/request | PASS |
| Maximum 32 unclaimed/device | PASS |
| Maximum 256 unclaimed/user | PASS |
| Atomic batch rollback при overflow | PASS |
| Expired-row cleanup | PASS |
| Bounded shared sliding-window limiter | PASS |
| Stable HTTP `429 RATE_LIMITED` | PASS |
| `Retry-After` contract | PASS |
| Memory-bounded limiter buckets | PASS |
| Startup/hourly stale bucket cleanup | PASS |

## 7. MLS secure messaging и recovery

| Область | Результат |
|---|---|
| Fixed MLS ciphersuite | PASS |
| One-time KeyPackage и scoped Welcome | PASS |
| Monotonic epoch и commit continuity | PASS |
| Unique commit/group epoch constraints | PASS |
| Ciphertext/message replay rejection | PASS |
| Device-scoped verified-member delivery | PASS |
| Ciphertext-only serialization/persistence/outbox | PASS |
| Direct legacy plaintext downgrade guards | PASS |
| Alice/Bob interoperability | PASS |
| Complete recovery group-envelope validation | PASS |
| Exact contiguous epoch sequence | PASS |
| SHA-256 commit payload validation | PASS |
| Duplicate commit-hash rejection | PASS |
| Intermediate/final public-state hash validation | PASS |
| Explicit lost-state failure | PASS |

Fixed profile: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

## 8. Encrypted media

| Область | Результат |
|---|---|
| AES-256-GCM Client encryption | PASS |
| AAD binding к conversation/attachment/media kind | PASS |
| Plaintext и ciphertext SHA-256 | PASS |
| Raw ciphertext byte cap | PASS |
| Exact `plaintextSize + GCM tag` validation | PASS |
| Quota по actual stored ciphertext bytes | PASS |
| Opaque server metadata | PASS |
| Pending download denial до message claim | PASS |
| Expiry и cancel cleanup | PASS |
| One-time atomic claim | PASS |
| Matching retry idempotency | PASS |
| Scope/hash/size substitution rejection | PASS |
| Attachment reuse rejection | PASS |
| Local verified decrypt/preview/playback/download | PASS |
| Outbox/cache descriptor isolation | PASS |
| Fail-closed room media restrictions | PASS |

Attachment key, IV, original filename, actual MIME, caption, voice duration и waveform находятся внутри MLS content и не хранятся Local Server как plaintext metadata.

## 9. Lifecycle regressions 3.2.1–3.2.2

Проверены:

- `/api/bootstrap` до Trust enrollment после authentication;
- отсутствие login bootstrap cycle;
- parent layout Trust configuration до child draft effects;
- safe empty read в pre-configuration draft window;
- сохранение видимости реальных Trust/IndexedDB errors;
- single-flight Server stop/quit;
- stopped-state Pulse/Trust status после SQLite close;
- propagation неожиданных repository/database errors.

## 10. Pulse и Cloud Identity

| Область | Результат |
|---|---|
| Cloud password scrypt storage | PASS |
| Cloud TOTP AES-256-GCM protection | PASS |
| Hashed email/session/OAuth tokens | PASS |
| OAuth 2.1 Authorization Code + PKCE S256 | PASS |
| Exact redirect URI validation | PASS |
| Atomic code consumption и refresh rotation | PASS |
| One-time signed Local Account linking | PASS |
| HTTPS и scoped service authentication | PASS |
| Ed25519 envelope/entitlement signature и scope | PASS |
| Provider-event replay/payload substitution controls | PASS |
| Checkout idempotency scope binding | PASS |
| Double-entry ledger и non-negative balance | PASS |
| Local sandbox production-authority isolation | PASS |

## 11. Maintenance и security-state retention

Автоматизированно проверены:

- expired session deletion;
- login history cleanup после 90 дней;
- stale persisted rate-limit bucket cleanup;
- hourly/startup maintenance wiring;
- отсутствие скрытия maintenance failure пустым handler;
- compatibility с существующими schema 8 operations.

## 12. Server-visible metadata

Secure-message path не предоставляет metadata confidentiality. Local Server видит или может вывести:

- account/device identifiers;
- room/conversation membership;
- sender/uploader identity;
- group/epoch и delivery order;
- attachment ID и ciphertext size;
- timestamps, IP/network/session context;
- ciphertext/replay hashes;
- operational errors и traffic patterns.

Nexora `3.2.3` не заявляет traffic-analysis resistance.

## 13. Residual risks

- same-origin XSS, malware, dependency compromise или malicious Client могут получить plaintext во время authorized use;
- total loss private device state может быть невосстановим;
- existing 3.1.x content не шифруется ретроактивно;
- public deployment зависит от reverse proxy, firewall, DDoS controls и monitoring;
- Local CA и local data требуют protected OS account, disk encryption и secure backups;
- production Pulse зависит от provider, Cloud deployment, key rotation, reconciliation и legal controls;
- stable Windows release зависит от Authenticode credentials и protected signing environment;
- stable Android release зависит от signed APK/AAB и physical-device matrix;
- automated verification не заменяет independent cryptographic/application-security review.

## 14. Stable-promotion blockers

До stable signed promotion `3.2.3` требуются:

1. packaged Windows Electron Client/Server runtime E2E;
2. installed PWA и physical Android runtime matrix;
3. extended multi-device simultaneous-commit/revoke/re-add/corrupted-state scenarios;
4. longer load/soak и long-offline evidence;
5. metadata minimization/traffic-analysis review;
6. Authenticode signing-machine и complete updater verification;
7. independent cryptographic/application-security review;
8. отсутствие unresolved high/critical findings.

## 15. Воспроизведение gate

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

Команды должны выполняться на exact release commit/tag. Результат другого commit не является release evidence.
