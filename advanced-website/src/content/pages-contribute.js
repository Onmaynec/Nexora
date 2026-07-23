const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'development', group: 'contribute', icon: 'GitPullRequestArrow', title: both('Участие в разработке', 'Contributing'),
    description: both('Рабочий процесс изменения Nexora.', 'The Nexora change workflow.'),
    body: both(
`# Участие в разработке

## Перед изменением

Изучите архитектуру, source of truth, существующие services/models/components, permission boundaries, migrations и tests. Не создавайте дублирующий service или новый dependency без необходимости.

## Ветка и PR

- одна связная задача на ветку;
- test-first для bugfix;
- migrations и rollback вместе со schema change;
- client/server/shared contracts обновляются атомарно;
- документация и changelog входят в ту же PR;
- секреты и generated binaries не коммитятся.

## Review checklist

- server-side authorization не заменён UI;
- error codes стабильны;
- concurrent edge cases покрыты;
- realtime access отзывается немедленно;
- uploads fail closed;
- no TODO/stub/dead code;
- lint, type-check, unit, integration, API, e2e и production build проходят по доступности.

## Source navigation

Используйте ссылки «Изменить на GitHub» и source paths на repository-backed страницах. API inventory помогает найти routes, но semantic review начинается с service и tests.`,
`# Contributing

## Before changing code

Study architecture, sources of truth, existing services/models/components, permission boundaries, migrations, and tests. Do not create a duplicate service or add a dependency without need.

## Branch and PR

- one coherent task per branch;
- test-first for bug fixes;
- migrations and rollback with schema changes;
- client/server/shared contracts updated atomically;
- documentation and changelog in the same PR;
- no secrets or generated binaries committed.

## Review checklist

- server authorization is not replaced by UI hiding;
- error codes remain stable;
- concurrent edge cases are covered;
- realtime access is revoked immediately;
- uploads fail closed;
- no TODOs, stubs, or dead code;
- lint, type-check, unit, integration, API, available e2e, and production build pass.

## Source navigation

Use “Edit on GitHub” and source paths on repository-backed pages. API inventory helps locate routes, but semantic review starts with services and tests.`),
  },
  {
    id: 'testing', group: 'contribute', icon: 'TestTubeDiagonal', title: both('Тестирование', 'Testing'),
    description: both('Quality gates и security regression coverage.', 'Quality gates and security regression coverage.'),
    body: both(
`# Тестирование

## Уровни

| Уровень | Назначение |
| --- | --- |
| Unit | reducers, validators, permissions, retry classification |
| Integration | services + repositories + migrations |
| API | auth, CSRF, roles, bans, limits, stable errors |
| Realtime | channel access, replay, revoke, ordering |
| Client | components, offline, upload, voice, accessibility |
| Packaging | real Windows Client/Server payload smoke start |
| Security | IDOR, downgrade, fake MIME, replay, races |

## Обязательные сценарии комнат

Owner/moderator/member boundaries, ownership transfer, moderator assignment, kick/ban/unban, read-only, slow mode, media restrictions, valid/revoked/expired/exhausted invites, concurrent final invite use и join requests.

## Release gate

\`\`\`bash
npm run release:check
\`\`\`

Release artifact считается готовым только после проверки фактического installer/archive payload, checksums и updater metadata policy.`,
`# Testing

## Levels

| Level | Purpose |
| --- | --- |
| Unit | reducers, validators, permissions, retry classification |
| Integration | services, repositories, and migrations |
| API | auth, CSRF, roles, bans, limits, stable errors |
| Realtime | channel access, replay, revocation, ordering |
| Client | components, offline, uploads, voice, accessibility |
| Packaging | real Windows Client/Server payload smoke start |
| Security | IDOR, downgrade, fake MIME, replay, races |

## Required room scenarios

Owner/moderator/member boundaries, ownership transfer, moderator assignment, kick/ban/unban, read-only, slow mode, media restrictions, valid/revoked/expired/exhausted invitations, concurrent final invite use, and join requests.

## Release gate

\`\`\`bash
npm run release:check
\`\`\`

A release artifact is ready only after the actual installer/archive payload, checksums, and updater-metadata policy are verified.`),
  },
  {
    id: 'release-process', group: 'contribute', icon: 'PackageCheck', title: both('Релизный процесс', 'Release process'),
    description: both('SemVer, evidence, signing и publication gates.', 'SemVer, evidence, signing, and publication gates.'),
    body: both(
`# Релизный процесс

## Semantic Versioning

Patch release исправляет дефекты без крупных несвязанных функций. Minor release добавляет обратно совместимые функции. Breaking contract требует major и migration guide.

## Pipeline

1. Синхронизировать version metadata.
2. Выполнить syntax/build/unit/integration/performance/security gates.
3. Собрать Windows Client/Server, PWA и Android.
4. Проверить реальный runtime payload.
5. Подписать при наличии production keys либо явно маркировать UNSIGNED-TEST.
6. Создать SBOM и SHA256SUMS.
7. Опубликовать release notes и machine-readable evidence.
8. Не выдавать unsigned prerelease updater metadata.

## Evidence

Release verification фиксирует commit, CI run, schema/API compatibility, migrations, artifacts, digests, signing status и реальные ограничения.`,
`# Release process

## Semantic Versioning

A patch release fixes defects without large unrelated features. A minor release adds backward-compatible functionality. Breaking contracts require a major version and migration guide.

## Pipeline

1. Synchronize version metadata.
2. Run syntax, build, unit, integration, performance, and security gates.
3. Build Windows Client/Server, PWA, and Android.
4. Verify the real runtime payload.
5. Sign with production keys or explicitly mark UNSIGNED-TEST.
6. Produce SBOM and SHA256SUMS.
7. Publish release notes and machine-readable evidence.
8. Never publish production updater metadata for an unsigned prerelease.

## Evidence

Release verification records the commit, CI run, schema/API compatibility, migrations, artifacts, digests, signing status, and real limitations.`),
  }
];
