# Nexora Roadmap 3.4.0–4.0.0

> Status: approved planning baseline for implementation after Nexora 3.3.4. This roadmap is a sequence of release outcomes and gates, not a calendar commitment.

## Current baseline and prerequisite

The current `main` line is Nexora 3.3.3. The approved 3.3.4 direction removes MLS/Trust Core runtime, restores server-readable Local Server messaging, keeps legacy MLS history read-only, and completes the related UX/release fixes. **No release in this roadmap starts before 3.3.4 is merged, verified, tagged and published.**

The old `Stable Trust` direction is superseded by the approved post-MLS architecture. The first new minor release is therefore **3.4.0 Stable Core**.

## Planning principles

- Every release follows Semantic Versioning and starts from the verified release commit of the previous version.
- `main` remains the only current product source; implementation uses a separate branch and Pull Request.
- Critical authorization, validation, policies, quotas and state transitions are enforced server-side.
- Schema changes require automatic backup, transactional/idempotent migration, destination integrity and downgrade protection.
- Retry-sensitive mutations require idempotency; realtime/client reducers must tolerate duplicate delivery.
- Windows, PWA and Android are first-class supported surfaces unless a release explicitly narrows its platform matrix.
- A version is not complete without tests, documentation, release notes, verification, immutable tag, GitHub Release and artifact smoke evidence.
- Technical specifications are maintained separately from this repository roadmap.

## Release sequence

| Version | Working name | Primary outcome | Depends on |
|---|---|---|---|
| 3.4.0 | Stable Core | Первая подтверждённая signed stable линия 3.x на обычном server-readable messaging core с проверяемой миграцией, backup/restore и безопасным updater. | Nexora 3.3.4 |
| 3.5.0 | Mobile Continuity | Единый надёжный пользовательский контур Windows, Browser/PWA и Android с сохранением drafts/outbox, background sync, безопасными notifications и resumable media. | Nexora 3.4.0 |
| 3.6.0 | Connect | Сделать Nexora полноценным контуром персональных связей: contacts, requests, block/privacy, direct calling и надёжные deep links. | Nexora 3.5.0 |
| 3.7.0 | Communities | Поддержать крупные сообщества на одном Nexora Server: структура каналов, onboarding, granular permissions, moderation queue и anti-abuse controls. | Nexora 3.6.0 |
| 3.8.0 | Workspaces | Добавить поверх communities рабочие пространства с задачами, досками, milestones, shared files, reminders и безопасными declarative automations. | Nexora 3.7.0 |
| 3.9.0 | Ecosystem | Открыть Nexora для безопасных приложений и интеграций через scoped manifests, signed webhooks, OAuth-style grants и declarative extension runtime без arbitrary code в trusted process. | Nexora 3.8.0 |
| 3.10.0 | Cloud Services | Добавить опциональные Cloud Services — account linking, push relay, encrypted backups, remote connectivity и fleet status — без обязательной облачной зависимости и без передачи message plaintext. | Nexora 3.9.0 |
| 3.11.0 | Organizations | Дать организациям централизованное управление несколькими Nexora Servers, пользователями, policies, audit и licensing без превращения Cloud в owner local message content. | Nexora 3.10.0 |
| 4.0.0 | Nexora Platform | Сформировать Nexora 4 как поддерживаемую платформу: стабильные API/event contracts, modular server, scalable storage option, extension SDK, migration from 3.x и LTS release process. | Nexora 3.11.x |

## Release details

### 3.4.0 — Stable Core

**Outcome.** Первая подтверждённая signed stable линия 3.x на обычном server-readable messaging core с проверяемой миграцией, backup/restore и безопасным updater.

**P0/P1 scope.**
- `STC-01` **Signed distribution** (P0): Authenticode Client/Server, immutable release assets и updater n-1→n.
- `STC-02` **Post-MLS data integrity** (P0): Безопасное завершение Trust/MLS runtime и read-only legacy history без потери данных.
- `STC-03` **Sessions and devices** (P0): Понятный device/session lifecycle, revoke и profile isolation без Trust Core.
- `STC-04` **Backup, restore and migration** (P0): Проверяемый upgrade, restore, disk-full и interrupted migration behavior.
- `STC-05` **Independent security review** (P0): Закрытие high/critical findings в auth, uploads, Electron, updater и Pulse.
- `STC-06` **Diagnostics and operations** (P1): Stable errors, requestId, signing status, runbooks и operator evidence.

**Release blockers.**
- Любая потеря обычной или legacy history при upgrade.
- Legacy MLS write path остаётся доступным.
- Updater принимает unsigned/tampered asset.
- Restore может смешать несовместимые DB/files.
- Unresolved high/critical finding.
- Installed Windows acceptance не завершён.

**Explicitly out of scope.**
- Возврат MLS/Trust Core или новая E2EE-система.
- Федерация, video calls и screen sharing.
- Обязательная Cloud account или server-side key escrow.
- Несвязанный масштабный UI redesign.

### 3.5.0 — Mobile Continuity

**Outcome.** Единый надёжный пользовательский контур Windows, Browser/PWA и Android с сохранением drafts/outbox, background sync, безопасными notifications и resumable media.

**P0/P1 scope.**
- `MBC-01` **Event replay and outbox** (P0): Cursor-based replay, conflict semantics и exactly-once-visible client behavior.
- `MBC-02` **Android production shell** (P0): Signed Android build, lifecycle, TLS, permissions и deep links.
- `MBC-03` **PWA offline lifecycle** (P0): Installable app shell, safe cache policy, background retry и update UX.
- `MBC-04` **Notifications and push** (P0): Device-scoped registration, privacy-safe payloads, mute/quiet hours.
- `MBC-05` **Resumable media continuity** (P1): Resume/cancel/retry files, images and voice across reconnect/restart.
- `MBC-06` **Multi-profile continuity** (P1): Isolated server profiles, local cache controls and diagnostics.

**Release blockers.**
- Draft/outbox loss or duplicate send after reconnect.
- Cross-profile data leakage.
- Push payload exposes unauthorized content.
- Android/PWA certificate policy can be bypassed.
- Mic/upload remains active after terminal state.
- Installed mobile/PWA acceptance incomplete.

**Explicitly out of scope.**
- Video/screen sharing.
- Federation or mandatory cloud relay.
- Cross-server merged inbox.
- Arbitrary background execution unsupported by platform.

### 3.6.0 — Connect

**Outcome.** Сделать Nexora полноценным контуром персональных связей: contacts, requests, block/privacy, direct calling и надёжные deep links.

**P0/P1 scope.**
- `CON-01` **Contacts and requests** (P0): Contact lifecycle, search, block and audit-safe state.
- `CON-02` **Presence and privacy** (P0): Scoped online/last-seen/read visibility.
- `CON-03` **One-to-one voice calls** (P0): WebRTC signaling, device selection, call states and history.
- `CON-04` **Call security and abuse controls** (P0): Block enforcement, rate limits, TURN and session revocation.
- `CON-05` **Profiles and deep links** (P1): Profile cards, exact navigation and safe fallback.
- `CON-06` **Accessibility and diagnostics** (P1): Keyboard call controls, permission states and network diagnostics.

**Release blockers.**
- Block/privacy bypass through REST or Socket.IO.
- Third party can join/observe call signaling.
- Microphone remains active after call end.
- TURN credentials leak or are long-lived.
- No cross-platform installed call acceptance.
- Unbounded call spam or signaling payload.

**Explicitly out of scope.**
- Video calls, screen sharing and group calls.
- Federation/calls between independent servers.
- Server-side call recording or transcription.
- Public user directory outside configured server.

### 3.7.0 — Communities

**Outcome.** Поддержать крупные сообщества на одном Nexora Server: структура каналов, onboarding, granular permissions, moderation queue и anti-abuse controls.

**P0/P1 scope.**
- `COM-01` **Community and channel hierarchy** (P0): Communities, categories, channel types and atomic ordering.
- `COM-02` **Role templates and permissions** (P0): Granular permission sets, inheritance and privilege boundaries.
- `COM-03` **Onboarding and invitations** (P0): Rules, screening, invite scopes, join requests and welcome flow.
- `COM-04` **Moderation and anti-abuse** (P0): Reports queue, actions, raid/spam controls and audit.
- `COM-05` **Announcements, events and discovery** (P1): Announcement channels, scheduled events and in-server discovery.
- `COM-06` **Large-community UX/performance** (P1): Virtualization, fanout, search and notification governance.

**Release blockers.**
- Permission/hidden-channel metadata bypass.
- Community can lose its only owner.
- Invite race creates extra membership.
- Moderator can act on protected target.
- Mass notification/action is unbounded.
- Large-community acceptance/performance not completed.

**Explicitly out of scope.**
- Federation/public Internet directory.
- Group voice/video channels.
- Arbitrary plugin execution.
- Organization-wide multi-server management.

### 3.8.0 — Workspaces

**Outcome.** Добавить поверх communities рабочие пространства с задачами, досками, milestones, shared files, reminders и безопасными declarative automations.

**P0/P1 scope.**
- `WKS-01` **Workspace lifecycle** (P0): Workspace, membership linkage, templates and archive/export.
- `WKS-02` **Tasks and boards** (P0): Tasks, statuses, assignees, comments, checklists and ordering.
- `WKS-03` **Milestones and calendar** (P0): Dates, dependencies, reminders and event views.
- `WKS-04` **Shared file hub** (P0): Folders/tags/versions, access checks, quotas and retention.
- `WKS-05` **Declarative automations** (P1): Trigger-condition-action rules with audit and limits.
- `WKS-06` **Offline/workspace UX** (P1): Optimistic updates, conflicts, accessibility and export.

**Release blockers.**
- Workspace permission bypass or cross-workspace data leak.
- Offline conflict silently overwrites server state.
- Automation can execute arbitrary code or exceed actor permission.
- File version/quota race corrupts storage.
- Reminder/task duplicate side effects.
- Migration/large-workspace acceptance incomplete.

**Explicitly out of scope.**
- Full collaborative rich-text editor.
- Arbitrary code plugins.
- External calendar two-way sync beyond explicit connectors.
- Organization-wide portfolio across independent servers.

### 3.9.0 — Ecosystem

**Outcome.** Открыть Nexora для безопасных приложений и интеграций через scoped manifests, signed webhooks, OAuth-style grants и declarative extension runtime без arbitrary code в trusted process.

**P0/P1 scope.**
- `ECO-01` **App manifests and permissions** (P0): Versioned manifest, scopes, installation and revoke.
- `ECO-02` **App identity and tokens** (P0): OAuth-style grants, token rotation and secret storage.
- `ECO-03` **Webhook and event delivery** (P0): Signed delivery, replay protection, retries and dead-letter.
- `ECO-04` **Isolated extension runtime** (P0): Bounded workers/declarative actions without trusted-process code injection.
- `ECO-05` **Catalog and review flow** (P1): Signed catalog metadata, compatibility and admin approval.
- `ECO-06` **SDK and conformance** (P1): Typed contracts, examples, test harness and certification checks.

**Release blockers.**
- App gains access beyond consented scope.
- Token/secret leakage.
- Webhook SSRF/replay allows unauthorized effect.
- Arbitrary code runs in trusted Server/Electron process.
- Extension can exhaust core resources.
- Catalog/package authenticity unverified.

**Explicitly out of scope.**
- Arbitrary in-process Node/Electron plugins.
- Unsigned automatic marketplace installation.
- Kernel/container orchestration platform.
- Cross-server federation protocol.

### 3.10.0 — Cloud Services

**Outcome.** Добавить опциональные Cloud Services — account linking, push relay, encrypted backups, remote connectivity и fleet status — без обязательной облачной зависимости и без передачи message plaintext.

**P0/P1 scope.**
- `CLD-01` **Cloud account and server linking** (P0): Explicit signed linking, scopes, revoke and device confirmation.
- `CLD-02` **Encrypted cloud backup** (P0): Client/server-side encryption, retention, restore and key ownership.
- `CLD-03` **Push and notification relay** (P0): Privacy-safe reliable relay for mobile/PWA.
- `CLD-04` **Optional remote connectivity** (P0): Brokered discovery/relay without exposing admin plane or plaintext.
- `CLD-05` **Fleet status and update channels** (P1): Safe telemetry, health and rollout controls.
- `CLD-06` **Billing, quotas and operations** (P1): Entitlements, limits, reconciliation and incident runbooks.

**Release blockers.**
- Cloud receives plaintext or backup decryption key.
- Cloud link/replay/scope bypass.
- Remote relay exposes admin plane or bypasses TLS pinning.
- Cloud outage breaks local-only messaging.
- Unsigned update can be forced.
- Billing/backup disaster-recovery evidence incomplete.

**Explicitly out of scope.**
- Mandatory cloud account for core messaging.
- Cloud plaintext message/file storage.
- Server-side escrow of backup decryption keys.
- Cross-server federation/message synchronization.

### 3.11.0 — Organizations

**Outcome.** Дать организациям централизованное управление несколькими Nexora Servers, пользователями, policies, audit и licensing без превращения Cloud в owner local message content.

**P0/P1 scope.**
- `ORG-01` **Organization and server enrollment** (P0): Tenant model, ownership proof, inventory and detach.
- `ORG-02` **SSO and SCIM provisioning** (P0): OIDC/SAML, groups, lifecycle and just-in-time/managed accounts.
- `ORG-03` **Policy packs and enforcement** (P0): Signed versioned policies, precedence, exceptions and offline cache.
- `ORG-04` **Delegated administration** (P0): Separation of duties, role hierarchy and approval workflows.
- `ORG-05` **Central audit and compliance** (P1): Safe audit ingestion/status, retention and export.
- `ORG-06` **Fleet rollout and licensing** (P1): Channels, staged updates, seat/server entitlement and reconciliation.

**Release blockers.**
- Cross-tenant data or control leak.
- Forged SSO/SCIM grants access.
- Tampered policy accepted or last owner path removed.
- Organization admin gains local content access without explicit grant.
- Unsigned update rollout possible.
- External security/enterprise acceptance incomplete.

**Explicitly out of scope.**
- Cross-server unified message history/federation.
- Cloud operator access to local content by default.
- Full regulated-industry certification claims without external audit.
- Automatic migration of all local accounts to managed identities without consent/policy.

### 4.0.0 — Nexora Platform

**Outcome.** Сформировать Nexora 4 как поддерживаемую платформу: стабильные API/event contracts, modular server, scalable storage option, extension SDK, migration from 3.x и LTS release process.

**P0/P1 scope.**
- `PLT-01` **API v4 and event protocol v2** (P0): Typed versioned contracts, idempotency, pagination and deprecation.
- `PLT-02` **Modular server runtime** (P0): Clear service boundaries, worker isolation and startup/shutdown orchestration.
- `PLT-03` **Data/storage evolution** (P0): Verified 3.x migration, SQLite LTS and optional PostgreSQL profile.
- `PLT-04` **Unified client platform** (P0): Shared state/reducers, offline conflict model and platform capability adapters.
- `PLT-05` **Security, supply chain and LTS** (P0): Independent review, provenance, signed updates and support policy.
- `PLT-06` **Scale and availability** (P1): Backpressure, multi-instance-compatible services and disaster recovery.

**Release blockers.**
- Any unsupported data loss or migration without verified restore.
- API/event contract drift after RC freeze.
- Cross-module/tenant authorization bypass.
- Cross-backend invariant mismatch corrupts state.
- Unsigned/unprovenanced update path.
- Unresolved high/critical review finding or incomplete LTS/DR evidence.

**Explicitly out of scope.**
- Undocumented unlimited horizontal scaling.
- Automatic federation with arbitrary third-party servers.
- Server-side reading of encrypted backups or external provider secrets.
- Breaking removal of 3.x data without export/migration path.

## Cross-release dependency chain

1. **3.4.0** establishes the signed stable post-MLS baseline and verified data/upgrade boundary.
2. **3.5.0** builds reliable cross-platform offline/mobile continuity on that stable core.
3. **3.6.0** adds contacts, privacy-aware presence and one-to-one voice calls.
4. **3.7.0** scales rooms into structured communities with stronger moderation.
5. **3.8.0** adds workspace/project collaboration and declarative workflows.
6. **3.9.0** exposes safe extension contracts and an ecosystem boundary.
7. **3.10.0** adds optional cloud assistance while preserving local-only operation.
8. **3.11.0** adds multi-server organization governance, identity and policy management.
9. **4.0.0** freezes the new platform contracts, migration boundary and LTS support model.

## Common release gate

Each release must complete, as applicable:

```text
source review -> threat model -> regression-first tests -> migration/backup
-> server authorization and validation -> API/realtime contracts
-> client/offline/error states -> security/performance/soak
-> Windows/PWA/Android acceptance -> docs/evidence
-> PR/CI/merge -> immutable tag -> GitHub Release -> asset re-download smoke
```

A later release must not begin until the previous release is actually published and its release evidence is complete.
