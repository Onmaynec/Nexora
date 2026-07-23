# Nexora 3.3.2 — Release Consistency

Дата: 2026-07-23

## Цель

Nexora 3.3.2 приводит version metadata, current documentation, release history и опубликованные artifacts к одному проверяемому состоянию.

## Изменено

- синхронизированы `package.json`, lockfile, Client handshake и Android metadata;
- актуализированы Repository README, Documentation Portal, Project Index, Architecture, Security Model и Android README;
- устранены current-ссылки на устаревший `RELEASE_VERIFICATION_3.2.4.md`;
- `CHANGELOG.md` закреплён как единственный канонический источник хронологии выпусков;
- добавлен CI gate, запрещающий несовпадение версии между package, lockfile, Android, README, Project Index, Architecture, Security Model и release evidence;
- release evidence pipeline теперь загружает опубликованные Client, Server, Android и PWA assets, проверяет SHA-256, сигнатуры контейнеров и обязательное содержимое;
- устаревшие конфликтующие pull requests закрыты с объяснением; экспериментальный Rust/OpenMLS draft отделён от текущего `ts-mls` Trust/MLS-контура.

## Совместимость

- пользовательские функции не добавлены;
- Application API остаётся `v3`;
- Trust/MLS/encrypted-media API остаётся `v4`;
- Local Server database остаётся schema `8`;
- миграции, новые зависимости и изменения конфигурации не требуются.

## Distribution boundary

При отсутствии Authenticode secrets Windows Client/Server и Android публикуются только как явно маркированные `UNSIGNED-TEST` assets. `latest.yml` и `.blockmap` не публикуются, поэтому production updater не принимает такой prerelease.
