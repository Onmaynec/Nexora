# Contributing to Nexora

## Локальная подготовка

```bash
npm ci
npm run check
npm test
npm run audit:security
```

Используйте Node.js 22.16+. Не добавляйте native SQLite packages: Windows-сборка намеренно основана на `node:sqlite` и не требует `node-gyp`.

## Правила изменений

- сохраняйте совместимость API внутри major 3 либо документируйте migration и диапазон Client;
- изменения данных оформляйте schema migration и reliability test;
- изменяющие routes обязаны использовать session, Origin и CSRF checks;
- денежные/Plus entitlement нельзя подтверждать локальным production-флагом;
- новые hover/overlay элементы проверяйте у обоих краёв, с details drawer и в узком окне;
- общение, базовые чаты и доступ к собственным данным не должны становиться paywalled;
- не коммитьте `data/`, SQLite, backups, certificates, update secrets или payment credentials.

## Commit и Pull Request

Используйте короткий imperative subject, например `fix: keep reaction picker interactive`. PR должен содержать:

- проблему и решение;
- влияние на schema/API/security;
- тесты и ручной сценарий;
- скриншот для UI-изменения;
- migration/rollback notes при необходимости.

Перед PR выполните `npm run release:check` и `npm run audit:security`.
