# Branch Status — `agent/nexora-3.2.0-trust-core-mls`

## Classification

- Target version: `3.2.0` development.
- Base stable release: `3.1.2`.
- Pull Request: `#12`.
- Status: draft / experimental / not releasable.
- Production use: prohibited.

## Purpose

This branch integrates the Trust Core and MLS 1.0 messaging path with Local Server schema 8, device identity, KeyPackage/Welcome delivery, epoch/replay control, ciphertext transport and encrypted client-side state.

## Documentation rule

Branch-local documents describe only work present or explicitly planned in this branch. They must not claim that stable Nexora provides E2EE. The authoritative stable documentation remains on `main` until a verified 3.2.0 release is merged.

## Release blockers

- complete Client UI/outbox integration;
- exhaustive plaintext-bypass prevention;
- dependency and reproducible-build lock;
- full API/MLS and multi-device interoperability tests;
- attachment encryption and metadata review;
- recovery/revocation UX and failure-mode tests;
- migrations, rollback and operator documentation;
- version metadata, changelog and release notes;
- all Windows/Linux/Android CI and security gates;
- independent cryptographic review.

## Safety

Do not use this branch for real private conversations or describe it as audited E2EE. Test only with disposable accounts, devices, rooms and data.
