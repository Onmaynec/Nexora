"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { BillingDatabase } = require("../cloud/billing-core.cjs");
const { createEntitlementSigner, verifySignedEnvelope } = require("../cloud/entitlements.cjs");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-catalog-"));
  const keys = crypto.generateKeyPairSync("ed25519");
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const database = new BillingDatabase(path.join(root, "pulse.sqlite"), {
    entitlementSigner: createEntitlementSigner({ keyId: "catalog-key", privateKey }),
    clock: () => new Date("2026-07-23T00:00:00.000Z"),
  });
  const account = database.createCloudAccount({ id: "account-catalog", country: "FI" });
  database.linkLocalAccount({ accountId: account.id, serverId: "server-main", localUserId: "user-main", id: "link-catalog" });
  database.grantImpulses(account.id, 2000, { idempotencyKey: "catalog-seed-wallet" });
  t.after(() => {
    database.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { database, account, publicKey };
}

test("catalog exposes stable spendable products", (t) => {
  const { database } = fixture(t);
  const catalog = database.catalog({ serverId: "server-main", localUserId: "user-main", roomId: "room-main" });
  assert.ok(catalog.some((item) => item.code === "avatar_frame_neon" && item.priceImpulses === 120));
  assert.ok(catalog.some((item) => item.code === "room_theme_midnight" && item.scope === "room"));
  assert.equal(catalog.every((item) => typeof item.description === "string" && item.description.length > 0), true);
});

test("personal catalog purchase is atomic, signed and idempotent", (t) => {
  const { database, account, publicKey } = fixture(t);
  const input = {
    serverId: "server-main",
    localUserId: "user-main",
    productCode: "avatar_frame_neon",
    idempotencyKey: "catalog-purchase-personal-001",
  };
  const first = database.purchaseCatalogProduct(input);
  const duplicate = database.purchaseCatalogProduct(input);
  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(database.getBalance(account.id), 1880);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM impulse_purchases").get().count, 1);
  assert.equal(database.db.prepare("SELECT COUNT(*) AS count FROM ledger_transactions WHERE operation_type='impulse_product_purchase'").get().count, 1);
  const payload = verifySignedEnvelope(first.entitlement.envelope, { "catalog-key": publicKey }, {
    serverId: "server-main",
    productCode: "avatar_frame_neon",
    now: "2026-07-23T00:00:01.000Z",
  });
  assert.equal(payload.cloudAccountId, account.id);
  assert.equal(database.ledgerInvariant().ok, true);
});

test("room catalog purchase is scoped to one room", (t) => {
  const { database, account, publicKey } = fixture(t);
  const result = database.purchaseCatalogProduct({
    serverId: "server-main",
    localUserId: "user-main",
    roomId: "room-main",
    productCode: "room_theme_midnight",
    idempotencyKey: "catalog-purchase-room-0001",
  });
  assert.equal(database.getBalance(account.id), 1350);
  const payload = verifySignedEnvelope(result.entitlement.envelope, { "catalog-key": publicKey }, {
    serverId: "server-main",
    roomId: "room-main",
    productCode: "room_theme_midnight",
    now: "2026-07-23T00:00:01.000Z",
  });
  assert.equal(payload.roomId, "room-main");
  assert.throws(() => database.purchaseCatalogProduct({
    serverId: "server-main",
    localUserId: "user-main",
    roomId: "room-other",
    productCode: "room_theme_midnight",
    idempotencyKey: "catalog-purchase-room-0001",
  }), (error) => error.code === "IDEMPOTENCY_CONFLICT");
});

test("catalog purchase fails closed on insufficient wallet", (t) => {
  const { database, account } = fixture(t);
  database.purchaseCatalogProduct({ serverId: "server-main", localUserId: "user-main", roomId: "room-main", productCode: "room_theme_midnight", idempotencyKey: "catalog-spend-01" });
  database.purchaseCatalogProduct({ serverId: "server-main", localUserId: "user-main", roomId: "room-other", productCode: "room_banner_aurora", idempotencyKey: "catalog-spend-02" });
  database.purchaseCatalogProduct({ serverId: "server-main", localUserId: "user-main", productCode: "message_style_prism", idempotencyKey: "catalog-spend-03" });
  assert.equal(database.getBalance(account.id), 630);
  assert.throws(() => database.purchaseCatalogProduct({
    serverId: "server-main",
    localUserId: "user-main",
    roomId: "room-third",
    productCode: "room_theme_midnight",
    idempotencyKey: "catalog-spend-insufficient",
  }), (error) => error.code === "WALLET_INSUFFICIENT_FUNDS");
  assert.equal(database.getBalance(account.id), 630);
});
