"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { BillingError } = require("./billing-core.cjs");

const ACCESS_TOKEN_TTL_MS = 15 * 60_000;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000;
const SESSION_TTL_MS = 12 * 60 * 60_000;
const RECENT_AUTH_TTL_MS = 10 * 60_000;
const EMAIL_TOKEN_TTL_MS = 30 * 60_000;
const AUTH_CODE_TTL_MS = 5 * 60_000;
const BROWSER_FLOW_TTL_MS = 10 * 60_000;

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new BillingError("Email имеет неверный формат.", "VALIDATION_FAILED", 400, { field: "email" });
  }
  return email;
}

function normalizeDisplayName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new BillingError("Имя должно содержать от 2 до 80 символов.", "VALIDATION_FAILED", 400, { field: "displayName" });
  return name;
}

function validatePassword(value) {
  const password = String(value || "");
  const errors = [];
  if (password.length < 12 || password.length > 128) errors.push("12–128 символов");
  if (!/[a-z]/.test(password)) errors.push("строчная буква");
  if (!/[A-Z]/.test(password)) errors.push("заглавная буква");
  if (!/\d/.test(password)) errors.push("цифра");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("спецсимвол");
  if (errors.length) throw new BillingError(`Пароль не соответствует политике: ${errors.join(", ")}.`, "PASSWORD_POLICY", 400, { errors });
  return password;
}

function secretToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashToken(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordHash(password, salt = crypto.randomBytes(16).toString("base64url")) {
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  return { salt, hash: derived.toString("base64url") };
}

function verifyPassword(password, salt, expected) {
  const actual = passwordHash(String(password || ""), String(salt || "")).hash;
  return safeEqual(actual, expected);
}

function base32Encode(buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let index = 0; index < bits.length; index += 5) output += alphabet[parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  return output;
}

function base32Decode(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new BillingError("MFA secret повреждён.", "MFA_INVALID", 500);
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totpCode(secret, timestamp = Date.now(), stepSeconds = 30) {
  const counter = Math.floor(timestamp / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

function verifyTotp(secret, code, timestamp = Date.now()) {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  return [-1, 0, 1].some((offset) => safeEqual(totpCode(secret, timestamp + offset * 30_000), normalized));
}

function encryptionKey(value) {
  const raw = String(value || "").trim();
  let key;
  try { key = Buffer.from(raw, "base64url"); } catch { key = Buffer.alloc(0); }
  if (key.length !== 32) throw new BillingError("IDENTITY_ENCRYPTION_KEY должен содержать 32 байта base64url.", "PULSE_CLOUD_MISCONFIGURED", 503);
  return key;
}

function encryptText(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((item) => item.toString("base64url")).join(".");
}

function decryptText(value, key) {
  const [ivText, tagText, encryptedText] = String(value || "").split(".");
  if (!ivText || !tagText || !encryptedText) throw new BillingError("Зашифрованный MFA secret повреждён.", "MFA_INVALID", 500);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, "base64url")), decipher.final()]).toString("utf8");
}

function parseJson(value, fallback = []) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function publicIdentity(row) {
  if (!row) return null;
  return {
    id: row.account_id,
    email: row.email,
    displayName: row.display_name,
    emailVerified: Boolean(row.email_verified_at),
    mfaEnabled: Boolean(row.mfa_enabled),
    createdAt: row.created_at,
  };
}

class IdentityService {
  constructor(database, options = {}) {
    if (!database?.db) throw new Error("IdentityService requires BillingDatabase.");
    this.database = database;
    this.db = database.db;
    this.clock = options.clock || (() => new Date());
    this.key = encryptionKey(options.encryptionKey);
    this.responseSigner = options.responseSigner;
    this.exposeVerificationTokens = options.exposeVerificationTokens === true;
    this.db.exec(fs.readFileSync(path.join(__dirname, "identity-schema.sql"), "utf8"));
    this.seedClients(options.oauthClients || []);
  }

  now() { return this.clock(); }
  nowIso() { return this.now().toISOString(); }

  seedClients(clients) {
    const now = this.nowIso();
    const values = Array.isArray(clients) ? clients : [];
    for (const client of values) {
      const id = String(client.clientId || "").trim();
      const redirects = [...new Set((client.redirectUris || []).map(String))];
      const scopes = [...new Set((client.scopes || ["openid", "profile", "link:account"]).map(String))];
      if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/.test(id) || !redirects.length) continue;
      const secretHash = client.clientSecret ? hashToken(client.clientSecret) : null;
      this.db.prepare(`
        INSERT INTO oauth_clients(client_id, client_secret_hash, client_type, display_name, redirect_uris_json, scopes_json, pkce_required, active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
        ON CONFLICT(client_id) DO UPDATE SET client_secret_hash=excluded.client_secret_hash, client_type=excluded.client_type,
          display_name=excluded.display_name, redirect_uris_json=excluded.redirect_uris_json, scopes_json=excluded.scopes_json,
          pkce_required=1, active=1, updated_at=excluded.updated_at
      `).run(id, secretHash, secretHash ? "confidential" : "public", String(client.displayName || id).slice(0, 100), JSON.stringify(redirects), JSON.stringify(scopes), now, now);
    }
  }

  register({ email, displayName, password, country = null, ip = "", userAgent = "" }) {
    const normalizedEmail = normalizeEmail(email);
    const normalizedName = normalizeDisplayName(displayName);
    const normalizedPassword = validatePassword(password);
    const existing = this.db.prepare("SELECT account_id FROM cloud_identities WHERE email=?").get(normalizedEmail);
    if (existing) throw new BillingError("Cloud Account с этим email уже существует.", "IDENTITY_EMAIL_EXISTS", 409);
    const credentials = passwordHash(normalizedPassword);
    const account = this.database.createCloudAccount({ country });
    const now = this.nowIso();
    try {
      this.db.prepare(`
        INSERT INTO cloud_identities(account_id,email,display_name,password_salt,password_hash,password_changed_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(account.id, normalizedEmail, normalizedName, credentials.salt, credentials.hash, now, now, now);
    } catch (error) {
      this.db.prepare("DELETE FROM cloud_accounts WHERE id=?").run(account.id);
      throw error;
    }
    const challenge = this.createEmailChallenge(account.id, "verify_email", normalizedEmail);
    this.recordSecurityEvent(normalizedEmail, ip, true, "registered");
    return { account: publicIdentity(this.getIdentity(account.id)), verificationDeliveryId: challenge.deliveryId, verificationToken: this.exposeVerificationTokens ? challenge.token : undefined };
  }

  createEmailChallenge(accountId, purpose, recipient) {
    const token = secretToken(32);
    const id = crypto.randomUUID();
    const deliveryId = crypto.randomUUID();
    const now = this.now();
    const expiresAt = new Date(now.getTime() + EMAIL_TOKEN_TTL_MS).toISOString();
    this.database.transaction(() => {
      this.db.prepare("UPDATE identity_email_challenges SET consumed_at=? WHERE account_id=? AND purpose=? AND consumed_at IS NULL")
        .run(now.toISOString(), accountId, purpose);
      this.db.prepare("INSERT INTO identity_email_challenges(id,account_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)")
        .run(id, accountId, purpose, hashToken(token), expiresAt, now.toISOString());
      this.db.prepare(`
        INSERT INTO identity_email_outbox(id,account_id,recipient,template,payload_json,status,available_at,created_at)
        VALUES (?,?,?,?,?,'pending',?,?)
      `).run(deliveryId, accountId, recipient, purpose, JSON.stringify({ challengeId: id, token }), now.toISOString(), now.toISOString());
    });
    return { token, deliveryId, expiresAt };
  }

  verifyEmail(token) {
    const now = this.nowIso();
    return this.database.transaction(() => {
      const challenge = this.db.prepare("SELECT * FROM identity_email_challenges WHERE token_hash=? AND purpose='verify_email'").get(hashToken(token));
      if (!challenge || challenge.consumed_at || Date.parse(challenge.expires_at) <= Date.parse(now)) {
        throw new BillingError("Код подтверждения недействителен или истёк.", "IDENTITY_TOKEN_INVALID", 400);
      }
      this.db.prepare("UPDATE identity_email_challenges SET consumed_at=? WHERE id=?").run(now, challenge.id);
      this.db.prepare("UPDATE cloud_identities SET email_verified_at=COALESCE(email_verified_at,?), updated_at=? WHERE account_id=?")
        .run(now, now, challenge.account_id);
      return publicIdentity(this.getIdentity(challenge.account_id));
    });
  }

  getIdentity(accountId) {
    return this.db.prepare("SELECT * FROM cloud_identities WHERE account_id=?").get(String(accountId || ""));
  }

  getIdentityByEmail(email) {
    return this.db.prepare("SELECT * FROM cloud_identities WHERE email=?").get(normalizeEmail(email));
  }

  recordSecurityEvent(email, ip, successful, reason) {
    this.db.prepare("INSERT INTO identity_login_attempts(id,email_hash,ip_hash,successful,reason,created_at) VALUES (?,?,?,?,?,?)")
      .run(crypto.randomUUID(), hashToken(String(email || "").toLowerCase()), hashToken(ip || "unknown"), successful ? 1 : 0, String(reason).slice(0, 80), this.nowIso());
  }

  assertLoginAllowed(email, ip) {
    const cutoff = new Date(this.now().getTime() - 15 * 60_000).toISOString();
    const attempts = this.db.prepare(`
      SELECT successful FROM identity_login_attempts WHERE email_hash=? AND ip_hash=? AND created_at>=? ORDER BY created_at DESC LIMIT 20
    `).all(hashToken(String(email || "").toLowerCase()), hashToken(ip || "unknown"), cutoff);
    let failures = 0;
    for (const attempt of attempts) {
      if (attempt.successful) break;
      failures += 1;
    }
    if (failures >= 8) throw new BillingError("Слишком много попыток входа. Повторите позже.", "IDENTITY_RATE_LIMITED", 429, { retryAfterSeconds: 900 });
  }

  login({ email, password, ip = "", userAgent = "" }) {
    const normalizedEmail = normalizeEmail(email);
    this.assertLoginAllowed(normalizedEmail, ip);
    const identity = this.getIdentityByEmail(normalizedEmail);
    if (!identity || !verifyPassword(password, identity.password_salt, identity.password_hash)) {
      this.recordSecurityEvent(normalizedEmail, ip, false, "invalid_credentials");
      throw new BillingError("Email или пароль неверны.", "IDENTITY_INVALID_CREDENTIALS", 401);
    }
    if (!identity.email_verified_at) {
      this.recordSecurityEvent(normalizedEmail, ip, false, "email_unverified");
      throw new BillingError("Сначала подтвердите email.", "IDENTITY_EMAIL_UNVERIFIED", 403);
    }
    const account = this.database.getCloudAccount(identity.account_id);
    if (!account || account.status !== "active") throw new BillingError("Cloud Account ограничен.", "CLOUD_ACCOUNT_RESTRICTED", 403);
    const token = secretToken(32);
    const now = this.now();
    const status = identity.mfa_enabled ? "pending_mfa" : "active";
    const session = {
      id: crypto.randomUUID(),
      token,
      status,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      recentAuthUntil: new Date(now.getTime() + RECENT_AUTH_TTL_MS).toISOString(),
    };
    this.db.prepare(`
      INSERT INTO identity_sessions(id,account_id,token_hash,status,auth_time,mfa_verified_at,recent_auth_until,expires_at,ip_hash,user_agent,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(session.id, identity.account_id, hashToken(token), status, now.toISOString(), status === "active" ? now.toISOString() : null,
      session.recentAuthUntil, session.expiresAt, hashToken(ip || "unknown"), String(userAgent || "").slice(0, 240), now.toISOString());
    this.recordSecurityEvent(normalizedEmail, ip, true, status === "active" ? "login" : "mfa_required");
    return { session, account: publicIdentity(identity), mfaRequired: status === "pending_mfa" };
  }

  sessionFromToken(token, { allowPendingMfa = false, recentAuth = false } = {}) {
    const row = this.db.prepare(`
      SELECT identity_sessions.*, cloud_identities.email, cloud_identities.display_name, cloud_identities.email_verified_at,
        cloud_identities.mfa_enabled, cloud_identities.mfa_secret_cipher
      FROM identity_sessions JOIN cloud_identities ON cloud_identities.account_id=identity_sessions.account_id
      WHERE identity_sessions.token_hash=?
    `).get(hashToken(token));
    if (!row || row.status === "revoked" || Date.parse(row.expires_at) <= this.now().getTime()) {
      throw new BillingError("Cloud Identity session недействительна.", "IDENTITY_SESSION_INVALID", 401);
    }
    if (!allowPendingMfa && row.status !== "active") throw new BillingError("Требуется второй фактор.", "MFA_REQUIRED", 401);
    if (recentAuth && Date.parse(row.recent_auth_until) <= this.now().getTime()) throw new BillingError("Требуется недавняя аутентификация.", "RECENT_AUTH_REQUIRED", 403);
    return row;
  }

  verifyMfaSession(sessionToken, code) {
    const session = this.sessionFromToken(sessionToken, { allowPendingMfa: true });
    if (session.status !== "pending_mfa") return { session: { token: sessionToken, status: session.status }, account: publicIdentity(session) };
    let valid = false;
    const secret = decryptText(session.mfa_secret_cipher, this.key);
    if (verifyTotp(secret, code, this.now().getTime())) valid = true;
    if (!valid) {
      const recoveryHash = hashToken(String(code || "").toUpperCase().replace(/\s+/g, ""));
      const recovery = this.db.prepare("SELECT * FROM identity_mfa_recovery_codes WHERE account_id=? AND code_hash=? AND consumed_at IS NULL").get(session.account_id, recoveryHash);
      if (recovery) {
        this.db.prepare("UPDATE identity_mfa_recovery_codes SET consumed_at=? WHERE id=?").run(this.nowIso(), recovery.id);
        valid = true;
      }
    }
    if (!valid) throw new BillingError("Код второго фактора неверен.", "MFA_INVALID", 401);
    const now = this.now();
    this.db.prepare("UPDATE identity_sessions SET status='active',mfa_verified_at=?,recent_auth_until=? WHERE id=?")
      .run(now.toISOString(), new Date(now.getTime() + RECENT_AUTH_TTL_MS).toISOString(), session.id);
    return { session: { token: sessionToken, status: "active", expiresAt: session.expires_at }, account: publicIdentity(session) };
  }

  beginMfaEnrollment(sessionToken, issuer = "Nexora") {
    const session = this.sessionFromToken(sessionToken, { recentAuth: true });
    const secret = base32Encode(crypto.randomBytes(20));
    this.db.prepare("UPDATE cloud_identities SET mfa_secret_cipher=?,mfa_enabled=0,updated_at=? WHERE account_id=?")
      .run(encryptText(secret, this.key), this.nowIso(), session.account_id);
    const label = encodeURIComponent(`${issuer}:${session.email}`);
    const uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
    return { secret, uri };
  }

  confirmMfaEnrollment(sessionToken, code) {
    const session = this.sessionFromToken(sessionToken, { recentAuth: true });
    if (!session.mfa_secret_cipher) throw new BillingError("MFA enrollment не начат.", "MFA_NOT_CONFIGURED", 409);
    const secret = decryptText(session.mfa_secret_cipher, this.key);
    if (!verifyTotp(secret, code, this.now().getTime())) throw new BillingError("Код второго фактора неверен.", "MFA_INVALID", 400);
    const recoveryCodes = Array.from({ length: 10 }, () => `${secretToken(5).slice(0, 5)}-${secretToken(5).slice(0, 5)}`.toUpperCase());
    const now = this.nowIso();
    this.database.transaction(() => {
      this.db.prepare("DELETE FROM identity_mfa_recovery_codes WHERE account_id=?").run(session.account_id);
      const insert = this.db.prepare("INSERT INTO identity_mfa_recovery_codes(id,account_id,code_hash,created_at) VALUES (?,?,?,?)");
      for (const codeValue of recoveryCodes) insert.run(crypto.randomUUID(), session.account_id, hashToken(codeValue.replace(/\s+/g, "")), now);
      this.db.prepare("UPDATE cloud_identities SET mfa_enabled=1,updated_at=? WHERE account_id=?").run(now, session.account_id);
    });
    return { enabled: true, recoveryCodes };
  }

  disableMfa(sessionToken, password) {
    const session = this.sessionFromToken(sessionToken, { recentAuth: true });
    const identity = this.getIdentity(session.account_id);
    if (!verifyPassword(password, identity.password_salt, identity.password_hash)) throw new BillingError("Пароль неверен.", "RECENT_AUTH_REQUIRED", 403);
    this.database.transaction(() => {
      this.db.prepare("UPDATE cloud_identities SET mfa_enabled=0,mfa_secret_cipher=NULL,updated_at=? WHERE account_id=?").run(this.nowIso(), session.account_id);
      this.db.prepare("DELETE FROM identity_mfa_recovery_codes WHERE account_id=?").run(session.account_id);
    });
    return { enabled: false };
  }

  logout(sessionToken) {
    this.db.prepare("UPDATE identity_sessions SET status='revoked',revoked_at=? WHERE token_hash=? AND status<>'revoked'")
      .run(this.nowIso(), hashToken(sessionToken));
    return true;
  }

  client(clientId, redirectUri, requestedScopes = []) {
    const client = this.db.prepare("SELECT * FROM oauth_clients WHERE client_id=? AND active=1").get(String(clientId || ""));
    if (!client) throw new BillingError("OAuth client не найден.", "OAUTH_INVALID_CLIENT", 400);
    const redirects = parseJson(client.redirect_uris_json, []);
    if (!redirects.includes(String(redirectUri || ""))) throw new BillingError("Redirect URI не разрешён.", "OAUTH_REDIRECT_INVALID", 400);
    const allowed = new Set(parseJson(client.scopes_json, []));
    const scopes = [...new Set((Array.isArray(requestedScopes) ? requestedScopes : String(requestedScopes || "").split(/\s+/)).filter(Boolean))];
    if (!scopes.length) scopes.push("openid");
    if (scopes.some((scope) => !allowed.has(scope))) throw new BillingError("Запрошен недопустимый OAuth scope.", "OAUTH_SCOPE_INVALID", 400);
    return { ...client, redirects, scopes };
  }

  createAuthorizationCode({ sessionToken, clientId, redirectUri, scopes, codeChallenge, codeChallengeMethod = "S256", nonce = null }) {
    const session = this.sessionFromToken(sessionToken);
    const client = this.client(clientId, redirectUri, scopes);
    if (client.pkce_required && (!/^[A-Za-z0-9_-]{43,128}$/.test(String(codeChallenge || "")) || codeChallengeMethod !== "S256")) {
      throw new BillingError("OAuth PKCE S256 обязателен.", "OAUTH_PKCE_REQUIRED", 400);
    }
    const code = secretToken(32);
    const now = this.now();
    this.db.prepare(`
      INSERT INTO oauth_authorization_codes(id,code_hash,account_id,client_id,redirect_uri,scopes_json,code_challenge,code_challenge_method,nonce,expires_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(crypto.randomUUID(), hashToken(code), session.account_id, client.client_id, redirectUri, JSON.stringify(client.scopes), codeChallenge, "S256", nonce,
      new Date(now.getTime() + AUTH_CODE_TTL_MS).toISOString(), now.toISOString());
    return { code, state: null, expiresIn: Math.floor(AUTH_CODE_TTL_MS / 1000) };
  }

  exchangeAuthorizationCode({ code, clientId, clientSecret = null, redirectUri, codeVerifier }) {
    const now = this.now();
    return this.database.transaction(() => {
      const row = this.db.prepare("SELECT codes.*, clients.client_secret_hash, clients.client_type FROM oauth_authorization_codes codes JOIN oauth_clients clients ON clients.client_id=codes.client_id WHERE codes.code_hash=?").get(hashToken(code));
      if (!row || row.consumed_at || Date.parse(row.expires_at) <= now.getTime()) throw new BillingError("Authorization code недействителен.", "OAUTH_INVALID_GRANT", 400);
      if (row.client_id !== clientId || row.redirect_uri !== redirectUri) throw new BillingError("Authorization code scope mismatch.", "OAUTH_INVALID_GRANT", 400);
      if (row.client_type === "confidential" && !safeEqual(hashToken(clientSecret), row.client_secret_hash)) throw new BillingError("OAuth client secret неверен.", "OAUTH_INVALID_CLIENT", 401);
      const challenge = crypto.createHash("sha256").update(String(codeVerifier || "")).digest("base64url");
      if (!safeEqual(challenge, row.code_challenge)) throw new BillingError("PKCE verifier неверен.", "OAUTH_INVALID_GRANT", 400);
      this.db.prepare("UPDATE oauth_authorization_codes SET consumed_at=? WHERE id=?").run(now.toISOString(), row.id);
      return this.issueOauthTokens(row.account_id, row.client_id, parseJson(row.scopes_json, []), null);
    });
  }

  issueOauthTokens(accountId, clientId, scopes, rotatedFromId) {
    const accessToken = secretToken(32);
    const refreshToken = secretToken(48);
    const now = this.now();
    const accessId = crypto.randomUUID();
    const refreshId = crypto.randomUUID();
    this.db.prepare("INSERT INTO oauth_access_tokens(id,token_hash,account_id,client_id,scopes_json,expires_at,created_at) VALUES (?,?,?,?,?,?,?)")
      .run(accessId, hashToken(accessToken), accountId, clientId, JSON.stringify(scopes), new Date(now.getTime() + ACCESS_TOKEN_TTL_MS).toISOString(), now.toISOString());
    this.db.prepare("INSERT INTO oauth_refresh_tokens(id,token_hash,account_id,client_id,scopes_json,expires_at,rotated_from_id,created_at) VALUES (?,?,?,?,?,?,?,?)")
      .run(refreshId, hashToken(refreshToken), accountId, clientId, JSON.stringify(scopes), new Date(now.getTime() + REFRESH_TOKEN_TTL_MS).toISOString(), rotatedFromId, now.toISOString());
    return { accessToken, refreshToken, tokenType: "Bearer", expiresIn: Math.floor(ACCESS_TOKEN_TTL_MS / 1000), scope: scopes.join(" ") };
  }

  rotateRefreshToken({ refreshToken, clientId, clientSecret = null }) {
    const now = this.now();
    return this.database.transaction(() => {
      const row = this.db.prepare("SELECT tokens.*, clients.client_secret_hash, clients.client_type FROM oauth_refresh_tokens tokens JOIN oauth_clients clients ON clients.client_id=tokens.client_id WHERE tokens.token_hash=?").get(hashToken(refreshToken));
      if (!row || row.revoked_at || Date.parse(row.expires_at) <= now.getTime() || row.client_id !== clientId) throw new BillingError("Refresh token недействителен.", "OAUTH_INVALID_GRANT", 400);
      if (row.client_type === "confidential" && !safeEqual(hashToken(clientSecret), row.client_secret_hash)) throw new BillingError("OAuth client secret неверен.", "OAUTH_INVALID_CLIENT", 401);
      this.db.prepare("UPDATE oauth_refresh_tokens SET revoked_at=? WHERE id=?").run(now.toISOString(), row.id);
      return this.issueOauthTokens(row.account_id, row.client_id, parseJson(row.scopes_json, []), row.id);
    });
  }

  userInfo(accessToken) {
    const row = this.db.prepare(`
      SELECT tokens.*, identities.email, identities.display_name, identities.email_verified_at
      FROM oauth_access_tokens tokens JOIN cloud_identities identities ON identities.account_id=tokens.account_id
      WHERE tokens.token_hash=?
    `).get(hashToken(accessToken));
    if (!row || row.revoked_at || Date.parse(row.expires_at) <= this.now().getTime()) throw new BillingError("Access token недействителен.", "OAUTH_INVALID_TOKEN", 401);
    return { sub: row.account_id, email: row.email, email_verified: Boolean(row.email_verified_at), name: row.display_name };
  }

  createBrowserFlow(input = {}) {
    const client = this.client(input.clientId, input.redirectUri, input.scopes || ["openid", "profile", "link:account"]);
    const csrf = secretToken(24);
    const flow = {
      id: crypto.randomUUID(), csrf, clientId: client.client_id, redirectUri: String(input.redirectUri),
      serverId: input.serverId ? String(input.serverId) : null,
      localUserId: input.localUserId ? String(input.localUserId) : null,
      linkId: input.linkId ? String(input.linkId) : null,
      nonce: input.nonce ? String(input.nonce) : null,
      state: input.state ? String(input.state) : null,
      codeChallenge: input.codeChallenge ? String(input.codeChallenge) : null,
      codeChallengeMethod: input.codeChallengeMethod || null,
    };
    const now = this.now();
    this.db.prepare(`
      INSERT INTO oauth_browser_flows(id,csrf_hash,client_id,redirect_uri,server_id,local_user_id,link_id,nonce,state,code_challenge,code_challenge_method,expires_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(flow.id, hashToken(csrf), flow.clientId, flow.redirectUri, flow.serverId, flow.localUserId, flow.linkId, flow.nonce, flow.state,
      flow.codeChallenge, flow.codeChallengeMethod, new Date(now.getTime() + BROWSER_FLOW_TTL_MS).toISOString(), now.toISOString());
    return flow;
  }

  completeBrowserFlow({ flowId, csrf, sessionToken }) {
    return this.database.transaction(() => {
      const flow = this.db.prepare("SELECT * FROM oauth_browser_flows WHERE id=?").get(String(flowId || ""));
      if (!flow || flow.consumed_at || Date.parse(flow.expires_at) <= this.now().getTime() || !safeEqual(hashToken(csrf), flow.csrf_hash)) {
        throw new BillingError("Authorization flow недействителен.", "OAUTH_FLOW_INVALID", 400);
      }
      const session = this.sessionFromToken(sessionToken);
      let result;
      if (flow.link_id) {
        if (!this.responseSigner) throw new BillingError("Cloud response signer не настроен.", "PULSE_CLOUD_MISCONFIGURED", 503);
        const now = this.now();
        const attestation = this.responseSigner({
          type: "local_account_link",
          linkId: flow.link_id,
          nonce: flow.nonce,
          serverId: flow.server_id,
          localUserId: flow.local_user_id,
          cloudAccountId: session.account_id,
          subject: `cloud-account:${session.account_id}`,
          issuedAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 5 * 60_000).toISOString(),
        });
        result = { type: "link", redirectUri: flow.redirect_uri, state: flow.state, linkId: flow.link_id, attestation };
      } else {
        const authorization = this.createAuthorizationCode({
          sessionToken,
          clientId: flow.client_id,
          redirectUri: flow.redirect_uri,
          scopes: ["openid", "profile"],
          codeChallenge: flow.code_challenge,
          codeChallengeMethod: flow.code_challenge_method,
          nonce: flow.nonce,
        });
        result = { type: "oauth", redirectUri: flow.redirect_uri, state: flow.state, code: authorization.code };
      }
      const consumed = this.db.prepare("UPDATE oauth_browser_flows SET consumed_at=? WHERE id=? AND consumed_at IS NULL").run(this.nowIso(), flow.id);
      if (Number(consumed.changes || 0) !== 1) throw new BillingError("Authorization flow уже использован.", "OAUTH_FLOW_REPLAYED", 409);
      return result;
    });
  }
}

module.exports = {
  IdentityService,
  base32Decode,
  base32Encode,
  decryptText,
  encryptText,
  hashToken,
  normalizeEmail,
  passwordHash,
  publicIdentity,
  secretToken,
  totpCode,
  validatePassword,
  verifyPassword,
  verifyTotp,
};
