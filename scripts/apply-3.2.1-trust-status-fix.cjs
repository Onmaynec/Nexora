"use strict";

const fs = require("node:fs");
const path = require("node:path");

const file = path.resolve(__dirname, "..", "server", "trust-core.cjs");
const source = fs.readFileSync(file, "utf8");
const before = `  status(userId = null) {
    const result = {
      schemaVersion: 8,
      protocol: "MLS 1.0 / RFC 9420",
      ciphersuite: MLS_CIPHERSUITE,
      privateKeysOnServer: false,
      devices: null,
      activeGroups: Number(this.db.prepare("SELECT COUNT(*) AS count FROM mls_groups WHERE status='active'").get().count || 0),
    };
    if (userId) {
      result.devices = {
        active: Number(this.db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active'").get(String(userId)).count || 0),
        verified: Number(this.db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active' AND trust_state='verified'").get(String(userId)).count || 0),
      };
    }
    return result;
  }`;
const after = `  status(userId = null) {
    const result = {
      schemaVersion: 8,
      protocol: "MLS 1.0 / RFC 9420",
      ciphersuite: MLS_CIPHERSUITE,
      privateKeysOnServer: false,
      devices: null,
      activeGroups: 0,
    };
    const db = this.store?.db;
    if (!db) return result;
    result.activeGroups = Number(db.prepare("SELECT COUNT(*) AS count FROM mls_groups WHERE status='active'").get().count || 0);
    if (userId) {
      result.devices = {
        active: Number(db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active'").get(String(userId)).count || 0),
        verified: Number(db.prepare("SELECT COUNT(*) AS count FROM trust_devices WHERE user_id=? AND status='active' AND trust_state='verified'").get(String(userId)).count || 0),
      };
    }
    return result;
  }`;

const first = source.indexOf(before);
if (first < 0) throw new Error("TrustCore status patch target not found");
if (source.indexOf(before, first + before.length) >= 0) throw new Error("TrustCore status patch target is ambiguous");
fs.writeFileSync(file, source.slice(0, first) + after + source.slice(first + before.length), "utf8");
console.log("Patched TrustCore status for a closed SQLite lifecycle.");
