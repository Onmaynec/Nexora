# Nexora 3.2.2 — Release Verification

## Classification

- Version: `3.2.2`.
- Base release: `3.2.1`.
- Pull Request: `#19`.
- Branch: `agent/nexora-3.2.2-trust-bootstrap-race`.
- Verified implementation head: `76854ffeca0813d42d397926ceac6202db149151`.
- GitHub Actions: CI run `#287`, run ID `29931947146`.
- Date: `2026-07-22`.
- Result: automated patch-release gate passed.

## Reported defect

After successful authentication, Web/PWA and Electron Client could replace the workspace with `CLIENT RECOVERY`. The Client diagnostic contained repeated renderer failures with `TRUST_NOT_CONFIGURED`.

## Root cause

`App` rendered `Workspace` immediately after bootstrap while `configureTrust()` ran in a parent passive effect. `ConversationList` mounted a child passive effect that read encrypted drafts. The child effect could run before the parent effect; `loadE2eeDraft()` called `current()` without an initialized Trust scope and synchronously threw `TRUST_NOT_CONFIGURED`. React's global Error Boundary then replaced the entire application.

## Implemented correction

- `configureTrust()` is committed in a parent `useLayoutEffect` before child passive effects run;
- asynchronous device creation and verification remain in a normal passive effect;
- `loadE2eeDraft()` returns an empty draft during the short pre-configuration lifecycle window;
- `saveE2eeDraft()` preserves a rejected-Promise error contract instead of throwing synchronously;
- platform, WebCrypto, IndexedDB, device registration and revocation failures remain visible;
- Client, Server, Android and package metadata are synchronized as `3.2.2`.

## Regression-first evidence

The tests-only candidate reproduced the defect before production code was changed. CI run `#282`, ID `29931545510`, failed on the 3.2.1 lifecycle ordering as expected.

`test/regression-3.2.2.test.cjs` verifies:

1. Trust configuration occurs in layout phase before Workspace child passive effects;
2. encrypted draft reads are safe before Trust scope initialization;
3. real Trust platform and registration failures are not hidden.

## Automated gate results

### Windows verify

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm run check` | PASS |
| `npm run test:unit` | PASS |
| `npm run test:performance` | PASS |
| `npm run audit:security` | PASS |

### Linux full suite

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm test` | PASS |

### Dedicated release gate

| Step | Result |
|---|---|
| `npm ci` | PASS |
| `npm run release:check` | PASS |

### Schema 8 soak

| Step | Result |
|---|---|
| `npm run test:soak` | PASS |

### Android source build

| Step | Result |
|---|---|
| Java 17 / Gradle 8.13 setup | PASS |
| `gradle -p android :app:assembleDebug --no-daemon` | PASS |

## Version, schema and API compatibility

- package: `3.2.2`;
- Client handshake: `3.2.2`;
- Android `versionName`: `3.2.2`;
- Android `versionCode`: `30202`;
- Local Server schema: `8` (unchanged);
- application API: v3 (unchanged);
- Trust/MLS/encrypted-media API: v4 (unchanged);
- no database migration is required from 3.2.0 or 3.2.1.

## Security review

- Trust validation is not bypassed;
- no key, token, credential or plaintext message is logged;
- the fallback applies only to reading a draft before the scope exists;
- device creation, unsupported cryptography, IndexedDB failure, registration failure and revocation still fail explicitly;
- the fix does not weaken MLS membership, device-scoped realtime or server authorization.

## Decision

Automated verification for implementation head `76854ffeca0813d42d397926ceac6202db149151` is **PASS**. The regression is covered and the patch is eligible for merge and publication as Nexora `3.2.2`, subject to the final documentation-only CI remaining green.
