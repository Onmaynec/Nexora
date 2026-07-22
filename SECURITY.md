# Security Policy

## Поддерживаемые версии

| Версия | Статус security updates |
|---|---|
| `3.1.x` | Поддерживается |
| `3.0.x` | Не поддерживается; обновитесь до 3.1.2 |
| `2.x` и старше | Не поддерживается |
| `3.2.0` development branches | Экспериментальная разработка, не stable release |

Исправления безопасности сначала проходят воспроизведение, regression test и проверку в актуальной ветке разработки. После верификации они выпускаются новым patch-релизом поддерживаемой линии.

## Сообщение об уязвимости

Не публикуйте рабочий exploit, session cookie, OAuth token, TOTP/recovery code, приватный ключ CA, Pulse API key/signing key, invite code, MLS private state, device identity private key или пользовательские данные в публичном Issue, Discussion либо Pull Request.

Используйте приватный GitHub Security Advisory:

1. откройте **Security → Advisories** в репозитории `Onmaynec/Nexora`;
2. выберите **New draft security advisory**;
3. укажите затронутую версию, платформу и компонент;
4. опишите влияние, минимальные шаги воспроизведения и безопасный proof of concept;
5. приложите только очищенные логи и тестовые данные.

Прямая форма: <https://github.com/Onmaynec/Nexora/security/advisories/new>.

## Ожидаемые сроки

- подтверждение получения — до 3 рабочих дней;
- первичная оценка и запрос недостающих данных — до 7 рабочих дней;
- исправление, выпуск и coordinated disclosure — по согласованному сроку с учётом сложности и риска.

Сроки являются целевыми, а не гарантированными. Публичное раскрытие до выпуска исправления может быть отложено, если оно создаёт непосредственный риск для пользователей.

## Приоритетный scope

Особенно важны сообщения об уязвимостях в следующих областях:

- обход авторизации, ролей, блокировок или ограничений комнаты;
- IDOR и чтение чужих комнат, сообщений, профилей или файлов;
- RCE, Electron boundary bypass и опасная навигация WebView;
- подмена TLS-сертификата, Server ID, fingerprint или update metadata;
- CSRF, Origin bypass, session fixation и утечка cookies/tokens;
- небезопасная обработка файлов, MIME spoofing, path traversal и SSRF;
- повреждение SQLite, schema migration, backup/restore или audit trail;
- обход подписи Pulse, replay, payload substitution, двойное списание или подмена entitlement;
- Cloud Identity/MFA/OAuth 2.1 PKCE bypass;
- metrics exposure, credential leakage в логах или обход audited developer commands;
- bot/webhook scope bypass и утечка секретов.

### Дополнительный Trust/MLS scope 3.2.0

Для ветки 3.2.0 приоритетными считаются:

- plaintext downgrade после активации MLS group через REST, Socket.IO, outbox, draft, scheduled, poll, bot, webhook, forward, edit или upload path;
- получение Local Server расшифрованного content/private group state;
- подмена `(userId, deviceId)` credential или signature key;
- регистрация устройства без proof of possession;
- подтверждение/отзыв устройства без действующего одноразового challenge;
- повторное использование, подмена области или race при KeyPackage/Welcome claim;
- skipped/stale/duplicate epoch, commit substitution и ciphertext replay;
- доставка revoked/removed device после изменения membership;
- восстановление пропущенных commits с разрывом журнала;
- rollback/cross-profile disclosure зашифрованного IndexedDB state;
- сохранение локальных private keys/state после self-revoke;
- расхождение authenticated data и conversation/client/device scope;
- supply-chain подмена `ts-mls` или использование другого ciphersuite без явного migration/review.

Отчёт о Trust/MLS проблеме должен указывать Server ID, conversation/group record ID, epoch, роли устройств и очищенный порядок protocol events. Не прикладывайте private key, полный MLS state или реальное содержимое переписки.

## Trust Core security boundary 3.2.0

На текущей ветке:

- Local Server хранит public device keys, credentials, delivery records, commits, ciphertext hashes/data и audit metadata;
- private device identity key и private MLS state остаются на клиенте;
- private state, KeyPackages, decrypted cache и drafts шифруются локальным AES-GCM wrapping key;
- identity private key создаётся non-extractable;
- credential authentication разрешает только active/verified device с совпадающим registered signature key;
- server-side route guards запрещают legacy plaintext fallback после MLS activation;
- attachment/image/voice UI отключён, потому что encrypted-media protocol ещё не реализован.

Это не устраняет XSS/client compromise: вредоносный renderer, dependency или подписанный клиентский бинарник может получить plaintext в момент использования приложения. Browser runtime входит в trusted computing base.

## Задокументированные ограничения 3.2.0

Следующее не считается уже реализованной гарантией:

- encrypted attachments, images и voice;
- сокрытие membership, timing, IP, ciphertext size и иных traffic metadata;
- ретроактивное шифрование истории 3.1.x;
- seamless recovery после полной потери локального private state;
- совместимость secure conversation со stable 3.1.2 client;
- независимый cryptographic/application-security audit.

Сообщение о том, что фактическое поведение выходит за эти ограничения небезопасным способом — например, attachment молча отправляется plaintext — является security issue.

## Безопасное исследование

Разрешается исследование на собственной тестовой установке и с собственными данными. Не выполняйте действия, которые:

- нарушают доступность чужого сервера;
- извлекают или изменяют чужие данные;
- используют социальную инженерию;
- публикуют секреты или персональные данные;
- требуют эксплуатации за пределами минимального подтверждения проблемы.

Проект не обещает денежное вознаграждение за отчёты об уязвимостях.

## Задокументированные границы, не являющиеся уязвимостью

- Stable Nexora 3.1.2 не использует E2EE; оператор Local Server имеет технический доступ к рабочей базе и вложениям.
- Наличие экспериментального Trust Core/MLS кода в development branch не означает, что stable-клиенты или существующие чаты защищены E2EE.
- Local Server нельзя безопасно публиковать напрямую в интернет без HTTPS reverse proxy, firewall, мониторинга и корректного `allowedOrigins`.
- Неподписанные локальные Windows-сборки предназначены для тестирования и не являются stable release.
- Production Plus/Pulse требует отдельного Pulse Cloud и не активируется только локальной командой или флагом.
- Local Pulse sandbox не выполняет реальные платежи, не создаёт production-entitlements и автоматически недоступен при production Cloud configuration.

Если сомневаетесь, отправляйте отчёт приватно: maintainers определят, относится ли проблема к security scope.
