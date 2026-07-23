# Обзор продукта Nexora

## 1. Назначение

Nexora — self-hosted платформа обмена сообщениями для частных серверов, команд, сообществ и контролируемых организационных установок. Основной коммуникационный контур работает на Local Server и не требует передачи локальных комнат, сообщений и файлов в централизованный Cloud.

Состав продукта:

- **Nexora Client** — общий React-интерфейс для Windows, Browser/PWA и Android;
- **Nexora Local Server** — authority локальных аккаунтов, комнат, ролей, сообщений, файлов, realtime и room policies;
- **Trust Core / MLS** — device-scoped secure messaging и encrypted media;
- **Nexora Pulse Cloud** — optional authority Cloud Identity, billing, ledger и production entitlements;
- **Operations layer** — health, metrics, audit, backup/restore, maintenance и release tooling;
- **Project website** — статическая презентация продукта и точка входа в repository documentation.

## 2. Текущая продуктовая линия

| Параметр | Значение |
|---|---|
| Current repository version | `3.3.3` |
| Distribution | Published `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |
| Local Server migration from 3.2.0–3.3.1 | не требуется |
| Independent E2EE/security approval | не завершён |

Patch lineage:

- `3.2.0` — Trust Core, MLS secure messaging, encrypted media и schema 8;
- `3.2.1` — authentication bootstrap ordering и serialized Server shutdown;
- `3.2.2` — Trust configuration lifecycle race и safe encrypted-draft reads;
- `3.2.3` — resource governance, route limiting, strict recovery validation и security-state cleanup;
- `3.2.4` — Windows updater lifecycle, audited Server console, automatic MLS Welcome recovery, post-update UX и test-mode diagnostics;
- `3.2.5` — messaging/media regressions, developer commands и encrypted outbox corrections;
- `3.3.0` — Trust recovery, spendable Impulses/Pulse, voice waveform UX, website и complete artifact pipeline;
- `3.3.1` — packaged Windows Server startup correction: `shared/**/*` включён в `app.asar` и защищён release gate;
- `3.3.2` — release metadata, current documentation, release history и published-asset smoke приведены к одному проверяемому состоянию.

## 3. Модель развёртывания

Поддерживаемые profiles:

- localhost и development;
- private LAN;
- private VPN, включая Radmin VPN;
- public HTTPS domain за reverse proxy;
- Windows Client/Server shells;
- installed PWA;
- Android WebView shell с system TLS trust store;
- separate Pulse Cloud deployment для production commercial features.

Public installation требует HTTPS, firewall, exact `allowedOrigins`, monitoring и verified backups. Direct port forwarding Local Server не считается поддерживаемой production topology.

## 4. Messaging и collaboration

- direct messages, Saved Messages и rooms;
- replies, threads, reactions, mentions и polls;
- edit/delete/forward, pins, bookmarks и edit history;
- silent/scheduled send и server drafts;
- global search, notifications, archive и filters;
- offline cache, delta sync и durable outbox.

## 5. Rooms и moderation

- roles `owner`, `moderator`, `member` и custom roles;
- exactly one owner;
- atomic ownership transfer;
- moderator appointment/removal;
- member removal, ban/unban и ban list;
- join requests;
- multiple invites с expiry, usage limit и revocation;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- audit log и system messages;
- server-side authorization для REST и realtime.

## 6. Media

### Legacy conversations

- size и quota checks;
- safe names;
- SHA-256 validation;
- actual MIME detection;
- resumable chunks;
- image/PDF/text preview;
- voice recording/playback.

### Secure conversations

- Client-side AES-256-GCM;
- opaque server storage;
- AAD scope binding;
- exact ciphertext size и SHA-256 checks;
- pending expiry/cancel;
- idempotent retry;
- one-time atomic message claim;
- local verified decrypt/preview/playback/download;
- fail-closed room media policy.

## 7. Trust Core и MLS

- Ed25519 device identity и proof-of-possession;
- distinct identity/MLS signature keys;
- exact BasicCredential `{ userId, deviceId }` binding;
- fingerprint comparison, signed verification и revocation;
- maximum 16 active Trust devices per user;
- one-time KeyPackages с limits 25/request, 32/device, 256/user;
- device/conversation-scoped Welcome;
- monotonic epochs, signed commits и replay rejection;
- device-scoped Socket.IO delivery;
- ciphertext-only persistence и durable outbox;
- encrypted IndexedDB private state/cache/drafts;
- strict missed-commit recovery;
- server-side plaintext downgrade guards.

Fixed profile: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

## 8. MLS Welcome recovery 3.3.0+

Verified device без local group state может запросить Welcome:

1. Local Server проверяет session, Origin/CSRF, conversation access, active ban, verified device и bounded rate limit;
2. scoped notification отправляется active verified devices внутри MLS group;
3. active Client создаёт RFC 9420 commit и Welcome;
4. pending Client повторяет one-time claim;
5. отсутствие active member сохраняет fail-closed pending state.

Server не получает private MLS state или plaintext.

## 9. Nexora Plus и Pulse

Pulse Cloud является authority для:

- Cloud Identity и email verification;
- Cloud MFA;
- OAuth 2.1 Authorization Code + PKCE;
- subscriptions и receipts;
- Impulse double-entry ledger;
- provider webhooks/reconciliation;
- signed production entitlements.

Local Server не хранит card data, Cloud password, Cloud MFA secret, Cloud signing private key или OAuth refresh token. Local Pulse sandbox предназначен только для QA/demo и не создаёт production authority.

## 10. Updates и Windows experience

3.3.0+ включает:

- default official GitHub Releases provider для packaged Client;
- automatic startup/scheduled checks;
- observable manual state, progress, terminal result и retry;
- no-downgrade/prerelease и code-signature gates;
- post-update summary с official release link;
- opt-in `--test-mode` для live tail local Client log;
- branded Russian Client/Server NSIS configuration;
- audited Server console с stable errors и inert help placeholders.

Unsigned updater assets не публикуются и не становятся installable fallback.

## 11. Platforms

| Platform | Technology | 3.3.2 status |
|---|---|---|
| Windows Client | Electron + React | source/build verified; installed signed updater acceptance pending |
| Windows Server | Electron shell + Node.js | source/build verified; signed installer runtime acceptance pending |
| Browser/PWA | React/Vite + Service Worker | Source/PWA prerelease distribution permitted |
| Android | WebView shell | source build verified; physical-device/signing gates pending |
| Local Server CLI | Node.js | automated release gate passed |
| Pulse Cloud | Node.js service | code/integration available; production deployment external |

## 12. Operational capabilities

- `/healthz/live` и `/healthz/ready`;
- protected Prometheus metrics;
- request IDs и recursive credential redaction;
- graceful drain/shutdown;
- SQLite integrity, backups, restore и downgrade protection;
- startup/hourly security-state cleanup;
- audited developer-command registry без shell/eval;
- release workflow с Source/PWA/SBOM/checksums и conditional signed Windows assets.

## 13. Product boundaries

Nexora 3.3.2 не заявляет:

- independent cryptographic/application-security certification;
- traffic-analysis resistance;
- сокрытие membership, timing, IP и ciphertext-size metadata;
- seamless recovery после полной потери private device state;
- retroactive encryption 3.1.x history/files;
- stable signed Windows status без signed assets и installed-runtime acceptance;
- voice/video calls или screen sharing как текущую функцию;
- suitability prerelease для high-risk communications.

## 14. Stable promotion gates

Требуются:

1. installed Windows Client/Server и signed updater E2E;
2. installed PWA и physical Android runtime matrix;
3. extended multi-device Welcome/commit/revoke/re-add/corrupted-state coverage;
4. longer load/soak и long-offline evidence;
5. metadata minimization/traffic-analysis review;
6. Authenticode signing-machine verification;
7. independent cryptographic/application-security review;
8. отсутствие unresolved high/critical findings.

Текущий release evidence: [Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.3.md).
