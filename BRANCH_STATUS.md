# Статус основной ветки `main`

## Состояние исходников

| Параметр | Текущее значение |
|---|---|
| Единственный source of truth | `main` |
| Package version | `3.6.0` (исходники, не опубликованный релиз) |
| Последняя ранее опубликованная версия | `v3.5.0` Mobile Continuity |
| Схема Local Server | `10` (Connect, additive migration) |
| Connect | исходники объединены PR #110 |
| Communities | экспериментальный код объединён PR #114; включается только при `experimentalCommunities === true` |
| Незакрытые release issues | #77 (Connect), #78 (Communities) |

## Проверено при консолидации

- Connect source CI: https://github.com/Onmaynec/Nexora/actions/runs/43549501844.
- Communities source CI: https://github.com/Onmaynec/Nexora/actions/runs/43552303098.
- Исправления поиска и блокировок: #115 / #117.
- Исправления списка сообществ и участников: #119 / #121.
- PR #110 объединён с `main` как исходный код, не как подписанный релиз.
- PR #114 объединён с `main` как выключенный по умолчанию экспериментальный модуль.

## Что не подтверждено

- Подписанный релиз `v3.6.0`, Windows/Android/PWA installed acceptance и post-download verification.
- Независимый security review и рабочая production TURN-конфигурация.
- Полный scope Communities, нагрузки/anti-abuse и стабильный `v3.7.0`.
- Все будущие релизные планы из Roadmap.

Исходники и наличие API не являются основанием для выставления release checkboxes. Правила архивации прежних веток приведены в [BRANCHES.md](BRANCHES.md).
