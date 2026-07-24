# Политика выпусков Nexora 3.4.0

## 1. Semantic Versioning

Nexora использует SemVer:

- `MAJOR` — incompatible product/API/data-contract change;
- `MINOR` — backward-compatible functionality;
- `PATCH` — backward-compatible defect, security или operational hardening.

Release metadata синхронизируется в package, lockfile, Client handshake, Android, current documentation, release notes, verification, machine-readable evidence и tag.

## 2. Release classifications

### Development

Implementation incomplete или имеет unresolved blockers. Не распространяется как product release.

### Source/PWA release candidate

Verified source, production web build и automated gates. Допустимы source/PWA/SBOM/checksum artifacts, но это не означает signed Windows installers, updater eligibility или production approval.

### Stable signed Windows

Требует:

- full automated gates на exact commit;
- verified migration/backup/rollback;
- valid Authenticode signatures и timestamp;
- complete Client/Server installers, blockmaps и updater metadata;
- installed n-1 → n acceptance на supported Windows versions;
- no unresolved release blockers;
- approved security/operations evidence;
- immutable tag и post-publication asset verification.

### Security patch

Требует regression-first reproduction, root cause, correction, tests, compatibility statement, supported-version update и coordinated disclosure when applicable.

### Documentation-only

Documentation-only PR не меняет version metadata и не создаёт product release. Он проходит existing CI и не изменяет runtime, dependencies, migrations или workflows без отдельного scope.

## 3. Nexora 3.4.0 classification

`3.4.0` является Stable Core release candidate до закрытия всех gates:

- published verified `v3.3.4` prerequisite;
- complete Authenticode policy;
- signed Client/Server assets and updater metadata;
- Windows 10/11 installed `3.3.4 → 3.4.0` acceptance;
- independent review без unresolved high/critical findings;
- final CI/security/soak/Android/websites gates;
- immutable publication and redownload verification.

Official `v3.4.0` tag запрещён до закрытия этих пунктов.

## 4. Automated gates

```bash
npm ci
npm run release:check
npm run test:soak
gradle -p android :app:assembleDebug --no-daemon
```

Release gate включает:

- metadata synchronization;
- release consistency;
- syntax и Electron builder config;
- production web build;
- unit/API/integration/realtime suites;
- performance;
- security invariant and dependency audit;
- Linux full tests;
- schema 8 soak;
- Android source build;
- introductory/Advanced Documentation website validation.

## 5. Manual and external gates

Depending on classification:

- clean install/repair/uninstall Windows 10/11;
- installed signed Client/Server verification;
- updater n-1 → n;
- NSIS runtime acceptance;
- installed PWA/offline behavior;
- physical Android matrix;
- backup/restore/migration drill;
- public HTTPS smoke;
- Pulse provider sandbox/reconciliation;
- accessibility/responsive review;
- independent security review.

For `3.4.0`, Windows and independent-review results are stored as machine-readable release evidence and must identify the exact reviewed ancestor commit.

## 6. Security claims

Documentation distinguishes:

1. functionality in source;
2. automated evidence;
3. manual runtime evidence;
4. signing/distribution evidence;
5. independent review evidence.

`Stable`, `production-ready`, `signed`, `audited`, `secure` и `E2EE` require exact version, feature path and completed evidence. Historical Trust/MLS records being retained does not mean current writable E2EE support.

## 7. Tag and artifacts

- immutable SemVer tags;
- package version equals tag;
- published stable assets never replaced;
- correction uses a new patch version;
- partial/unsigned stable asset set is forbidden;
- updater consumes only complete signed stable metadata;
- source, PWA, Android evidence, SPDX SBOM and SHA-256 checksums are included;
- release notes come from canonical `docs/releases/<version>/RELEASE_NOTES.md`;
- published assets are re-downloaded and verified.

## 8. Updater policy

- Client channel: `latest`;
- Server channel: `server`;
- downgrade and prerelease consumption disabled;
- signature/checksum mismatch maps to `UPDATE_SIGNATURE_INVALID`;
- partial signing configuration rejected;
- unsigned local/test builds never publish `latest.yml`, `server.yml` or blockmaps;
- stable metadata must correspond to exact signed installer and version.

## 9. Baseline policy

Nexora 3.4.0 stable upgrade is defined as verified `3.3.4 → 3.4.0`.

The release workflow must fail before packaging if `v3.3.4` is missing, draft/prerelease or lacks required Client/Server/checksum assets.

## 10. Review and merge

Release PR remains draft until internal gates are green and external evidence exists. Before merge:

- no unresolved review threads;
- no high/critical security findings;
- no temporary scripts/workflows/failure logs;
- PR body contains exact head SHA and gate results;
- release notes, verification, changelog and current evidence agree.

Merge commit subject must match release workflow trigger and point to the exact approved head.

## 11. Post-publication

After stable publication:

- verify tag points to release commit;
- re-download all assets;
- verify SHA-256 and Authenticode;
- verify updater metadata and channels;
- record release URL, tag SHA, asset digests and smoke result;
- update `release-evidence/current.json` from release-candidate to published state;
- close/delete completed release branch after provenance is preserved.
