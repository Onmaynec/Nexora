# Документация Nexora

Этот каталог является официальной точкой входа в продуктовую, техническую, эксплуатационную, security- и release-документацию Nexora.

## Текущий статус

| Параметр | Значение |
|---|---|
| Текущая версия репозитория | `3.2.4` |
| Канал распространения | Source/PWA prerelease для контролируемого тестирования |
| Последняя signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | SQLite schema 8 |
| Database migration с 3.2.0–3.2.2 | не требуется |
| Независимый E2EE/security audit | не завершён |

`3.2.4` включает Trust/MLS и encrypted-media foundation `3.2.0`, lifecycle fixes `3.2.1–3.2.2`, security hardening `3.2.3` и recovery patch `3.2.4` для updater, Server console, MLS Welcome и Client diagnostics. Документация различает реализованное поведение, автоматические доказательства, ручные release-gates и независимую проверку.

## Быстрый выбор документа

| Задача | Документ |
|---|---|
| Понять назначение и состав продукта | [Обзор продукта](PRODUCT_OVERVIEW.md) |
| Запустить проект для разработки | [README](../README.md#быстрый-старт-для-разработки) |
| Развернуть Local Server | [Руководство по развёртыванию](DEPLOYMENT.md) |
| Администрировать установку | [Руководство администратора](../ADMIN_GUIDE.md) |
| Выполнять backup, maintenance и incident response | [Operations Runbook](OPERATIONS_RUNBOOK.md) |
| Провести приёмочное тестирование | [Acceptance Test Guide](../TESTER_GUIDE.md) |
| Сообщить об ошибке или получить поддержку | [Support Policy](../SUPPORT.md) |

## Продукт и архитектура

| Документ | Назначение | Статус |
|---|---|---|
| [Product Overview](PRODUCT_OVERVIEW.md) | назначение, платформы, функции, версии и ограничения | Current through 3.2.4 |
| [Architecture](ARCHITECTURE.md) | компоненты, data flow, storage, authorization и trust boundaries | Current through 3.2.4 |
| [Project Index](../PROJECT_INDEX.md) | карта entrypoints, модулей, API и тестов | Current 3.2.4 |
| [Security Model](SECURITY_MODEL.md) | threat model, Trust/MLS, resource governance и residual risks | Current through 3.2.4 |
| [Pulse Cloud Boundary ADR](ADR_0001_PULSE_CLOUD_BOUNDARY.md) | разделение Local Server и Cloud authority | Current architecture decision |

## Безопасность

| Документ | Назначение | Статус |
|---|---|---|
| [Security Policy](../SECURITY.md) | поддерживаемые версии и приватное раскрытие уязвимостей | Current |
| [Security Verification Summary](../SECURITY_AUDIT.md) | автоматические проверки и остаточные риски | Current 3.2.3 |
| [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) | updater, console, Welcome recovery и test-mode security boundary | Current release-specific |
| [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md) | CI evidence и compatibility boundary | Current release-specific |
| [Security Review 3.2.3](../SECURITY_REVIEW_3.2.3.md) | resource-governance findings и security patch decisions | Historical release-specific |
| [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md) | 3.2.3 CI evidence и compatibility boundary | Historical release-specific |
| [Trust Core 3.2.0](TRUST_CORE_3.2.0.md) | исходная Trust/MLS foundation и protocol design | Historical foundation |
| [Schema 8 Migration](MIGRATION_3.2.0.md) | migration, backup, downgrade protection и rollback | Current schema history |

## Развёртывание и эксплуатация

| Документ | Назначение |
|---|---|
| [Deployment Guide](DEPLOYMENT.md) | поддерживаемые topology, TLS, database и release channels |
| [Administrator Guide](../ADMIN_GUIDE.md) | пользователи, комнаты, Trust devices, Pulse и updates |
| [Operations Runbook](OPERATIONS_RUNBOOK.md) | startup, monitoring, maintenance, backup, restore и incidents |
| [GitHub Release Guide](GITHUB_RELEASE.md) | tags, signing, assets и updater policy |
| [Release Checklist](RELEASE_CHECKLIST.md) | автоматический и ручной release gate |

## Nexora Plus и Pulse

| Документ | Назначение |
|---|---|
| [Pulse Product Boundary](PULSE.md) | продуктовая модель, modes и Local/Cloud contract |
| [Pulse Cloud](PULSE_CLOUD.md) | Cloud Identity, billing, ledger и provider integration |
| [Cloud Identity](CLOUD_IDENTITY.md) | registration, email verification, MFA и OAuth 2.1 PKCE |
| [Local Pulse Integration](LOCAL_PULSE_INTEGRATION.md) | signed Local Server integration и verified cache |

## Релизы

| Документ | Назначение |
|---|---|
| [Release Policy](RELEASE_POLICY.md) | Semantic Versioning, classifications и promotion gates |
| [Changelog](../CHANGELOG.md) | хронология пользовательских и технических изменений |
| [Release Notes 3.2.4](../RELEASE_NOTES_3.2.4.md) | текущий updater/console/Welcome recovery patch |
| [Security Review 3.2.4](../SECURITY_REVIEW_3.2.4.md) | security boundaries текущего patch release |
| [Release Verification 3.2.4](../RELEASE_VERIFICATION_3.2.4.md) | авторитетное автоматическое evidence текущей версии |
| [Release Notes 3.2.3](../RELEASE_NOTES_3.2.3.md) | исторический security hardening patch |
| [Branch Index](../BRANCHES.md) | назначение активных и исторических веток |
| [Current Release Status](../BRANCH_STATUS.md) | текущая release classification и blockers |

## Интеграции и платформы

| Документ | Назначение |
|---|---|
| [Automations](AUTOMATIONS.md) | bots, scoped tokens и webhooks |
| [Android](../android/README.md) | Android WebView shell, build, TLS и runtime gates |

## Статусы документов

- **Current** — соответствует `main` и текущей версии репозитория.
- **Release-specific** — фиксирует состав и evidence конкретного релиза; не переписывается задним числом.
- **Stable baseline** — относится к последней подтверждённой signed production line.
- **Prerelease** — реализовано и автоматически проверено, но не прошло полный manual/signing/external-review gate.
- **Historical foundation** — сохраняется для architecture, migration и release provenance.
- **Draft** — план или незавершённая разработка, не являющаяся гарантией продукта.

## Стандарт документации

1. Указывать версию, release classification и область применимости.
2. Разделять реализованное поведение, automated evidence, manual evidence и planned work.
3. Не использовать термины «stable», «production-ready», «audited» или «E2EE» без конкретной границы и доказательств.
4. Не переписывать исторические release-документы так, чтобы изменять provenance.
5. Не включать secrets, private keys, реальные пользовательские данные, полные базы или необработанные production logs.
6. При изменении поведения обновлять guide, changelog, release notes и verification material.
7. Использовать относительные ссылки и проверять их из default branch.
