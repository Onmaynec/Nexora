# Статус выпуска Nexora 3.3.3

## Классификация

| Параметр | Значение |
|---|---|
| Version | `3.3.3` |
| Release scope | Goals, voice UX, Pulse effects, idempotent billing and MLS recovery |
| Source Pull Request | PR `#65`, merged |
| Source release commit | `5b1ca1cae10ab4130f0c163c8785604365b239bc` |
| Release tag | `v3.3.3` |
| Distribution | Published `UNSIGNED-TEST` prerelease |
| Signed production baseline | `3.1.2` |
| Local Server schema | `8` |
| Application API | `v3` |
| Trust/MLS API | `v4` |
| Database migration | not required |
| Independent security audit | not performed |

## Реализовано

- исправлено создание коллективных целей с серверной авторизацией owner/moderator, валидацией и атомарными операциями;
- голосовые получили microphone-level waveform при записи, сохранённые waveform metadata и анимированное воспроизведение;
- покупки Pulse применяют только server-owned catalog effects и корректно снимаются после истечения;
- покупки и взносы используют стабильный `Idempotency-Key`, исключающий повторное списание;
- открытие защищённого чата проверяет MLS epoch и поддерживает fail-closed recovery через новый device-scoped Welcome.

## Проверка

- `npm run check` — success;
- `npm run test:unit` — success;
- `npm run test:performance` — success;
- `npm run audit:security` — success;
- `npm run release:check` — success;
- Windows/Linux/release/schema soak/Android validation gates — success.

Release notes и verification размещаются в [`docs/releases/3.3.3/`](docs/releases/3.3.3/). Машиночитаемое свидетельство публикации хранится в [`release-evidence/current.json`](release-evidence/current.json).

## Security and compatibility

- authorization, room roles, bans, upload policy and wallet ledger remain server-enforced;
- Pulse effects are resolved only from the server-owned allowlist;
- MLS recovery affects only the authenticated current device and never enables plaintext fallback;
- schema 8, API v3 and Trust/MLS API v4 remain compatible;
- no migration or rollback is required.

## Реальные ограничения

- Windows Client/Server and Android remain unsigned test artifacts unless valid signing credentials are configured;
- production updater metadata is intentionally absent for unsigned artifacts;
- independent cryptographic/application-security audit is not completed;
- physical-device Android and installed Windows acceptance remain external release evidence requirements.
