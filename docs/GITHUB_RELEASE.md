# GitHub Release и обновления Nexora

## 1. Repository controls

Public repository: [`Onmaynec/Nexora`](https://github.com/Onmaynec/Nexora).

Production controls:

- protect `main` и release tags;
- prohibit force-push и tag replacement;
- require Windows, Linux, release-gate, soak и Android checks;
- require maintainer 2FA;
- use protected `windows-release` Environment с manual approval;
- restrict signing/release secrets;
- never rewrite published stable release.

## 2. Release classifications

| Classification | Artifacts | Updater eligible |
|---|---|---|
| Source/PWA prerelease | source ZIP, PWA ZIP, SPDX SBOM, checksums | нет |
| Stable signed Windows | signed Client/Server `.exe`, blockmap, `latest.yml`, source/PWA/SBOM/checksums | да |
| Local unsigned build | local development output | нет |

Текущий статус:

- `3.2.3` — Source/PWA prerelease;
- `3.1.2` — последняя confirmed signed production baseline.

## 3. Secrets

Windows signing:

- `WINDOWS_CERTIFICATE_BASE64`;
- `WINDOWS_CERTIFICATE_PASSWORD`.

`GITHUB_TOKEN` выдаётся GitHub Actions.

Не храните secrets в source, `.env`, `update-config.json`, logs, release notes или artifacts. Pulse/provider secrets отделены от Windows signing environment.

## 4. Version preparation

Metadata должны совпадать в:

- `package.json`;
- `package-lock.json`;
- Client handshake;
- Android `versionName`/`versionCode`;
- release notes/security review/verification;
- release tag.

Перед release:

```bash
git switch main
git pull --ff-only
npm ci
npm run release:check
gradle -p android :app:assembleDebug --no-daemon
```

Для `3.2.3` tag — `v3.2.3`.

```bash
git tag -s v3.2.3 -m "Nexora 3.2.3"
git push origin main
git push origin v3.2.3
```

Если signed Git tags не настроены, используйте annotated tag, а не lightweight tag.

## 5. Security patch evidence

Для security patch release сохраняются:

- regression-first failing CI;
- verified implementation commit;
- implementation CI;
- final documentation head;
- final CI;
- Security Review;
- Release Verification;
- compatibility/schema/API statement.

Для `3.2.3`:

- regression-first CI: `#290`, ID `29934225971`;
- verified implementation head: `a3586fe7d399dc03a990c939c31a3ceabcbad000`;
- implementation CI: `#308`, ID `29937445396`;
- final documentation head: `5369263a3220e165d420615b53d770f7732a54b3`;
- final CI: `#309`, ID `29937694136`.

## 6. Release workflow

`.github/workflows/release.yml`:

1. resolves approved release commit/tag;
2. verifies tag/package metadata;
3. executes release checks;
4. creates source ZIP, PWA ZIP, SPDX SBOM и `SHA256SUMS.txt`;
5. checks Authenticode secrets;
6. when signing is available, builds/verifies Client и Server Windows assets;
7. publishes stable Latest only with complete signed set;
8. otherwise publishes explicit Source/PWA prerelease without updater assets.

Manual run targets existing approved tag. Arbitrary untagged `main` cannot be published as release.

Unpublished draft/prerelease may be regenerated. Published stable release is immutable; corrections use a new PATCH version/tag.

## 7. Stable Windows asset set

- signed Client `.exe`;
- Client `.blockmap`;
- valid `latest.yml`;
- signed Server `.exe`;
- source ZIP;
- PWA ZIP;
- SPDX SBOM;
- `SHA256SUMS.txt`.

Missing/unsigned install metadata makes release non-installable by Electron updater.

## 8. Electron updater policy

Client updater:

- initializes after `app.whenReady()`;
- performs initial check;
- checks every six hours;
- uses single-flight;
- cleans listeners/timers on shutdown;
- applies signature/install policy;
- returns `no_installable_update` without complete signed set.

Updater rejects:

- unsigned installer;
- invalid/foreign `latest.yml`;
- incomplete asset set;
- invalid signature;
- Source/PWA-only prerelease.

## 9. Update verification

1. Install previous signed stable Client с тем же `appId`.
2. Publish next complete signed stable patch.
3. Confirm initial check.
4. Confirm concurrent checks single-flight.
5. Verify download states.
6. Close Client и verify signed installation.
7. Confirm trusted servers, isolated sessions и settings preserved.
8. Test Source/PWA prerelease и confirm `no_installable_update`.
9. Test missing/corrupt metadata в isolated feed и confirm stable diagnostic.

## 10. Internal update feed

`update-config.json`:

```json
{
  "clientFeedUrl": "https://updates.example.local/nexora/client",
  "serverFeedUrl": "https://updates.example.local/nexora/server"
}
```

Environment alternatives:

- `NEXORA_CLIENT_UPDATE_URL`;
- `NEXORA_SERVER_UPDATE_URL`.

HTTP feed rejected. Internal feed не отменяет signature verification.

## 11. Server update 3.2.x → 3.2.3

Database migration не требуется, schema остаётся 8.

Перед update:

1. create verified backup;
2. record current version/schema;
3. review release/security notes;
4. verify Client compatibility;
5. check disk space;
6. graceful shutdown.

После update:

- verify `/healthz/live` и `/healthz/ready`;
- verify SQLite integrity/schema;
- test login/bootstrap;
- test Server shutdown;
- test Trust device enrollment/revocation;
- test rate-limit contract;
- test MLS recovery и encrypted attachments.

## 12. Rollback

- не заменяйте asset существующего version number;
- используйте новый patch release для correction;
- Server rollback требует compatible verified backup;
- не запускайте binary, не поддерживающий schema 8;
- после restore проверяйте integrity/readiness.

## 13. Distribution decision 3.2.3

Automated gate позволяет Source/PWA prerelease. Stable signed promotion заблокирован до packaged runtime, signing, extended platform/security и independent-review gates.

См. [Release Policy](RELEASE_POLICY.md), [Release Checklist](RELEASE_CHECKLIST.md) и [Release Verification 3.2.3](../RELEASE_VERIFICATION_3.2.3.md).
