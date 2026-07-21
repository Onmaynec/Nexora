# Security audit Nexora 2.0.0

Дата автоматической проверки: 20 июля 2026.

## Модель угроз

Nexora предназначена для локальной/Radmin VPN-сети, но не доверяет участнику только потому, что он подключён к VPN. Server проверяет сессию, CSRF/Origin, членство, роли, блокировки и ресурсный scope для каждого действия. Прямое размещение Server в интернете не поддерживается.

## Результаты

| Область | Результат |
|---|---|
| CSRF для изменяющих REST-запросов | PASS |
| Origin для REST и Socket.IO | PASS |
| HttpOnly/Secure/SameSite=Strict session cookie | PASS |
| persistent rate limits и temporary login lock | PASS |
| password policy и forced change после admin reset | PASS |
| PEM SHA-256 pinning + Server ID + TOCTOU protection | PASS |
| Electron session certificate verifier и safe fallback | PASS |
| SQLite WAL/FULL/integrity/transactional UPSERT | PASS |
| crash during write integrity test | PASS |
| AES-256-GCM + scrypt encrypted backup | PASS |
| Electron contextIsolation / nodeIntegration off | PASS |
| Electron media permission ограничен микрофоном (камера запрещена) | PASS |
| Pulse HTTPS-only и Ed25519 signed envelope | PASS |
| Pulse scope/expiry/idempotency validation | PASS |
| Pulse production entitlement только из подписанного Cloud envelope | PASS |
| Pulse goal membership/ban/overfund/refund/capability checks | PASS |
| Production dependency audit high / critical | 0 / 0 |
| Native SQLite dependency / node-gyp | отсутствует |

Воспроизведение: `npm run audit:security` и `npm test`.

## Pulse trust boundary

Локальный Server не является денежным источником истины. В production он:

- использует только HTTPS Pulse Cloud;
- аутентифицируется server-scoped API key;
- проверяет Ed25519 envelope, expiry, Server ID и User ID;
- не проводит операцию при offline/invalid response;
- использует idempotency key для вклада;
- хранит только проверенный кэш entitlement/balance.

Sandbox отделён от production и не должен включаться на продающем сервере. Реальная платёжная безопасность дополнительно зависит от ещё не поставляемого в этом репозитории Pulse Cloud/provider контура.

## Остаточные риски

- E2EE отсутствует: сообщения видны администратору компьютера Server в рабочей SQLite.
- Автоматические незашифрованные локальные копии доступны системному администратору; защищайте Windows account/disk.
- Radmin VPN снижает поверхность сети, но не заменяет обновления Windows, firewall и контроль участников VPN.
- Browser требует безопасной доставки local CA; компрометация CA key требует ротации у всех тестеров.
- Цифровая подпись installers и защищённость GitHub Release зависят от внешнего Windows certificate и GitHub secrets.
- GitHub Actions использует version tags сторонних actions; перед high-assurance release рекомендуется закрепить actions на проверенные commit SHA.
- Автоматический аудит не заменяет независимый manual review, pentest и проверку supply chain.

## Обязательное перед публичным выпуском

1. Выпустить/подключить OV или EV Windows code-signing certificate.
2. Защитить GitHub account 2FA, branch/tag rules и Environment approvals.
3. Провести чистую установку и upgrade test на Windows 10/11.
4. Завершить не менее 60 минут soak; для production рекомендуется 24 часа.
5. Если включается Plus production — провести отдельный PCI/provider/webhook/refund review и legal review.
6. Заказать независимый API/Electron review и pentest.
