# Nexora 3.3.2 — Release Consistency

Дата: 2026-07-23

## Цель

Nexora 3.3.2 приводит version metadata, весь current documentation surface, release history и опубликованные artifacts к одному проверяемому состоянию.

## Изменено

- синхронизированы `package.json`, lockfile, Client handshake и Android metadata;
- актуализированы Repository README, Documentation Portal, Project Index, Architecture, Security Model и Android README;
- синхронизированы Security Policy/Audit, Support, Contributing, Admin/Tester guides, Product Overview, Deployment, Operations, Release Policy/Checklist, Branch Index, issue template и публичный сайт;
- current feature baselines, ранее ошибочно обозначенные как текущая версия 3.2.4, нормализованы как линия `3.3.0+`;
- устранены current-ссылки на устаревший `RELEASE_VERIFICATION_3.2.4.md`, при этом исторические release-specific документы сохранены;
- `CHANGELOG.md` закреплён как единственный канонический источник хронологии выпусков, `RELEASE_HISTORY.md` оставлен указателем;
- CI gate запрещает несовпадение версии между package, lockfile, Android, 24 current documentation surfaces, website fallbacks и release evidence;
- release evidence pipeline загружает опубликованные Client, Server, Android и PWA assets, проверяет SHA-256, PE/ZIP integrity и обязательное содержимое;
- PR #30/#31, obsolete PR #6/#7 и экспериментальный Rust/OpenMLS PR #11 закрыты с сохранением provenance.

## Совместимость

- пользовательские функции не добавлены;
- Application API остаётся `v3`;
- Trust/MLS/encrypted-media API остаётся `v4`;
- Local Server database остаётся schema `8`;
- миграции, новые зависимости и изменения конфигурации не требуются.

## Distribution boundary

При отсутствии Authenticode secrets Windows Client/Server и Android публикуются только как явно маркированные `UNSIGNED-TEST` assets. `latest.yml` и `.blockmap` не публикуются, поэтому production updater не принимает такой prerelease.
