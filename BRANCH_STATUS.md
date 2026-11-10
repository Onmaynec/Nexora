# Статус ветки `feat/communities-foundation`

- Класс: экспериментальная feature-ветка, **не текущая версия продукта**.
- База: verified исходный код `3.6.0 Connect` на commit `f651dd1a76c9163767663bfb0d37772165855902`.
- Цель: подготовить отдельный фундамент COM-01/COM-02 и часть COM-03/COM-04.
- Текущий опубликованный релиз: `v3.5.0`; текущий `main` — единственный product source of truth.
- Разработка 3.6.0: [PR #110](https://github.com/Onmaynec/Nexora/pull/110), остаётся draft. Официальная релизная ветка 3.7.0 не создаётся до публикации Connect.
- API: экспериментальные маршруты под `/api/v3/communities`, включаются только опцией `experimentalCommunities: true`.
- База: отдельные таблицы для прототипа поверх schema 10. Schema 11, миграции, резервные копии для нового контура и downgrade protection не готовы.
- Реализовано: транзакционная база сообществ, роли, категории, каналы-метаданные, приглашения, блокировки, очередь жалоб, owner transfer, базовые ограничения API.
- Не готово: интеграция существующих rooms/messages/Socket.IO/uploads/search, полноценное клиентское управление, release/security/installed evidence, production acceptance.
- Публикация: запрещена; нельзя заявлять stable, independently audited или signed.
- Документация ветки описывает только этот commit и не заменяет README/Release Notes в `main`.
- Подробности: [Communities foundation](docs/COMMUNITIES_FOUNDATION.md).
