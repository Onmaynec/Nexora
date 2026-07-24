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
3. `docs/ROADMAP.md` for planned releases after the approved prerequisite.
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
  "version": "{{version}}"
}
```

Rules:

- `src` is restricted to `advanced-website/public/docs-media/` and the `svg|png|webp` allowlist;
- remote URLs, `data:`, `javascript:`, `.`/`..` path segments, HTML, scripts, `foreignObject`, external CSS/imports and event handlers are rejected;
- `alt` and `caption` are mandatory in RU and EN;
- width and height are mandatory to prevent layout shift;
- images render with `loading="lazy"` and `decoding="async"`;
- Mermaid remains `securityLevel: "strict"` with a text fallback.

Pages, sections and blocks may declare `lines`, `since` or `until`. The selected 3.1/3.2/3.3 line filters navigation, rendered sections, previous/next links, generated API/event inventory and the search index. Trust/MLS API v4 and Pulse Cloud are absent from the 3.1.x view; Pulse Cloud and 3.3-only goals/voice/purchase material are absent from 3.2.x.

## Generated and authoritative data

`advanced-website/scripts/generate-reference.mjs` scans current `server/` and `cloud/` JavaScript sources and generates:

- HTTP method/path/source inventory;
- Socket.IO `on`, `once` and `emit` inventory;
- the current package SemVer;
- release-note fallback data.

The roadmap page is located at `#/roadmap`, appears in **Versions and sources**, and uses `docs/ROADMAP.md` as its edit/source link. Validation compares published version, working name and dependency order with the authoritative Markdown table and fails on drift.

Current patch SemVer is injected from root `package.json`; current-classification content and media use `{{version}}` or a non-patch line label instead of duplicating the current patch literal.

## Validation

`advanced-website/scripts/validate-content.mjs` verifies:

- bilingual page, section, callout, Mermaid and figure metadata;
- allowed block types, version metadata, navigation and unique anchors;
- safe and existing `sourcePath` values;
- local media existence, `docs-media/` containment, extension, dimensions, per-file/package budgets and SVG executable-content rejection;
- at least 16 diagrams, 10 illustrations, 12 API examples and 8 runbooks;
- package/generated-reference equality and absence of a stale current patch in release content/media;
- roadmap version/name/dependency parity with `docs/ROADMAP.md`;
- version-line navigation/search boundaries for 3.1.x and 3.2.x;
- absence of unsafe content-model markers.

## Portal capabilities

- RU/EN language switch with persisted preference;
- functional 3.1.x, 3.2.x and 3.3.x content selector;
- current SemVer injected from root `package.json`;
- `Ctrl/Cmd + K` search limited to available content for the selected line, including captions and alt text;
- nested left navigation, breadcrumbs and right-side page table of contents;
- anchor links, version-aware previous/next navigation and code-copy controls;
- version-filtered generated API v3, Trust/MLS v4 and Socket.IO reference;
- Mermaid diagrams with strict rendering and a safe text fallback;
- local lazy-loaded figures with bilingual captions and failure fallback;
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
