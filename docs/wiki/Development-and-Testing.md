# Development and Testing

## Branch workflow

- `main` is the only current product source of truth.
- Start new work from the latest verified `main` unless an approved stacked-branch plan says otherwise.
- Use `feat/`, `fix/`, `docs/`, `test/` or `chore/` prefixes.
- Do not mix unrelated refactoring, feature work and documentation cleanup.
- Every retained development branch must contain an accurate `BRANCH_STATUS.md`.

## Engineering rules

- Preserve the current architecture and reuse existing services, models, components and utilities.
- Fix the root cause, not only the visible UI symptom.
- Keep critical authorization, validation and state transitions on the server.
- Use transactions for related records and idempotency for retry-sensitive mutations.
- Schema changes require migration, backup, integrity checks, downgrade protection and rollback guidance.
- Do not leave TODOs, stubs, fake data, empty handlers or unused code.

## Minimum validation

```bash
npm run check
npm test
npm run audit:security
```

Release-sensitive validation:

```bash
npm run release:check
```

Affected-area gates:

| Area | Command / evidence |
|---|---|
| Performance | `npm run test:performance` |
| Pulse Cloud | `npm run test:cloud` |
| Local Pulse | `npm run test:pulse-local` |
| Soak/integrity | `npm run test:soak` |
| Android | `gradle -p android :app:assembleDebug --no-daemon` |
| Windows packages | `npm run dist:windows` |
| Signed Windows release | `npm run release:windows:signed` |

## Security-sensitive test matrix

- owner/moderator/member boundaries and last-owner invariant;
- removal, ban and immediate realtime access loss;
- invitation expiry, revocation, limits and concurrent final use;
- CSRF, Origin, IDOR and direct API bypass attempts;
- upload MIME/size/hash substitution and temporary-file cleanup;
- Pulse price/signature/replay/idempotency behavior;
- migration, downgrade, backup and restore failure paths;
- updater signing and no-downgrade behavior.

## Pull request evidence

A PR must state:

1. problem and root-cause fix;
2. affected components;
3. schema/API/client compatibility;
4. security and privacy impact;
5. migration/rollback behavior;
6. tests added or updated;
7. actual command results;
8. manual validation;
9. documentation and changelog changes;
10. real remaining limitations.

## References

- [`CONTRIBUTING.md`](../../CONTRIBUTING.md)
- [`BRANCHES.md`](../../BRANCHES.md)
- [`docs/BRANCH_DOCUMENTATION_POLICY.md`](../BRANCH_DOCUMENTATION_POLICY.md)
- [`docs/RELEASE_CHECKLIST.md`](../RELEASE_CHECKLIST.md)