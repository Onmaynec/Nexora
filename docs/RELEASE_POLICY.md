# Политика выпусков Nexora

## 1. Semantic Versioning

Nexora использует SemVer:

- `MAJOR` — incompatible product/API/data-contract change;
- `MINOR` — backward-compatible functionality;
- `PATCH` — backward-compatible defect, security или operational hardening.

Metadata синхронизируется в package, lockfile, Client handshake, Android, current README/documentation, release notes, verification, release evidence и tag.

## 2. Release classifications

### Development

Implementation incomplete или имеет unresolved blockers. Не распространяется как product release.

### Source/PWA prerelease

Verified source, production web build и automated gates. Допустимы:

- source ZIP;
- built PWA ZIP;
- SPDX SBOM;
- SHA-256 checksums.

Не означает signed Windows installers, updater eligibility, packaged runtime E2E, external certification или high-risk production suitability.

### Stable signed Windows

Требует:

- full automated gates;
- manual platform/runtime acceptance;
- verified migration/rollback;
- valid Authenticode signatures;
- complete installer/blockmap/`latest.yml`;
- updater n-1 → n;
- no unresolved release blockers;
- approved security/operations evidence.

### Security patch

Требует regression-first reproduction, root cause, correction, tests, compatibility statement, supported-version update и coordinated disclosure when applicable.

### Documentation-only release support

Documentation-only PR не меняет version metadata и не создаёт новый product release. Он должен пройти existing CI и не изменять runtime code, dependencies, migrations или workflows.

## 3. Automated gates

```bash
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Release gate includes syntax, builder config, production web build, unit/API/integration, performance, security invariants/dependency audit и metadata synchronization.

Release-sensitive changes additionally run relevant soak, migration, Cloud, Pulse, Trust/MLS, updater и platform suites.

## 4. Manual gates

Depending on classification:

- clean install/upgrade Windows 10/11;
- signed Client/Server verification;
- updater n-1 → n;
- NSIS visual/runtime acceptance;
- test-mode shortcut/log-tail acceptance;
- installed PWA/offline behavior;
- physical Android matrix;
- backup/restore/migration drill;
- public HTTPS smoke;
- Pulse provider sandbox/reconciliation;
- multi-device MLS commit/Welcome/revoke/re-add/recovery;
- accessibility/responsive review.

## 5. Security claims

Release documentation distinguishes:

1. functionality in source;
2. automated evidence;
3. manual runtime evidence;
4. signing/distribution evidence;
5. independent review evidence.

“Stable”, “production-ready”, “audited”, “secure” и “E2EE” use requires exact version, feature path и completed evidence.

## 6. Tag и artifacts

- immutable SemVer tags;
- package version equals tag;
- published stable assets never replaced;
- correction uses new patch version;
- unsigned `.exe`, blockmap и `latest.yml` not published;
- updater consumes only complete signed stable set;
- prerelease explicitly marked;
- release links point to official `Onmaynec/Nexora` tag.

## 7. Database compatibility

Schema change requires:

- source integrity;
- verified backup;
- free-space check;
- transactional/idempotent migration;
- destination integrity;
- rollback/restore procedure;
- downgrade protection;
- tests from supported source schemas.

3.3.2 keeps schema 8. Migration from 3.2.0–3.3.1 is not required.

## 8. Branch policy

- `main` is only current product source;
- development branch has explicit `BRANCH_STATUS.md`;
- merged/superseded branch preserves provenance;
- obsolete automation branch is not merged/tagged/published;
- historical docs are not rewritten to imitate current release;
- details: [Branch Documentation Policy](BRANCH_DOCUMENTATION_POLICY.md).

## 9. Current release decision

### 3.3.2

- classification: Published `UNSIGNED-TEST` prerelease;
- automated multi-platform gate: passed;
- schema: 8;
- API: v3/v4;
- database migration from 3.2.0–3.3.1: none;
- signed stable Windows approval: not granted;
- independent security review: not completed.

### 3.1.2

- classification: last confirmed signed production baseline;
- schema: 7;
- secure-message E2EE from Local Server operator: not provided.

Authoritative evidence: [Release Verification 3.3.2](../RELEASE_VERIFICATION_3.3.2.md).
