# Политика поддержки Nexora

Nexora — open-source project, поддерживаемый через публичный repository. Поддержка предоставляется best-effort и не является договорным SLA.

## 1. Поддерживаемые линии

| Версия | Статус поддержки |
|---|---|
| `3.2.4` Source/PWA prerelease | Текущая prerelease-линия; defect и security reports принимаются |
| `3.2.0–3.2.3` | Superseded prereleases; обновитесь до `3.2.4` перед обычной диагностикой |
| `3.1.x` signed production baseline | Поддерживается как последняя подтверждённая signed production line |
| `3.0.x` и старше | Не поддерживаются, кроме migration/security context |

В обращении укажите точные Client, Server и Pulse Cloud versions, release channel и commit/tag. `3.2.4` не является signed stable Windows release и не заявляется как independently audited E2EE.

## 2. Product defects

Используйте [Bug Report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml) для воспроизводимой проблемы в:

- Windows Client или Server;
- Browser/PWA;
- Android;
- Local Server API или Socket.IO;
- Trust devices, KeyPackages, MLS groups, Welcome/recovery;
- encrypted files, images и voice;
- route rate limiting или resource ceilings;
- session/security-state maintenance;
- Client updater, post-update notes или Windows test mode;
- audited Server console;
- Pulse Cloud/Cloud Identity;
- migration, backup или restore;
- documentation.

Перед отправкой:

- воспроизведите на `3.2.4`, если это возможно;
- проверьте Client/Server compatibility;
- найдите существующие Issues;
- приведите minimum reproduction;
- укажите expected/actual result;
- приложите HTTP status, stable code и `Retry-After`, если применимо;
- приложите только sanitized diagnostics.

## 3. Информация для диагностики

Полезны:

- platform, OS/browser и device model;
- source/PWA/installed Windows channel;
- deployment profile: localhost, LAN, private VPN или public HTTPS;
- Local Server schema и readiness state;
- Server ID и request ID;
- точное время события;
- Trust device count, KeyPackage count, conversation/group/epoch scope;
- updater state: checking, available, downloading, downloaded, current или error;
- наличие активного verified MLS group device при Welcome recovery;
- sanitized screenshot или log excerpt.

## 4. Product proposals

Используйте [Feature Request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml).

Опишите:

- пользовательскую проблему;
- целевой сценарий;
- ожидаемый результат;
- влияние на Client, Server, storage и realtime;
- security/privacy impact;
- compatibility/migration impact;
- acceptance criteria.

Визуальное пожелание без определения product behavior, accessibility и state handling может потребовать уточнения.

## 5. Documentation issues

Documentation issue используется для:

- stale version/release status;
- неверной installation/migration instruction;
- broken link;
- противоречия между README, Security Policy, Release Status и guides;
- неверного branch lifecycle;
- неподтверждённого product/security claim.

Правила branch-local documentation: [Branch Documentation Policy](docs/BRANCH_DOCUMENTATION_POLICY.md).

## 6. Installation и operations

Перед обращением изучите:

- [README](README.md);
- [Documentation Portal](docs/README.md);
- [Deployment Guide](docs/DEPLOYMENT.md);
- [Administrator Guide](ADMIN_GUIDE.md);
- [Operations Runbook](docs/OPERATIONS_RUNBOOK.md);
- [Release Policy](docs/RELEASE_POLICY.md);
- [Security Policy](SECURITY.md).

Maintainers не гарантируют индивидуальную настройку third-party reverse proxy, firewall, DNS, payment provider, mail provider или enterprise identity infrastructure.

## 7. Security vulnerabilities

Не создавайте public Issue. Используйте private GitHub Security Advisory по [SECURITY.md](SECURITY.md).

Private reporting требуется, например, для:

- authorization/IDOR bypass;
- plaintext downgrade;
- Trust device, KeyPackage, Welcome, MLS replay/scope bypass;
- private-key, token или user-data disclosure;
- updater signature/no-downgrade bypass;
- shell/eval escape из Server console;
- payment/ledger duplication или entitlement forgery.

## 8. Запрещённые данные

Не публикуйте:

- passwords и backup passphrases;
- cookies, OAuth/API/bot/Pulse tokens;
- TOTP seeds и recovery codes;
- invite codes;
- CA, signing, Android или device private keys;
- complete MLS private state;
- production databases, backups или attachments;
- real payment/customer data;
- unredacted network inventory;
- personal data, не требуемые для reproduction.

## 9. Границы каналов

- Pull Requests предназначены для repository changes, а не general support.
- Security Advisories предназначены для vulnerabilities.
- Public Issues не являются secure file-transfer channel.
- Historical/superseded branch limitation не является дефектом current `main`, но unsafe behavior за пределами заявленной branch boundary может быть уязвимостью.

Security response targets приведены в [SECURITY.md](SECURITY.md).
