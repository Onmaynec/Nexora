# Nexora

[![Website](https://img.shields.io/badge/website-open-c69cff)](https://onmaynec.github.io/Nexora/)
[![CI](https://github.com/Onmaynec/Nexora/actions/workflows/ci.yml/badge.svg)](https://github.com/Onmaynec/Nexora/actions/workflows/ci.yml)
![Current version](https://img.shields.io/badge/current-3.3.3%20UNSIGNED--TEST-c69cff)
![Stable signed baseline](https://img.shields.io/badge/stable%20signed-3.1.2-70e6b1)
![API](https://img.shields.io/badge/API-v3%20%2B%20Trust%20v4-70e6b1)
![Database](https://img.shields.io/badge/SQLite-schema%208-70e6b1)
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20PWA%20%7C%20Android-9b5cff)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Nexora** — self-hosted платформа обмена сообщениями для Windows, браузера/PWA и Android. Система объединяет локальный сервер, многоплатформенный клиент, комнаты и модерацию, офлайн-синхронизацию, защищённые сообщения и медиа, эксплуатационные инструменты, а также отдельный коммерческий контур Nexora Pulse.

**Сайт проекта:** [onmaynec.github.io/Nexora](https://onmaynec.github.io/Nexora/) — интерактивная презентация, архитектурные схемы, актуальные GitHub-метрики, документация и загрузки по версиям.

## Статус продукта

| Линия | Назначение | Статус распространения |
|---|---|---|
| `3.3.3` | Goal workflow, Telegram-style voice UX, effective Pulse purchases and safe MLS recovery | Опубликованный UNSIGNED-TEST prerelease без updater metadata |
| `3.3.2` | Release Consistency: единая версия, current docs, release evidence и asset smoke gate | Опубликованный UNSIGNED-TEST prerelease без updater metadata |
| `3.3.1` | Исправление запуска Windows Server: shared Pulse runtime включён в installer и проверяется release gate | Заменён 3.3.2 |
| `3.3.0` | Trust recovery, расходуемые Импульсы, обновлённый Client UX, сайт и полный artifact pipeline | Заменён 3.3.1: Server installer не содержал обязательный shared runtime module |
| `3.1.2` | Основной messaging-контур, Pulse Cloud и production hardening | Последняя подтверждённая signed production baseline |

`3.3.3` исправляет создание коллективных целей, голосовые сообщения, применение Pulse-покупок, idempotent purchase flow и восстановление MLS-состояния. Windows Client/Server публикуются как явно маркированные `UNSIGNED-TEST` assets; updater metadata отсутствует. Авторитетные документы текущей линии:

- [Release Notes 3.3.3](docs/releases/3.3.3/RELEASE_NOTES.md);
- [Release Verification 3.3.3](docs/releases/3.3.3/RELEASE_VERIFICATION.md);
- [Security Review 3.3.0](docs/releases/3.3.0/SECURITY_REVIEW.md) — security boundary не изменён.

## Возможности

### Общение и совместная работа

- личные диалоги, Saved Messages и комнаты;
- ответы, ветки, реакции, упоминания и опросы;
- редактирование, удаление, пересылка, закрепление и закладки;
- silent и scheduled send, серверные черновики и история изменений;
- глобальный поиск, уведомления, архивирование и фильтры;
- IndexedDB cache, delta sync и durable outbox для восстановления после потери связи.

### Комнаты и администрирование

- роли `owner`, `moderator`, `member` и custom roles;
- атомарная передача владения и управление модераторами;
- удаление участника, бан, разбан и room ban list;
- заявки на вступление и несколько приглашений;
- срок действия, лимит использований и отзыв приглашений;
- read-only, slow mode, announcement и pre-approval;
- ограничения файлов, изображений и голосовых;
- административный журнал и системные сообщения;
- server-side authorization для REST и realtime-операций.

### Файлы, изображения и голосовые

Для обычных диалогов доступны resumable uploads с проверкой размера, SHA-256 и фактического MIME-типа, previews и voice playback.

В secure conversations:

- Client шифрует данные AES-256-GCM до загрузки;
- Local Server хранит opaque ciphertext;
- API проверяет фактический размер ciphertext и SHA-256;
- pending attachment недоступен до атомарной привязки к MLS-message;
- поддерживаются progress, cancel, idempotent retry и one-time claim;
- preview, playback и download выполняются после локальной проверки и расшифровки;
- при запрете любого класса `files/images/voice` secure-media path блокируется fail-closed.

### Trust Core и MLS

- Ed25519 device identity с proof-of-possession;
- отдельные ключи для identity proof и MLS signatures;
- строгая привязка MLS BasicCredential к `{ userId, deviceId }`;
- сравнение fingerprint, подписанное подтверждение и отзыв устройств;
- one-time KeyPackages и device/conversation-scoped Welcome delivery;
- monotonic epochs, signed commits и replay protection;
- device-scoped Socket.IO delivery только активным verified devices;
- ciphertext-only persistence и durable MLS outbox;
- encrypted IndexedDB для private MLS state, KeyPackages, decrypted cache и drafts;
- missed-commit recovery с проверкой scope, последовательности epoch, hashes и public-state chain;
- server-side guards против plaintext downgrade через legacy send/edit/forward/draft/scheduled/poll/bot/upload paths.

Фиксированный MLS profile: `MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519`.

### Release 3.3.3

- owner и moderator создают валидируемые коллективные цели; одновременно активна только одна цель комнаты;
- voice waveform реагирует на микрофон, сохраняется в MLS media descriptor и анимируется при playback;
- покупки Pulse применяют server-owned profile, message, reaction и room effects;
- purchase requests защищены стабильным Idempotency-Key и повторное выполнение не списывает баланс дважды;
- MLS open path принудительно сверяет epoch и безопасно запрашивает fresh Welcome без plaintext fallback.

### Release 3.3.2

- package, lockfile, Client handshake и Android metadata синхронизированы одной версией;
- Architecture, Security Model, Android README, Project Index и Documentation Portal актуализированы;
- `CHANGELOG.md` закреплён как единственный источник release history;
- CI блокирует version drift и старые current verification links;
- release evidence pipeline скачивает и smoke-проверяет Client, Server, Android и PWA assets.

### Release 3.3.1

- исправлен crash установленного Nexora Server из-за отсутствующего `shared/pulse-catalog.cjs`;
- `shared/**/*` включён в Windows Server `app.asar`;
- release gate проверяет Server runtime payload и Pulse catalog contract;
- schema 8, API v3 и Trust/MLS API v4 сохранены без миграции.

### Release 3.3.0

- conversation-scoped MLS Welcome limiting, Client coalescing, backoff и Retry-After;
- расходуемый Impulse catalog с atomic ledger purchases и signed/local entitlements;
- самостоятельные Sandbox goals, contributions и refunds без Cloud 503/409;
- in-app confirmation dialogs для обычных и защищённых сообщений;
- RMS/peak voice waveform с played color, animation, seek и playback rate;
- исправленные Pulse overflow и account fallback states;
- переработанный bilingual website с direct GitHub Release downloads;
- signed production artifacts или явно маркированные UNSIGNED TEST installers без updater metadata.

### Security hardening 3.2.3

- не более 16 активных Trust devices на локальную учётную запись;
- не более 25 KeyPackages в одном запросе, 32 unclaimed packages на устройство и 256 на пользователя;
- атомарное применение лимитов в SQLite;
- bounded route-specific rate limits для Trust, recovery и E2EE upload routes;
- стабильная ошибка `RATE_LIMITED` с `Retry-After`;
- action-specific allowlists для Trust audit metadata;
- fail-closed room access при активном бане даже при stale membership;
- startup/hourly cleanup expired sessions, login history старше 90 дней и stale rate-limit buckets.

### Nexora Plus и Pulse

- отдельная Cloud Identity с email verification, MFA и OAuth 2.1 Authorization Code + PKCE;
- Nexora Plus, Impulse double-entry ledger, receipts, billing portal, room goals и расходуемый catalog;
- персональные и room-scoped entitlements с server-defined price и idempotent purchase;
- signed Local Account ↔ Cloud Account linking;
- production entitlements только от отдельного Pulse Cloud;
- локальный sandbox для QA/demo без реальных платежей и production signatures.

### Эксплуатация

- liveness, readiness и защищённые Prometheus metrics;
- request IDs и recursive credential redaction;
- graceful drain и сериализованный shutdown;
- audited developer command registry без shell/eval;
- SQLite WAL/FULL, integrity checks, backup/restore, retention и quota;
- очистка устаревших security records при старте и каждый час;
- отдельные Windows Client/Server shells, PWA и Android WebView shell.

## Архитектура

```mermaid
flowchart TB
  classDef platform fill:#181221,stroke:#b978ff,stroke-width:1.5px,color:#f7f3ff;
  classDef client fill:#211533,stroke:#c994ff,stroke-width:1.5px,color:#ffffff;
  classDef server fill:#0f1c25,stroke:#70d8ff,stroke-width:1.5px,color:#f4fbff;
  classDef data fill:#101a17,stroke:#65e4b0,stroke-width:1.5px,color:#f4fff9;
  classDef cloud fill:#241a14,stroke:#f1c666,stroke-width:1.5px,color:#fff8e8;
  classDef external fill:#181818,stroke:#9299a8,stroke-width:1px,color:#f2f2f2;

  subgraph PLATFORMS["01 · КЛИЕНТСКИЕ ПЛАТФОРМЫ"]
    direction LR
    WIN["Windows Client"]
    PWA["Browser / PWA"]
    AND["Android"]
  end

  subgraph CLIENT["02 · КЛИЕНТСКОЕ ПРИЛОЖЕНИЕ"]
    direction LR
    UI["React + Vite<br/>интерфейс · offline state · outbox"]
    TRUST["Trust Core + MLS<br/>device identity · E2EE · recovery"]
    LOCAL[("Encrypted IndexedDB<br/>ключи · private MLS state · drafts")]
    UI --> TRUST --> LOCAL
  end

  subgraph SERVER["03 · ЛОКАЛЬНЫЙ СЕРВЕР"]
    direction LR
    EDGE["API + Realtime<br/>REST v3 · Trust v4 · Socket.IO"]
    CONTROL["Контроль доступа<br/>sessions · CSRF · roles · bans · limits"]
    DB[("SQLite schema 8<br/>rooms · ciphertext · audit")]
    SERVICES["Медиа и эксплуатация<br/>uploads · health · backup · maintenance"]
    EDGE --> CONTROL --> DB
    EDGE --> SERVICES
  end

  subgraph CLOUD["04 · NEXORA PULSE CLOUD"]
    direction LR
    ID["Cloud Identity<br/>email · MFA · OAuth 2.1 + PKCE"]
    COMMERCE["Коммерческий контур<br/>Plus · Impulse ledger · receipts"]
    ENT["Signed entitlements<br/>подписки и покупки"]
    PAY["Payment provider"]
    ID --> COMMERCE --> ENT
    COMMERCE --> PAY
  end

  WIN --> UI
  PWA --> UI
  AND --> UI
  TRUST <-->|"HTTPS · MLS ciphertext · verified device channel"| EDGE
  EDGE <-->|"signed HTTPS contract"| ID

  class WIN,PWA,AND platform;
  class UI,TRUST client;
  class LOCAL,DB data;
  class EDGE,CONTROL,SERVICES server;
  class ID,COMMERCE,ENT cloud;
  class PAY external;

  style PLATFORMS fill:#0b0910,stroke:#6f568b,stroke-width:1px
  style CLIENT fill:#0d0914,stroke:#9c67d3,stroke-width:1px
  style SERVER fill:#081116,stroke:#4d91aa,stroke-width:1px
  style CLOUD fill:#151008,stroke:#a98643,stroke-width:1px
```

Local Server является источником истины для локальных аккаунтов, комнат, ролей, доступа, порядка доставки и хранения ciphertext. Pulse Cloud является отдельным authority для Cloud Identity, billing, ledger и production entitlements.

Local Server не получает private MLS state, plaintext secure-message content или ключи secure attachments. При этом сервер видит service metadata: account/device identifiers, membership, conversation scope, timing, IP/network context, ciphertext size, attachment ID и delivery events. Nexora `3.3.2` не заявляет защиту от traffic analysis.

Полное описание: [Architecture](docs/ARCHITECTURE.md), [Security Model](docs/SECURITY_MODEL.md) и [Project Index](PROJECT_INDEX.md).

## Требования

- Node.js `22.16+` и npm;
- Windows 10/11 для Electron Client/Server;
- JDK 17, Android SDK 36 и Gradle 8.13 для Android source build;
- HTTPS для PWA, Android и публичных развёртываний;
- отдельная Cloud-среда и provider credentials только для production Pulse.

## Быстрый старт для разработки

```bash
git clone https://github.com/Onmaynec/Nexora.git
cd Nexora
npm ci
npm run dev
```

Полный release-sensitive gate:

```bash
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

| Команда | Назначение |
|---|---|
| `npm run check` | syntax, Electron Builder config и production web build |
| `npm test` | web build, unit/API/integration и performance suites |
| `npm run test:unit` | функциональные unit/API/integration tests |
| `npm run test:performance` | изолированный performance smoke |
| `npm run audit:security` | security invariants и dependency audit |
| `npm run test:soak` | долговременная проверка состояния, backup и SQLite integrity |
| `npm run dist:windows` | локальные тестовые NSIS Client/Server builds |
| `npm run release:windows` | release gate и локальные Windows installers без обязательной подписи |
| `npm run release:windows:signed` | release gate, signing gate и подписанные production installers |

## Развёртывание

Публичный Local Server размещайте только за HTTPS reverse proxy с ограниченным firewall, явным `allowedOrigins`, мониторингом и регулярными резервными копиями. Прямой port forwarding локального server port не является поддерживаемой production-топологией.

Перед подключением пользователя передайте по доверенному каналу:

1. полный HTTPS-адрес;
2. Server ID;
3. SHA-256 certificate fingerprint.


Electron Client закрепляет fingerprint за Server ID. Для браузера/PWA и Android Local CA необходимо установить в доверенное хранилище операционной системы. TLS errors не должны обходиться.

Инструкции: [Deployment Guide](docs/DEPLOYMENT.md), [Administrator Guide](ADMIN_GUIDE.md) и [Operations Runbook](docs/OPERATIONS_RUNBOOK.md).

## Документация

Центральный каталог: **[Nexora Documentation](docs/README.md)**.

| Раздел | Документы |
|---|---|
| Продукт | [Product Overview](docs/PRODUCT_OVERVIEW.md), [Roadmap](docs/ROADMAP.md), [Current Release Status](BRANCH_STATUS.md) |
| Архитектура | [Architecture](docs/ARCHITECTURE.md), [Project Index](PROJECT_INDEX.md) |
| Безопасность | [Security Policy](SECURITY.md), [Security Model](docs/SECURITY_MODEL.md), [Security Verification](SECURITY_AUDIT.md) |
| Развёртывание | [Deployment](docs/DEPLOYMENT.md), [Administrator Guide](ADMIN_GUIDE.md), [Operations Runbook](docs/OPERATIONS_RUNBOOK.md) |
| Тестирование | [Acceptance Test Guide](TESTER_GUIDE.md), [3.3.2 Verification](docs/releases/3.3.3/RELEASE_VERIFICATION.md) |
| Trust / MLS | [Trust Core 3.2.0 foundation](docs/TRUST_CORE_3.2.0.md), [Security Review 3.3.0](docs/releases/3.3.0/SECURITY_REVIEW.md) |
| Миграция | [Schema 8 Migration](docs/MIGRATION_3.2.0.md) |
| Plus / Pulse | [Pulse](docs/PULSE.md), [Pulse Cloud](docs/PULSE_CLOUD.md) |
| Выпуски | [Release Policy](docs/RELEASE_POLICY.md), [Release Checklist](docs/RELEASE_CHECKLIST.md), [Release History](docs/releases/README.md), [Changelog](CHANGELOG.md) |
| Репозиторий | [Branch Index](BRANCHES.md), [Contributing](CONTRIBUTING.md), [Support](SUPPORT.md) |

## Поддержка и участие

- ошибки: [Bug report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml);
- предложения: [Feature request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml);
- установка и эксплуатация: [SUPPORT.md](SUPPORT.md);
- уязвимости: только приватно по инструкции в [SECURITY.md](SECURITY.md);
- правила участия: [CONTRIBUTING.md](CONTRIBUTING.md) и [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

## Лицензия

Код и документация распространяются по лицензии [MIT](LICENSE).
