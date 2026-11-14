# Communities: предварительная реализация

> Ветка: `feat/communities-foundation`. Это экспериментальный исходный код поверх кандидата 3.6.0 Connect. Он не является опубликованной или утверждённой Nexora 3.7.0.

## Почему отдельная ветка

Issue #78 запрещает создавать официальную релизную ветку 3.7.0 до публикации 3.6.0. В настоящее время Connect остаётся draft. Эта работа изолирована в feature-ветке и не изменяет `main` или `release/3.6.0-connect`. Нельзя объединять её с веткой Connect до его публикации и отдельного решения о выпуске 3.7.0.

## Включение для локальной проверки

Функциональность отключена по умолчанию. При программном запуске Local Server можно передать `experimentalCommunities: true` в `createNexoraServer` (модуль `server/create-server-v31.cjs`). Режим доступен только в исходных тестовых сборках и не активируется автоматически через переменные окружения.

Он создаёт отдельные таблицы `communities`, `community_members`, `community_categories`, `community_channels`, `community_roles`, `community_role_assignments`, `community_invites`, `community_bans`, `community_reports` и `community_audit`. Legacy комнаты и schema 10 не изменяются; новая schema 11 и её транзакционная миграция пока **не реализованы**. На рабочей базе не включать: таблицы и жизненный цикл их данных ещё не прошли release migration/rollback acceptance.

## Реализованный контракт (экспериментальный)

Все маршруты размещены под `/api/v3/communities`. Используют действующие cookie-session и CSRF-проверку Nexora. Доступ проверяется сервером в момент каждого запроса. Список сообществ виден только их участникам; чужая община и скрытый канал возвращают 404.

| Метод | Путь | Назначение |
|---|---|---|
| GET, POST | `/communities` | Список моих сообществ / создание |
| GET | `/communities/:communityId` | Данные, категории и доступные каналы |
| POST | `/communities/:communityId/categories` | Создание категории |
| PATCH, DELETE | `/communities/:communityId/categories/:categoryId` | Переименование / удаление пустой категории |
| POST | `/communities/:communityId/channels` | Создание text/announcement канала |
| GET, PATCH, DELETE | `/communities/:communityId/channels/:channelId` | Доступ к каналу, редактирование и удаление с проверкой приватности |
| PATCH | `/communities/:communityId/channels/order` | Атомарная сортировка с expectedRevision |
| GET, POST | `/communities/:communityId/roles` | Список ролей для владельца / создание ограниченной роли |
| PUT | `/communities/:communityId/members/:userId/roles/:roleId` | Назначение пользовательской роли |
| GET | `/communities/:communityId/members` | Ограниченный список участников для модерации |
| PATCH | `/communities/:communityId/members/:userId/role` | Назначение moderator/member владельцем |
| PATCH | `/communities/:communityId/members/:userId/role` | Назначение moderator/member владельцем |
| GET, POST | `/communities/:communityId/invites` | Список метаданных приглашений / создание токена |
| DELETE | `/communities/:communityId/invites/:inviteId` | Отзыв приглашения |
| POST | `/communities/join` | Вступление по приглашению; лимит и membership в одной транзакции |
| POST | `/communities/:communityId/transfer` | Передача единственного owner одной транзакцией |
| POST | `/communities/:communityId/leave` | Выход участника; owner выйти без передачи владения не может |
| DELETE | `/communities/:communityId/members/:userId/roles/:roleId` | Отзыв пользовательской роли |
| GET | `/communities/:communityId/audit` | Ограниченный журнал действий для модераторов |
| POST | `/communities/:communityId/bans/:userId` | Блокировка (без изменения owner и защищённых модераторов) |
| GET, POST | `/communities/:communityId/reports` | Очередь модерации / жалоба |
| PATCH | `/communities/:communityId/reports/:reportId` | Закрытие или отклонение жалобы |

Изменения администрирования записываются в `community_audit`. Временная реализация rate limit: 60 мутаций и 180 чтений за минуту на аккаунт. Ключи приглашений не сохраняются открытым текстом, только SHA-256 от случайных 32 байт.

## Экспериментальный интерфейс

На Local Server с включённой опцией `experimentalCommunities: true` экран сообществ появляется из раздела «Комнаты». Доступны создание и вступление, просмотр доступных каналов, создание категорий/каналов, приглашения, простые пользовательские роли, управление участниками, передачу владения и очередь жалоб. В обычном 3.6.0 пункт скрыт. UI не утверждён для production.

## Что ещё не готово до релиза 3.7.0

- Schema 11, migration 10 → 11, backup/restore, explicit downgrade protection.
- Перенос существующих rooms в сообщества с сохранением истории, ban- и permission-инвариантов.
- Живые сообщения в community channels, централизованная проверка доступа в REST, Socket.IO, upload, search, notifications и delivery fanout. Сейчас каналы — **только метаданные**, не новый работающий контур сообщений.
- Realtime-события и отписка сессий после удаления или блокировки, системные сообщения и полноценные audit-представления.
- Механизмы screening/join requests, onboarding, события, анонсы, анти-рейд, уведомления, крупные сообщества и нагрузочные границы.
- Полная UI-матрица (уже есть предварительный экран), Android/PWA accessibility, cross-platform acceptance, review безопасности.
- Publication gates; issue #78 не закрывать и релиз 3.7.0 не создавать.

## Локальная проверка

`npm ci`, затем `node --test test/communities-foundation.test.cjs`. Перед PR нужны также `npm run check`, `npm test`, `npm run audit:security`. Успешный source CI означает только проверенный экспериментальный фундамент, а не готовность к публикации.
