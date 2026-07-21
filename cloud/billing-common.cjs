"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const IMPULSE_CURRENCY = "IMPULSE";
const PLUS_PRODUCT = "nexora_plus";
const MONTHLY_PLUS_IMPULSES = 400;
const DEFAULT_ENTITLEMENT_DAYS = 30;

class BillingError extends Error {
  constructor(message, code = "BILLING_ERROR", status = 400, details = {}) {
    super(message);
    this.name = "BillingError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function requireId(value, field) {
  const normalized = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{1,127}$/.test(normalized)) {
    throw new BillingError(`Поле ${field} имеет неверный формат.`, "VALIDATION_FAILED", 400, { field });
  }
  return normalized;
}

function requirePositiveInt(value, field, max = 1_000_000_000) {
  const normalized = Math.trunc(Number(value));
  if (!Number.isSafeInteger(normalized) || normalized <= 0 || normalized > max) {
    throw new BillingError(`Поле ${field} должно быть положительным целым числом.`, "VALIDATION_FAILED", 400, { field });
  }
  return normalized;
}

function parseJson(value, fallback = {}) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function serializeRow(row) {
  if (!row) return null;
  const result = { ...row };
  for (const key of Object.keys(result)) {
    if (key.endsWith("_json")) {
      const target = key.slice(0, -5);
      result[target] = parseJson(result[key], target === "metadata" ? {} : null);
      delete result[key];
    }
  }
  return result;
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

class BillingBase {
  constructor(filePath, options = {}) {
    this.filePath = path.resolve(filePath);
    this.entitlementSigner = options.entitlementSigner || null;
    this.clock = options.clock || (() => new Date());
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    this.db = new DatabaseSync(this.filePath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.createSchema();
    this.seedCatalog();
  }

  close() {
    this.db?.close();
    this.db = null;
  }

  createSchema() {
    const schemaFile = path.join(__dirname, "schema.sql");
    this.db.exec(fs.readFileSync(schemaFile, "utf8"));
  }

  seedCatalog() {
    const insert = this.db.prepare(`
      INSERT INTO products(code, display_name, product_type, impulse_amount, entitlement_duration_days, active, metadata_json)
      VALUES (?, ?, ?, ?, ?, 1, ?)
      ON CONFLICT(code) DO UPDATE SET
        display_name=excluded.display_name,
        product_type=excluded.product_type,
        impulse_amount=excluded.impulse_amount,
        entitlement_duration_days=excluded.entitlement_duration_days,
        metadata_json=excluded.metadata_json
    `);
    insert.run(PLUS_PRODUCT, "Nexora Plus", "subscription", 0, 30, JSON.stringify({ monthlyGrant: MONTHLY_PLUS_IMPULSES }));
    insert.run("impulse_pack_500", "500 Импульсов", "impulse_pack", 500, 0, "{}");
    insert.run("room_reaction_pack", "Пакет реакций комнаты", "room_entitlement", 0, 30, "{}");
  }

  transaction(callback) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = callback();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }
}

module.exports = {
  BillingBase,
  BillingError,
  DEFAULT_ENTITLEMENT_DAYS,
  IMPULSE_CURRENCY,
  MONTHLY_PLUS_IMPULSES,
  PLUS_PRODUCT,
  parseJson,
  requireId,
  requirePositiveInt,
  serializeRow,
  timingSafeEqualText,
};
