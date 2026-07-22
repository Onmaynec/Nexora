# Security audit Nexora 3.1.2

Дата документации: 22 июля 2026.

## Область

Документ относится к stable branch `main` версии 3.1.2: Local Server/Client API v3, SQLite schema 7, Pulse Cloud/Cloud Identity 3.1, production hardening 3.1.1 и bug fixes 3.1.2.

Экспериментальные Trust Core/MLS branches 3.2.0 не входят в stable audit и требуют отдельной cryptographic/interoperability/security verification до release.

## Модель угроз

Nexora не доверяет участнику только из-за LAN/VPN-доступа. Local Server проверяет session или scoped bot token, Origin/CSRF, membership, role, ban/restriction, room settings и resource scope.

Для public domain обязательны HTTPS, firewall/reverse proxy, explicit allowed origins, monitoring и backup. Stable 3.1.2 не использует E2EE: администратор компьютера Local Server контролирует plaintext data SQLite и attachments.

Pulse Cloud является отдельной trust boundary. Local Server не является authority денег/production entitlement, а Client не является authority price/balance/scope.

## Автоматические и архитектурные результаты

| Область | Результат |
|---|---|
| Origin/CSRF и secure HttpOnly/SameSite session | PASS |
| persistent rate limit и temporary login lock | PASS |
| local TOTP, one-time recovery codes, timing-safe compare | PASS |
| Cloud Identity scrypt passwords, TOTP AES-256-GCM, hashed tokens | PASS |
| OAuth 2.1 Authorization Code + PKCE S256 и exact redirect URI | PASS |
| PEM SHA-256 pinning, Server ID и certificate verifier | PASS |
| отдельная Electron session на Server ID | PASS |
| context isolation / sandbox / Node integration off | PASS |
| Android cleartext/mixed content запрещены, TLS error отменяется | PASS |
| SQLite WAL/FULL/integrity/transactional mutation | PASS |
| schema 6 → 7 verified backup/migration и downgrade protection | PASS |
| resumable chunks: size/index/SHA-256 и MIME sniffing | PASS |
| bot token хранится как hash, scopes/expiry/room проверяются | PASS |
| webhook: HTTPS, private-IP rejection, DNS validation/pinning, HMAC | PASS |
| Pulse HTTPS-only, scoped service auth и Ed25519 signed envelopes | PASS |
| provider event replay/payload substitution protection | PASS |
| checkout/business idempotency scope binding | PASS |
| double-entry ledger и non-negative wallet invariant | PASS |
| liveness/readiness, protected metrics и graceful drain | PASS |
| recursive credential redaction и request IDs | PASS |
| audited developer command allowlist без shell/eval | PASS |
| Local Pulse sandbox не создаёт production signatures/payments | PASS |
| Windows update signature/install policy | PASS |
| unsigned release исключает `.exe`/blockmap/`latest.yml` | PASS |
| 3.1.2 updater single-flight/scheduler/stable missing-assets reason | PASS |
| 3.1.2 global voice dock full state/source cleanup | PASS |

Воспроизведение stable gate:

```bash
npm ci
npm run check
npm test
npm run audit:security
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

PR 3.1.2 CI завершил Windows verify, Linux full tests и Android source build успешно. Security audit должен повторяться на release commit/tag и после dependency changes.

## Trust boundaries

- Local Server — authority local users, roles, rooms, messages и files.
- Windows shell — certificate trust, isolated sessions и signed update policy.
- PWA Service Worker — только application shell; API/Socket.IO исключены.
- Android — system CA trust, strict origin navigation и unconditional TLS error cancellation.
- Bot token — one-time display, hash-at-rest и minimum scopes.
- Webhook — public HTTPS only, destination validation и HMAC payload signature.
- Pulse Cloud — authority Cloud Identity, provider/customer mapping, ledger, receipts и production entitlements.
- Payment provider — card/payment processing; card data не хранится Nexora.

## Проверки Pulse/Cloud

Local Server принимает Cloud success data только после проверки:

- pinned/known Ed25519 key ID;
- envelope и nested entitlement signatures;
- issued/activation/expiry time;
- Server/User/Room/Product scope;
- request nonce, idempotency и replay state.

Cloud хранит passwords через scrypt; TOTP secret шифруется AES-256-GCM; email/session/OAuth tokens хранятся только как hashes. Authorization code одноразовый и PKCE-bound, refresh token вращается атомарно.

Provider success redirect не settlement signal. Settlement выполняется только verified webhook/event processing. Failed event retry допускается только с тем же provider/type/payload hash.

## Operational security

- `/metrics` требует Bearer token, если configured, иначе loopback-only.
- readiness становится `503` до shutdown dependencies.
- logs рекурсивно скрывают authorization, cookies, passwords, tokens, API keys, secrets и signatures.
- developer command registry не предоставляет arbitrary shell/JavaScript.
- mutating commands записываются в `integrationAudit` без secret argument values.
- Local sandbox отключается при production Cloud configuration, блокирует checkout и не допускает negative balance.

## Остаточные и внешние риски

- E2EE отсутствует в stable 3.1.2; messages доступны Local Server operator и process с filesystem/database access.
- Local CA и plaintext working data требуют protected OS account, full-disk encryption и restricted backups.
- Public deployment требует external reverse proxy/DDoS/rate-limit/monitoring beyond repository defaults.
- Stable Windows release требует external Authenticode certificate и protected GitHub secrets/environment approval.
- Android WebView shell требует Android signing, device matrix и store review.
- Real Pulse production требует provider, Cloud deployment, reconciliation, key rotation, refund/dispute/legal/tax/privacy review.
- Automatic audit не заменяет independent code review, pentest, cryptographic review и supply-chain assessment.
- Development 3.2.0 MLS code нельзя считать E2EE-ready до plaintext bypass, epoch/replay, device identity, key package, state rollback, attachment encryption и interoperability gates.

## Обязательное перед production

1. Включить 2FA, protected branches/tags и required CI.
2. Подключить OV/EV Windows code-signing certificate и manual release approval.
3. Проверить clean install/upgrade/rollback на Windows 10/11 и Android device matrix.
4. Выполнить минимум 60 минут soak; для production рекомендуется 24 часа.
5. Провести внешний API/Electron/Android pentest для public deployment.
6. Для Pulse production отдельно пройти provider/webhook/refund/reconciliation/legal audit.
7. До выпуска 3.2.0 провести независимый MLS/Trust Core cryptographic and interoperability review.
