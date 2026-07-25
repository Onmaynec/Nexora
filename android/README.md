# Nexora for Android

## Статус

| Параметр | Значение |
|---|---|
| Current version | `3.4.0` |
| Classification | Stable Core release candidate |
| Official distribution | blocked until signed stable gates complete |
| Signed production baseline | `3.1.2` |
| Upgrade baseline | published verified `3.3.4` |
| Application API | v3 |
| Trust/MLS runtime | retired; legacy secure history is read-only |
| Local Server database | schema 8 compatibility layer, server-side |

Android application is a controlled WebView shell for the adaptive Nexora Client. CI verifies the source build. Production promotion requires a signed APK/AAB, physical-device acceptance and the external 3.4.0 release gates recorded in the release evidence ledger.

## Capabilities

- saved HTTPS Local Servers and server picker;
- `nexora://connect?url=...` deep links;
- authentication, profiles, rooms, ordinary messages, search and notifications;
- files, images and voice recording/playback through the ordinary server-readable messaging path;
- offline application shell and authorized local cache;
- session-derived device inventory and remote session revocation;
- read-only access to retained legacy secure-history metadata and locally cached decrypted records when they already exist;
- external links opened outside the WebView.

The Android shell does not store the Local Server database, Cloud password, payment-card data, Pulse signing keys, Local CA private key or Authenticode material.

## Build

Requirements:

- JDK 17;
- Android SDK 36;
- Gradle 8.13.

```text
cd android
gradle :app:assembleDebug --no-daemon
gradle :app:assembleRelease --no-daemon
```

Release APK/AAB must be signed outside the repository. Never commit a keystore, password or private signing configuration.

## TLS and navigation

For a private CA, install the operator-provided root certificate into the Android trust store and verify Server ID/fingerprint separately.

Policy:

- `onReceivedSslError` cancels;
- HTTP and mixed content are disabled;
- file/content access is restricted;
- third-party cookies are disabled;
- in-app navigation is limited to the selected Server origin;
- an external origin opens in the system browser;
- a deep link accepts valid HTTPS only;
- certificate changes require the supported trust flow.

## Stable Core data boundary

- ordinary messages and media are authorized, validated and stored by Local Server;
- executable Trust/MLS enrollment, KeyPackage, Welcome, commit and encrypted-upload write paths are absent;
- schema 8 legacy IDs, epochs, timestamps, ciphertext and audit provenance remain intact;
- legacy history is immutable and server export records `serverDecrypted: false`;
- legacy HTTP and Socket.IO mutations terminate with `410/LEGACY_READ_ONLY`;
- the Client never converts retained ciphertext into server-readable plaintext;
- readable historical plaintext depends on a pre-existing local client cache.

## Session and device behavior

The Client sends a stable server-scoped device identifier and safe device metadata. Local Server owns session validity.

The UI must handle:

- active session inventory with device name, platform, Client version, creation and last-seen timestamps;
- targeted remote revocation;
- immediate `session.revoked` logout and Socket.IO disconnect;
- `device.updated` refresh;
- `STATE_CONFLICT` when attempting to revoke the current device through the remote-device endpoint;
- expired or otherwise invalid sessions without reconnect loops.

## Uploads and voice

- room file/image/voice restrictions are enforced server-side;
- size, actual MIME type, safe filename and resource ceilings are validated;
- corrupt images and unsupported formats fail safely;
- microphone denial/revocation is surfaced without a crash;
- recording supports start, stop, cancel, preview and send;
- playback exposes progress, seeking and terminal error state;
- retired encrypted-upload routes cannot reserve or persist new data.

## Acceptance

### Source and installation

- CI `assembleDebug` passes;
- release build is produced in a controlled signing environment;
- clean install/upgrade preserves saved servers and authorized local state;
- version metadata equals `3.4.0`.

### Connection

- manual HTTPS URL;
- HTTPS deep link;
- HTTP, invalid, untrusted or changed certificate rejected;
- external navigation leaves the app.

### Core product

- login/bootstrap;
- profiles, rooms, ordinary messages, search and notifications;
- files, images and voice;
- offline/reconnect;
- Cloud Identity/Pulse UI without Cloud secrets.

### Legacy history

- legacy conversation opens without blocking ordinary chats;
- no composer, upload, recording, edit or delete controls are present;
- unavailable local plaintext is reported explicitly;
- export preserves ciphertext and `serverDecrypted: false`;
- every direct legacy mutation fails with `LEGACY_READ_ONLY`.

### Permissions and lifecycle

- file picker;
- microphone allow, deny and revoke;
- background/foreground;
- process death/restart;
- storage pressure;
- network switching;
- long-offline reconnect;
- remote session revoke while Socket.IO is connected.

## Stable-promotion requirements

- published verified `v3.3.4` prerequisite assets;
- complete Authenticode signing policy for Windows Client/Server;
- real Windows 10 and Windows 11 installed `3.3.4 → 3.4.0` acceptance;
- independent security review with no unresolved high/critical findings;
- physical Android device matrix and signed APK/AAB upgrade path;
- long-offline and session-revocation scenarios;
- permission denial/revocation and process-death state consistency;
- accessibility/responsive review.

## Limitations

Nexora 3.4.0 does not claim traffic-analysis resistance before external review evidence is complete. Local Server cannot decrypt retained legacy ciphertext. Until the official stable gates complete, this branch is a release candidate and must not produce an official `v3.4.0` tag or production updater metadata.

See [Documentation Portal](../docs/README.md), [Security Model](../docs/SECURITY_MODEL.md), [Security Policy](../SECURITY.md) and [Release Verification 3.4.0](../docs/releases/3.4.0/RELEASE_VERIFICATION.md).
