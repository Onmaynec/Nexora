const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'security-model', group: 'security', icon: 'ShieldCheck', title: both('Модель безопасности', 'Security model'),
    description: both('Threat boundaries, metadata visibility и остаточные риски.', 'Threat boundaries, metadata visibility, and residual risks.'),
    body: both(
`# Модель безопасности

Nexora разделяет confidentiality content и service metadata. MLS/secure media защищают content от Local Server, но сервер продолжает видеть идентификаторы аккаунтов/устройств, membership, conversation scope, timing, network context, ciphertext size и delivery events.

## Основные свойства

- authenticated session и CSRF для browser mutations;
- server-side roles, bans, room policies и upload limits;
- Ed25519 device identity с proof-of-possession;
- отдельные MLS signature credentials;
- one-time KeyPackages и scoped Welcome delivery;
- monotonic epochs, signed commits и replay protection;
- encrypted local private state;
- opaque ciphertext persistence.

## Не заявляется

- независимый cryptographic/application-security audit;
- защита от traffic analysis;
- анонимность membership или IP metadata;
- безопасность при компрометации endpoint device;
- звонки и screen sharing в текущей линии.

## Operational security

Безопасность зависит от HTTPS, trusted origins, secret management, backup protection, update signing и корректного incident response. E2EE не компенсирует слабую server authentication или заражённое устройство.`,
`# Security model

Nexora separates content confidentiality from service metadata. MLS and encrypted media keep content away from Local Server, while the server still observes account/device identifiers, membership, conversation scope, timing, network context, ciphertext size, and delivery events.

## Core properties

- authenticated sessions and CSRF for browser mutations;
- server-side roles, bans, room policies, and upload limits;
- Ed25519 device identity with proof of possession;
- separate MLS signature credentials;
- one-time KeyPackages and scoped Welcome delivery;
- monotonic epochs, signed commits, and replay protection;
- encrypted local private state;
- opaque ciphertext persistence.

## Not claimed

- independent cryptographic or application-security audit;
- resistance to traffic analysis;
- anonymity of membership or IP metadata;
- security after endpoint-device compromise;
- calls or screen sharing in the current line.

## Operational security

Security still depends on HTTPS, trusted origins, secret management, protected backups, signed updates, and incident response. E2EE does not compensate for weak server authentication or a compromised endpoint.`),
  },
  {
    id: 'trust-mls', group: 'security', icon: 'Fingerprint', title: both('Trust Core и MLS', 'Trust Core and MLS'),
    description: both('Device identity, KeyPackages, groups, epochs и recovery.', 'Device identity, KeyPackages, groups, epochs, and recovery.'),
    body: both(
`# Trust Core и MLS

## Device lifecycle

1. Клиент создаёт Ed25519 identity/signature material.
2. Registration challenge подтверждает possession.
3. Устройство регистрируется и получает explicit verification state.
4. Verified devices участвуют в MLS group lifecycle.
5. Revocation отключает targeted delivery и очищает local scope.

## KeyPackages

KeyPackages одноразовые, ограничены размером request и inventory. Claim должен быть scoped к ожидаемому user/device/conversation и атомарно переводить package из unclaimed state.

## Groups and epochs

Group state связан с conversation. Commit обязан двигать epoch монотонно; replayed, stale или scope-mismatched commit отклоняется. Welcome доставляется целевому verified device и claim’ится один раз.

## Recovery

Recovery проверяет requester device, group membership, requested scope, последовательность epochs, commit hashes и public-state chain. Client coalesces duplicate Welcome requests и соблюдает backoff/Retry-After.

## Fixed profile

Текущая документация указывает \`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519\`. Изменение profile — protocol compatibility change и требует migration/interoperability tests.`,
`# Trust Core and MLS

## Device lifecycle

1. The client creates Ed25519 identity and signature material.
2. A registration challenge proves possession.
3. The device is registered with explicit verification state.
4. Verified devices participate in the MLS group lifecycle.
5. Revocation removes targeted delivery and clears local scope.

## KeyPackages

KeyPackages are one-time and bounded by request and inventory limits. A claim must be scoped to the expected user, device, and conversation, then atomically transition the package out of the unclaimed state.

## Groups and epochs

Group state is bound to a conversation. Commits must advance epochs monotonically; replayed, stale, or scope-mismatched commits are rejected. Welcome messages target a verified device and are claimed once.

## Recovery

Recovery validates the requester device, group membership, requested scope, epoch continuity, commit hashes, and public-state chain. The client coalesces duplicate Welcome requests and honors backoff and Retry-After.

## Fixed profile

Current documentation names \`MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519\`. Changing the profile is a protocol compatibility change requiring migrations and interoperability tests.`),
  },
  {
    id: 'secure-media', group: 'security', icon: 'FileLock2', title: both('Защищённые медиа', 'Encrypted media'),
    description: both('Ciphertext upload, validation, claim и local preview.', 'Ciphertext upload, validation, claim, and local preview.'),
    body: both(
`# Защищённые медиа

Secure attachment шифруется клиентом до upload. Local Server принимает opaque ciphertext, проверяет фактический размер/hash/quota и не получает content key.

## Lifecycle

1. Client проверяет файл и room policy.
2. Создаёт random content key/nonce и AES-GCM ciphertext.
3. Upload создаётся как pending и resumable/idempotent.
4. MLS message атомарно claim’ит attachment.
5. Получатель скачивает ciphertext, проверяет digest и расшифровывает локально.
6. Preview/playback выполняется из проверенного decrypted blob.

## Fail-closed policies

Запрет files/images/voice проверяется сервером для обычного и secure-media path. Поддельный MIME, oversized ciphertext, expired pending attachment, повторный claim и direct API bypass отклоняются.

## Cleanup

Ошибочный, отменённый или истёкший upload должен удалять временные данные. Quota и orphan cleanup не должны удалять committed attachment, пока оно связано с доступным сообщением.`,
`# Encrypted media

A secure attachment is encrypted by the client before upload. Local Server accepts opaque ciphertext, validates actual size, digest, and quota, and never receives the content key.

## Lifecycle

1. The client validates the file and room policy.
2. It creates a random content key/nonce and AES-GCM ciphertext.
3. Upload starts as pending and supports resumable/idempotent behavior.
4. The MLS message atomically claims the attachment.
5. A recipient downloads ciphertext, verifies the digest, and decrypts locally.
6. Preview and playback use the verified decrypted blob.

## Fail-closed policies

Files, images, and voice restrictions are enforced server-side for both legacy and secure media paths. Spoofed MIME, oversized ciphertext, expired pending uploads, duplicate claims, and direct-API bypasses are rejected.

## Cleanup

Failed, cancelled, or expired uploads must remove temporary data. Quota and orphan cleanup must not remove a committed attachment while it remains linked to an accessible message.`),
  },
  {
    id: 'security-checklist', group: 'security', icon: 'ListChecks', title: both('Security checklist', 'Security checklist'),
    description: both('Проверка до изменения server operation.', 'Checks before changing a server operation.'),
    body: both(
`# Security checklist

Перед каждой server mutation проверьте:

1. authentication и session expiry;
2. Origin/CSRF для cookie-auth browser request;
3. существование resource;
4. membership и active ban;
5. role/permission;
6. room/server policy;
7. input, actual MIME/size/hash;
8. rate/resource limits;
9. transactional integrity;
10. audit/system/realtime side effects.

## Обязательные adversarial cases

- IDOR через соседний room/conversation/message ID;
- moderator воздействует на owner;
- blocked user сохраняет stale membership/socket;
- revoked/expired/exhausted invite используется конкурентно;
- последний owner удаляется;
- direct API обходит hidden UI action;
- upload подделывает extension/MIME/size;
- replayed Trust commit/Welcome/KeyPackage;
- secret попадает в error/log/audit metadata;
- Cloud authority получает local message content.

## Ответ ошибки

Возвращайте стабильный code и safe message с request ID. Stack, SQL, токены, credentials и private paths остаются только в redacted internal diagnostics.`,
`# Security checklist

Before every server mutation, verify:

1. authentication and session expiry;
2. Origin and CSRF for cookie-authenticated browser requests;
3. resource existence;
4. membership and active bans;
5. role and permission;
6. room or server policy;
7. input, actual MIME, size, and digest;
8. rate and resource limits;
9. transactional integrity;
10. audit, system-message, and realtime side effects.

## Required adversarial cases

- IDOR through a neighboring room, conversation, or message ID;
- a moderator acts on the owner;
- a blocked user retains stale membership or socket access;
- a revoked, expired, or exhausted invite is used concurrently;
- the last owner is removed;
- direct API bypasses a hidden UI action;
- upload spoofs extension, MIME, or size;
- Trust commit, Welcome, or KeyPackage replay;
- secrets leak into errors, logs, or audit metadata;
- Cloud authority receives local message content.

## Error response

Return a stable code and safe message with a request ID. Stack traces, SQL, tokens, credentials, and private paths remain only in redacted internal diagnostics.`),
  }
];
