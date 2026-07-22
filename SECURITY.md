# Security Policy

## Поддерживаемые версии

| Версия / ветка | Статус |
|---|---|
| `main` / `3.1.x` | Поддерживаемая stable-линия |
| `agent/nexora-3.2.0-trust-core-mls` | Experimental development; security reports принимаются, production support отсутствует |
| `3.0.x` и старше | Не поддерживаются |

Эта ветка не является stable E2EE release. Наличие Trust Core/MLS кода не подтверждает confidentiality всех сообщений, attachments или metadata.

## Сообщение об уязвимости

Не публикуйте exploit, private MLS state, device signing key, recovery material, session/OAuth token, private CA/Pulse key или пользовательские данные в Issue/PR.

Используйте приватный GitHub Security Advisory: <https://github.com/Onmaynec/Nexora/security/advisories/new>.

Укажите:

- branch и exact commit SHA;
- platform/runtime и affected component;
- expected security invariant;
- minimal reproduction с disposable data;
- impact и возможность plaintext/key/metadata exposure;
- очищенные logs без secrets.

## Priority scope stable 3.1.x

- auth/role/membership/ban bypass и IDOR;
- CSRF/Origin/session/token defects;
- Electron/WebView/TLS/update boundary bypass;
- unsafe upload/MIME/path/SSRF behavior;
- SQLite migration/backup/audit corruption;
- Pulse signature/replay/idempotency/ledger/OAuth bypass;
- bot/webhook scope или secret leakage.

## Priority scope этой 3.2.0 ветки

- plaintext fallback или bypass secure-channel enforcement;
- private MLS/device key leakage;
- device impersonation, verification или revocation bypass;
- KeyPackage/Welcome reuse, substitution или wrong-device delivery;
- stale/duplicate/skipped epoch acceptance;
- replay, commit/application-message substitution или cross-room delivery;
- encrypted IndexedDB rollback, corruption, cross-profile access или weak key handling;
- recovery flow, revoked-device re-entry или silent group-state reset;
- ciphertext/attachment metadata that exposes plaintext or keys;
- Server/client disagreement that silently downgrades security.

## Safe research

Исследуйте только на собственной disposable installation и с собственными test accounts/data. Не нарушайте availability, не извлекайте чужие данные, не применяйте social engineering и не публикуйте working key material.

## Documented limitations

- Stable 3.1.2 не использует E2EE.
- Эта draft-ветка не прошла independent cryptographic review и full release gate.
- Complete UI/outbox, plaintext-bypass, multi-device, recovery, attachment и migration guarantees ещё не считаются release-ready.
- Local Server всё ещё видит operational metadata; MLS само по себе не скрывает membership, timing, ciphertext size или IP data.
- Тестовые builds, unsigned installers и development state нельзя использовать для реальных private communications.

Если классификация неясна, отправляйте report приватно.
