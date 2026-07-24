# Getting Started

## Requirements

| Component | Requirement |
|---|---|
| Node.js | `22.16+` |
| Package manager | npm with the committed lockfile |
| Android | JDK 17, Android SDK 36, Gradle 8.13 |
| Windows packaging | Windows 10/11 |

## Local development

```bash
git clone https://github.com/Onmaynec/Nexora.git
cd Nexora
npm ci
npm run dev
```

The development command starts the Local Server and Vite client together.

## Core commands

```bash
npm run check
npm test
npm run audit:security
```

Release-sensitive validation:

```bash
npm run release:check
```

Additional gates:

```bash
npm run test:cloud
npm run test:pulse-local
npm run test:soak
npm run dist:windows
```

Android source build:

```bash
gradle -p android :app:assembleDebug --no-daemon
```

## Runtime surfaces

- **Windows Client** — Electron shell using `electron/client-main.cjs`.
- **Windows Local Server** — Electron/server shell using `electron/server-main.cjs`.
- **Browser/PWA** — Vite-built React application.
- **Android** — WebView shell with platform permissions and lifecycle handling.
- **Local Server** — Express, Socket.IO and SQLite.
- **Pulse Cloud** — optional service boundary; core local messaging must not depend on it.

## Before reporting a defect

1. Confirm the exact version, branch, tag or release asset.
2. Reproduce on the current supported line where possible.
3. Record the affected platform and deployment profile.
4. Remove credentials, tokens, private keys, invite codes and user content.
5. Use the repository Issue forms; use a private Security Advisory for vulnerabilities.

## Distribution warning

The current `3.3.3` line is published as `UNSIGNED-TEST`. It must not be treated as a signed stable production build. The last documented signed production baseline is `3.1.2`.