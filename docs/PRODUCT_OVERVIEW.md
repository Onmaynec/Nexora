# Обзор продукта Nexora 3.4.0

## 1. Назначение

Nexora — self-hosted платформа обмена сообщениями для частных серверов, команд, сообществ и контролируемых организационных установок. Local Server является authority локальных аккаунтов, комнат, ролей, ordinary messages, files, realtime и room policies.

Состав продукта:

- **Nexora Client** — общий React-интерфейс для Windows, Browser/PWA и Android;
- **Nexora Local Server** — authentication, authorization, rooms, ordinary messaging, uploads, storage и realtime;
- **Legacy secure compatibility layer** — read-only доступ к сохранённым schema 8 Trust/MLS records/ciphertext;
- **Nexora Pulse Cloud** — optional authority Cloud Identity, billing, ledger и production entitlements;
- **Operations layer** — health, metrics, audit, backup/restore, maintenance и release tooling;
- **Project websites** — introductory product site и Advanced Documentation portal.

## 2. Текущая продуктовая линия

| Параметр | Значение |
|---|---|
| Target repository version | `3.4.0` |
| Classification | Stable Core release candidate |
| Merged prerequisite source | Nexora `3.3.4` post-MLS baseline |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Writable messaging | ordinary server-readable messaging |
| Trust/MLS runtime | retired |
| Legacy secure history | read-only; Server не decrypts ciphertext |
| Local Server database | SQLite schema 8 |

Stable publication остаётся заблокированной до published verified `v3.3.4`, complete Authenticode policy, Windows 10/11 installed acceptance, independent review и final green gates.

## 3. Stable Core transition

Nexora 3.4.0:

- удаляет executable Trust Core, MLS routes/recovery/socket transport и encrypted-upload writes;
- удаляет `ts-mls` из dependency graph/package payload;
- оставляет schema 8 legacy IDs, timestamps, epochs, ciphertext и audit provenance;
- открывает legacy conversations в dedicated read-only viewer;
- запрещает legacy HTTP/Socket.IO writes через `LEGACY_READ_ONLY`;
- не преобразует historical ciphertext в server-readable plaintext;
- сохраняет ordinary messaging, uploads, voice, drafts, offline cache и outbox как writable core.

## 4. Deployment profiles

Поддерживаемые profiles:

- localhost/development;
- private LAN;
- private VPN;
- public HTTPS domain за reverse proxy;
- Windows Client/Server shells;
- installed PWA;
- Android WebView shell с system TLS trust store;
- separate Pulse Cloud deployment.

Public installation требует HTTPS, firewall, exact `allowedOrigins`, monitoring, backups и protected secret storage. Direct port forwarding Local Server не является supported production topology.

## 5. Messaging и collaboration

- direct messages, Saved Messages и rooms;
- replies, threads, reactions, mentions и polls;
- edit/delete/forward, pins, bookmarks и edit history;
- silent/scheduled send и server drafts;
- search, notifications, archive и filters;
- offline cache, delta sync и bounded durable outbox;
- ordinary conversations не зависят от local MLS epoch/state.

## 6. Rooms и moderation

- roles `owner`, `moderator`, `member`;
- exactly one owner;
- atomic ownership transfer;
- moderator appointment/removal;
- member removal, ban/unban и ban list;
- join requests;
- invites с expiry, usage limit и revocation;
- read-only, slow mode, announcement и pre-approval;
- file/image/voice restrictions;
- audit log и system messages;
- server-side authorization для REST и realtime.

## 7. Files, images и voice

Ordinary media path включает:

- progress, cancel/retry и resumable upload;
- size/quota и chunk/file SHA-256 validation;
- safe filenames;
- actual MIME signature detection;
- dangerous/executable file rejection;
- image/PDF/text preview;
- corrupt image handling;
- voice recording, cancellation, preview, duration, waveform, played progress, seek и speed;
- server-enforced room media restrictions.

Legacy encrypted media остаётся immutable ciphertext/history и не принимает новые writes.

## 8. Devices и sessions

Server-owned inventory строится из active sessions и содержит device ID, name, platform, Client version, creation, last-seen и expiry.

Поддерживаются:

- revoke one remote device;
- revoke all other devices;
- immediate `session.revoked` и target Socket.IO disconnect;
- `device.updated` refresh;
- `STATE_CONFLICT` для remote revoke текущего device.

## 9. Storage, backup и reliability

- SQLite schema 8, WAL, transactional mutation и integrity checks;
- compatibility-preserving idempotent migration;
- future-schema guard before mutation;
- verified backup and free-space checks;
- non-restoring backup verification API;
- staged DB/file replacement with rollback;
- temporary data cleanup after success/error;
- fault coverage for disk-full and replacement failure.

## 10. Errors и observability

Stable error envelope содержит `code`, `message`, `requestId`, safe `details` и compatibility `error` field.

Health/operations:

- `/healthz/live`;
- `/healthz/ready`;
- protected `/metrics`;
- request correlation;
- recursive credential redaction;
- graceful drain/shutdown.

## 11. Release boundary

Official `v3.4.0` требует:

1. published verified `v3.3.4` assets/checksums;
2. complete Authenticode identity/timestamp policy;
3. signed Client/Server installers, blockmaps и updater metadata;
4. Windows 10/11 installed `3.3.4 → 3.4.0` acceptance;
5. independent review без unresolved high/critical findings;
6. full CI/security/soak/Android/websites gates;
7. immutable tag, SHA-256 evidence и post-publication redownload verification.

До закрытия этих пунктов продукт классифицируется как source release candidate, а не опубликованный stable release.
> Current release candidate: Nexora 3.5.0 Mobile Continuity. This is not a published stable release.
