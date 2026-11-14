# Nexora 3.6.0 Connect — Operations Runbook

## 1. Scope and status

This runbook covers the Nexora `3.6.0` implementation candidate:

- Local Server SQLite schema 10;
- Application API v3;
- contacts, block and privacy policy;
- privacy-filtered presence/read receipts;
- one-to-one WebRTC voice calls;
- short-lived operator TURN credentials;
- Windows, Browser/PWA and Android clients.

It does not authorize production rollout or `v3.6.0`. Signed stable publication remains blocked until the external evidence ledger is complete.

## 2. Preflight

Verify before startup or upgrade:

- Node.js `22.16+`;
- writable Local Server data directory;
- free space for SQLite, WAL, uploads and a pre-migration backup;
- HTTPS certificate, SAN, Server ID and expected fingerprint;
- exact allowed origins and firewall/interface exposure;
- known backup and restore procedure;
- no secrets in repository, command history, logs or support exports;
- exact release classification and compatible Client version;
- production TURN deployment and protected secret when voice calls are enabled.

### Connect configuration

```text
NEXORA_TURN_URLS=stun:stun.example:3478,turns:turn.example:5349?transport=tcp
NEXORA_TURN_SECRET=<strong protected shared secret>
NEXORA_TURN_TTL_SECONDS=600
```

Rules:

- use operator-controlled TURN for production;
- prefer `turns:` where supported;
- do not embed TURN credentials in web, Electron or Android clients;
- do not print the secret or generated credentials;
- keep TTL between the server-enforced bounds;
- rotate the secret through the deployment secret store and restart affected Local Servers in a controlled window.

## 3. Startup and readiness

```bash
npm ci
npm start
```

Check:

```text
GET /healthz/live
GET /healthz/ready
```

Confirm in status/log evidence:

- schema version is `10`;
- migration completed before network listen;
- SQLite integrity is `ok`;
- storage has safe headroom;
- Socket.IO is ready;
- Connect status reports contacts/privacy/direct calls enabled;
- TURN status matches intended deployment;
- no migration backup or filesystem path is returned to untrusted clients.

A future-schema database, failed integrity check, low disk space or failed backup is a terminal startup condition. Do not bypass it by editing the database manually.

## 4. Schema 9 → 10 rollout

Before upgrade:

1. stop or drain application writes;
2. create an operator backup and verify it independently;
3. confirm enough free space for the automatic pre-schema backup;
4. record exact source version/commit and database integrity;
5. deploy the 3.6.0 candidate to a staging copy first.

Automatic migration performs:

1. schema prerequisite and downgrade-protection check;
2. source `PRAGMA integrity_check`;
3. free-space calculation;
4. WAL checkpoint;
5. verified `.pre-schema-10-*.bak` backup;
6. one immediate SQLite transaction;
7. destination integrity check.

After migration verify the presence of:

```text
connect_privacy
connect_call_history
connect_idempotency
connect_audit
```

and their expected indexes. Existing users, rooms, conversations, messages, files, sessions, schema 8 legacy records and schema 9 Mobile Continuity records must remain intact.

### Rollback

Do not downgrade a live schema 10 database into an older binary. Rollback means:

1. stop the candidate;
2. preserve failed migration/log evidence;
3. restore the verified schema 9 backup using the supported restore path;
4. verify database and file-store consistency;
5. start the previous verified version;
6. validate representative accounts, rooms, messages, uploads and sessions.

## 5. Normal monitoring

Monitor bounded aggregates, not user/call identifiers:

- process liveness/readiness;
- HTTP and Socket.IO error rates;
- authentication/CSRF failures;
- `RATE_LIMITED` frequency and retry windows;
- active call count;
- call outcome counts (`completed`, `declined`, `missed`, `failed`);
- ringing/connecting timeout counts;
- TURN configured/degraded state;
- SQLite integrity, WAL size, storage quota and backup age;
- session revocation/disconnect health;
- orphan upload and maintenance cleanup state;
- certificate and signing-material expiry.

Never use username, user ID, call ID, SDP, ICE candidate, token or TURN credential as a metric label.

## 6. Contact and privacy incidents

For an unexpected contact request, presence disclosure or read receipt:

1. record UTC time, request ID and stable error/event code;
2. identify the exact viewer and subject in protected incident tooling;
3. inspect current block/contact/shared-room relationship;
4. inspect subject privacy rows and current session state;
5. verify both query serialization and realtime recipient filtering;
6. test the same operation through direct REST/Socket.IO, not only UI;
7. preserve sanitized audit entries;
8. revoke compromised sessions if needed.

Expected properties:

- block prevents new contact/call operations;
- unblock does not restore contact;
- hidden presence disappears without reconnect;
- hidden read receipts are neither emitted nor counted;
- search results do not disclose blocked/disabled users or private profile fields.

A client-side hidden button is not proof of enforcement.

## 7. Call incidents

### Infinite ringing or connecting

Check:

- caller/callee active sessions;
- call state and deadline;
- Socket.IO connectivity;
- signaling sequence errors;
- TURN configuration;
- rate-limit events;
- client media permission/device state.

The server should terminalize ringing and connection attempts at bounded deadlines. A state without timeout is a release blocker.

### Third-party or wrong-device signaling

Immediately:

1. terminate affected calls;
2. revoke involved sessions;
3. preserve request IDs and sanitized call audit metadata;
4. verify call participant IDs and bound session IDs;
5. confirm the target event used `session:*`, not an unrelated user/global room;
6. reproduce with direct Socket.IO tests.

Unauthorized call observation/join is a security incident and blocks release.

### Call spam

Inspect bounded counters for:

- caller account;
- caller device;
- caller→target pair;
- signaling account/device/call windows.

Do not raise limits to hide abuse or test failures. Confirm `RATE_LIMITED` and a positive retry delay are returned.

### Microphone remains active

Client must stop every local track and close the peer connection on:

- user end;
- decline/missed/failed state;
- block;
- session revoke/disconnect;
- server shutdown;
- navigation/unmount/profile switch;
- permission/device error.

If the OS privacy indicator remains active after a terminal path, treat it as a release blocker. Capture platform/version and reproduction steps without recording voice content.

## 8. TURN incidents

### `TURN_UNAVAILABLE`

Verify:

- URLs parse as `stun:`, `turn:` or `turns:`;
- secret is present and sufficiently strong;
- DNS/firewall/TLS reachability;
- relay ports and transport policy;
- server/client clocks;
- generated TTL;
- coturn/shared-secret configuration matches the Local Server.

Do not fall back to static credentials in the client.

### Suspected credential leak

1. rotate `NEXORA_TURN_SECRET` immediately;
2. restart affected Local Servers;
3. invalidate old credentials by waiting no longer than their short TTL;
4. inspect logs/artifacts/support exports for credential material;
5. remove unsafe evidence and notify security owners;
6. add a regression/audit rule before resuming release work.

## 9. Session revoke, disable and block

A bound call must terminate when access disappears.

For session revocation:

1. revoke through the supported device/session endpoint;
2. verify `session.revoked` delivery;
3. verify target Socket.IO disconnect;
4. verify call receives a terminal state;
5. verify subsequent signal/TURN requests fail.

For account disable:

- invalidate all sessions;
- disconnect all user sockets;
- verify `findUser`/active-session checks reject the disabled account;
- terminate any active call involving that account;
- verify search/profile/presence no longer expose the account.

For block:

- remove contact relation;
- cancel pending requests;
- terminate active calls;
- verify stale sockets cannot continue signaling;
- verify unblock does not recreate prior state.

## 10. Diagnostics and support collection

`GET /api/v3/calls/diagnostics` may expose only safe capability state:

- signaling available;
- TURN configured;
- relay-required indicator;
- whether the current session has an active call;
- selected device scope;
- explicit flags confirming that content/candidates/user identifiers are excluded.

Support bundles must not contain:

- SDP or ICE candidates;
- media or transcription;
- cookies/session tokens/CSRF tokens;
- TURN secret or generated credentials;
- password/TOTP/recovery material;
- private profile fields or message content.

Use request IDs to correlate server logs. Apply recursive redaction before export.

## 11. Backup and restore

Before any restore:

1. stop/drain writes;
2. stage database and file store together;
3. verify allowlisted backup identity;
4. check integrity and supported schema;
5. preserve rollback copies;
6. swap atomically under the maintenance lock;
7. start and verify readiness;
8. validate representative accounts, rooms, messages, uploads, privacy and call history.

Restoring schema 9 under 3.6.0 should invoke the supported migration to schema 10. A schema newer than 10 must fail closed.

## 12. Emergency disable

When Connect presents an active security or reliability risk:

- stop accepting new traffic or place the Local Server in supported emergency read-only mode;
- terminate active calls through controlled shutdown;
- disable/withdraw TURN credentials at the operator service;
- revoke compromised sessions;
- preserve database, logs and runtime evidence;
- do not delete call history/audit before incident review;
- deploy only a tested fix with regression coverage.

There is no supported client-only switch that can make an unsafe server path secure.

## 13. Release failure and publication

The signed 3.6.0 workflow must remain fail-closed.

Before it can publish, machine-readable evidence must report:

- `status: release-approved`;
- `signed: true`;
- `distribution: signed-stable`;
- zero release blockers;
- all independent/platform/cross-platform evidence records `passed` with completion timestamps and real results.

If packaging or publication fails:

- do not manually replace/create the official tag;
- do not upload partial updater metadata;
- preserve exact run/job/artifact IDs;
- distinguish source failure from missing external prerequisite;
- fix root cause on the branch and rerun the complete gate;
- verify no unapproved asset is exposed through stable channels.

## 14. Required external acceptance

Source CI cannot prove:

- Windows 10/11 installed signed behavior;
- Android physical-device permission/lifecycle behavior;
- Browser/PWA installed lifecycle;
- Windows↔Android, Windows↔PWA and Android↔PWA calls;
- TURN-only NAT traversal and network handover;
- production signer identities.

Record real environment, versions, devices, network path, test result, completion time and evidence reference in the corresponding `release-evidence/*-3.6.0.json` file. Do not mark a pending scenario as passed.

## 15. Incident record

Record:

- UTC time;
- exact version/commit/tag;
- server deployment profile;
- affected account/session/call in protected records;
- request ID and stable code;
- sanitized logs;
- containment actions;
- root cause;
- regression test;
- restore/recovery result;
- closure and release impact.
