# Nexora 3.2.5 — Release Verification

## Классификация

- версия: `3.2.5`;
- базовая версия: `3.2.4`;
- тип: patch release;
- Local Server schema: `8`, без миграции;
- Application API: v3;
- Trust/MLS API: v4.

## Regression-first

Перед изменением production-кода создаётся `test/release-3.2.5-regressions.test.cjs`. Начальный запуск обязан падать как минимум на real-SQLite Pulse contract, renderer release modal contract, scoped ParticleField, стабильном message rendering и разделении local/signed Windows build.

## Проверяемые сценарии

- `plus grant netrox 30` и `impulses grant netrox 100` с реальным SQLite;
- renderer-driven release announcement и per-version dismissal;
- scoped interactive network только в истории чата;
- автоматическое image/voice представление;
- отсутствие блокирующего bootstrap refresh после отправки;
- MLS group-creation race через Welcome request/wait;
- local Windows build без сертификата при неизменном signing gate официального workflow;
- themed disabled controls и scrollbars Nexora Server.

## Финальные команды

- `npm run check`;
- `npm run test:unit`;
- `npm run test:performance`;
- `npm run audit:security`;
- `npm run release:windows` на Windows runner;
- Android `assembleDebug` и Linux `npm test` — через штатный CI.

Фактические run ID и результаты добавляются после прохождения current-head CI перед merge.
