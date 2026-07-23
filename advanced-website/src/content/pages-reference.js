const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'versions', group: 'reference', icon: 'GitBranch', title: both('Версии 3.1–3.3', 'Versions 3.1–3.3'),
    description: both('Исторические линии и compatibility.', 'Historical lines and compatibility.'),
    body: both(
`# Версии 3.1–3.3

## 3.1.x

Линия Cloud Identity, OAuth 2.1 + PKCE, MFA, Pulse billing/entitlements и production hardening. Patch-релизы исправляли updater, voice и sandbox administration.

## 3.2.x

Линия Trust/MLS, secure media, release hardening, UX/regression fixes и расширенной security/performance проверки.

## 3.3.x

Линия Trust recovery, расходуемого Impulse catalog, обновлённого Client UX, сайта и полного artifact pipeline. 3.3.1 исправляет packaged Server startup из-за отсутствующего shared Pulse runtime, а 3.3.2 добавляет release-consistency и post-publication asset smoke gates без schema/API migration.

## Правило просмотра

Version selector фильтрует release reference. Общие архитектурные страницы отражают current main. Для точного поведения конкретного patch используйте release notes, verification и tag source.`,
`# Versions 3.1–3.3

## 3.1.x

The Cloud Identity, OAuth 2.1 + PKCE, MFA, Pulse billing/entitlements, and production-hardening line. Patch releases fixed updater, voice, and sandbox-administration defects.

## 3.2.x

The Trust/MLS, secure-media, release-hardening, UX/regression, and expanded security/performance validation line.

## 3.3.x

The Trust recovery, consumable Impulse catalog, refreshed Client UX, website, and full artifact-pipeline line. 3.3.1 fixes packaged Server startup caused by a missing shared Pulse runtime, while 3.3.2 adds release-consistency and post-publication asset smoke gates without a schema/API migration.

## Viewing rule

The version selector filters release references. General architecture pages describe current main. For exact patch behavior, use release notes, verification, and tag source.`),
  },
  {
    id: 'releases', group: 'reference', icon: 'Tags', title: both('Release notes', 'Release notes'),
    description: both('GitHub Releases с локальным fallback.', 'GitHub Releases with a local fallback.'),
    body: both('# Release notes\n\nДанные загружаются из GitHub Releases и фильтруются по выбранной линии 3.1.x–3.3.x.', '# Release notes\n\nData is loaded from GitHub Releases and filtered by the selected 3.1.x–3.3.x line.'),
    special: 'releases',
  },
  {
    id: 'repository-docs', group: 'reference', icon: 'BookMarked', title: both('Документы репозитория', 'Repository documents'),
    description: both('Актуальные Markdown-документы current main.', 'Current-main Markdown documents.'),
    body: both('# Документы репозитория\n\nСтраницы импортируются при сборке из README, PROJECT_INDEX и каталога docs.', '# Repository documents\n\nPages are imported at build time from README, PROJECT_INDEX, and the docs directory.'),
    special: 'repository-docs',
  },
  {
    id: 'documentation-kit', group: 'reference', icon: 'Archive', title: both('Documentation Kit 0.3–1.0', 'Documentation Kit 0.3–1.0'),
    description: both('Исторический аудит и проектная спецификация.', 'Historical audit and product specification.'),
    body: both('# Documentation Kit\n\nМатериалы основаны на Nexora 0.3.0 от 17 июля 2026 года. Они показывают эволюцию решений, но могут описывать целевое или уже заменённое поведение.', '# Documentation Kit\n\nThese materials are based on Nexora 0.3.0 as of July 17, 2026. They explain design evolution but may describe target or superseded behavior.'),
    special: 'kit-docs',
  }
];
