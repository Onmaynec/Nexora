# Nexora for Android

## 1. Статус

| Параметр | Значение |
|---|---|
| Current version | `3.3.3` |
| Distribution | Published `UNSIGNED-TEST` APK prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS/encrypted-media API | v4 |
| Local Server database | schema 8, server-side |

Android application — controlled WebView shell общего adaptive Nexora Client. CI verifies source build. Stable promotion requires physical-device runtime matrix и signed APK/AAB validation.

## 2. Capabilities

- saved HTTPS servers и server picker;
- `nexora://connect?url=...` deep links;
- local authentication, profiles, rooms, messages, search и notifications;
- files, images и voice recording/playback;
- offline application shell и authorized local cache;
- Trust device enrollment/verification/revocation;
- MLS secure messaging и encrypted media;
- strict commit recovery;
- automatic MLS Welcome recovery with active verified member;
- external links opened outside WebView.

Android shell does not store Local Server database, Cloud password, payment-card data, Pulse signing keys или Local CA private key.

## 3. Build

Requirements:

- JDK 17;
- Android SDK 36;
- Gradle 8.13.

```text
cd android
gradle :app:assembleDebug --no-daemon
gradle :app:assembleRelease --no-daemon
```

Release APK/AAB must be signed outside repository. Never commit keystore, password or private signing configuration.

## 4. TLS и navigation

For private CA install operator-provided root certificate into Android trust store and verify Server ID/fingerprint separately.

Policy:

- `onReceivedSslError` cancels;
- HTTP and mixed content disabled;
- file/content access restricted;
- third-party cookies disabled;
- in-app navigation limited selected Server origin;
- external origin opens system browser;
- deep link accepts valid HTTPS only;
- certificate change requires supported trust flow.

## 5. Trust и secure data

- private device identity/MLS state remain client-side;
- local state, KeyPackages, cache и drafts encrypted;
- message encrypted before durable outbox;
- file/image/voice encrypted before upload;
- attachment key/private metadata inside MLS content;
- Local Server receives opaque ciphertext and service metadata;
- revocation disconnects and wipes local Trust scope;
- recovery chain validated before persistence.

Renderer remains in TCB. Malware, XSS, compromised dependency or malicious binary can access plaintext during authorized use.

## 6. Resource and recovery behavior

Client must handle:

- 16 active-device account limit;
- KeyPackage 25/request, 32/device, 256/user limits;
- `429 RATE_LIMITED` and `Retry-After`;
- expired session and Trust state;
- `MLS_WELCOME_PENDING` without retry storm;
- one bounded Welcome request;
- fail-closed state when no active group member exists.

No plaintext fallback is permitted.

## 7. Acceptance

### Source/install

- CI `assembleDebug` passes;
- release build in controlled signing environment;
- clean install/upgrade preserves saved servers and authorized state;
- version metadata equals `3.3.3`.

### Connection

- manual HTTPS URL;
- HTTPS deep link;
- HTTP/invalid/untrusted/changed certificate rejected;
- external navigation outside app.

### Core product

- login/bootstrap;
- profiles/rooms/messages/search/notifications;
- legacy media/voice;
- offline/reconnect;
- Cloud Identity/Pulse UI without Cloud secrets.

### Trust/MLS

- first/additional device enrollment;
- fingerprint verify/revoke;
- active-device capacity behavior;
- secure send after restart/reconnect;
- strict missed-commit recovery;
- Welcome request with active verified group member;
- no-active-member fail-closed;
- encrypted file/image/voice preview/playback/download;
- no plaintext fallback after policy/recovery failure.

### Permissions/lifecycle

- file picker;
- microphone allow/deny/revoke;
- background/foreground;
- process death/restart;
- storage pressure;
- network switching;
- long-offline reconnect.

## 8. Stable-promotion requirements

- physical-device matrix;
- signed APK/AAB and upgrade path;
- long-offline/recovery scenarios;
- permission denial/revocation;
- process-death state consistency;
- accessibility/responsive review;
- independent security review relevant to Android runtime.

## 9. Limitations

Nexora 3.3.0+ does not claim traffic-analysis resistance or independent certification. Existing 3.1.x data is not retroactively encrypted. 3.1.x Client cannot participate in an active secure 3.3.x conversation.

See [Documentation Portal](../docs/README.md), [Security Model](../docs/SECURITY_MODEL.md), [Security Policy](../SECURITY.md) and [Release Verification 3.3.2](../../docs/releases/3.3.3/RELEASE_VERIFICATION.md).
