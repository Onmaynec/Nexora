# Nexora 3.1.2 Release Checklist

## Version и repository state

- [ ] `package.json`, `package-lock.json`, Android metadata, UI и release docs показывают `3.1.2`.
- [ ] tag — `v3.1.2`, annotated/signed и указывает на проверенный release commit.
- [ ] working tree чистый; release commit не содержит temporary patches, diagnostics или secrets.
- [ ] `CHANGELOG.md`, `RELEASE_NOTES_3.1.2.md` и `RELEASE_VERIFICATION_3.1.2.md` актуальны.
- [ ] документация не заявляет E2EE или другие 3.2.0 development capabilities как stable.

## Код, tests и данные

- [ ] schema 6 → 7 migration протестирована на копии 3.0.0 data.
- [ ] pre-migration backup создаётся и проходит verification.
- [ ] downgrade к schema 6 блокируется при persist/restore.
- [ ] `PRAGMA integrity_check` возвращает `ok` до и после migration/restore.
- [ ] `npm ci` — PASS.
- [ ] `npm run check` — PASS.
- [ ] `npm test` — PASS.
- [ ] `npm run audit:security` — PASS.
- [ ] `npm run release:check` — PASS.
- [ ] soak не менее 60 минут — PASS; для production рекомендуется 24 часа.
- [ ] Android `gradle -p android :app:assembleDebug --no-daemon` — PASS.

## Regression scope 3.1.2

- [ ] global voice dock X останавливает playback, очищает полный audio state/source и немедленно размонтирует dock.
- [ ] следующий voice item не наследует предыдущие URL/name/time/duration/speed.
- [ ] updater запускает initial check после `app.whenReady()`.
- [ ] updater использует single-flight и не создаёт duplicate checks.
- [ ] automatic interval равен шести часам, timers/listeners очищаются при quit.
- [ ] missing signed `latest.yml`/installable assets возвращает `no_installable_update` без raw stack.
- [ ] Local Pulse sandbox включается/выключается audited command.
- [ ] test Plus grant выдаёт 400 Impulses только один раз на новую activation.
- [ ] sandbox balance не становится отрицательным.
- [ ] sandbox checkout заблокирован и production configuration отключает local sandbox.
- [ ] grant/revoke operations записываются в audit/ledger без secret leakage.

## Cloud Identity и Pulse 3.1.x

- [ ] email verification, Cloud sessions, TOTP MFA и recovery-code one-time use проверены.
- [ ] OAuth 2.1 Authorization Code + PKCE S256 использует exact redirect URI.
- [ ] authorization code и refresh token вращаются/потребляются атомарно.
- [ ] Local Account link attestation одноразовая и scope-bound.
- [ ] unknown/replaced Ed25519 key ID отвергается.
- [ ] envelope/entitlement signature, expiry и server/user/room/product scope проверяются.
- [ ] provider event retry разрешён только с тем же payload hash.
- [ ] checkout idempotency key нельзя повторно использовать в другом scope.
- [ ] Cloud event delta/revoke применяется idempotently без restart.
- [ ] Cloud outage не блокирует local messaging и не разрешает новые monetary writes.

## Operational hardening 3.1.1

- [ ] `/healthz/live` и `/healthz/ready` проверены для Local Server и Pulse Cloud.
- [ ] readiness становится `503` в drain mode.
- [ ] `/metrics` требует Bearer token либо loopback source.
- [ ] logs содержат request ID и redaction credentials/cookies/passwords/tokens/API keys/signatures.
- [ ] graceful shutdown останавливает workers, HTTP/Socket.IO и SQLite в документированном порядке.
- [ ] developer command registry не выполняет shell/eval.
- [ ] mutating commands записываются в `integrationAudit` без secret argument values.

## UI/UX

- [ ] avatars открывают profile во всех контекстах.
- [ ] profile с `relationship: null` не вызывает blank screen.
- [ ] zero badges скрыты.
- [ ] reaction picker доступен mouse и keyboard.
- [ ] message actions/dock/details не пересекают boundaries.
- [ ] проверены 1920×1080, 1366×768 и narrow window.
- [ ] `prefers-reduced-motion` отключает decorative motion.
- [ ] offline cache/outbox/delta sync восстанавливаются после restart.
- [ ] Cloud/Pulse states имеют loading/success/error/offline/disabled/misconfigured UI.

## Windows

- [ ] clean install Client/Server на Windows 10 x64.
- [ ] clean install Client/Server на Windows 11 x64.
- [ ] upgrade с 3.0.0, 3.1.0 и 3.1.1 сохраняет Server data, schema 7 и trusted servers.
- [ ] Authenticode обоих `.exe` действителен и timestamped.
- [ ] SmartScreen/reputation проверены.
- [ ] uninstall не удаляет Server data без явного выбора.

## Сеть и платформы

- [ ] localhost, LAN, Radmin VPN и public HTTPS FQDN работают.
- [ ] certificate fingerprint совпадает; change требует confirmation.
- [ ] browser/PWA `.crt` flow и microphone проверены.
- [ ] Android отменяет TLS error и запрещает HTTP/mixed content.
- [ ] firewall ограничен нужным interface/scope.
- [ ] несовместимый Client получает stable HTTP 426 response.
- [ ] PWA Service Worker не кэширует API/Socket.IO.
- [ ] Android deep link принимает только HTTPS URL.

## GitHub/update

- [x] public `Onmaynec/Nexora` существует.
- [ ] `main` и release tags protected, CI required, 2FA включена.
- [ ] Source/PWA prerelease содержит source ZIP, PWA ZIP, SPDX SBOM и checksums.
- [ ] stable Windows release содержит signed Client/Server `.exe`, blockmap, `latest.yml`, source/PWA/SBOM/checksums.
- [ ] stable release не помечен prerelease.
- [ ] auto-update n-1 → 3.1.2 проверен на installed Client.
- [ ] Source/PWA-only prerelease не воспринимается как installable Windows update.
- [ ] published stable assets не заменяются повторным workflow run.

## Pulse production — только при включении

- [ ] provider sandbox и production полностью разделены.
- [ ] Cloud URL HTTPS, service credentials scoped/rotatable.
- [ ] signing private key находится только в secret manager.
- [ ] Cloud database backup/restore и ledger invariant проверены.
- [ ] webhook signatures, idempotency, reconciliation, refund/dispute/revocation протестированы.
- [ ] transactional email и worker retry/lease behavior проверены.
- [ ] OAuth redirect/client allowlist утверждён.
- [ ] privacy, retention, offer, taxes/receipts и support/incident flow утверждены.
- [ ] card data не хранится Nexora.

Если production Pulse checklist не завершён, stable release разворачивается с `NEXORA_PULSE_MODE=disabled`; QA/demo использует изолированный local sandbox.
