const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'introduction', group: 'getting-started', icon: 'Sparkles',
    title: both('Введение', 'Introduction'),
    description: both('Технический портал Nexora для разработчиков и операторов.', 'The technical Nexora portal for developers and operators.'),
    body: both(
`# Nexora Advanced Documentation

Nexora — self-hosted коммуникационная платформа для Windows, PWA и Android. Этот портал описывает не маркетинговую поверхность, а инженерные границы продукта: локальный authority-сервер, React-клиент, Trust Core/MLS, защищённые медиа, Nexora Pulse Cloud, релизный процесс и эксплуатацию.

## Для кого этот портал

- разработчики, которые изучают код или готовят pull request;
- администраторы частных Nexora Server;
- специалисты по безопасности и аудиторы;
- интеграторы REST API, Socket.IO и Pulse;
- сопровождающие Windows, PWA и Android-сборки.

## Источники истины

Портал формируется из текущего \`package.json\`, исходного кода, Markdown-документации и release notes. Индекс маршрутов, realtime-событий и стабильных кодов ошибок извлекается при сборке. Документы 0.3–1.0 из приложенного Documentation Kit доступны отдельно и помечены как исторические: они полезны для понимания решений, но не заменяют current main.

## Архитектурная граница

\`Local Server\` остаётся источником истины для локальных аккаунтов, комнат, ролей, доступа, порядка доставки и локального хранения. \`Pulse Cloud\` является отдельным authority для Cloud Identity, billing, ledger и production entitlements. Secure message plaintext и private MLS state не должны переходить в серверный контур.

## Навигация

Начните с Quickstart, затем изучите Architecture Overview и Security Model. При интеграции используйте автоматически сформированный API Inventory и всегда проверяйте source link: извлечённый индекс показывает наличие контракта, но окончательные permissions и validation определяются серверным кодом.`,
`# Nexora Advanced Documentation

Nexora is a self-hosted communication platform for Windows, PWA, and Android. This portal documents the engineering surface rather than the marketing surface: the local authority server, React client, Trust Core/MLS, encrypted media, Nexora Pulse Cloud, release engineering, and operations.

## Who this portal is for

- developers studying the codebase or preparing a pull request;
- administrators operating a private Nexora Server;
- security engineers and auditors;
- REST API, Socket.IO, and Pulse integrators;
- maintainers of Windows, PWA, and Android builds.

## Sources of truth

The portal is generated from the current \`package.json\`, repository source, Markdown documentation, and release notes. REST routes, realtime events, and stable error codes are indexed during the build. The attached 0.3–1.0 Documentation Kit is available in a clearly marked historical section; it explains design intent but does not override current main.

## Authority boundary

\`Local Server\` is authoritative for local accounts, rooms, roles, access, delivery ordering, and local persistence. \`Pulse Cloud\` is a separate authority for Cloud Identity, billing, ledger, and production entitlements. Secure-message plaintext and private MLS state must remain outside the server authority.

## How to navigate

Start with Quickstart, then read Architecture Overview and Security Model. Integrators should use the generated API Inventory and follow each source link: extraction confirms that a contract exists, while the server implementation remains authoritative for permissions and validation.`),
    special: 'home',
  },
  {
    id: 'quickstart', group: 'getting-started', icon: 'Rocket', title: both('Quickstart', 'Quickstart'),
    description: both('Запуск локальной среды и базовая проверка.', 'Run the local stack and verify the baseline.'),
    body: both(
`# Quickstart

## Требования

- Node.js версии, указанной в корневом \`package.json\`;
- npm с lockfile-установкой;
- Windows 10/11 для Electron Client/Server;
- HTTPS для PWA, Android и публичного развертывания.

## Установка

\`\`\`bash
npm ci
\`\`\`

## Локальная разработка

\`\`\`bash
npm run dev
\`\`\`

Команда запускает сервер разработки и Vite-клиент параллельно. Для изолированной диагностики используйте \`npm run dev:server\` и \`npm run dev:web\`.

## Проверка проекта

\`\`\`bash
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
\`\`\`

## Сборка клиента

\`\`\`bash
npm run build:web
npm run preview
\`\`\`

## Первый инженерный ориентир

1. Откройте \`PROJECT_INDEX.md\` и карту каталогов.
2. Найдите server authority в \`server/\` и API/realtime handlers.
3. Найдите React application shell в \`client/\`.
4. Изучите \`docs/ARCHITECTURE.md\` и \`docs/SECURITY_MODEL.md\`.
5. Перед изменением поведения найдите существующие regression tests и стабильные error codes.`,
`# Quickstart

## Requirements

- the Node.js version declared in the root \`package.json\`;
- npm with lockfile-based installation;
- Windows 10/11 for Electron Client/Server packaging;
- HTTPS for PWA, Android, and public deployments.

## Install

\`\`\`bash
npm ci
\`\`\`

## Local development

\`\`\`bash
npm run dev
\`\`\`

This starts the development server and Vite client in parallel. Use \`npm run dev:server\` and \`npm run dev:web\` for isolated diagnostics.

## Verify the baseline

\`\`\`bash
npm run check
npm run test:unit
npm run test:performance
npm run audit:security
\`\`\`

## Build the client

\`\`\`bash
npm run build:web
npm run preview
\`\`\`

## First engineering pass

1. Read \`PROJECT_INDEX.md\` and the directory map.
2. Locate server authority and API/realtime handlers under \`server/\`.
3. Locate the React application shell under \`client/\`.
4. Read \`docs/ARCHITECTURE.md\` and \`docs/SECURITY_MODEL.md\`.
5. Before changing behavior, find existing regression tests and stable error codes.`),
  },
  {
    id: 'client-installation', group: 'getting-started', icon: 'MonitorDown', title: both('Установка клиента', 'Client installation'),
    description: both('Windows, PWA и Android-контуры.', 'Windows, PWA, and Android delivery paths.'),
    body: both(
`# Установка клиента

## Windows Client

Production installer создаётся Electron Builder после прохождения release gates. Проверяйте подпись и тип опубликованного asset: неподписанный \`UNSIGNED-TEST\` предназначен для тестирования и не должен подключаться к production updater metadata.

\`\`\`bash
npm run dist:client
\`\`\`

## PWA

PWA собирается из Vite-клиента. Для service worker, secure cookies, media permissions и устойчивого origin требуется HTTPS. Публичный reverse proxy должен сохранять WebSocket upgrade и не подменять security headers.

\`\`\`bash
npm run build:web
\`\`\`

## Android

Android shell использует тот же web application contract. Проверяйте exact origin, сертификаты, разрешения микрофона/файлов и совместимость WebView. Android artifact без release signing должен быть явно маркирован тестовым.

## Server profile

Клиент должен хранить привязку server identity к точному origin и ожидаемому certificate fingerprint. Изменение origin или fingerprint — security event, а не обычный redirect.`,
`# Client installation

## Windows Client

The production installer is built with Electron Builder after release gates pass. Verify the signature and asset class: an \`UNSIGNED-TEST\` build is intended for testing and must not receive production updater metadata.

\`\`\`bash
npm run dist:client
\`\`\`

## PWA

The PWA is produced from the Vite client. HTTPS is required for service workers, secure cookies, media permissions, and stable origin semantics. A public reverse proxy must preserve WebSocket upgrades and security headers.

\`\`\`bash
npm run build:web
\`\`\`

## Android

The Android shell consumes the same web application contract. Verify exact-origin rules, certificates, microphone/file permissions, and WebView compatibility. Android artifacts without release signing must be explicitly marked as test builds.

## Server profile

The client should bind server identity to an exact origin and expected certificate fingerprint. An origin or fingerprint change is a security event, not a normal redirect.`),
  },
  {
    id: 'server-installation', group: 'getting-started', icon: 'Server', title: both('Установка сервера', 'Server installation'),
    description: both('Local Server, конфигурация и жизненный цикл.', 'Local Server configuration and lifecycle.'),
    body: both(
`# Установка Nexora Server

## Source mode

\`\`\`bash
npm ci
npm start
\`\`\`

\`npm start\` запускает server CLI. Cloud-контур запускается отдельно через \`npm run start:cloud\` и не должен автоматически получать доступ к local messaging data.

## Windows Server

\`\`\`bash
npm run dist:server
\`\`\`

Перед публикацией installer проверяет runtime payload, включая shared modules. Ошибка отсутствующего shared runtime должна ловиться build-config regression gate до выпуска.

## Production baseline

- выделенный data directory с резервным копированием;
- HTTPS и точные public origins;
- отдельные production secrets для Pulse Cloud;
- защищённые health/metrics endpoints;
- controlled shutdown вместо принудительного завершения;
- регулярная SQLite integrity/backup проверка;
- запрет логирования токенов, cookies, private keys и plaintext secure content.

## После установки

Выполните liveness/readiness checks, создайте резервную копию, проверьте registration policy, лимиты uploads, retention и восстановление в тестовой среде.`,
`# Nexora Server installation

## Source mode

\`\`\`bash
npm ci
npm start
\`\`\`

\`npm start\` launches the server CLI. The cloud authority starts separately through \`npm run start:cloud\` and must not gain implicit access to local messaging data.

## Windows Server

\`\`\`bash
npm run dist:server
\`\`\`

Before publication, the installer validates its runtime payload, including shared modules. Missing shared runtime dependencies must fail a build-config regression gate before release.

## Production baseline

- dedicated data directory with backups;
- HTTPS and exact public origins;
- separate production secrets for Pulse Cloud;
- protected health and metrics endpoints;
- controlled shutdown instead of forced termination;
- regular SQLite integrity and backup validation;
- no tokens, cookies, private keys, or secure plaintext in logs.

## Post-install verification

Run liveness/readiness checks, create a backup, verify registration policy, upload limits, retention, and restore behavior in a non-production environment.`),
  },
  {
    id: 'deployment', group: 'getting-started', icon: 'CloudCog', title: both('Production deployment', 'Production deployment'),
    description: both('Reverse proxy, TLS, process lifecycle и rollout.', 'Reverse proxy, TLS, process lifecycle, and rollout.'),
    body: both(
`# Production deployment

## Топология

Рекомендуемая граница: Local Server и его SQLite/uploads находятся в доверенном контуре организации; reverse proxy публикует только необходимые HTTPS и WebSocket endpoints. Pulse Cloud разворачивается отдельно с собственными identity, billing и signing secrets.

## Reverse proxy checklist

- сохранять \`Upgrade\`/\`Connection\` для Socket.IO;
- передавать корректный client IP только через доверенную proxy chain;
- ограничивать body size согласованно с серверными upload limits;
- не кэшировать session/bootstrap/private API;
- включить HSTS только после проверки HTTPS rollout;
- не переписывать origin без обновления client server profile.

## Rolling update

1. Проверить release notes и migrations.
2. Создать проверенный backup.
3. Перевести сервер в drain/maintenance.
4. Дождаться активных mutations/uploads.
5. Обновить runtime и выполнить startup migrations.
6. Проверить readiness, metrics и realtime reconnect.
7. Снять maintenance и наблюдать error budget.

## Rollback

Rollback к бинарнику без совместимого schema rollback может повредить данные. Используйте документированный restore path и совместимую backup snapshot.`,
`# Production deployment

## Topology

Keep Local Server, SQLite, and uploads inside the organization's trusted boundary. Publish only required HTTPS and WebSocket endpoints through a reverse proxy. Deploy Pulse Cloud separately with independent identity, billing, and signing secrets.

## Reverse proxy checklist

- preserve \`Upgrade\` and \`Connection\` for Socket.IO;
- trust client IP headers only from an explicit proxy chain;
- align proxy body limits with server upload limits;
- never cache session, bootstrap, or private API responses;
- enable HSTS only after the HTTPS rollout is verified;
- do not rewrite origins without updating client server-profile bindings.

## Rolling update

1. Review release notes and migrations.
2. Create and verify a backup.
3. Enter drain or maintenance mode.
4. Wait for active mutations and uploads.
5. Update runtime and apply startup migrations.
6. Verify readiness, metrics, and realtime reconnect.
7. Leave maintenance mode and watch the error budget.

## Rollback

Rolling back binaries without a compatible schema path can damage data. Use the documented restore workflow and a compatible backup snapshot.`),
  }
];
