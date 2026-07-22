# Политика безопасности Nexora

## Поддерживаемые версии

| Версия | Канал | Статус security support |
|---|---|---|
| `3.2.3` | Source/PWA prerelease | Текущая поддерживаемая prerelease-линия; security fixes принимаются |
| `3.2.0–3.2.2` | Superseded prerelease | Обновитесь до `3.2.3`; отчёты принимаются для regression/impact analysis |
| `3.1.x` | Signed production baseline | Поддерживается |
| `3.0.x` | Historical | Не поддерживается |
| `2.x` и старше | Historical | Не поддерживается |

Security fix должен иметь воспроизведение, regression coverage и verification в затронутой линии. Публичный выпуск и coordinated disclosure определяются severity, exploitability и deployment impact.

## Сообщение об уязвимости

Не публикуйте exploit, session cookie, OAuth token, TOTP/recovery code, CA private key, Pulse credential/signing key, invite code, MLS private state, device identity private key, secure-message plaintext или пользовательские данные в публичном Issue, Discussion или Pull Request.

Используйте private GitHub Security Advisory:

1. откройте **Security → Advisories** в `Onmaynec/Nexora`;
2. выберите **New draft security advisory**;
3. укажите affected version, platform и component;
4. опишите impact, minimum reproduction и safe proof of concept;
5. приложите только sanitized logs и test data.

Прямая форма: <https://github.com/Onmaynec/Nexora/security/advisories/new>.

## Целевые сроки ответа

- подтверждение получения — до 3 рабочих дней;
- первичная оценка или запрос деталей — до 7 рабочих дней;
- remediation и disclosure — по согласованному плану с учётом severity и complexity.

Это целевые сроки, а не договорный SLA. Disclosure может быть отложен, если ранняя публикация создаёт непосредственный риск.

## Security scope

Приоритетные категории:

- authentication, authorization, role, ban или room-policy bypass;
- IDOR и доступ к чужим rooms, messages, profiles, files или Cloud records;
- RCE, Electron boundary bypass или unsafe WebView navigation;
- TLS, Server ID, fingerprint или updater-metadata substitution;
- CSRF, Origin bypass, session fixation и token/cookie exposure;
- unsafe upload processing, MIME spoofing, path traversal или SSRF;
- SQLite corruption, migration/backup/restore failure или audit tampering;
- Pulse signature bypass, replay, double settlement или entitlement substitution;
- Cloud Identity, MFA или OAuth 2.1 PKCE bypass;
- metrics exposure, credential leakage в logs или developer-command escape;
- bot/webhook scope bypass или secret disclosure;
- resource exhaustion через Trust, KeyPackage, recovery или E2EE upload routes.

## Trust Core, MLS и encrypted-media scope

Приоритетные отчёты включают:

- plaintext downgrade после MLS activation через REST, Socket.IO, outbox, edit, forward, draft, scheduled, poll, bot или upload paths;
- доступ Local Server к secure-message plaintext, private MLS state или secure-attachment key;
- подмену `{ userId, deviceId }` MLS BasicCredential;
- reuse одного Ed25519 key для identity proof и MLS signatures;
- device registration без proof of possession;
- verify/revoke без valid one-time challenge;
- обход 16-device account limit;
- обход KeyPackage batch/device/user limits;
- KeyPackage/Welcome reuse, scope substitution или race;
- stale/skipped/duplicate epoch, commit substitution или ciphertext replay;
- delivery revoked, unverified, removed или mismatched device;
- incomplete local Trust wipe после revocation;
- cross-profile/rollback disclosure из encrypted IndexedDB;
- authenticated-data mismatch по conversation/client/device scope;
- recovery acceptance без проверки envelope, sequence, hashes или public-state chain;
- opaque attachment hash/size/scope substitution или claim reuse;
- rate-limit bypass, unbounded bucket growth или неверный `Retry-After` contract;
- sensitive data в Trust audit nested metadata;
- dependency/ciphersuite substitution без migration и review.

Trust/MLS report должен содержать Server ID, conversation/group ID, epoch, device roles и sanitized protocol sequence. Не прикладывайте private keys, complete MLS state или real message content.

## Реализованная security boundary — 3.2.3

Текущая prerelease-линия включает:

- Ed25519 proof-of-possession device registration;
- strict BasicCredential binding к authenticated `{ userId, deviceId }`;
- distinct identity и MLS signature keys;
- signed verify/revoke с one-time scoped challenges;
- active/verified device enforcement;
- максимум 16 active Trust devices на user;
- KeyPackage limits: 25/request, 32/device, 256/user;
- fixed profile `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`;
- one-time KeyPackage и scoped Welcome delivery;
- monotonic epochs, commit continuity и replay rejection;
- device-scoped Socket.IO authentication/delivery;
- immediate targeted disconnect после revocation;
- ciphertext-only persistence и durable outbox;
- server-side rejection legacy plaintext paths;
- encrypted IndexedDB private state, KeyPackages, cache и drafts;
- strict missed-commit scope/sequence/hash/state validation;
- AES-256-GCM encrypted files, images и voice;
- opaque attachment exact-size/SHA-256/quota validation, expiry и one-time claim;
- fail-closed encrypted-media policy;
- bounded route-specific rate limiting с `RATE_LIMITED` и `Retry-After`;
- action-specific primitive Trust audit allowlists;
- startup/hourly cleanup expired sessions и stale security state;
- active-ban fail-closed room access.

Local Server не получает secure-message plaintext, private MLS state, secure-attachment key, original filename, actual MIME, caption, voice duration или waveform.

## Trusted computing base

Secure-message boundary не устраняет Client compromise. Plaintext доступен authorized Client при compose, display и playback.

Trusted computing base включает:

- browser/Electron renderer;
- installed application binary;
- runtime dependencies;
- operating-system account и local device security;
- local encrypted-state key material.

Same-origin XSS, malicious dependency, malware или compromised signed Client могут получить plaintext во время использования.

## Metadata limitations

Nexora `3.2.3` не заявляет metadata confidentiality или traffic-analysis resistance. Local Server видит или может вывести:

- account/device identifiers;
- room/conversation membership;
- sender/uploader identity;
- group/epoch и delivery order;
- attachment ID и ciphertext size;
- timestamps, IP/network/session context;
- ciphertext/replay hashes и operational errors;
- traffic patterns.

## Документированные non-guarantees

Не заявляются:

- retroactive encryption истории и файлов 3.1.x;
- compatibility 3.1.x Client с active secure 3.2.x conversation;
- seamless recovery после полной потери private device state;
- защита plaintext от compromised authorized Client;
- traffic-analysis resistance;
- independent cryptographic/application-security certification;
- signed stable Windows status для `3.2.3`;
- suitability prerelease для high-risk communications.

Если фактическое поведение небезопасно выходит за эти границы — например, secure attachment молча отправляется plaintext — это остаётся security issue.

## Безопасное исследование

Исследование разрешено на собственных installations и данных. Запрещено:

- нарушать доступность чужого service;
- читать или изменять чужие данные;
- применять social engineering;
- публиковать secrets или personal data;
- продолжать exploitation сверх минимального подтверждения.

Проект не обещает monetary bounty.

## Operational boundaries

- Public Local Server требует HTTPS reverse proxy, firewall, monitoring и explicit `allowedOrigins`.
- Unsigned Windows builds предназначены только для development/testing.
- Production Plus/Pulse требует отдельный Pulse Cloud и не активируется authoritative локальным флагом.
- Local Pulse sandbox не выполняет реальные платежи и не создаёт production entitlement/signature.
- Automated checks не заменяют independent review, pentest, supply-chain assessment и operational monitoring.

Подробная текущая модель: [docs/SECURITY_MODEL.md](docs/SECURITY_MODEL.md). При сомнении отправляйте отчёт приватно.
