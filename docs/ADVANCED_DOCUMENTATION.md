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
3. `ROADMAP.md` for planned releases after the approved prerequisite.
4. The 17 July 2026 Documentation Kit as historical audit and target-design provenance only.

The Documentation Kit was prepared against an older 0.3.0 line. Its target endpoints, schema assumptions and roadmap claims are not presented as current implementation unless verified against the release-candidate source.

## Post-MLS documentation boundary

Nexora 3.3.4 exposes Application API v3 and ordinary messaging as the writable core. The advanced portal must not advertise executable Trust/MLS v4 services.

Current legacy reference rules:

- schema 8 compatibility records preserve legacy IDs, epochs, timestamps, ciphertext and audit provenance;
- legacy secure history is read-only;
- Trust/E2EE HTTP writes and MLS Socket.IO mutations return `LEGACY_READ_ONLY`;
- server export records `serverDecrypted: false`;
- removed runtime files and `ts-mls` are not part of the generated reference.

## Content model

Pages are stored in `advanced-website/src/content-data/`. Existing block types remain `paragraph`, `bullets`, `steps`, `code`, `callout`, `table` and `mermaid`.

The portal additionally supports a strict local `image`/`figure` block:

```json
{
  "type": "image",
  "src": "docs-media/example.svg",
  "alt": {"ru": "Meaningful alternative text", "en": "Meaningful alternative text"},
  "caption": {"ru": "What is shown and what to verify", "en": "What is shown and what to verify"},
  "width": 1200,
  "height": 675,
  "version": "3.3.3"
}
```

Rules:

- `src` is relative to `advanced-website/public/` and must match the allowlist `svg|png|webp`;
- remote URLs, `data:`, `javascript:`, HTML, scripts, iframes and event handlers are rejected;
- `alt` and `caption` are mandatory in RU and EN;
- width and height are mandatory to prevent layout shift;
- images render with `loading="lazy"` and `decoding="async"`;
- Mermaid remains `securityLevel: "strict"` with a text fallback.

Pages, sections and blocks may declare `lines`, `since` or `until`. The selected 3.1/3.2/3.3 line filters rendered sections and the search haystack. Trust/MLS API v4 is unavailable in the 3.1.x view, while 3.3-only goals, voice and Pulse material is excluded from older views.

## Generated and authoritative data

`advanced-website/scripts/generate-reference.mjs` scans current `server/` and `cloud/` JavaScript sources and generates:

- HTTP method/path/source inventory;
- Socket.IO `on`, `once` and `emit` inventory;
- current package SemVer;
- release-note fallback data.

The roadmap page is located at `#/roadmap`, appears in **Versions and sources**, and uses `ROADMAP.md` as its edit/source link. Validation compares the published version/name/order table with the authoritative Markdown table and fails on drift.

`advanced-website/scripts/run-tests.mjs` runs every advanced documentation contract and emits concise failing subtests, locations and assertions without suppressing the exit status.

The Pages workflow validates both sites, builds the React/Vite portal with base `/Nexora/advanced/`, places output in `website/advanced/`, publishes the complete `website/` artifact, and smoke-checks both published URLs.

## Portal capabilities

- RU/EN language switch with persisted preference;
- functional 3.1.x, 3.2.x and 3.3.x content selector;
- current SemVer injected from root `package.json`;
- `Ctrl/Cmd + K` version-aware full-text search including captions and alt text;
- nested left navigation, breadcrumbs and right-side page table of contents;
- anchor links, previous/next navigation and code-copy controls;
- generated Application API v3, legacy compatibility and Socket.IO reference;
- Mermaid diagrams with a safe text fallback;
- live GitHub Releases with repository fallback;
- Edit on GitHub and issue-report links;
- keyboard, focus, reduced-motion and responsive mobile states.

## Verification

```bash
npm ci
node website/validate.mjs
node advanced-website/scripts/inject-entry-link.mjs website/index.html
node advanced-website/scripts/generate-reference.mjs
node advanced-website/scripts/validate-content.mjs
node advanced-website/scripts/run-tests.mjs
npx vite build --config advanced-website/vite.config.mjs
npm run check
npm run release:consistency
```

The build must produce `website/advanced/index.html`; the composed introductory page must contain exactly one `data-advanced-docs` entry; and no current page may claim an active Trust/MLS runtime.
