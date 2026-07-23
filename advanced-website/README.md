# Nexora Advanced Documentation

Separate React/Vite documentation portal deployed to `/Nexora/advanced/`.

## Scope

The portal is intended for Nexora developers and contributors, self-hosted operators, REST/Socket.IO integrators, and security reviewers. It provides bilingual RU/EN documentation for the 3.1.x, 3.2.x and 3.3.x lines, while the active version is read from the root `package.json` during the build.

Current repository source and current repository documentation are authoritative. The attached 17 July 2026 Documentation Kit is used only as historical context and target-design provenance because it was based on the older 0.3.0 code line.

## Build

The portal uses the root repository lockfile and existing React/Vite dependencies.

```bash
node advanced-website/scripts/inject-entry-link.mjs
node advanced-website/scripts/generate-reference.mjs
node advanced-website/scripts/validate-content.mjs
node --test advanced-website/test/*.test.mjs
npx vite build --config advanced-website/vite.config.mjs
```

The build generates HTTP route and Socket.IO inventories from the current `server/` and `cloud/` source tree. GitHub Releases are loaded at runtime, with repository release notes as the offline fallback.

The output is written to `website/advanced/`. The entry button for the existing introductory website is injected only into the composed Pages artifact, so the current beginner-facing source remains unchanged.