# Nexora for Android

## Status

| Property | Value |
|---|---|
| Current repository version | `3.2.0` |
| Distribution classification | Source/PWA prerelease |
| Signed production baseline | `3.1.2` |
| Application API | v3 |
| Trust/MLS API | v4 |

The Android application is a controlled WebView shell for the shared adaptive Nexora Client. Android source compatibility is verified by CI. Stable promotion of `3.2.0` still requires physical-device runtime testing and signed APK/AAB validation.

## Capabilities

- saved HTTPS servers and server picker;
- `nexora://connect?url=...` deep links;
- local authentication, rooms, messages, search and notifications;
- files, images and voice recording/playback;
- offline application shell and authorized local cache;
- Trust device enrollment, verification and revocation;
- MLS secure messaging and encrypted media in compatible 3.2.0 conversations;
- external links opened outside the WebView.

The shell does not store the Local Server database, Cloud password, payment-card data, Pulse signing keys or Local CA private key.

## Build requirements

- JDK 17;
- Android SDK 36;
- Gradle 8.13.

```text
cd android
gradle :app:assembleDebug --no-daemon
gradle :app:assembleRelease --no-daemon
```

A release APK/AAB must be signed with an Android release key stored outside the repository. Never commit keystores, passwords or private signing configuration.

## TLS and navigation policy

For a Local Server using a private CA, install the operator-provided root certificate in the Android trust store and separately verify Server ID and SHA-256 certificate fingerprint.

Security policy:

- `onReceivedSslError` always cancels the connection;
- HTTP and mixed content are disabled;
- WebView file/content access is restricted;
- third-party cookies are disabled;
- in-app navigation is limited to the selected Server origin;
- external origins open in the system browser;
- deep links accept valid HTTPS URLs only;
- certificate changes require explicit trust through the supported connection flow.

## Trust and secure data

In 3.2.0 secure conversations:

- private device identity and MLS state remain client-side;
- private state, KeyPackages, decrypted cache and drafts are encrypted locally;
- messages are encrypted before durable outbox enqueue;
- files, images and voice are encrypted before upload;
- attachment keys and original metadata travel inside MLS content;
- Local Server receives only opaque ciphertext and service metadata.

The Android renderer remains part of the trusted computing base. Malware, XSS, dependency compromise or a malicious application binary can access plaintext during authorized use.

## Acceptance checks

### Source and installation

- CI `assembleDebug` passes;
- release build completes in a controlled signing environment;
- clean install and upgrade preserve configured servers and authorized state;
- version metadata matches `3.2.0`.

### Connection

- manually entered HTTPS URL works;
- `nexora://connect` works for HTTPS;
- HTTP, invalid host and untrusted/changed certificate are rejected;
- external navigation opens outside the app.

### Core product

- login, profiles, rooms, messages, search and notifications;
- legacy files and voice;
- offline/reconnect behavior;
- Cloud Identity/Pulse UI without Cloud secrets in WebView storage.

### Trust/MLS prerelease

- first and additional device enrollment;
- fingerprint verification and revocation;
- secure message send/receive after restart and reconnect;
- immediate disconnect and local state wipe after revocation;
- encrypted file/image/voice upload, preview/playback and verified download;
- no plaintext fallback when secure path or room policy blocks an action.

### Stable-promotion requirements

- physical-device matrix;
- long-offline and recovery scenarios;
- permission denial/revocation flows;
- background/foreground and process-death behavior;
- signed APK/AAB verification;
- independent security review relevant to the Android runtime.

## Limitations

Nexora 3.2.0 does not claim traffic-analysis resistance or independent cryptographic certification. Existing 3.1.x history is not retroactively encrypted, and a 3.1.x Client cannot participate in an active secure 3.2.0 conversation.

See [Documentation Portal](../docs/README.md), [Security Policy](../SECURITY.md) and [Release Verification 3.2.0](../RELEASE_VERIFICATION_3.2.0.md).
