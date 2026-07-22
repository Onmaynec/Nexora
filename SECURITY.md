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

Не публикуйте рабочий exploit, session cookie, OAuth token, TOTP/recovery code, приватный ключ CA, Pulse API key/signing key, invite code или пользовательские данные в публичном Issue, Discussion либо Pull Request.

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

Для экспериментальных 3.2.0 веток также важны plaintext bypass, MLS epoch/replay errors, device impersonation, KeyPackage/Welcome reuse, encrypted-state rollback и key-disclosure defects.

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
