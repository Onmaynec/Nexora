# Обзор продукта Nexora

## Назначение

Nexora — self-hosted платформа обмена сообщениями для частных серверов, команд, сообществ и контролируемых организационных установок. Локальные аккаунты, комнаты, сообщения, файлы, permissions и realtime остаются authority Local Server.

## Состав продукта

- **Nexora Client** — общий React-интерфейс для Windows, Browser/PWA и Android;
- **Nexora Local Server** — authority authentication, rooms, roles, ordinary messages, uploads, sessions, audit и policies;
- **Legacy secure-history layer** — immutable schema 8 ciphertext/history compatibility без server-side decryption;
- **Nexora Pulse Cloud** — optional Cloud Identity, billing, ledger и production entitlements;
- **Operations layer** — health, metrics, backup/restore, maintenance и release tooling;
- **Project websites** — introductory site и Advanced Documentation portal.

## Текущая продуктовая линия

| Параметр | Значение |
|---|---|
| Current repository version | `3.3.4` release candidate |
| Distribution | signed when policy exists; otherwise explicit `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS runtime | retired |
| Legacy secure history | read-only |
| Local Server database | SQLite schema 8 |

3.3.4 — обязательный post-MLS prerequisite для Nexora 3.4.0 Stable Core.

## Ordinary messaging

Ordinary server-readable messaging — единственный writable messaging path. Он включает:

- direct и room conversations;
- messages, replies, forwarding, edit/delete, reactions and read state;
- search, drafts, scheduled messages, polls and notifications;
- files, images and voice;
- offline cache and bounded outbox;
- server-side role, ban, room-policy, upload and rate-limit enforcement.

Missing, corrupt или stale local MLS state не блокирует открытие ordinary conversations.

## Legacy secure history

Trust Core, MLS transport/recovery, KeyPackage/Welcome lifecycle и encrypted-upload write runtime удалены.

Сохраняются:

- legacy conversation/message identifiers;
- epochs, timestamps, ciphertext and audit provenance;
- read-only listing/view/export;
- previously decrypted records already present in local Client cache.

Server не расшифровывает ciphertext и отмечает export как `serverDecrypted: false`. Все legacy mutations завершаются `LEGACY_READ_ONLY`.

## Rooms и administration

Local Server поддерживает owner/moderator/member, ownership transfer, moderator assignment, remove/ban/unban, read-only, slow mode, media restrictions, invites with expiry/use limits, join requests, administrative audit и system messages.

UI скрывает недоступные actions, но security обеспечивается проверками Server при каждом request/event.

## Sessions и devices

Session inventory показывает safe device metadata. Targeted revoke удаляет sessions, отправляет `session.revoked`, отключает Socket.IO room и публикует `device.updated`. Current device remote revoke отклоняется `STATE_CONFLICT`.

## Files, images и voice

Uploads проверяют size, actual MIME, safe filename, hashes, quotas и room restrictions. Temporary data удаляется после failure/cancel. Images используют safe preview. Voice поддерживает recording, cancel, preview, send, amplitude-responsive waveform, duration and playback progress.

## Backup и reliability

Local Server выполняет integrity/WAL/free-space preflight, verified backup, staged mutation and rollback. Backup can be verified without restore. Future schema, disk-full and replacement failures terminate before unsafe mixed state.

## Updater и distribution

Client and Server use separate update metadata channels. Downgrade disabled. Complete signing policy verifies Authenticode identity/timestamp. Without signing policy, official `v3.3.4` is an explicit `UNSIGNED-TEST` prerelease and contains no updater metadata or blockmaps.

## Non-goals и ограничения

- Local Server cannot decrypt retained legacy ciphertext;
- historical readable plaintext requires a pre-existing local cache;
- metadata/traffic-analysis resistance is not claimed;
- automated verification is not an independent security review;
- production public deployment depends on external TLS, firewall, monitoring and operations;
- signed stable 3.4.0 promotion requires its own completed external gates.

См. [Documentation Portal](README.md), [Architecture](ARCHITECTURE.md), [Security Model](SECURITY_MODEL.md) и [Release Notes 3.3.4](releases/3.3.4/RELEASE_NOTES.md).
