# Nexora Release Policy

## 1. Versioning

Nexora follows Semantic Versioning:

- `MAJOR` — incompatible product, API or data-contract changes;
- `MINOR` — backward-compatible functionality;
- `PATCH` — backward-compatible fixes and hardening.

Version metadata must remain synchronized across `package.json`, lockfile, Client handshake, Android metadata, release notes and tags.

## 2. Release classifications

### Development

Implementation is incomplete or has unresolved blockers. Development builds are not distributed as product releases.

### Source/PWA prerelease

The source, production web build and automated gates are verified. Distribution may include:

- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- SHA-256 checksums.

This classification does not imply:

- signed Windows installers;
- updater eligibility;
- packaged runtime E2E;
- external security certification;
- production suitability for high-risk communications.

### Stable signed release

Requires:

- all automated release gates;
- manual platform/runtime acceptance;
- verified migrations and rollback procedure;
- valid Authenticode signatures for Windows assets;
- complete updater metadata;
- no unresolved release blockers;
- approved security and operational evidence.

### Security patch

A patch release addressing a security issue must include reproduction, regression coverage, coordinated disclosure plan and supported-version statement.

## 3. Required automated gates

Before release:

```bash
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

The current release gate covers:

- source syntax;
- Electron Builder configuration;
- production web build;
- unit/API/integration tests;
- isolated performance tests;
- security invariants and dependency audit;
- release metadata synchronization.

Release-sensitive changes additionally require the relevant soak, migration, Cloud, Pulse, Trust/MLS and platform-specific suites.

## 4. Manual gates

Depending on release classification:

- clean install and upgrade on Windows 10/11;
- signed Client/Server installer verification;
- updater n-1 → n;
- installed PWA runtime and offline behavior;
- physical Android device matrix;
- backup/restore and migration rollback drill;
- public HTTPS deployment smoke;
- provider sandbox and webhook/reconciliation smoke for Pulse;
- multi-device and recovery matrix for Trust/MLS;
- accessibility and responsive UI review.

## 5. Security claims

Release documentation must distinguish:

1. functionality present in source;
2. automated test evidence;
3. manual runtime evidence;
4. signing and distribution evidence;
5. independent review evidence.

Terms such as “secure”, “encrypted”, “E2EE”, “audited”, “production-ready” and “stable” must be scoped to a concrete version, feature path and completed evidence.

## 6. Tag and artifact policy

- release tags are immutable SemVer tags;
- `package.json` version must match the tag;
- published stable assets are never replaced in place;
- corrections use a new patch version;
- unsigned `.exe`, blockmap and `latest.yml` are not published;
- Electron updater consumes only a complete signed stable Windows set;
- source/PWA prerelease remains explicitly marked as prerelease.

## 7. Database compatibility

Every schema change requires:

- pre-migration integrity check;
- verified backup;
- transactional/idempotent migration;
- post-migration integrity check;
- documented rollback or restore procedure;
- downgrade protection where old binaries could corrupt new state;
- test coverage from supported source schemas.

## 8. Current release decision

### Nexora 3.2.0

- classification: Source/PWA prerelease;
- automated release gate: passed;
- Local Server schema: 8;
- application API: v3;
- Trust/MLS API: v4;
- stable signed production promotion: not approved;
- independent cryptographic/application-security review: not completed.

### Nexora 3.1.2

- classification: signed production baseline;
- Local Server schema: 7;
- secure-message E2EE: not provided.

The authoritative evidence for `3.2.0` is [RELEASE_VERIFICATION_3.2.0.md](../RELEASE_VERIFICATION_3.2.0.md).
