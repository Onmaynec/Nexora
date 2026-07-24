# Nexora 3.3.3 Advanced Documentation Portal

## Scope

This release evidence records the content-only development of `https://onmaynec.github.io/Nexora/advanced/`. The introductory `/Nexora/` website source, layout, copy, animation and UX are outside scope and were not modified.

## Delivered

- functional 3.1.x / 3.2.x / 3.3.x content applicability and version-aware search;
- safe local bilingual `image`/`figure` blocks with lazy rendering, fixed dimensions and asset validation;
- roadmap route `#/roadmap`, sourced and parity-checked against `ROADMAP.md`;
- current 3.3.3 release classification without stale patch duplication in content JSON;
- architecture, authority, data, realtime/offline, rooms, media, Trust/MLS, Pulse, security, operations, development and release diagrams;
- ten sanitised local SVG illustrations;
- twelve curated API v3/v4 examples and Socket.IO/error guidance;
- eight operational runbooks with prerequisites, procedure, verification and failure path;
- dedicated API overview and limits/errors lifecycle documentation;
- regression tests and validators for bilingual parity, versions, roadmap drift, local media and minimum documentation depth.

## Security and privacy evidence

- Mermaid remains configured with `securityLevel: strict` and text fallback.
- Figure sources are limited to local `docs-media/` SVG, PNG and WEBP assets.
- Remote URLs, `data:`, `javascript:`, arbitrary HTML, iframe, script and event-handler content are rejected.
- Examples use fictitious identifiers and contain no credentials, cookies, fingerprints, private messages, room names, IP addresses or payment data.
- Version-incompatible claims fail closed; Trust/MLS API v4 is not presented as a 3.1.x capability.

## Verification

The pull-request merge ref passed:

- advanced reference generation;
- advanced documentation validation and Node tests;
- Vite production build and composed-site verification;
- `npm run check`;
- unit, performance and security-audit jobs;
- Linux tests, schema 8 soak, Android source build and release gate;
- focused Nexora 3.3 regressions.

## Residual limitations

The ten media assets are sanitised repository illustrations rather than screenshots captured from a production account. This avoids disclosure of credentials and private content, but a future release may replace selected illustrations with approved, redacted real-state captures while preserving the same figure schema and validation gates.
