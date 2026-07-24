# Nexora Advanced Documentation Portal

## Purpose

The advanced portal is the technical counterpart to the introductory project website. It is published at `https://onmaynec.github.io/Nexora/advanced/` and targets:

- Nexora maintainers and external contributors;
- self-hosted Local Server operators;
- REST, Socket.IO, bot, webhook and Pulse integrators;
- security reviewers studying Trust/MLS, encrypted media and authority boundaries.

The introductory site remains unchanged in source. During the Pages build, an idempotent script adds one **Продвинутая документация / Advanced documentation** button to the composed artifact.

## Source precedence

1. Current repository source and tests.
2. Current `PROJECT_INDEX.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY_MODEL.md`, operator runbooks and release evidence.
3. `ROADMAP.md` for planned releases after the approved prerequisite.
4. The 17 July 2026 Documentation Kit as historical audit and target-design provenance only.

The Documentation Kit was prepared against an older 0.3.0 line. Its target endpoints, schema assumptions and 0.4–0.6 roadmap claims are not presented as current implementation unless verified against `main`.

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
- the current package SemVer;
- release-note fallback data.

The roadmap page is located at `#/roadmap`, appears in **Versions and sources**, and uses `ROADMAP.md` as its edit/source link. Validation compares the published version/name/order table with the authoritative Markdown table and fails on drift.

Current patch SemVer is injected from root `package.json`; `releases.json` uses `{{version}}` instead of duplicating a current patch literal.

## Validation

`advanced-website/scripts/validate-content.mjs` verifies:

- bilingual page, section, callout, Mermaid and figure metadata;
- navigation and unique anchors;
- sourcePath existence;
- local media existence, extension, dimensions and size budgets;
- at least 16 diagrams, 10 illustrations, 12 API examples and 8 runbooks;
- package/generated-reference equality;
- roadmap parity with `ROADMAP.md`;
- version-line filtering and the 3.1.x Trust/API v4 boundary;
- absence of unsafe content-model markers.

## Portal capabilities

- RU/EN language switch with persisted preference;
- functional 3.1.x, 3.2.x and 3.3.x content selector;
- current SemVer injected from root `package.json`;
- `Ctrl/Cmd + K` version-aware full-text search including captions and alt text;
- nested left navigation, breadcrumbs and right-side page table of contents;
- anchor links, previous/next navigation and code-copy controls;
- generated API v3, Trust/MLS v4 and Socket.IO reference;
- Mermaid diagrams with strict rendering and a safe text fallback;
- local lazy-loaded figures with bilingual captions;
- roadmap 3.4.0–4.0.0 with a 3.3.4 prerequisite and publication gates;
- live GitHub Releases with repository fallback;
- Edit on GitHub and issue-report links;
- keyboard, focus, reduced-motion and responsive mobile states.

## Verification

```bash
npm ci
node advanced-website/scripts/inject-entry-link.mjs
node advanced-website/scripts/generate-reference.mjs
node advanced-website/scripts/validate-content.mjs
node --test advanced-website/test/*.test.mjs
npx vite build --config advanced-website/vite.config.mjs
npm run check
npm run release:consistency
```

The build must produce `website/advanced/index.html`, and the composed introductory page must contain exactly one `data-advanced-docs` entry. The source tree of the introductory website must have no documentation-content or design changes.
