"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const createServer = fs.readFileSync(path.join(root, "server/create-server.cjs"), "utf8");
const v3 = fs.readFileSync(path.join(root, "server/v3-features.cjs"), "utf8");

function requireCode(source, code, context) {
  assert.match(source, new RegExp(`conversationUsesMls[\\s\\S]{0,900}${code}|${code}[\\s\\S]{0,900}conversationUsesMls`), `${context} must reject plaintext after MLS activation`);
}

test("legacy Socket.IO plaintext and forwards cannot bypass an active MLS group", () => {
  requireCode(createServer, "E2EE_REQUIRED", "message:send");
  requireCode(createServer, "E2EE_FORWARD_REQUIRED", "message:forward");
  requireCode(createServer, "E2EE_ATTACHMENT_REQUIRED", "legacy uploads");
});

test("v3 drafts, schedules, polls, bots and resumable uploads are guarded", () => {
  requireCode(v3, "E2EE_DRAFT_LOCAL_ONLY", "server drafts");
  requireCode(v3, "E2EE_SCHEDULE_UNSUPPORTED", "scheduled messages");
  requireCode(v3, "E2EE_POLL_UNSUPPORTED", "poll creation");
  requireCode(v3, "E2EE_BOT_UNSUPPORTED", "bot messages");
  const attachmentGuards = v3.match(/E2EE_ATTACHMENT_REQUIRED/g) || [];
  assert.ok(attachmentGuards.length >= 3, "resumable upload create/chunk/complete must all reject MLS plaintext");
});

test("encrypted message serialization exposes ciphertext but never stored plaintext", () => {
  const model = fs.readFileSync(path.join(root, "server/model.cjs"), "utf8");
  assert.match(model, /message\.type === "encrypted" \? "" : message\.text/);
  assert.match(model, /ciphertext: message\.mlsEnvelope\.ciphertext/);
  assert.match(model, /messageHash: message\.mlsEnvelope\.messageHash/);
});
