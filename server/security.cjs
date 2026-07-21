"use strict";

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const cookie = require("cookie");

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "nexora_session";
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

async function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = await scrypt(password, salt, 64);
  return { salt, hash: Buffer.from(derived).toString("hex") };
}

async function verifyPassword(password, salt, expectedHex) {
  const derived = Buffer.from(await scrypt(password, salt, 64));
  const expected = Buffer.from(expectedHex, "hex");
  return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
}

function createSessionToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createCsrfToken() {
  return crypto.randomBytes(24).toString("base64url");
}

function passwordPolicy(settings = {}) {
  return {
    minLength: Math.max(8, Math.min(64, Number(settings.passwordMinLength) || 10)),
    requireUpper: settings.passwordRequireUpper !== false,
    requireLower: settings.passwordRequireLower !== false,
    requireNumber: settings.passwordRequireNumber !== false,
    requireSymbol: Boolean(settings.passwordRequireSymbol),
  };
}

function validatePassword(password, settings = {}) {
  const value = String(password ?? "");
  const policy = passwordPolicy(settings);
  const errors = [];
  if (value.length < policy.minLength) errors.push(`минимум ${policy.minLength} символов`);
  if (value.length > 128) errors.push("не более 128 символов");
  if (policy.requireUpper && !/[A-ZА-ЯЁ]/u.test(value)) errors.push("заглавная буква");
  if (policy.requireLower && !/[a-zа-яё]/u.test(value)) errors.push("строчная буква");
  if (policy.requireNumber && !/\d/u.test(value)) errors.push("цифра");
  if (policy.requireSymbol && !/[^\p{L}\p{N}\s]/u.test(value)) errors.push("специальный символ");
  return { ok: errors.length === 0, errors, policy };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseSessionToken(headerValue) {
  if (!headerValue) return null;
  try {
    return cookie.parse(headerValue)[SESSION_COOKIE] ?? null;
  } catch {
    return null;
  }
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    status: user.status ?? "",
    bio: user.bio ?? "",
    avatarUrl: user.avatarFileId ? `/api/avatars/${user.avatarFileId}` : null,
    avatarFrame: user.avatarFrame ?? "none",
    profileColor: user.profileColor ?? "violet",
    plusBadgeVisible: user.plusBadgeVisible !== false,
    role: user.role,
    isBot: Boolean(user.isBot),
    totpEnabled: Boolean(user.totpEnabled),
    mustChangePassword: Boolean(user.mustChangePassword),
    createdAt: user.createdAt,
  };
}

function setSessionCookie(response, token, secure) {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_DURATION_MS,
  });
}

function clearSessionCookie(response, secure) {
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/",
  });
}

function sessionUser(store, token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const now = Date.now();
  const session = store.read((state) =>
    state.sessions.find((item) => item.tokenHash === tokenHash && Date.parse(item.expiresAt) > now),
  );
  if (!session) return null;
  const user = store.read((state) => state.users.find((item) => item.id === session.userId));
  return user && !user.disabledAt ? user : null;
}

module.exports = {
  SESSION_COOKIE,
  SESSION_DURATION_MS,
  clearSessionCookie,
  createCsrfToken,
  createSessionToken,
  hashPassword,
  hashToken,
  parseSessionToken,
  publicUser,
  passwordPolicy,
  sessionUser,
  setSessionCookie,
  verifyPassword,
  validatePassword,
};
