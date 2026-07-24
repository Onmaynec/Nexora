# Nexora 3.1.2 — Updater, Voice Dock и Local Pulse Sandbox

## Scope

3.1.2 — patch release поверх 3.1.1. Он исправляет три пользовательских regression и не добавляет unrelated product scope:

1. global voice dock не закрывался полностью;
2. Electron updater не имел завершённого automatic lifecycle и стабильной диагностики missing signed assets;
3. Pulse API v3 не предоставлял управляемую Local Server sandbox-модель для Plus/Impulses QA.

## Voice dock

`stopVoice()` очищает:

- active message/audio ID;
- source URL;
- display name;
- current time и duration;
- playback speed;
- `src` HTMLAudioElement.

После очистки вызывается `load()`, а dock немедленно размонтируется. Следующее voice message не должно наследовать metadata или playback state предыдущего.

## Electron auto-update

Client updater:

- инициализируется после `app.whenReady()`;
- выполняет initial check;
- повторяет check каждые шесть часов;
- использует single-flight для concurrent manual/automatic requests;
- освобождает timers/listeners при quit;
- сохраняет обязательную signed-install policy.

Для installable Windows update требуются signed NSIS Client, `.blockmap` и `latest.yml`. Source/PWA prerelease и incomplete/unsigned asset set не устанавливаются.

Отсутствие installable signed metadata возвращает stable reason `no_installable_update`, а не raw provider/Electron stack.

## Local Pulse sandbox

Windows Server Admin и CLI используют общий audited command registry:

```text
pulse sandbox on|off
pulse user <user>
plus grant <user> [days]
plus revoke <user>
impulses grant <user> <amount> [reason]
impulses revoke <user> <amount> [reason]
```

Инварианты:

- sandbox предназначен только для development/demo/QA;
- production Pulse Cloud configuration автоматически блокирует local sandbox;
- checkout и provider operations отключены;
- новый test Plus entitlement выдаёт 400 Impulses один раз;
- repeat activation не дублирует grant;
- wallet balance не может стать отрицательным;
- grants/revokes фиксируются в local audit/ledger;
- production signing keys, receipts и entitlements локально не создаются.

## Безопасность

- все sandbox mutations выполняются Server, а не Client;
- user/amount/duration/reason проходят validation;
- arbitrary shell/eval недоступны;
- mutating command audit не сохраняет secret argument values;
- sandbox state не смешивается с verified production cache/ledger.

## Верификация

До merge release branch прошли:

- focused 3.1.2 regression tests — `8/8`;
- `npm run release:check` — `100/100` tests;
- GitHub CI Windows verify — success;
- GitHub CI Linux `npm test` — success;
- GitHub CI Android source build — success;
- `npm run audit:security` — success.

Подробный итог: [releases/3.1.2/RELEASE_VERIFICATION.md](../releases/3.1.2/RELEASE_VERIFICATION.md).
