# Политика безопасности Nexora

## 1. Поддерживаемые версии

| Версия | Канал | Security status |
|---|---|---|
| `3.3.3` | Published `UNSIGNED-TEST` prerelease | Текущая поддерживаемая prerelease-линия; security fixes принимаются |
| `3.2.0–3.3.1` | Superseded prereleases | Обновитесь до `3.3.2`; отчёты принимаются для regression/impact analysis |
| `3.1.x` | Signed production baseline | Поддерживается |
| `3.0.x` и старше | Historical | Не поддерживается |

Security correction должна иметь reproduction, regression coverage, compatibility statement и verification в затронутой линии.

## 2. Сообщение об уязвимости

Не публикуйте exploit, session cookie, OAuth token, TOTP/recovery code, CA/signing key, Pulse credential, invite code, MLS private state, device private key, secure-message plaintext или пользовательские данные в public Issue, Discussion или Pull Request.

Используйте private GitHub Security Advisory:

1. откройте **Security → Advisories** в `Onmaynec/Nexora`;
2. выберите **New draft security advisory**;
3. укажите affected version, branch, platform и component;
4. опишите impact, minimum reproduction и safe proof of concept;
5. приложите только sanitized logs и synthetic test data.

Direct form: <https://github.com/Onmaynec/Nexora/security/advisories/new>.

## 3. Целевые сроки ответа

- подтверждение получения — до 3 рабочих дней;
- первичная оценка или запрос деталей — до 7 рабочих дней;
- remediation и coordinated disclosure — по согласованному плану с учётом severity, exploitability и complexity.

Это targets, а не договорный SLA.

## 4. Приоритетный scope

### Application и access control

- authentication/session bypass;
- CSRF, Origin, session fixation или token disclosure;
- IDOR и unauthorized room/message/file/profile access;
- owner/moderator/member privilege escalation;
- ban/removal/read-only/slow-mode/media-policy bypass;
- realtime access после потери membership или Trust state;
- invitation replay, expiry/limit race;
- unsafe upload parsing, MIME spoofing, path traversal или SSRF.

### Desktop, Android и update chain

- Electron renderer boundary bypass;
- unsafe WebView navigation или TLS-error bypass;
- certificate/Server ID/fingerprint substitution;
- updater feed substitution, downgrade или unsigned asset acceptance;
- malicious `latest.yml`, installer или blockmap handling;
- unintended DevTools, Node integration, remote debugging или test-mode privilege;
- Server console shell/eval/filesystem escape.

### Trust Core, MLS и encrypted media

- plaintext downgrade после MLS activation;
- device credential/signing-key substitution;
- registration без proof of possession;
- verification/revocation challenge replay;
- active-device или KeyPackage ceiling bypass;
- KeyPackage/Welcome reuse, race или scope substitution;
- unauthorized `welcome/request` notification;
- recovery group/epoch/hash/public-state validation bypass;
- stale/skipped/duplicate epoch или ciphertext replay;
- delivery revoked, unverified, removed или mismatched device;
- incomplete local state wipe;
- encrypted IndexedDB rollback/cross-profile disclosure;
- opaque attachment size/hash/scope/claim reuse;
- route rate-limit bypass или unbounded limiter state.

### Pulse Cloud и operations

- Cloud Identity/MFA/OAuth PKCE bypass;
- entitlement signature/scope/replay bypass;
- checkout/provider-event double processing;
- ledger imbalance или negative wallet;
- metrics exposure;
- secret leakage в logs/audit/diagnostics;
- migration, backup, restore или downgrade corruption;
- cleanup/retention failure, позволяющая reuse expired security state.

## 5. Текущая security boundary — 3.3.0+

Текущая prerelease-линия включает:

- HttpOnly/SameSite sessions, Origin и CSRF validation;
- server-side membership, role, ban, room-policy и resource checks;
- Ed25519 device proof, distinct identity/MLS signature keys и exact BasicCredential binding;
- максимум 16 active Trust devices per user;
- KeyPackage limits: 25/request, 32/device, 256/user;
- bounded Trust/recovery/E2EE route limits с `429 RATE_LIMITED` и `Retry-After`;
- one-time scoped KeyPackages, Welcome и challenges;
- monotonic MLS epochs, commit/replay validation и strict missed-commit recovery;
- verified-device-only scoped `mls.welcome_requested` notifications;
- fail-closed behavior при отсутствии active MLS member;
- ciphertext-only secure-message persistence/delivery;
- AES-256-GCM encrypted media и opaque attachment API;
- server-side plaintext downgrade guards;
- packaged updater с HTTPS provider, no-downgrade/prerelease policy и code-signature gate;
- audited Server console без shell/eval;
- startup/hourly cleanup expired sessions, old login history и stale rate-limit buckets.

Подробности: [Security Model](docs/SECURITY_MODEL.md), [Security Review 3.3.0](SECURITY_REVIEW_3.3.0.md), [Release Verification 3.3.2](RELEASE_VERIFICATION_3.3.3.md).

## 6. Trusted computing base

Secure messaging не устраняет Client compromise. TCB включает:

- browser/Electron renderer;
- installed application binary и runtime dependencies;
- OS account и local device security;
- non-extractable key storage и encrypted local state;
- release/signing environment;
- operator-controlled TLS, filesystem и backup environment.

XSS, malware, dependency compromise или malicious signed Client могут получить plaintext во время authorized use.

## 7. Metadata и non-guarantees

Local Server может видеть или выводить:

- account/device identifiers;
- room/conversation membership;
- sender/uploader identity;
- group/epoch и delivery order;
- attachment ID и ciphertext size;
- timestamps, IP/network/session context;
- replay/ciphertext hashes;
- Welcome request timing;
- operational errors и traffic patterns.

Не заявляются:

- traffic-analysis resistance;
- retroactive encryption данных 3.1.x;
- seamless recovery после полной потери private device state;
- independent cryptographic/application-security certification;
- signed stable Windows status для 3.3.2;
- suitability prerelease для high-risk communications.

## 8. Safe research

Исследования разрешены только на системах и данных, которыми исследователь вправе распоряжаться. Запрещено:

- ухудшать чужой service;
- получать или изменять third-party data;
- использовать social engineering;
- публиковать secrets/personal data;
- продолжать exploitation после получения минимального evidence.

Project не обещает monetary bounty.

## 9. Branch-specific reports

Для уязвимости в historical, superseded или development branch укажите точное имя ветки и commit. Branch-local claims не заменяют current `main` policy. Правила: [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md).

При сомнении сообщайте privately.
