# Nexora Advanced Documentation Portal

## Purpose

The advanced portal is the technical counterpart to the introductory project website. It is published at `https://onmaynec.github.io/Nexora/advanced/` and targets:

- Nexora maintainers and external contributors;
- self-hosted Local Server operators;
- REST, Socket.IO, bot, webhook and Pulse integrators;
- security reviewers studying authorization, sessions, uploads, immutable legacy history and authority boundaries.

During the Pages build, an idempotent script adds one **Продвинутая документация / Advanced documentation** button to the composed introductory artifact.

## Source precedence

1. Current repository source and tests.
2. Current `PROJECT_INDEX.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`, operator runbooks and release evidence.
3. The 17 July 2026 Documentation Kit as historical audit and target-design provenance only.

The Documentation Kit was prepared against an older 0.3.0 line. Its target endpoints, schema assumptions and roadmap claims are not presented as current implementation unless verified against the release-candidate source.

## Post-MLS documentation boundary

Nexora 3.3.4 exposes Application API v3 and ordinary messaging as the writable core. The advanced portal must not advertise executable Trust/MLS v4 services.

Current legacy reference rules:

- schema 8 compatibility records preserve legacy IDs, epochs, timestamps, ciphertext and audit provenance;
- legacy secure history is read-only;
- Trust/E2EE HTTP writes and MLS Socket.IO mutations return `LEGACY_READ_ONLY`;
- server export records `serverDecrypted: false`;
- removed runtime files and `ts-mls` are not part of the generated reference.

## Build pipeline

`advanced-website/scripts/generate-reference.mjs` scans current `server/` and `cloud/` JavaScript sources and generates:

- HTTP method/path/source inventory;
- Socket.IO `on`, `once` and `emit` inventory;
- current package SemVer;
- release-note fallback data.

`advanced-website/scripts/validate-content.mjs` verifies bilingual page metadata, navigation integrity, unique section anchors, generated reference presence and package-version consistency.

`advanced-website/scripts/run-tests.mjs` runs every advanced documentation contract and emits concise failing subtests, locations and assertions without suppressing the exit status.

The Pages workflow validates both sites, builds the React/Vite portal with base `/Nexora/advanced/`, places output in `website/advanced/`, publishes the complete `website/` artifact, and smoke-checks both published URLs.

## Portal capabilities

- RU/EN language switch with persisted preference;
- 3.1.x, 3.2.x and 3.3.x documentation line selector;
- current SemVer injected from root `package.json`;
- `Ctrl/Cmd + K` full-text search;
- nested left navigation, breadcrumbs and right-side page table of contents;
- anchor links, previous/next navigation and code-copy controls;
- generated Application API v3, legacy compatibility and Socket.IO reference;
- Mermaid diagrams with a safe text fallback;
- live GitHub Releases with repository fallback;
- Edit on GitHub and issue-report links;
- keyboard, focus, reduced-motion and responsive mobile states;
- bounded high-DPI particle background using spatial buckets instead of all-pairs connection checks.

## Verification

```bash
npm ci
node website/validate.mjs
node advanced-website/scripts/inject-entry-link.mjs website/index.html
node advanced-website/scripts/generate-reference.mjs
node advanced-website/scripts/validate-content.mjs
node advanced-website/scripts/run-tests.mjs
npx vite build --config advanced-website/vite.config.mjs
```

The build must produce `website/advanced/index.html`; the composed introductory page must contain exactly one `data-advanced-docs` entry; and no current page may claim an active Trust/MLS runtime.
