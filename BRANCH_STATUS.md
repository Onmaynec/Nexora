# Branch Status — `agent/nexora-3.2.0-trust-core`

## Classification

- Target version: `3.2.0` development.
- Base stable release: `3.1.2`.
- Pull Request: `#11`.
- Status: draft Trust Core foundation.
- Production use: prohibited.

## Purpose

This branch establishes a separate Rust/WebAssembly cryptographic boundary based on OpenMLS 0.8.1 and MLS 1.0. It covers device credentials, signing identities, KeyPackages, group lifecycle, application encryption/decryption, provider-state integrity and exported group secrets.

## Explicit limitations

This branch does not yet establish a complete Local Server Delivery Service, key transparency, secure-channel UI, cross-device integration, plaintext-bypass protection or release-ready E2EE.

## Documentation rule

Do not copy branch claims into stable documentation. The authoritative stable release remains Nexora 3.1.2 on `main`, where messages are not protected from the Local Server operator by E2EE.

## Safety

Use disposable accounts and data. Do not use this branch for real private conversations or security-sensitive production deployment.
