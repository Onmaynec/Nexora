# Статус ветки `release/3.4.0-stable-core-v2`

## Классификация

| Параметр | Значение |
|---|---|
| Classification | Active development / blocked draft release |
| Target version | Nexora `3.4.0` |
| Required baseline | Verified and published Nexora `3.3.4` |
| Pull Request | Draft PR `#96` |
| Current product source of truth | `main`, Nexora `3.3.3` |
| Release state | Blocked, not approved, not tagged, not published |
| Package metadata | `3.4.0` on this branch only |

## Scope

- implement the approved Stable Core contract;
- retire executable Trust/MLS runtime while preserving schema 8 legacy ciphertext;
- expose read-only legacy secure history and export paths;
- add server-owned device/session inventory and immediate revocation;
- add backup verification and safe signing diagnostics;
- harden signed Client/Server updater and release evidence;
- synchronize Client, Server, Android, documentation and version metadata.

## Blocking dependency

This branch must not merge, tag or publish until the 3.3.4 prerequisite is approved and the branch is rebased or otherwise reconciled against that exact verified baseline. Current package metadata alone does not make 3.4.0 a release candidate.

## Required verification

- migration and schema 8 compatibility tests;
- legacy ciphertext read-only/export tests;
- authorization, device revocation and session invalidation tests;
- backup restore and integrity verification;
- signed updater and n-1 → n installed acceptance;
- unit, API, integration, performance, security and artifact gates;
- independent security review and closure evidence.

## Security boundary

Historical encrypted records must not be silently decrypted, rewritten or deleted. Device/session revocation and all privileged operations remain server-authoritative. Signing credentials, tokens and private data must not be committed or logged.

## Real limitations

- the mandatory 3.3.4 baseline is not yet merged and published;
- Authenticode credentials and Windows 10/11 installed acceptance are external release prerequisites;
- independent review is incomplete;
- `main` 3.3.3 remains the only current product source of truth.
