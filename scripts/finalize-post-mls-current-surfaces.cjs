"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const VERSION = "3.3.4";

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(absolute(relativePath), "utf8");
}

function write(relativePath, source) {
  fs.writeFileSync(absolute(relativePath), source, "utf8");
}

function update(relativePath, transform) {
  const before = read(relativePath);
  const after = transform(before);
  if (after !== before) write(relativePath, after);
}

function replaceRequired(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`Missing expected marker in ${label}: ${JSON.stringify(from)}`);
  return source.replaceAll(from, to);
}

const currentDocs = [
  "README.md",
  "PROJECT_INDEX.md",
  "docs/README.md",
  "docs/ARCHITECTURE.md",
  "docs/SECURITY_MODEL.md",
  "docs/PRODUCT_OVERVIEW.md",
  "docs/OPERATIONS_RUNBOOK.md",
  "docs/DEPLOYMENT.md",
  "docs/RELEASE_POLICY.md",
  "docs/RELEASE_CHECKLIST.md",
  "docs/GITHUB_RELEASE.md",
  "SECURITY.md",
  "SECURITY_AUDIT.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "ADMIN_GUIDE.md",
  "TESTER_GUIDE.md",
  "BRANCH_STATUS.md",
  "BRANCHES.md",
  "android/README.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
].filter((relativePath) => fs.existsSync(absolute(relativePath)));

for (const relativePath of currentDocs) {
  update(relativePath, (source) => source
    .replaceAll("release/3.3.4-stable-core", "release/3.3.4-post-mls")
    .replaceAll("PR #69", "PR #70")
    .replaceAll("PR `#69`", "PR `#70`")
    .replaceAll("Pull request | `#69`", "Pull request | `#70`")
    .replaceAll("verified `v3.3.4`, Authenticode/Windows acceptance and independent review are mandatory", "final CI, merge, `v3.3.4` publication and asset re-download smoke are mandatory")
    .replaceAll("verified `v3.3.4`, Authenticode/Windows acceptance и independent security review", "final CI, merge, `v3.3.4` publication и asset re-download smoke")
    .replaceAll("verified stable `v3.3.4` baseline exists, Authenticode/Windows acceptance is complete and an independent security review closes all high/critical findings", "final CI passes, PR #70 is merged, and the official `v3.3.4` release passes asset re-download verification")
    .replaceAll("External review pending", "Internal review complete; independent review deferred to 3.4.0")
    .replaceAll("external review gate", "internal review and 3.4.0 deferred gates")
    .replaceAll("Stable Core", "Post-MLS Baseline"));
}

update("README.md", (source) => {
  source = source.replace(
    /> \*\*Post-MLS Baseline release candidate:\*\*[\s\S]*?\n\n## Product status/,
    "> **Post-MLS Baseline release candidate:** version `3.3.4` is implemented in PR #70. Completion requires green final CI, merge, the official `v3.3.4` GitHub Release and successful asset re-download verification. Signed stable promotion, independent review and signed n-1→n acceptance remain Nexora 3.4.0 gates.\n\n## Product status",
  );
  return source;
});

update("docs/README.md", (source) => source
  .replace(
    "| Publication | Blocked — verified `v3.3.4`, Authenticode/Windows acceptance and independent review are mandatory |",
    "| Publication | Pending final CI, merge, official `v3.3.4` release and asset re-download smoke |",
  )
  .replace(
    "| [Security Review 3.3.4](../SECURITY_REVIEW_3.3.4.md) | reviewed scope, findings and external review gate | External review pending |",
    "| [Security Review 3.3.4](../SECURITY_REVIEW_3.3.4.md) | internal reviewed scope, findings and closures | Internal review complete; independent review deferred to 3.4.0 |",
  ));

update("PROJECT_INDEX.md", (source) => source.replace(
  "Этот индекс описывает ветку `release/3.3.4-post-mls` и PR #70. До merge он не является описанием опубликованного `main`.",
  "Этот индекс описывает ветку `release/3.3.4-post-mls` и PR #70. До merge/tag/release он является release-candidate документацией, а не описанием опубликованного `main`.",
));

write("BRANCH_STATUS.md", `# Статус ветки Nexora 3.3.4 Post-MLS Baseline

## Классификация

| Параметр | Значение |
|---|---|
| Version | \`3.3.4\` |
| Branch | \`release/3.3.4-post-mls\` |
| Pull Request | \`#70\` |
| Baseline | published Nexora \`3.3.3\` line |
| Classification | Release candidate; signed when policy exists, otherwise explicit \`UNSIGNED-TEST\` prerelease |
| Application API | v3 |
| Local Server schema | 8 compatibility layer |
| Trust/MLS runtime | retired; legacy history read-only |
| Publication | pending final CI, merge, annotated \`v3.3.4\`, GitHub Release and asset smoke |

## Implemented boundary

- ordinary server-readable messaging is the only writable messaging path;
- executable Trust/MLS services and \`ts-mls\` are removed;
- schema 8 legacy ciphertext, IDs, epochs, timestamps and audit provenance are retained;
- legacy viewer/export is immutable and the server never decrypts ciphertext;
- legacy REST and Socket.IO mutations fail with \`410/LEGACY_READ_ONLY\`;
- session-derived devices support targeted revoke and immediate realtime disconnect;
- backup verification is non-restoring and restore/migration failure paths are covered;
- updater and release tooling distinguish signed assets from explicit unsigned test assets.

## Release completion gates

1. final PR CI, focused regressions and website validation pass;
2. PR #70 is reviewed and merged with release commit identity;
3. post-merge CI passes;
4. annotated \`v3.3.4\` and GitHub Release are created;
5. checksums and release evidence are published;
6. all assets are re-downloaded and verified.

Authenticode credentials are optional for this prerequisite. Without them, the release remains a clearly marked \`UNSIGNED-TEST\` prerelease and must not contain updater metadata. Independent review and signed 3.3.4→3.4.0 acceptance remain 3.4.0 gates.
`);

write("docs/GITHUB_RELEASE.md", `# GitHub Release и обновления Nexora

## Current release candidate

| Параметр | Значение |
|---|---|
| Version | \`3.3.4\` |
| Branch | \`release/3.3.4-post-mls\` |
| Pull request | \`#70\` |
| Official tag | pending annotated \`v3.3.4\` |
| Baseline | published \`v3.3.3\` line |
| Signed baseline | \`3.1.2\` |

## Publication contract

The release workflow accepts only package version \`3.3.4\` and official tag \`v3.3.4\`. It always runs \`npm run release:check\`, builds source/PWA/Android/SBOM/Windows evidence, performs installed package smoke, publishes SHA-256 checksums and re-downloads the immutable release assets.

### Complete signing policy

When certificate, password, expected subject and expected thumbprint are all configured:

- Client and Server installers are Authenticode-verified;
- signer subject, thumbprint and timestamp are validated;
- Client \`latest.yml\`, Server \`server.yml\` and blockmaps may be published;
- the release may be updater-eligible according to its actual evidence.

Partial signing configuration is rejected.

### Missing signing policy

When signing policy is absent:

- the official tag remains \`v3.3.4\`;
- GitHub Release is an explicit \`UNSIGNED-TEST\` prerelease;
- Windows and Android assets include \`UNSIGNED-TEST\` in their names;
- \`latest.yml\`, \`server.yml\` and all blockmaps are forbidden;
- production updater cannot consume the release.

## Immutable evidence

Required common assets:

- source ZIP;
- PWA ZIP;
- Android test APK;
- SPDX 2.3 SBOM;
- machine-readable release evidence;
- \`SHA256SUMS.txt\`;
- Client and Server installers in the applicable signing class.

After publication the workflow downloads every asset again, verifies SHA-256 values and rechecks signed/unsigned channel invariants. Existing tags cannot be moved to another commit.

## Separation from 3.4.0

Nexora 3.3.4 removes the prerequisite blocker by creating the verified post-MLS baseline. Independent security review, signed Windows 10/11 n-1→n acceptance and first stable signed 3.x promotion remain mandatory Nexora 3.4.0 gates.
`);

function updateWebsiteDictionary(relativePath) {
  update(relativePath, (source) => source
    .replaceAll('const FALLBACK_VERSION = "3.3.3";', 'const FALLBACK_VERSION = "3.3.4";')
    .replaceAll('membersSecure: "8 участников · secure conversation"', 'membersSecure: "8 участников · server messaging"')
    .replaceAll('membersSecure: "8 members · secure conversation"', 'membersSecure: "8 members · server messaging"')
    .replaceAll('mockOne: "Local Server остаётся authority для комнат, ролей и доставки ciphertext."', 'mockOne: "Local Server проверяет доступ, сохраняет и доставляет обычные сообщения."')
    .replaceAll('mockOne: "Local Server remains authoritative for rooms, roles and ciphertext delivery."', 'mockOne: "Local Server authorizes, stores and delivers ordinary messages."')
    .replaceAll('deviceVerified: "Device verified"', 'deviceVerified: "Legacy read-only"')
    .replaceAll('productLead: "Nexora объединяет messaging, комнаты, медиа, offline-first поведение, эксплуатацию, Trust Core и отдельный Cloud authority без обязательной передачи локальных сообщений в централизованное облако."', 'productLead: "Nexora объединяет messaging, комнаты, медиа, offline-first поведение, эксплуатацию, immutable legacy history и отдельный Cloud authority."')
    .replaceAll('productLead: "Nexora combines messaging, rooms, media, offline-first behaviour, operations, Trust Core and an isolated Cloud authority without requiring local messages to move into a central cloud."', 'productLead: "Nexora combines messaging, rooms, media, offline-first behaviour, operations, immutable legacy history and an isolated Cloud authority."')
    .replaceAll('trustCardTitle: "Device-scoped secure messaging"', 'trustCardTitle: "Immutable legacy secure history"')
    .replaceAll('trustCardText: "Ed25519 identity, verified devices, MLS epochs, replay protection, ciphertext-only persistence и encrypted local state."', 'trustCardText: "Legacy ciphertext, IDs, epochs and timestamps remain read-only; new Trust/MLS writes are rejected."')
    .replaceAll('trustCardText: "Ed25519 identity, verified devices, MLS epochs, replay protection, ciphertext-only persistence and encrypted local state."', 'trustCardText: "Legacy ciphertext, IDs, epochs and timestamps remain read-only; new Trust/MLS writes are rejected."')
    .replaceAll('mediaTitle: "Validated and encrypted media"', 'mediaTitle: "Validated ordinary media"')
    .replaceAll('mediaText: "Resumable uploads, actual MIME detection, SHA-256, safe names, previews, voice playback и AES-256-GCM secure attachments."', 'mediaText: "Resumable uploads, actual MIME detection, SHA-256, safe names, previews and responsive voice playback."')
    .replaceAll('mediaText: "Resumable uploads, actual MIME detection, SHA-256, safe names, previews, voice playback and AES-256-GCM secure attachments."', 'mediaText: "Resumable uploads, actual MIME detection, SHA-256, safe names, previews and responsive voice playback."')
    .replaceAll('archClient: "UI, offline state, device keys, MLS encryption/decryption и verified media preview."', 'archClient: "UI, offline cache, drafts, bounded outbox, uploads, voice and local legacy-cache viewing."')
    .replaceAll('archClient: "UI, offline state, device keys, MLS encryption/decryption and verified media preview."', 'archClient: "UI, offline cache, drafts, bounded outbox, uploads, voice and local legacy-cache viewing."')
    .replaceAll('archServer: "Accounts, sessions, rooms, roles, bans, policies, ordering, ciphertext delivery, storage, audit и backup."', 'archServer: "Accounts, sessions, rooms, roles, bans, policies, ordinary message delivery, storage, audit and backup."')
    .replaceAll('archServer: "Accounts, sessions, rooms, roles, bans, policies, ordering, ciphertext delivery, storage, audit and backup."', 'archServer: "Accounts, sessions, rooms, roles, bans, policies, ordinary message delivery, storage, audit and backup."')
    .replaceAll('matrixClient: "Private MLS state и attachment keys не передаются Local Server."', 'matrixClient: "Previously decrypted legacy content remains local and read-only; server export keeps ciphertext."')
    .replaceAll('matrixClient: "Private MLS state and attachment keys never reach Local Server."', 'matrixClient: "Previously decrypted legacy content remains local and read-only; server export keeps ciphertext."')
    .replaceAll('deliveryTitle: "От composer до verified device."', 'deliveryTitle: "От composer до активной сессии."')
    .replaceAll('deliveryTitle: "From composer to verified device."', 'deliveryTitle: "From composer to active session."')
    .replaceAll('deliveryTwoTitle: "Encrypt"', 'deliveryTwoTitle: "Validate"')
    .replaceAll('deliveryTwo: "MLS application ciphertext"', 'deliveryTwo: "Input, policy and media validation"')
    .replaceAll('deliveryThree: "Session, device, membership, epoch"', 'deliveryThree: "Session, membership, role and ban"')
    .replaceAll('deliveryFour: "Ciphertext + delivery state"', 'deliveryFour: "Message + delivery state"')
    .replaceAll('deliveryFive: "Только verified member devices"', 'deliveryFive: "Только активным участникам"')
    .replaceAll('deliveryFive: "Active member devices only"', 'deliveryFive: "Active members only"')
    .replaceAll('deliverySixTitle: "Decrypt"', 'deliverySixTitle: "Sync"')
    .replaceAll('deliverySix: "Локально на устройстве получателя"', 'deliverySix: "Realtime, cache and read state"')
    .replaceAll('deliverySix: "Locally on the recipient device"', 'deliverySix: "Realtime, cache and read state"')
    .replaceAll('trustTitle: "Проверяемые ограничения.<br><em>Без вымышленных процентов.</em>"', 'trustTitle: "Проверяемая совместимость.<br><em>Legacy без новых записей.</em>"')
    .replaceAll('trustTitle: "Verifiable limits.<br><em>No invented percentages.</em>"', 'trustTitle: "Verifiable compatibility.<br><em>Legacy without new writes.</em>"')
    .replaceAll('trustLead: "Сайт показывает только значения, закреплённые в коде и release-документации Nexora 3.3.x."', 'trustLead: "Schema 8 сохраняет legacy metadata и ciphertext, а все новые Trust/MLS mutations завершаются кодом LEGACY_READ_ONLY."')
    .replaceAll('trustLead: "The site shows only values enforced by code and release documentation."', 'trustLead: "Schema 8 preserves legacy metadata and ciphertext while all new Trust/MLS mutations terminate with LEGACY_READ_ONLY."')
    .replaceAll('limitDevices: "Активных Trust devices"', 'limitDevices: "SQLite schema"')
    .replaceAll('limitDevices: "Active Trust devices"', 'limitDevices: "SQLite schema"')
    .replaceAll('perAccount: "на учётную запись"', 'perAccount: "compatibility layer"')
    .replaceAll('perAccount: "per account"', 'perAccount: "compatibility layer"')
    .replaceAll('atomicLimit: "атомарный лимит"', 'atomicLimit: "terminal HTTP status"')
    .replaceAll('atomicLimit: "atomic request limit"', 'atomicLimit: "terminal HTTP status"')
    .replaceAll('unclaimed: "unclaimed"', 'unclaimed: "MiB per ordinary file"')
    .replaceAll('totalInventory: "общий inventory"', 'totalInventory: "seconds per voice message"')
    .replaceAll('totalInventory: "total user inventory"', 'totalInventory: "seconds per voice message"')
    .replaceAll('lifecycleTitle: "Идентичность устройства становится частью доступа."', 'lifecycleTitle: "Legacy scope сохраняется без продолжения протокола."')
    .replaceAll('lifecycleTitle: "Device identity becomes part of authorization."', 'lifecycleTitle: "Legacy scope is preserved without continuing the protocol."')
    .replaceAll('lifeOneTitle: "Identity key"', 'lifeOneTitle: "Detect"')
    .replaceAll('lifeOne: "Client создаёт non-extractable Ed25519 identity key."', 'lifeOne: "Schema 8 records identify legacy conversations and ciphertext."')
    .replaceAll('lifeOne: "Client creates a non-extractable Ed25519 identity key."', 'lifeOne: "Schema 8 records identify legacy conversations and ciphertext."')
    .replaceAll('lifeTwoTitle: "Proof of possession"', 'lifeTwoTitle: "Preserve"')
    .replaceAll('lifeTwo: "Registration подтверждает владение private key."', 'lifeTwo: "IDs, epochs, timestamps and audit provenance remain unchanged."')
    .replaceAll('lifeTwo: "Registration proves possession of the private key."', 'lifeTwo: "IDs, epochs, timestamps and audit provenance remain unchanged."')
    .replaceAll('lifeThreeTitle: "Verification"', 'lifeThreeTitle: "Lock"')
    .replaceAll('lifeThree: "Дополнительное устройство получает подписанное подтверждение."', 'lifeThree: "HTTP and Socket.IO writes return LEGACY_READ_ONLY."')
    .replaceAll('lifeThree: "A second device receives a signed verification."', 'lifeThree: "HTTP and Socket.IO writes return LEGACY_READ_ONLY."')
    .replaceAll('lifeFourTitle: "Scoped delivery"', 'lifeFourTitle: "Read locally"')
    .replaceAll('lifeFour: "Ciphertext доставляется конкретным verified devices."', 'lifeFour: "Existing local decrypted cache may be viewed without mutation."')
    .replaceAll('lifeFour: "Ciphertext is delivered to specific verified devices."', 'lifeFour: "Existing local decrypted cache may be viewed without mutation."')
    .replaceAll('lifeFiveTitle: "Revocation"', 'lifeFiveTitle: "Export"')
    .replaceAll('lifeFive: "Отзыв немедленно отключает secure socket и очищает local state."', 'lifeFive: "Immutable export records ciphertext and serverDecrypted=false."')
    .replaceAll('lifeFive: "Revocation disconnects the secure socket and wipes local state."', 'lifeFive: "Immutable export records ciphertext and serverDecrypted=false."')
    .replaceAll('boundaryOne: "Линия 3.3.x не заявляется как независимо аудированная E2EE-система."', 'boundaryOne: "3.3.4 является post-MLS prerequisite и не заявляется как независимо проверенный stable-релиз."')
    .replaceAll('boundaryOne: "The 3.3.x line is not claimed as independently audited E2EE."', 'boundaryOne: "3.3.4 is a post-MLS prerequisite and is not claimed as an independently reviewed stable release."')
    .replaceAll('boundaryTwo: "Сервер видит membership, timing, IP context, ciphertext size и delivery events."', 'boundaryTwo: "Сервер хранит обычные сообщения и видит membership, timing, IP context и delivery events."')
    .replaceAll('boundaryTwo: "The server sees membership, timing, IP context, ciphertext size and delivery events."', 'boundaryTwo: "The server stores ordinary messages and sees membership, timing, IP context and delivery events."')
    .replaceAll('docSecurity: "Threat model, Trust/MLS boundary и residual risks."', 'docSecurity: "Threat model, post-MLS legacy boundary and residual risks."')
    .replaceAll('docSecurity: "Threat model, Trust/MLS boundaries and residual risks."', 'docSecurity: "Threat model, post-MLS legacy boundary and residual risks."'));
}

updateWebsiteDictionary("website/app.js");
updateWebsiteDictionary("website/site-fixes.js");

update("website/index.html", (source) => {
  source = source
    .replaceAll("3.3.3", VERSION)
    .replaceAll("3.3.2", VERSION)
    .replace('content="Self-hosted messenger, Local Server, Trust Core, MLS, encrypted media and Nexora Pulse."', 'content="Self-hosted messenger, Local Server, ordinary messaging, read-only legacy secure history and Nexora Pulse."')
    .replace("API v3 · Trust v4", "API v3 · legacy read-only")
    .replace("Schema 8 · API v3/v4", "Schema 8 · API v3")
    .replace("8 участников · secure conversation", "8 участников · server messaging")
    .replace("Local Server остаётся authority для комнат, ролей и доставки ciphertext.", "Local Server проверяет доступ, сохраняет и доставляет обычные сообщения.")
    .replace("TRUST CORE", "LEGACY HISTORY")
    .replace("Device verified", "Read-only archive")
    .replace("Nexora объединяет messaging, комнаты, медиа, offline-first поведение, эксплуатацию, Trust Core и отдельный Cloud authority без обязательной передачи локальных сообщений в централизованное облако.", "Nexora объединяет messaging, комнаты, медиа, offline-first поведение, эксплуатацию, immutable legacy history и отдельный Cloud authority.")
    .replace("<div class=\"card-index\">02</div><div class=\"card-icon\">◇</div><span>TRUST CORE</span>", "<div class=\"card-index\">02</div><div class=\"card-icon\">◇</div><span>LEGACY HISTORY</span>")
    .replace("Device-scoped secure messaging", "Immutable legacy secure history")
    .replace("Ed25519 identity, verified devices, MLS epochs, replay protection, ciphertext-only persistence и encrypted local state.", "Legacy ciphertext, IDs, epochs and timestamps remain read-only; new Trust/MLS writes are rejected.")
    .replace("Validated and encrypted media", "Validated ordinary media")
    .replace("Resumable uploads, actual MIME detection, SHA-256, safe names, previews, voice playback и AES-256-GCM secure attachments.", "Resumable uploads, actual MIME detection, SHA-256, safe names, previews and responsive voice playback.")
    .replace("React / Vite + Trust Engine", "React / Vite + session messaging")
    .replace("UI, offline state, device keys, MLS encryption/decryption и verified media preview.", "UI, offline cache, drafts, bounded outbox, uploads, voice and local legacy-cache viewing.")
    .replace("Accounts, sessions, rooms, roles, bans, policies, ordering, ciphertext delivery, storage, audit и backup.", "Accounts, sessions, rooms, roles, bans, policies, ordinary message delivery, storage, audit and backup.")
    .replace("Private MLS state и attachment keys не передаются Local Server.", "Previously decrypted legacy content remains local and read-only; server export keeps ciphertext.")
    .replace("От composer до verified device.", "От composer до активной сессии.")
    .replace("<li><span>02</span><b data-i18n=\"deliveryTwoTitle\">Encrypt</b><small data-i18n=\"deliveryTwo\">MLS application ciphertext</small></li>", "<li><span>02</span><b data-i18n=\"deliveryTwoTitle\">Validate</b><small data-i18n=\"deliveryTwo\">Input, policy and media validation</small></li>")
    .replace("<li><span>03</span><b data-i18n=\"deliveryThreeTitle\">Authorize</b><small data-i18n=\"deliveryThree\">Session, device, membership, epoch</small></li>", "<li><span>03</span><b data-i18n=\"deliveryThreeTitle\">Authorize</b><small data-i18n=\"deliveryThree\">Session, membership, role and ban</small></li>")
    .replace("<li><span>04</span><b data-i18n=\"deliveryFourTitle\">Persist</b><small data-i18n=\"deliveryFour\">Ciphertext + delivery state</small></li>", "<li><span>04</span><b data-i18n=\"deliveryFourTitle\">Persist</b><small data-i18n=\"deliveryFour\">Message + delivery state</small></li>")
    .replace("<li><span>05</span><b data-i18n=\"deliveryFiveTitle\">Deliver</b><small data-i18n=\"deliveryFive\">Verified member devices only</small></li>", "<li><span>05</span><b data-i18n=\"deliveryFiveTitle\">Deliver</b><small data-i18n=\"deliveryFive\">Active members only</small></li>")
    .replace("<li><span>06</span><b data-i18n=\"deliverySixTitle\">Decrypt</b><small data-i18n=\"deliverySix\">Locally on recipient device</small></li>", "<li><span>06</span><b data-i18n=\"deliverySixTitle\">Sync</b><small data-i18n=\"deliverySix\">Realtime, cache and read state</small></li>");

  const replacement = `    <section class="trust-section section" id="trust">
      <div class="section-heading reveal">
        <div><span class="section-kicker">03 / SECURITY & COMPATIBILITY</span><h2 data-i18n="trustTitle">Проверяемая совместимость.<br><em>Legacy без новых записей.</em></h2></div>
        <p data-i18n="trustLead">Schema 8 сохраняет legacy metadata и ciphertext, а все новые Trust/MLS mutations завершаются кодом LEGACY_READ_ONLY.</p>
      </div>

      <div class="limit-grid">
        <article class="limit-card reveal"><small data-i18n="limitDevices">SQLite schema</small><strong data-count="8">0</strong><span data-i18n="perAccount">compatibility layer</span><i style="--level:64%"></i></article>
        <article class="limit-card reveal"><small>Legacy write status</small><strong data-count="410">0</strong><span data-i18n="atomicLimit">terminal HTTP status</span><i style="--level:84%"></i></article>
        <article class="limit-card reveal"><small>Ordinary file limit</small><strong data-count="25">0</strong><span data-i18n="unclaimed">MiB per ordinary file</span><i style="--level:72%"></i></article>
        <article class="limit-card reveal"><small>Voice limit</small><strong data-count="300">0</strong><span data-i18n="totalInventory">seconds per voice message</span><i style="--level:92%"></i></article>
      </div>

      <div class="trust-lifecycle reveal">
        <div class="lifecycle-visual">
          <div class="lifecycle-core"><img src="assets/nexora-icon.png" alt="" /><span>LEGACY</span></div>
          <i class="ring ring-a"></i><i class="ring ring-b"></i><i class="ring ring-c"></i>
          <b class="orbit-dot dot-a"></b><b class="orbit-dot dot-b"></b><b class="orbit-dot dot-c"></b>
        </div>
        <div class="lifecycle-content">
          <span class="section-kicker">POST-MLS COMPATIBILITY LIFECYCLE</span>
          <h3 data-i18n="lifecycleTitle">Legacy scope сохраняется без продолжения протокола.</h3>
          <ol>
            <li><span>01</span><div><b data-i18n="lifeOneTitle">Detect</b><p data-i18n="lifeOne">Schema 8 records identify legacy conversations and ciphertext.</p></div></li>
            <li><span>02</span><div><b data-i18n="lifeTwoTitle">Preserve</b><p data-i18n="lifeTwo">IDs, epochs, timestamps and audit provenance remain unchanged.</p></div></li>
            <li><span>03</span><div><b data-i18n="lifeThreeTitle">Lock</b><p data-i18n="lifeThree">HTTP and Socket.IO writes return LEGACY_READ_ONLY.</p></div></li>
            <li><span>04</span><div><b data-i18n="lifeFourTitle">Read locally</b><p data-i18n="lifeFour">Existing local decrypted cache may be viewed without mutation.</p></div></li>
            <li><span>05</span><div><b data-i18n="lifeFiveTitle">Export</b><p data-i18n="lifeFive">Immutable export records ciphertext and serverDecrypted=false.</p></div></li>
          </ol>
        </div>
      </div>
    </section>`;

  const trustSection = /    <section class="trust-section section" id="trust">[\s\S]*?    <\/section>(?=\n\n    <section class="downloads-section)/;
  if (!trustSection.test(source)) throw new Error("Unable to locate website trust section");
  return source.replace(trustSection, replacement);
});

update("website/validate.mjs", (source) => source
  .replace('const requiredIds = ["main", "product", "architecture", "trust", "downloads", "docs"];', 'const requiredIds = ["main", "product", "architecture", "trust", "downloads", "docs"];')
  .replace('if (!app.includes("ru: {") || !app.includes("en: {")) throw new Error("RU/EN dictionaries are missing");', 'if (!app.includes("ru: {") || !app.includes("en: {") || !app.includes(\'const FALLBACK_VERSION = "3.3.4"\')) throw new Error("RU/EN dictionaries or current version fallback are missing");')
  .replace('if (!app.includes("class AetherField")) throw new Error("Interactive Canvas background is missing");', 'if (!app.includes("class AetherField")) throw new Error("Interactive Canvas background is missing");\nif (html.includes("Trust Core, MLS") || html.includes("API v3 · Trust v4") || html.includes("3.3.3")) throw new Error("Retired Trust/MLS or stale version claim is present");\nif (!html.includes("LEGACY_READ_ONLY") || !html.includes("serverDecrypted=false")) throw new Error("Post-MLS compatibility boundary is missing");'));

fs.rmSync(__filename, { force: true });
console.log("Finalized Nexora 3.3.4 current documentation and website surfaces.");
