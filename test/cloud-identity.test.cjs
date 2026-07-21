"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { BillingDatabase } = require("../cloud/billing-core.cjs");
const { createResponseSigner, verifySignedEnvelope } = require("../cloud/entitlements.cjs");
const { IdentityService, totpCode } = require("../cloud/identity-service.cjs");

function fixture(t, now = new Date("2026-07-21T12:00:00.000Z")) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-identity-"));
  const keys = crypto.generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const signer = createResponseSigner({ keyId: "identity-key-1", privateKey });
  const database = new BillingDatabase(path.join(directory, "cloud.sqlite"), { clock: () => new Date(now), entitlementSigner: signer });
  const identity = new IdentityService(database, {
    encryptionKey: crypto.randomBytes(32).toString("base64url"),
    responseSigner: signer,
    clock: () => new Date(now),
    exposeVerificationTokens: true,
    oauthClients: [{ clientId: "nexora-test-client", displayName: "Test", redirectUris: ["https://client.example/callback"], scopes: ["openid", "profile", "link:account"] }],
  });
  t.after(() => { database.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { database, identity, signer, publicKey, setNow(value) { now = new Date(value); } };
}

function verifiedAccount(identity, suffix = "one") {
  const registered = identity.register({ email: `${suffix}@example.com`, displayName: `User ${suffix}`, password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
  identity.verifyEmail(registered.verificationToken);
  return registered.account;
}

test("Cloud Identity requires email verification and creates a secure session", (t) => {
  const { identity } = fixture(t);
  const registered = identity.register({ email: "User@Example.com", displayName: "Cloud User", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
  assert.equal(registered.account.email, "user@example.com");
  assert.equal(registered.account.emailVerified, false);
  assert.throws(() => identity.login({ email: "user@example.com", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" }), (error) => error.code === "IDENTITY_EMAIL_UNVERIFIED");
  const verified = identity.verifyEmail(registered.verificationToken);
  assert.equal(verified.emailVerified, true);
  const login = identity.login({ email: "user@example.com", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
  assert.equal(login.mfaRequired, false);
  assert.equal(identity.sessionFromToken(login.session.token).account_id, registered.account.id);
});

test("MFA enrollment returns one-time recovery codes and enforces second factor", (t) => {
  const { identity } = fixture(t);
  verifiedAccount(identity, "mfa");
  const first = identity.login({ email: "mfa@example.com", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
  const enrollment = identity.beginMfaEnrollment(first.session.token);
  const confirmation = identity.confirmMfaEnrollment(first.session.token, totpCode(enrollment.secret, Date.parse("2026-07-21T12:00:00.000Z")));
  assert.equal(confirmation.enabled, true);
  assert.equal(confirmation.recoveryCodes.length, 10);
  identity.logout(first.session.token);
  const second = identity.login({ email: "mfa@example.com", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
  assert.equal(second.mfaRequired, true);
  assert.throws(() => identity.sessionFromToken(second.session.token), (error) => error.code === "MFA_REQUIRED");
  const completed = identity.verifyMfaSession(second.session.token, confirmation.recoveryCodes[0]);
  assert.equal(completed.session.status, "active");
  assert.throws(() => {
    const third = identity.login({ email: "mfa@example.com", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
    identity.verifyMfaSession(third.session.token, confirmation.recoveryCodes[0]);
  }, (error) => error.code === "MFA_INVALID");
});

test("OAuth authorization code uses PKCE S256, is single-use and rotates refresh tokens", (t) => {
  const { identity } = fixture(t);
  verifiedAccount(identity, "oauth");
  const login = identity.login({ email: "oauth@example.com", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const authorization = identity.createAuthorizationCode({
    sessionToken: login.session.token,
    clientId: "nexora-test-client",
    redirectUri: "https://client.example/callback",
    scopes: ["openid", "profile"],
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
  });
  assert.throws(() => identity.exchangeAuthorizationCode({ code: authorization.code, clientId: "nexora-test-client", redirectUri: "https://client.example/callback", codeVerifier: "wrong-verifier-value-that-is-long-enough-1234567890" }), (error) => error.code === "OAUTH_INVALID_GRANT");
  const tokens = identity.exchangeAuthorizationCode({ code: authorization.code, clientId: "nexora-test-client", redirectUri: "https://client.example/callback", codeVerifier: verifier });
  assert.equal(identity.userInfo(tokens.accessToken).email, "oauth@example.com");
  assert.throws(() => identity.exchangeAuthorizationCode({ code: authorization.code, clientId: "nexora-test-client", redirectUri: "https://client.example/callback", codeVerifier: verifier }), (error) => error.code === "OAUTH_INVALID_GRANT");
  const rotated = identity.rotateRefreshToken({ refreshToken: tokens.refreshToken, clientId: "nexora-test-client" });
  assert.notEqual(rotated.refreshToken, tokens.refreshToken);
  assert.throws(() => identity.rotateRefreshToken({ refreshToken: tokens.refreshToken, clientId: "nexora-test-client" }), (error) => error.code === "OAUTH_INVALID_GRANT");
});

test("browser link attestation is signed, scoped and one-time", (t) => {
  const { identity, publicKey } = fixture(t);
  verifiedAccount(identity, "link");
  const login = identity.login({ email: "link@example.com", password: "Strong-Cloud-Pass-123!", ip: "127.0.0.1" });
  identity.seedClients([{ clientId: "nexora-server:server-main", displayName: "Server", redirectUris: ["https://client.example/callback"], scopes: ["openid", "profile", "link:account"] }]);
  const flow = identity.createBrowserFlow({ clientId: "nexora-server:server-main", redirectUri: "https://client.example/callback", serverId: "server-main", localUserId: "local-user-1", linkId: "link-session-1", nonce: "nonce-value-123456789", scopes: ["openid", "profile", "link:account"] });
  const result = identity.completeBrowserFlow({ flowId: flow.id, csrf: flow.csrf, sessionToken: login.session.token });
  const payload = verifySignedEnvelope(result.attestation, { "identity-key-1": publicKey }, { serverId: "server-main", now: new Date("2026-07-21T12:00:00.000Z") });
  assert.equal(payload.type, "local_account_link");
  assert.equal(payload.localUserId, "local-user-1");
  assert.equal(payload.linkId, "link-session-1");
  assert.throws(() => identity.completeBrowserFlow({ flowId: flow.id, csrf: flow.csrf, sessionToken: login.session.token }), (error) => error.code === "OAUTH_FLOW_INVALID");
});
