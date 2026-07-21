# Security audit Nexora 3.0.0

Дата автоматической проверки: 21 июля 2026.

## Модель угроз

Nexora не доверяет участнику только из-за LAN/VPN-доступа. Server проверяет сессию или scoped bot token, Origin/CSRF, membership, role, restriction и resource scope. Для публичного домена обязательны HTTPS, firewall/reverse proxy и явные allowed origins. E2EE отсутствует: администратор компьютера Server контролирует открытые данные SQLite.

## Автоматические результаты

| Область | Результат |
|---|---|
| CSRF/Origin и secure HttpOnly/SameSite session | PASS |
| persistent rate limit и temporary login lock | PASS |
| TOTP, одноразовые recovery codes, timing-safe compare | PASS |
| AES-256-GCM backup и TOTP secret storage | PASS |
| PEM SHA-256 pinning, Server ID и certificate verifier | PASS |
| отдельная Electron session на Server ID | PASS |
| context isolation / sandbox / Node integration off | PASS |
| Android cleartext/mixed content запрещены, TLS error отменяется | PASS |
| SQLite WAL/FULL/integrity/transactional mutation | PASS |
| pre-migration backup для schema 6 | PASS |
| resumable chunks: size/index/SHA-256 и MIME sniffing | PASS |
| bot token хранится как hash, проверяются scopes/expiry/room | PASS |
| webhook: HTTPS, private-IP rejection, DNS pinning, HMAC | PASS |
| Pulse HTTPS-only и Ed25519 signed entitlement | PASS |
| Windows update signature verification | PASS |
| unsigned release не публикует `.exe`/blockmap/`latest.yml` | PASS |
| Production dependency audit high / critical | 0 / 0 |
| Native SQLite dependency / node-gyp | отсутствует |

Воспроизведение: `npm run audit:security`, `npm test` и CI Windows/Linux/Android.

## Trust boundaries

- Server является источником истины для пользователей, ролей, сообщений и файлов.
- Windows shell хранит trust по Server ID/fingerprint и проверяет подпись обновления.
- PWA Service Worker кэширует только application shell; API/Socket.IO исключены.
- Android использует системное хранилище CA и всегда вызывает `cancel()` при TLS error.
- Bot bearer token выдаётся один раз; Server хранит только hash и позволяет минимальные scopes.
- Webhook secret зашифрован, payload подписан HMAC; получатель обязан проверять signature/event ID.
- Pulse Cloud, а не локальный Server, является authority платежей и production entitlements.

## Остаточные и внешние риски

- E2EE отсутствует; сообщения доступны администратору Server и процессу с доступом к базе.
- Локальный CA и незашифрованные рабочие данные требуют защищённой учётной записи и шифрования диска.
- Android WebView использует общий web client, а не отдельное end-to-end native UI; его release APK/AAB требует Android signing и ручной device matrix.
- Public deployment требует reverse proxy/DDoS/rate-limit/monitoring контура вне этого репозитория.
- Stable Windows release требует внешнего Authenticode PFX/P12 и GitHub secrets.
- Реальный Pulse требует платёжного провайдера, Cloud ledger, webhook/refund/dispute/KYC/legal review; локальный sandbox не является покупкой.
- Автоматический аудит не заменяет независимый code review, pentest и supply-chain review.

## Обязательное перед production

1. Подключить OV/EV Windows code-signing certificate и защищённые GitHub Environment approvals.
2. Включить 2FA, branch/tag protection и обязательный CI.
3. Проверить чистую установку/upgrade/rollback на Windows 10/11 и Android device matrix.
4. Выполнить не менее 60 минут soak; для production рекомендуется 24 часа.
5. Для public deployment провести внешний API/Electron/Android pentest.
6. Для Pulse production отдельно пройти provider/webhook/refund/legal review.
