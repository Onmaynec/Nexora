# Security Policy

## Поддерживаемые версии

| Версия / ветка | Статус |
|---|---|
| `main` / `3.1.x` | Поддерживаемая stable-линия |
| `agent/nexora-3.2.0-trust-core` | Experimental Trust Core foundation; production support отсутствует |
| `3.0.x` и старше | Не поддерживаются |

Эта branch не является завершённой E2EE implementation. Она изолирует cryptographic foundation, но не включает подтверждённый end-to-end Client ↔ Delivery Service path.

## Reporting

Не публикуйте private signing/MLS material, provider-state secrets, session/OAuth tokens, CA/Pulse keys или user data в public Issue/PR.

Используйте private GitHub Security Advisory: <https://github.com/Onmaynec/Nexora/security/advisories/new>.

Укажите exact branch/commit, runtime target (`native`/`wasm32`/browser), expected invariant, minimal disposable reproduction и impact.

## Foundation security scope

Особенно важны:

- private signing key или MLS state leakage;
- predictable/reused identity, nonce, credential или KeyPackage material;
- invalid signature/credential acceptance;
- provider-state integrity bypass, rollback или cross-profile reuse;
- group-state confusion between server/account/device/conversation contexts;
- incorrect create/load/join/add-member lifecycle;
- application ciphertext forgery, replay or wrong-group decryption;
- unsafe exported group-secret semantics;
- native/WASM behavior divergence;
- secret material in logs/errors/serialization;
- silent plaintext fallback in integration code.

Stable auth/authorization, Electron/WebView/TLS/update, SQLite, Pulse and upload vulnerabilities also remain in scope.

## Safe research

Use only your own disposable installation, identities, groups and data. Do not attack third-party servers, extract foreign data, publish working keys or exceed minimal proof of the defect.

## Documented limitations

- Stable Nexora 3.1.2 does not provide E2EE.
- Compiling OpenMLS/Trust Core or passing local encrypt/decrypt tests does not make existing chats secure.
- Local Server Delivery Service, device transparency, secure UI/outbox, plaintext guards, recovery and cross-device integration are incomplete in this foundation branch.
- Exported group secrets do not mean attachments are encrypted.
- No independent cryptographic review or production release gate has been completed.

Use this branch only with disposable data. Send uncertain reports privately.
