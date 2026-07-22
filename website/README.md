# Nexora project website

Static presentation site for Nexora. The website reuses the canonical application icon from `client/public/nexora-icon.png`; the same binary is tracked at `website/assets/nexora-icon.png` for static deployment.

## Preview

Run `python -m http.server 8080` from the `website` directory and open `http://localhost:8080`.

## GitHub Pages

The workflow in `.github/workflows/pages.yml` validates and publishes this directory after changes reach `main`.

GitHub requires Pages to be enabled once by a repository administrator:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Open **Actions → Project website** and run the workflow again.

The workflow token deliberately cannot perform this repository-administration step. After Pages is enabled, subsequent website changes deploy automatically.