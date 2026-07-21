"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { applySchema8Migration } = require("../server/trust-schema8.cjs");
const { TrustCore } = require("../server/trust-core.cjs");
const { claimWelcomeForConversation, listCommits } = require("../server/trust-recovery.cjs");

function createStore(filePath) {
  const db = new DatabaseSync(filePath);
  db.exec(`
    CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO meta(key,value) VALUES('schema_version','7');
    INSERT INTO meta(key,value) VALUES('state_meta','{"schemaVersion":7,"serverId":"server-1"}');
  `);
  return {
    db,
    filePath,
    state: { meta: { schemaVersion: 7, serverId: "server-1" } },
    queue: Promise.resolve(),
    async flush() {},
    persistState(next = this.state) { this.state = next; },
    stats() { return { schemaVersion: 7 }; },
  };
}

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-trust-recovery-"));
  const filePath = path.join(directory, "nexora.sqlite");
  const store = createStore(filePath);
  await applySchema8Migration({ store, databaseFile: filePath });
  const core = new TrustCore({ store });
  const now = new Date().toISOString();
  const deviceId = crypto.randomUUID();
  core.db.prepare(`INSERT INTO trust_devices(
    id,user_id,display_name,identity_key,signature_key,credential,fingerprint,status,trust_state,
    created_at,updated_at,last_seen_at,verified_at,revoked_at,data
  ) VALUES(?,?,?,?,?,?,?,'active','verified',?,?,?,?,NULL,'{}')`).run(
    deviceId,
    "user-1",
    "Primary",
    crypto.randomBytes(32).toString("base64"),
    crypto.randomBytes(32).toString("base64"),
    Buffer.from("credential").toString("base64"),
    crypto.randomBytes(32).toString("hex"),
    now,
    now,
    now,
    now,
  );
  t.after(async () => {
    store.db.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
  return { core, deviceId, now };
}

function insertGroup(core, { conversationId, creatorDeviceId, epoch = 1 }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  core.db.prepare(`INSERT INTO mls_groups(
    id,conversation_id,group_id,ciphersuite,epoch,status,creator_device_id,public_state_hash,created_at,updated_at
  ) VALUES(?,?,?,?,?,'active',?,?,?,?)`).run(
    id,
    conversationId,
    crypto.randomBytes(32).toString("base64"),
    1,
    epoch,
    creatorDeviceId,
    crypto.randomBytes(32).toString("hex"),
    now,
    now,
  );
  return id;
}

test("Welcome claim is scoped to the requested conversation", async (t) => {
  const { core, deviceId, now } = await fixture(t);
  const groupA = insertGroup(core, { conversationId: "conversation-a", creatorDeviceId: deviceId });
  const groupB = insertGroup(core, { conversationId: "conversation-b", creatorDeviceId: deviceId });
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  for (const [groupId, conversation] of [[groupA, "conversation-a"], [groupB, "conversation-b"]]) {
    core.db.prepare(`INSERT INTO mls_welcome_queue(
      id,group_id,target_user_id,target_device_id,epoch,welcome_hash,welcome_data,ratchet_tree_data,created_at,expires_at,claimed_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?,NULL)`).run(
      crypto.randomUUID(),
      groupId,
      "user-1",
      deviceId,
      1,
      crypto.randomBytes(32).toString("hex"),
      Buffer.from(`welcome:${conversation}`).toString("base64"),
      null,
      now,
      expiresAt,
    );
  }

  const claimedB = claimWelcomeForConversation(core, {
    conversationId: "conversation-b",
    requesterUserId: "user-1",
    requesterDeviceId: deviceId,
  });
  assert.equal(claimedB.conversationId, "conversation-b");
  assert.equal(Buffer.from(claimedB.welcome, "base64").toString("utf8"), "welcome:conversation-b");

  const claimedA = claimWelcomeForConversation(core, {
    conversationId: "conversation-a",
    requesterUserId: "user-1",
    requesterDeviceId: deviceId,
  });
  assert.equal(claimedA.conversationId, "conversation-a");
  assert.equal(claimWelcomeForConversation(core, {
    conversationId: "conversation-a",
    requesterUserId: "user-1",
    requesterDeviceId: deviceId,
  }), null);
});

test("commit recovery accepts an initial epoch-1 commit and enforces continuity", async (t) => {
  const { core, deviceId, now } = await fixture(t);
  const groupId = insertGroup(core, { conversationId: "conversation-a", creatorDeviceId: deviceId, epoch: 2 });
  core.db.prepare(`INSERT INTO mls_group_members(
    group_id,user_id,device_id,leaf_index,status,joined_epoch,removed_epoch,created_at,updated_at
  ) VALUES(?,?,?,0,'active',0,NULL,?,?)`).run(groupId, "user-1", deviceId, now, now);
  for (const epoch of [1, 2]) {
    core.db.prepare(`INSERT INTO mls_commit_log(
      id,group_id,previous_epoch,epoch,actor_user_id,actor_device_id,commit_hash,commit_data,public_state_hash,created_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`).run(
      crypto.randomUUID(),
      groupId,
      epoch - 1,
      epoch,
      "user-1",
      deviceId,
      crypto.randomBytes(32).toString("hex"),
      crypto.randomBytes(64).toString("base64"),
      crypto.randomBytes(32).toString("hex"),
      now,
    );
  }
  const result = listCommits(core, {
    groupRecordId: groupId,
    requesterUserId: "user-1",
    requesterDeviceId: deviceId,
    afterEpoch: -1,
  });
  assert.deepEqual(result.commits.map((item) => item.epoch), [1, 2]);
});
