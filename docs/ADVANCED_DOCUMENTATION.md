# Nexora Advanced Documentation

The advanced engineering portal is published alongside the existing project website at:

- `https://onmaynec.github.io/Nexora/advanced/`

Its source lives in `advanced-website/`. The original presentation website remains in `website/`; deployment composes both sites and adds only one navigation link to the advanced portal.

## Source model

The production build runs `advanced-website/scripts/generate-content.mjs`. It reads the root `package.json`, current server/client/cloud source, repository Markdown documentation, `RELEASE_NOTES_3.1.x`–`3.3.x`, and the attached historical Documentation Kit.

Generated data includes:

- the current package version and Node requirement;
- detected REST routes with source locations, conservative authorization inference, request fields, response statuses and stable error codes;
- detected Socket.IO receive/emit references;
- a conservative OpenAPI 3.1 inventory at `/Nexora/advanced/openapi.json`;
- current repository documentation and local release notes;
- the historical 0.3–1.0 documentation set with an explicit outdated-content warning.

Static extraction does not replace server validators. The portal intentionally leaves unknown OpenAPI field types unspecified rather than inventing schemas.

## Commands

```bash
npm run dev:advanced
npm run test:advanced
npm run build:advanced
npm run preview:advanced
```

## Deployment

`.github/workflows/advanced-docs.yml` validates tests, source extraction, the production build and OpenAPI output for pull requests. `.github/workflows/pages.yml` builds both sites, copies the advanced Vite output to `website/advanced/`, deploys the combined artifact through GitHub Pages and verifies both public URLs.

## External runtime resources

The portal uses Google Fonts and loads Mermaid from jsDelivr only when a Mermaid block is present. Swagger UI is opened as an explicit external link. No analytics, advertising scripts, cookies or third-party tracking are included.
