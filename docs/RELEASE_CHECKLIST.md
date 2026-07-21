# Nexora 3.0.0 Release Checklist

## Код и данные

- [ ] `package.json`, Client header, Android и UI показывают 3.0.0.
- [ ] migration schema 3/4/5 → 6 протестирована на копии данных и создаёт pre-migration backup.
- [ ] backup создан, restore проверен, password backup известен ответственному.
- [ ] `PRAGMA integrity_check` возвращает `ok`.
- [ ] `npm run check`, `npm test`, `npm run audit:security` — PASS.
- [ ] soak не менее 60 минут — PASS; для production рекомендуется 24 часа.

## UI/UX

- [ ] аватары открывают профиль во всех контекстах;
- [ ] нулевые badges скрыты;
- [ ] reaction picker кликается мышью и клавиатурой;
- [ ] message actions/dock/details не пересекают границы;
- [ ] проверены 1920×1080, 1366×768 и узкое окно;
- [ ] `prefers-reduced-motion` отключает декоративное движение.
- [ ] профиль открывается и при `relationship: null`, без blank screen/error boundary.
- [ ] offline cache/outbox/delta sync восстанавливаются после перезапуска.

## Windows

- [ ] чистая установка Client/Server на Windows 10 x64;
- [ ] чистая установка Client/Server на Windows 11 x64;
- [ ] upgrade с 1.0.2 сохраняет Server data и trusted servers;
- [ ] Authenticode обоих `.exe` действителен и timestamped;
- [ ] SmartScreen/reputation проверены;
- [ ] uninstall не удаляет Server data без явного выбора.

## Сеть

- [ ] localhost, LAN и Radmin VPN full address работают;
- [ ] certificate fingerprint совпадает, смена требует подтверждения;
- [ ] browser `.crt` flow и microphone проверены;
- [ ] public FQDN принимается только по HTTPS;
- [ ] Android отменяет TLS error и не принимает HTTP/mixed content;
- [ ] firewall ограничен private/Radmin scope;
- [ ] несовместимый Client получает понятный HTTP 426.

## GitHub/update

- [x] public `Onmaynec/Nexora` существует;
- [ ] `main` protected, CI required, 2FA включена;
- [ ] Source/PWA prerelease содержит source ZIP, PWA ZIP, SPDX SBOM и checksums;
- [ ] для stable Windows release signing secrets добавлены;
- [ ] stable Release не prerelease и содержит Client/Server `.exe`, blockmap, `latest.yml`, source/PWA/SBOM/checksums;
- [ ] update n-1 → 3.0.0 проверен на установленном Client.

## Android и браузер

- [ ] `gradle -p android :app:assembleDebug` проходит на JDK 17 / SDK 36;
- [ ] PWA устанавливается и обновляет application shell;
- [ ] Service Worker не кэширует API/Socket.IO;
- [ ] deep link `nexora://connect` принимает только HTTPS URL.

## Pulse production (если включается)

- [ ] Billing/provider sandbox и production разделены;
- [ ] Cloud URL HTTPS, API key scoped/rotatable;
- [ ] signing private key только в secret manager;
- [ ] webhook signatures, idempotency, refund/revocation протестированы;
- [ ] оферта, privacy, налоги/чеки и support flow утверждены;
- [ ] checkout проверен без хранения card data в Nexora.

Если блок Pulse production не завершён, релиз выпускается с `NEXORA_PULSE_MODE=disabled`.
