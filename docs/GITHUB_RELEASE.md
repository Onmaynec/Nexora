# GitHub Release и обновления Nexora

## 1. Repository controls

Repository: [`Onmaynec/Nexora`](https://github.com/Onmaynec/Nexora).

Required controls:

- protected `main` и release tags;
- no force-push/tag replacement;
- required Windows/Linux/release/soak/Android checks;
- maintainer 2FA;
- protected `windows-release` Environment;
- restricted signing secrets;
- immutable published stable release.

## 2. Release classifications

| Classification | Artifacts | Updater eligible |
|---|---|---|
| Source/PWA prerelease | source ZIP, PWA ZIP, SPDX SBOM, checksums | no |
| Stable signed Windows | signed Client/Server `.exe`, blockmap, `latest.yml`, source/PWA/SBOM/checksums | yes |
| Local unsigned build | local test output | no |

Current status:

- `3.2.4` — Source/PWA prerelease;
- `3.1.2` — last confirmed signed production baseline.

## 3. Secrets

Windows signing:

- `WINDOWS_CERTIFICATE_BASE64`;
- `WINDOWS_CERTIFICATE_PASSWORD`.

`GITHUB_TOKEN` supplied by Actions. Do not store secrets in source, `.env`, update config, logs, notes or artifacts. Pulse/provider credentials are separate.

## 4. Version preparation

The following must match:

- `package.json`;
- `package-lock.json`;
- Client handshake;
- Android version metadata;
- release notes/security review/verification;
- release tag.

```bash
git switch main
git pull --ff-only
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Current tag: `v3.2.4`.

```bash
git tag -s v3.2.4 -m "Nexora 3.2.4"
git push origin main
git push origin v3.2.4
```

When signed Git tag unavailable, use annotated tag rather than lightweight.

## 5. Release workflow

`.github/workflows/release.yml`:

1. resolves approved tag/commit;
2. validates tag/package metadata;
3. runs release checks;
4. creates source ZIP, PWA ZIP, SPDX SBOM и checksums;
5. evaluates Authenticode secrets;
6. builds/verifies signed Client/Server assets when available;
7. publishes stable only for complete signed asset set;
8. otherwise publishes explicit Source/PWA prerelease without updater assets.

Arbitrary untagged state must not be published as release.

## 6. Stable Windows asset set

- signed Client installer;
- Client blockmap;
- valid `latest.yml`;
- signed Server installer;
- source ZIP;
- PWA ZIP;
- SPDX SBOM;
- `SHA256SUMS.txt`.

Missing/unsigned installer metadata makes release non-installable.

## 7. Packaged Client updater 3.2.4

- service initializes before renderer IPC;
- default provider is GitHub Releases for `Onmaynec/Nexora`;
- custom generic feed accepted only by explicit HTTPS config;
- initial check after startup;
- bounded scheduled checks;
- single-flight manual/automatic requests;
- checking/progress/current/available/downloaded/error states;
- fallback terminal result when updater emits no terminal event;
- no downgrade/prerelease;
- `verifyUpdateCodeSignature: true` remains;
- stable non-installable result when signed asset set absent.

Unpackaged development mode intentionally does not perform real automatic update checks.

## 8. Feed configuration

Optional internal feed:

```json
{
  "clientFeedUrl": "https://updates.example.local/nexora/client",
  "serverFeedUrl": "https://updates.example.local/nexora/server"
}
```

Or:

- `NEXORA_CLIENT_UPDATE_URL`;
- `NEXORA_SERVER_UPDATE_URL`.

HTTP is rejected. Private feed does not bypass signature/no-downgrade policy.

## 9. Updater acceptance

1. install previous signed stable Client;
2. publish complete signed 3.2.4 asset set;
3. verify initial check;
4. verify single-flight manual/automatic checks;
5. verify progress and terminal state;
6. download/install/restart;
7. verify Server trust, sessions/settings preserved;
8. verify post-update summary;
9. verify exact official release link;
10. verify per-version dismissal;
11. test incomplete/unsigned feed and confirm non-installable state;
12. test network failure and retry without stack disclosure.

## 10. Post-update notes

3.2.4 displays:

- “Подробнее” — exact official tag;
- “Закрыть”;
- “Не показывать снова” — stores version/display state only.

Published release text must be stable and safe for rendering.

## 11. Windows test mode

- `--test-mode`;
- installer “Nexora Client (Test Mode)” shortcut;
- `NEXORA_CLIENT_TEST_MODE=1`.

PowerShell tails existing local Client log. It must not enable DevTools, Node integration, remote debugging or privileged IPC.

## 12. NSIS acceptance

Client/Server installer verifies:

- official Nexora icon;
- branded 164×314 sidebar;
- Russian language;
- clean install/update/uninstall;
- valid Authenticode signature/timestamp for stable release;
- test-mode shortcut only for Client;
- Server data preservation according to documented uninstall behavior.

## 13. Server update

Before:

1. verified backup;
2. current version/schema record;
3. migration/rollback review;
4. Client compatibility;
5. free space;
6. maintenance/drain.

After:

- live/ready;
- integrity/schema;
- login/bootstrap;
- messaging/realtime;
- Trust/MLS/Welcome recovery;
- backup/storage.

Schema 8 rollback is restore-based. Never run unsupported old binary against schema 8.

## 14. Release evidence

3.2.4 evidence is recorded in:

- [Release Notes](../RELEASE_NOTES_3.2.4.md);
- [Security Review](../SECURITY_REVIEW_3.2.4.md);
- [Release Verification](../RELEASE_VERIFICATION_3.2.4.md);
- [Release Checklist](RELEASE_CHECKLIST.md).

Source/PWA prerelease remains non-updater-eligible until signed installed-runtime acceptance completes.
