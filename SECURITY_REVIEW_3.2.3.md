# Nexora 3.2.3 Security Review

## Method

Every submitted finding was checked against the 3.2.2 release source before changing production code. Confirmed gaps received regression tests first. Claims contradicted by current implementation were documented rather than replaced with ineffective controls.

## Confirmed and corrected

1. Active Trust device resource exhaustion: fixed with an atomic 16-device account limit.
2. KeyPackage storage exhaustion: fixed with atomic per-device and per-user inventory limits.
3. Credential scope ambiguity: fixed by parsing and binding MLS BasicCredential to userId/deviceId.
4. Identity/signature key role reuse: rejected during device registration.
5. Trust audit nested metadata exposure: replaced with action-specific primitive allowlists.
6. Device directory/enrollment/recovery request flooding: protected by bounded sliding-window rate limiters.
7. Stale membership plus active room ban: conversation access now fails closed.
8. Client missed-commit envelope trust: scope, sequence, hash, replay and state hashes are verified before persistence.
9. Stale sessions and security telemetry: removed at startup and hourly according to retention limits.

## Findings already mitigated in 3.2.2

- Trust bootstrap ordering uses parent layout configuration and safe draft reads.
- CSRF tokens are required on mutating application and Trust APIs; mutating API requests also validate Origin.
- Socket.IO uses allowRequest with the same allowed-origin policy.
- IndexedDB private material is sealed with AES-256-GCM and non-extractable WebCrypto keys. Same-origin XSS remains outside what storage encryption can neutralize and is mitigated by CSP, renderer isolation and output handling.
- E2EE upload parsing caps actual ciphertext bytes, requires exact plaintextSize + GCM tag length, verifies ciphertext SHA-256 and charges quota by actual ciphertext size.
- SQLite enforces unique MLS commit hashes and unique group epochs; the recovery endpoint also validates a contiguous server log.

## Rejected recommendations

- SHA-256 collision handling beyond full key/credential equality is not a practical security control for device registration.
- timingSafeEqual cannot hide whether a KeyPackage exists because availability is the explicit API result.
- the server cannot decrypt opaque E2EE attachments to measure plaintext without violating the E2EE boundary.
- keeping a persistent wrapping key only in memory would make durable offline Trust state unrecoverable after restart; OS/WebAuthn-backed key wrapping is a future product capability, not a safe patch substitution.

## Compatibility

No schema or protocol migration is required. All new limits are enforced server-side with stable error codes.
