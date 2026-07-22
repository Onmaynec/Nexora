# Nexora Documentation

Этот каталог является официальной точкой входа в техническую, эксплуатационную и релизную документацию Nexora.

## Актуальный статус

| Параметр | Значение |
|---|---|
| Текущая версия репозитория | `3.2.0` |
| Классификация 3.2.0 | Source/PWA prerelease для контролируемого тестирования |
| Последняя signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS API | v4 |
| Local Server database | SQLite schema 8 |
| Stable audited E2EE claim | отсутствует |

Документы 3.2.0 описывают реализованный и автоматически проверенный secure-message path. Они не заменяют независимый cryptographic/application-security review и не подтверждают traffic-analysis resistance.

## Начало работы

| Задача | Документ |
|---|---|
| Понять назначение продукта | [Product Overview](PRODUCT_OVERVIEW.md) |
| Запустить проект для разработки | [README](../README.md#быстрый-старт-для-разработки) |
| Развернуть Local Server | [Deployment Guide](DEPLOYMENT.md) |
| Администрировать установку | [Administrator Guide](../ADMIN_GUIDE.md) |
| Выполнить приёмочное тестирование | [Tester Guide](../TESTER_GUIDE.md) |
| Получить поддержку | [Support Policy](../SUPPORT.md) |

## Архитектура и кодовая база

| Документ | Назначение |
|---|---|
| [Architecture](ARCHITECTURE.md) | компоненты, data flow, trust boundaries, realtime и storage |
| [Project Index](../PROJECT_INDEX.md) | карта entrypoints, модулей, API и тестов |
| [Trust Core 3.2.0](TRUST_CORE_3.2.0.md) | device lifecycle, MLS profile, recovery и secure messaging |
| [ADR: Pulse Cloud Boundary](ADR_0001_PULSE_CLOUD_BOUNDARY.md) | разделение Local Server и коммерческого Cloud authority |

## Безопасность

| Документ | Назначение |
|---|---|
| [Security Policy](../SECURITY.md) | поддерживаемые версии и приватное раскрытие уязвимостей |
| [Security Audit](../SECURITY_AUDIT.md) | зафиксированные автоматические проверки и остаточные риски |
| [Release Verification 3.2.0](../RELEASE_VERIFICATION_3.2.0.md) | evidence автоматического release gate |
| [Schema 8 Migration](MIGRATION_3.2.0.md) | migration, backup, downgrade protection и rollback |

## Nexora Plus и Pulse

| Документ | Назначение |
|---|---|
| [Pulse Product Boundary](PULSE.md) | продуктовая модель, modes и Local/Cloud contract |
| [Pulse Cloud](PULSE_CLOUD.md) | Cloud Identity, billing, ledger и provider integration |
| [Cloud Identity](CLOUD_IDENTITY.md) | registration, email verification, MFA и OAuth 2.1 PKCE |
| [Local Pulse Integration](LOCAL_PULSE_INTEGRATION.md) | signed Local Server integration и verified cache |

## Релизы и сопровождение

| Документ | Назначение |
|---|---|
| [Release Policy](RELEASE_POLICY.md) | SemVer, release classifications и promotion gates |
| [GitHub Release Guide](GITHUB_RELEASE.md) | tags, signing, assets и updater policy |
| [Release Checklist](RELEASE_CHECKLIST.md) | обязательный технический и ручной gate |
| [Changelog](../CHANGELOG.md) | хронология пользовательских и технических изменений |
| [Release Notes 3.2.0](../RELEASE_NOTES_3.2.0.md) | состав текущего prerelease |
| [Branch Index](../BRANCHES.md) | назначение активных и исторических веток |

## Интеграции и платформы

| Документ | Назначение |
|---|---|
| [Automations](AUTOMATIONS.md) | bots, scoped tokens и webhooks |
| [Android](../android/README.md) | Android WebView shell, build и TLS policy |

## Статусы документов

В документации применяются следующие обозначения:

- **Current** — соответствует `main` и текущей версии репозитория;
- **Stable baseline** — описывает последнюю подтверждённую signed production line;
- **Prerelease** — реализовано и автоматически проверено, но не прошло все manual/signing/external-review gates;
- **Historical** — сохранено для migration, audit или release provenance;
- **Draft** — план или незавершённая разработка, не являющаяся гарантией продукта.

## Правила документации

1. Документ должен различать реализованное, проверенное и запланированное.
2. Security claims должны указывать конкретную версию и границу доверия.
3. Release status определяется verification evidence, signing state и manual gates, а не только номером версии.
4. Исторические документы не переписываются так, чтобы создавать ложную историю релиза.
5. Секреты, private keys, реальные пользовательские данные и необработанные production logs в документацию не включаются.
6. При изменении пользовательского поведения обновляются соответствующие guide, release notes и changelog.
