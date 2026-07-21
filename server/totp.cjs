"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;

function base32Encode(buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let result = "";
  for (let index = 0; index < bits.length; index += 5) {
    result += ALPHABET[Number.parseInt(bits.slice(index, index + 5).padEnd(5, "0"), 2)];
  }
  return result;
}

function base32Decode(value) {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const character of normalized) {
    const index = ALPHABET.indexOf(character);
    if (index < 0) throw new Error("Некорректный TOTP secret.");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret, counter, digits = 6) {
  const value = Buffer.alloc(8);
  value.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", base32Decode(secret)).update(value).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const number = (digest.readUInt32BE(offset) & 0x7fffffff) % (10 ** digits);
  return String(number).padStart(digits, "0");
}

function totp(secret, timestamp = Date.now()) {
  return hotp(secret, Math.floor(timestamp / 1000 / STEP_SECONDS));
}

function safeEqualText(first, second) {
  const a = Buffer.from(String(first || ""));
  const b = Buffer.from(String(second || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyTotp(secret, code, { timestamp = Date.now(), window = 1 } = {}) {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  for (let offset = -window; offset <= window; offset += 1) {
    if (safeEqualText(totp(secret, timestamp + offset * STEP_SECONDS * 1000), normalized)) return true;
  }
  return false;
}

function recoveryCodeHash(code) {
  return crypto.createHash("sha256").update(`nexora-recovery:${String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}`).digest("hex");
}

function createRecoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    const value = crypto.randomBytes(8).toString("base64url").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
    return `${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8, 12)}`;
  });
}

async function readOrCreateKey(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    const key = await fs.readFile(filePath);
    if (key.length !== 32) throw new Error("Ключ TOTP имеет неверную длину.");
    return key;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const key = crypto.randomBytes(32);
  try {
    const handle = await fs.open(filePath, "wx", 0o600);
    await handle.writeFile(key);
    await handle.close();
    return key;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return fs.readFile(filePath);
  }
}

async function createTotpService({ keyFile, issuer = "Nexora" }) {
  const encryptionKey = await readOrCreateKey(keyFile);
  return {
    generate(username) {
      const secret = base32Encode(crypto.randomBytes(20));
      const label = `${issuer}:${username}`;
      const uri = `otpauth://totp/${encodeURIComponent(label)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
      return { secret, uri };
    },
    verify: verifyTotp,
    encrypt(secret) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
      const ciphertext = Buffer.concat([cipher.update(String(secret), "utf8"), cipher.final()]);
      return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
    },
    decrypt(value) {
      const [ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
      if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Зашифрованный TOTP secret повреждён.");
      const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivValue, "base64url"));
      decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
    },
    createRecoveryCodes,
    recoveryCodeHash,
  };
}

module.exports = {
  STEP_SECONDS,
  base32Decode,
  base32Encode,
  createRecoveryCodes,
  createTotpService,
  hotp,
  recoveryCodeHash,
  totp,
  verifyTotp,
};
