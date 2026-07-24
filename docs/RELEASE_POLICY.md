# Политика выпусков Nexora

## Semantic Versioning

Nexora использует SemVer:

- `MAJOR` — incompatible product/API/data-contract change;
- `MINOR` — backward-compatible functionality;
- `PATCH` — backward-compatible defect, security или operational hardening.

Metadata синхронизируется в package, lockfile, Client handshake, Android, current documentation, canonical versioned release notes/verification, release evidence и tag.

## Release classifications

### Development

Implementation incomplete или имеет unresolved blockers. Не распространяется как product release.

### Source/PWA prerelease

Verified source, production web build и automated gates. Не означает signed Windows installers, updater eligibility, packaged runtime acceptance, external certification или high-risk production suitability.

### `UNSIGNED-TEST` prerelease

Допускает официальный immutable SemVer tag и GitHub prerelease с явно маркированными Client/Server/Android test assets. Обязательные ограничения:

- updater metadata (`latest.yml`, `server.yml`) и blockmaps не публикуются;
- production updater не может принять release;
- installer names содержат `UNSIGNED-TEST`;
- checksums, SBOM, release evidence и post-publication re-download smoke обязательны.

### Stable signed Windows

Требует full automated gates, manual Windows acceptance, valid Authenticode identity/timestamp, complete updater metadata, n-1→n upgrade, no unresolved blockers и approved security/operations evidence.

### Security patch

Требует regression-first reproduction, root cause, correction, tests, compatibility statement, supported-version update и coordinated disclosure when applicable.

## Automated gates

```bash
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Release gate включает metadata synchronization, release consistency, syntax, builder configuration, production web build, unit/API/integration/realtime, performance, security invariants/dependency audit, schema soak, Android, focused regressions и website contracts.

## Manual gates by classification

- installed Client/Server smoke;
- backup verification and restore drill;
- public HTTPS/certificate profile smoke;
- PWA/offline and Android acceptance;
- signed Windows 10/11 and updater n-1→n only for signed stable promotion;
- independent review only when a release claims that evidence.

## Security claims

Documentation distinguishes functionality, automated evidence, manual runtime evidence, signing/distribution evidence and independent-review evidence. “Stable”, “production-ready”, “audited”, “secure” and “E2EE” require exact version, feature path and completed evidence.

## Tag and artifacts

- immutable SemVer tag;
- package version equals tag;
- published assets are never replaced;
- correction uses a new patch version;
- unsigned release never contains updater metadata;
- signed updater consumes only a complete verified asset set;
- release links point to the official `Onmaynec/Nexora` tag;
- every published asset is re-downloaded and checksum-verified.

## Database compatibility

Schema-affecting work requires source integrity, verified backup, free-space check, transactional/idempotent migration, destination integrity, rollback, downgrade protection and supported-source tests.

Nexora 3.3.4 keeps SQLite schema 8 as a compatibility layer. It removes executable Trust/MLS runtime without converting legacy ciphertext into plaintext. Future schema versions fail before mutation.

## Current release decision

### 3.3.4

- classification: Post-MLS Baseline release candidate;
- baseline: published `3.3.3` line;
- ordinary server-readable messaging: writable;
- legacy Trust/MLS history: read-only, writes return `410/LEGACY_READ_ONLY`;
- release without signing policy: official `v3.3.4` `UNSIGNED-TEST` prerelease without updater metadata;
- completion blockers: final CI, merge, post-merge CI, tag/release and asset re-download smoke;
- independent review and signed 3.3.4→3.4.0 acceptance: deferred to Nexora 3.4.0.

### 3.3.3

Previous published `UNSIGNED-TEST` prerelease and supported upgrade source for 3.3.4.

### 3.1.2

Last confirmed signed production baseline.

Authoritative 3.3.4 evidence: [Release Verification](releases/3.3.4/RELEASE_VERIFICATION.md), [Release Notes](releases/3.3.4/RELEASE_NOTES.md), [Security Review](../SECURITY_REVIEW_3.3.4.md) and [`release-evidence/current.json`](../release-evidence/current.json).
