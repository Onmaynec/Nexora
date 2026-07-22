# Политика поддержки Nexora

Nexora — open-source project, поддерживаемый через публичный repository. Поддержка предоставляется best-effort и не включает гарантированный SLA.

## Поддерживаемые линии

| Версия | Статус поддержки |
|---|---|
| `3.2.3` Source/PWA prerelease | Текущая prerelease-линия: defect reports и security fixes принимаются |
| `3.2.0–3.2.2` | Superseded; обновитесь до `3.2.3` перед обычной диагностикой |
| `3.1.x` signed production baseline | Поддерживается |
| `3.0.x` и старше | Не поддерживаются, кроме migration/security context |

При обращении укажите точные Client, Server и Cloud versions, release channel и commit/tag. `3.2.3` нельзя описывать как signed stable или independently audited release.

## Product defects

Используйте [Bug Report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml) для воспроизводимой проблемы в:

- Windows Client/Server;
- Browser/PWA;
- Android;
- Local Server API/Socket.IO;
- Trust devices/MLS/recovery;
- encrypted files/images/voice;
- route rate limiting или resource ceilings;
- security-state maintenance;
- Pulse Cloud/Cloud Identity;
- installer/updater;
- migration/backup/restore;
- documentation.

Перед отправкой:

- обновитесь до supported version, если возможно;
- проверьте Client/Server compatibility;
- найдите existing Issues;
- предоставьте minimum reproduction;
- укажите expected/actual result;
- приложите HTTP status, stable code и `Retry-After`, если применимо;
- укажите timestamp/request ID;
- используйте только sanitized logs/screenshots.

## Product proposals

Используйте [Feature Request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml).

Опишите:

- user problem;
- target scenario;
- expected outcome;
- Server/Client/storage/realtime impact;
- security/privacy impact;
- compatibility/migration impact;
- acceptance criteria.

Визуальное пожелание без описания data, authorization и business-rule impact недостаточно для функции, затрагивающей серверный контур.

## Документация

Documentation issue подходит для:

- stale version или release status;
- неверной installation/migration instruction;
- broken link;
- contradiction между docs;
- unsupported product/security claim;
- несоответствия current behavior и guide/checklist.

Небольшие однозначные corrections можно отправлять Pull Request.

## Installation и operations

Сначала изучите:

- [README](README.md);
- [Documentation Portal](docs/README.md);
- [Deployment Guide](docs/DEPLOYMENT.md);
- [Administrator Guide](ADMIN_GUIDE.md);
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md);
- [Acceptance Test Guide](TESTER_GUIDE.md);
- [Release Policy](docs/RELEASE_POLICY.md);
- [Security Policy](SECURITY.md).

В installation request укажите:

- platform/OS;
- Nexora version;
- source/package/PWA channel;
- Local Server schema;
- deployment profile;
- sanitized HTTPS URL format;
- exact error code/message;
- live/ready status;
- whether upgrade occurred from 3.1.x or 3.2.x.

Maintainers не гарантируют индивидуальную настройку third-party reverse proxy, firewall, DNS, payment provider, mail provider или identity infrastructure.

## Security vulnerabilities

Не создавайте public Issue. Следуйте [SECURITY.md](SECURITY.md) и используйте private GitHub Security Advisory.

Private reporting требуется для:

- authorization/IDOR bypass;
- plaintext downgrade;
- Trust credential/device scope bypass;
- обход device/KeyPackage limits;
- route-limit bypass или unbounded resource growth;
- MLS replay/recovery validation bypass;
- private-key/token/user-data disclosure;
- updater signature bypass;
- payment/ledger duplication или entitlement forgery.

## Запрещённые данные

Не публикуйте:

- passwords или backup passphrases;
- cookies, OAuth/API/bot/Pulse tokens;
- TOTP seeds/recovery codes;
- invite codes;
- CA, signing или device private keys;
- complete MLS private state;
- secure-message plaintext;
- production databases/backups/attachments;
- payment/customer data;
- unredacted private network inventory;
- лишние personal data.

## Channel boundaries

- Pull Requests предназначены для repository changes, не general support.
- Security Advisories — для vulnerabilities, не ordinary UI defects.
- Public Issues — не secure file-transfer channel.
- Discussions не заменяют reproducible bug report.
- Documented prerelease limitation не является defect автоматически; небезопасное поведение за пределами boundary может быть defect/security issue.

## Response expectations

Maintainers могут запросить дополнительное evidence, закрыть unsupported-version report, перенаправить обращение или отложить proposal вне текущего roadmap.

Security response targets указаны в [SECURITY.md](SECURITY.md).
