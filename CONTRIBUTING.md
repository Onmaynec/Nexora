# Contributing to Nexora

Thank you for contributing to Nexora. This policy defines the repository workflow, quality requirements and security expectations for Issues, Pull Requests and documentation.

Participation is subject to the [Code of Conduct](CODE_OF_CONDUCT.md). Security reports must follow [SECURITY.md](SECURITY.md).

## 1. Current repository baseline

- repository version: `3.2.0`;
- distribution classification: Source/PWA prerelease;
- signed production baseline: `3.1.2`;
- application API: v3;
- Trust/MLS API: v4;
- Local Server database: SQLite schema 8.

A contribution must not present prerelease functionality as stable, signed or independently audited.

## 2. Before opening a Pull Request

Use the appropriate channel:

- reproducible defect — [Bug report](https://github.com/Onmaynec/Nexora/issues/new?template=bug_report.yml);
- product proposal — [Feature request](https://github.com/Onmaynec/Nexora/issues/new?template=feature_request.yml);
- documentation defect — Documentation issue;
- installation or operations question — [SUPPORT.md](SUPPORT.md);
- vulnerability — private GitHub Security Advisory.

Discuss large features, architecture changes, schema changes and new dependencies before implementation.

## 3. Local environment

Requirements:

- Node.js `22.16+`;
- npm;
- JDK 17, Android SDK 36 and Gradle 8.13 for Android work;
- Windows 10/11 for complete Electron packaging validation.

```bash
git clone https://github.com/Onmaynec/Nexora.git
cd Nexora
npm ci
npm run check
npm test
npm run audit:security
```

Nexora uses `node:sqlite`. Do not introduce a native SQLite package or `node-gyp` requirement without an approved architecture decision.

## 4. Engineering principles

- preserve the existing architecture and reuse current services, models, components and utilities;
- fix the root cause, not only the visible symptom;
- keep Client responsible for interface and local interaction state;
- keep Server responsible for authorization, validation, business rules, storage integrity and realtime access;
- perform critical permission and room-policy checks on the Server;
- treat hidden UI actions as presentation, not security;
- use transactions for related writes and race-sensitive operations;
- add migrations, backup checks and rollback documentation for schema changes;
- preserve API compatibility inside major line 3 or document migration/compatibility explicitly;
- do not add dependencies without a documented need;
- do not leave TODOs, stubs, fake data, empty handlers or unused code.

## 5. Security and privacy requirements

Never commit:

- `.env` files or production credentials;
- SQLite databases, backups or user attachments;
- CA private keys, PFX/P12 files or signing secrets;
- session cookies, OAuth/API/bot/Pulse tokens or invite codes;
- Trust identity private keys or MLS private state;
- real user data in tests, screenshots or logs.

Mutating browser requests must preserve session, Origin and CSRF checks. Trust operations must preserve device scope, challenge/signature validation and plaintext downgrade protection.

Production Plus/Pulse entitlement cannot be issued authoritatively by Local Server.

## 6. Branches and commits

Create a focused branch from current `main`:

- `feat/` — functionality;
- `fix/` — defect correction;
- `docs/` — documentation/community files;
- `test/` — test-only work;
- `chore/` — maintenance without product behavior change.

Use concise imperative commit subjects, for example:

```text
fix: reject stale MLS epoch
```

Do not combine unrelated refactoring, feature work and documentation cleanup in one Pull Request.

## 7. Required tests

Minimum gate:

```bash
npm run check
npm test
npm run audit:security
```

Release-sensitive gate:

```bash
npm run release:check
```

Additional affected-surface checks:

- performance — `npm run test:performance`;
- Cloud — `npm run test:cloud`;
- Local Pulse — `npm run test:pulse-local`;
- long-running integrity — `npm run test:soak`;
- Android — `gradle -p android :app:assembleDebug --no-daemon`;
- local Windows packages — `npm run dist:windows`;
- signed Windows release — `npm run release:windows`.

UI changes require keyboard, responsive, long-content and reduced-motion review.

## 8. Test expectations

Add unit, integration and API coverage for affected behavior. Security-sensitive work should include direct bypass attempts, not only successful UI flows.

Relevant examples:

- role and room-policy boundaries;
- ban/removal realtime access loss;
- invitation expiry/limit races;
- upload MIME/size/hash substitution;
- CSRF and IDOR attempts;
- Pulse signature/replay/idempotency;
- Trust device proof, verify/revoke and replay;
- MLS epoch/replay/recovery;
- plaintext downgrade after MLS activation;
- encrypted attachment scope/hash/claim reuse;
- migration, downgrade and restore behavior.

## 9. Pull Request requirements

A Pull Request must state:

1. problem and solution;
2. affected components;
3. schema/API/client compatibility impact;
4. security and privacy impact;
5. migration/rollback plan;
6. tests added or updated;
7. actual command results;
8. manual validation performed;
9. documentation and changelog changes;
10. remaining limitations.

Review may be blocked when a PR is not reproducible, contains secrets, bypasses Server checks, lacks migration/testing evidence or introduces unrelated mass refactoring.

## 10. Documentation standard

Documentation must:

- describe actual current behavior;
- identify the relevant version and release classification;
- separate implemented, automated-verified, manual-verified and planned scope;
- state security limitations and trust boundaries;
- use repository-relative links;
- preserve historical release provenance;
- avoid unsupported marketing claims;
- update guides, release notes and changelog when user-visible behavior changes.

The documentation index is [docs/README.md](docs/README.md).

## 11. Licensing

By submitting a contribution, you confirm that you have the right to provide it and agree that it may be distributed under the [MIT License](LICENSE).
