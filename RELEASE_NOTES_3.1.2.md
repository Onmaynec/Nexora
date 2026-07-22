# Nexora 3.1.2 Release Notes

Дата: 21 июля 2026  
Тип: patch release  
API: v3  
Local Server schema: 7

## Назначение релиза

Nexora 3.1.2 исправляет regressions в global voice playback, Electron auto-update и Local Pulse QA. Релиз сохраняет архитектуру, API v3 и schema 7 версии 3.1.1 и не добавляет breaking changes.

## Исправлено

### Global voice dock

- закрытие через X полностью останавливает playback;
- очищаются ID, URL, name, current time, duration и speed;
- `src` удаляется из audio element, после чего вызывается `load()`;
- dock немедленно размонтируется;
- следующее voice message не наследует state предыдущего.

### Electron updater

- updater запускается после `app.whenReady()`;
- выполняется initial update check;
- automatic check повторяется каждые шесть часов;
- concurrent checks объединяются через single-flight;
- timers/listeners очищаются при shutdown;
- missing signed metadata или incomplete installable assets возвращают stable reason `no_installable_update`.

Signed install policy не ослаблена: Client не устанавливает unsigned NSIS artifacts, Source/PWA-only prerelease или release без корректного `latest.yml`/blockmap.

## Добавлено

### Local Pulse sandbox administration

Audited CLI и Windows Server Admin commands:

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Sandbox behavior:

- предназначен только для QA/demo/development;
- checkout и реальные provider operations отключены;
- новая test Plus activation выдаёт 400 Impulses один раз;
- balance не может стать отрицательным;
- grants/revokes фиксируются в local audit/ledger;
- production Cloud configuration блокирует local sandbox;
- production signing keys, receipts и entitlements локально не создаются.

## Security

- sandbox mutations выполняются только Server-side;
- production Pulse остаётся отдельной trust boundary;
- updater signature/install policy сохранена;
- operational command allowlist не предоставляет shell/eval;
- secrets и production credentials не должны попадать в command audit/logs.

## Совместимость

- Client/Server: 3.1.2;
- API: v3;
- Local Server database: schema 7;
- upgrade: 3.0.0 → 3.1.2 выполняет schema 6 → 7 migration; 3.1.0/3.1.1 → 3.1.2 не требуют новой schema migration;
- основной диапазон Client major: 2–3;
- Windows 10/11, browser/PWA и Android source shell сохраняются.

Перед update Local Server создайте verified backup. Запуск schema-6 binary поверх schema 7 не поддерживается.

## Проверка

Release branch прошёл:

- focused regression tests `8/8`;
- `npm run release:check` — `100/100` tests;
- Windows `npm run check`, `npm run test:unit`, `npm run audit:security`;
- Linux `npm test`;
- Android `:app:assembleDebug`.

Полный отчёт: [RELEASE_VERIFICATION_3.1.2.md](RELEASE_VERIFICATION_3.1.2.md).

## Известные границы

- stable 3.1.2 не использует E2EE;
- voice/video calls и screen sharing не входят в stable release;
- Local Pulse sandbox не является payment system;
- production Pulse требует отдельного Cloud deployment, provider integration и legal/operational controls;
- Windows stable auto-update требует Authenticode-signed complete release assets.
