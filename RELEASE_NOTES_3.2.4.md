# Nexora 3.2.4 — Update and MLS delivery recovery

Nexora 3.2.4 is a patch release focused on the Windows update path, Server operator console and MLS device recovery.

## Fixed

- Client automatic updates initialize before the renderer can query them and continue checking on schedule.
- The “Проверить обновления” action receives a terminal state even when Electron Updater does not emit one.
- Network failures and releases without signed updater metadata are reported with stable, understandable states.
- Server console commands preserve error codes instead of exposing Electron IPC wrapper text.
- Arguments copied from help, including `plus grant <netrox> [1]`, are normalized safely.
- A verified device without local group state can request MLS Welcome from active members and retry automatically. This shared path covers text, encrypted media and voice messages.

## Added

- After an actual Client version transition, Nexora shows a short release summary with “Подробнее”, “Закрыть” and “Не показывать снова”.
- `--test-mode` opens a live Windows PowerShell console tailing `nexora-client.log`.
- The installer creates a “Nexora Client (Test Mode)” Start Menu shortcut.
- Client and Server NSIS installers use Nexora icons, a branded sidebar and Russian installer language.

## Security and compatibility

- Update integrity and Authenticode release gates remain enabled; unsigned updater assets are not silently trusted.
- The MLS Welcome request contains no key material. The server only notifies verified devices already active in the group; an active client still creates the RFC 9420 Welcome.
- Local Server schema 8, API v3 and Trust/MLS API v4 are unchanged.
