# Security Policy

## Supported versions

| Version | Security updates |
|---|---|
| 2.0.x | Yes |
| 1.x and older | No |

## Reporting a vulnerability

Не публикуйте рабочий exploit, session cookie, приватный ключ CA, Pulse API key или пользовательские данные в публичном Issue.

До настройки отдельного security email создайте GitHub Security Advisory в репозитории `Onmaynec/Nexora` через **Security → Advisories → New draft advisory**. Укажите затронутую версию, влияние, минимальные шаги воспроизведения и безопасный proof of concept.

Ожидаемый процесс:

1. подтверждение получения — до 3 рабочих дней;
2. первичная оценка — до 7 рабочих дней;
3. исправление и coordinated disclosure — по согласованному сроку.

## Scope

Приоритет: обход авторизации/ролей, чтение чужих комнат/файлов, RCE/Electron boundary, подмена сертификата/обновления, повреждение SQLite/backup, обход подписи Pulse и двойное списание.

Не являются уязвимостью в текущей модели: отсутствие E2EE, доступ администратора серверного ПК к рабочей базе и невозможность безопасно публиковать Radmin Server напрямую в интернет — это задокументированные границы продукта.
