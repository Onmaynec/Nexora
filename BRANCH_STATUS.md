# Статус ветки `release/3.3.4`

## Классификация

| Параметр | Значение |
|---|---|
| Classification | Overlapping draft / reconciliation required |
| Intended version | Nexora `3.3.4` |
| Current package metadata | `3.3.3` |
| Pull Request | Draft PR `#67` |
| Competing candidate | `release/3.3.4-post-mls`, draft PR `#70` |
| Current product source of truth | `main`, Nexora `3.3.3` |
| Release state | Not release-ready, not tagged, not published |

## Intended scope

- remove MLS and Trust Core runtime;
- restore server-readable Local Server messaging while retaining legacy MLS history as read-only;
- replace native goal-contribution confirmation with an in-app dialog;
- repair avatar-frame clipping and entitlement refresh;
- close voice-recorder state after send and add microphone selection;
- synchronize repository and website documentation;
- prepare explicitly classified test artifacts after validation.

## Reconciliation boundary

This branch overlaps the newer `release/3.3.4-post-mls` candidate. It must not be merged, tagged or published independently. The implementation must be compared with PR #70, and any unique required changes must be ported through a reviewed commit or explicitly discarded with recorded rationale.

Because `package.json` still reports `3.3.3`, this branch cannot satisfy the 3.3.4 release consistency gate in its current state.

## Security boundary

No plaintext fallback for legacy secure records, silent ciphertext deletion, server-side legacy decryption or secret logging is permitted. Any transition away from MLS must preserve read-only historical access and explicit API errors for unsupported mutations.

## Real limitations

- version metadata is not synchronized;
- branch scope overlaps PR #70;
- complete CI, release evidence and independent security review are not established;
- `main` 3.3.3 remains the only current product source of truth.
