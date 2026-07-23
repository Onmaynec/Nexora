# Nexora Advanced Documentation

Separate React/Vite engineering portal deployed at `/Nexora/advanced/` without replacing the existing project website.

## Commands

```bash
npm run dev:advanced
npm run test:advanced
npm run build:advanced
npm run preview:advanced
```

The build generates repository-derived content before Vite runs. Generated artifacts are not committed.

## Content boundaries

- current package metadata, source code, Markdown documentation and release notes are authoritative for current main;
- REST, realtime and error inventories are conservative static extraction with source links;
- generated OpenAPI intentionally omits field types that cannot be proven from source;
- `content/` contains the attached 0.3–1.0 Documentation Kit and is always shown as historical;
- GitHub Releases are loaded at runtime, while local release notes remain the offline fallback.
