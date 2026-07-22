# Nexora project website

Static presentation site for Nexora. It reuses the canonical application icon from `client/public/nexora-icon.png`; the same binary is tracked at `website/assets/nexora-icon.png` for GitHub Pages.

## Features

- responsive Russian/English product presentation;
- whole-page Canvas particle field with desktop pointer interaction;
- reduced animation on mobile and low-power devices;
- pause while the browser tab is hidden;
- live GitHub version, stars, forks, issues, release assets, CI status and commit activity;
- version-aware Client, Server, PWA, Android and source download cards;
- architecture, Trust lifecycle, delivery path and verified product-limit diagrams;
- keyboard focus, reduced-motion support and mobile navigation.

## Preview

From the repository root:

```bash
python -m http.server 8080 --directory website
```

Open `http://localhost:8080`.

## Validation

```bash
node --check website/app.js
node website/validate.mjs
```

## GitHub Pages

The workflow in `.github/workflows/pages.yml` validates and publishes this directory after changes reach `main`.

GitHub Pages must be enabled once by a repository administrator:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Project website** and run the workflow again.
