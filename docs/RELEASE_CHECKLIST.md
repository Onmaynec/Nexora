# Nexora 2.0.0 Release Checklist

## Код и данные

- [ ] `package.json`, Client header и UI показывают 2.0.0.
- [ ] migration `nexora.json` и schema 3/4 → 5 протестирована на копии данных.
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
- [ ] firewall ограничен private/Radmin scope;
- [ ] несовместимый Client получает понятный HTTP 426.

## GitHub/update

- [x] public `Onmaynec/Nexora` существует;
- [ ] `main` protected, CI required, 2FA включена;
- [ ] signing secrets добавлены;
- [ ] Release не prerelease и содержит `.exe`, blockmap, `latest.yml`, checksums;
- [ ] update n-1 → 2.0.0 проверен на установленном Client.

## Pulse production (если включается)

- [ ] Billing/provider sandbox и production разделены;
- [ ] Cloud URL HTTPS, API key scoped/rotatable;
- [ ] signing private key только в secret manager;
- [ ] webhook signatures, idempotency, refund/revocation протестированы;
- [ ] оферта, privacy, налоги/чеки и support flow утверждены;
- [ ] checkout проверен без хранения card data в Nexora.

Если блок Pulse production не завершён, релиз выпускается с `NEXORA_PULSE_MODE=disabled`.
