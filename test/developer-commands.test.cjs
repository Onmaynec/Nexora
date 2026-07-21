"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DeveloperCommandService, splitCommandLine } = require("../server/developer-commands.cjs");

function fixture() {
  const state = { settings: { emergencyReadOnly: false }, integrationAudit: [], users: [], rooms: [] };
  const store = {
    read: (callback) => callback ? callback(state) : structuredClone(state),
    mutate: async (callback) => callback(state),
  };
  const instance = {
    status: () => ({ running: true, stats: { integrity: "ok", schemaVersion: 7, users: 1, rooms: 1, messages: 2 }, pulseV3: { mode: "sandbox" }, operations: { ready: true } }),
    listAdminData: async () => ({
      users: [{ id: "u1", username: "admin", displayName: "Admin", role: "server_admin", disabledAt: null, sessions: 1 }],
      rooms: [{ id: "r1", slug: "general", name: "General", privacy: "public", memberCount: 1, messageCount: 2 }],
    }),
    createBackup: async () => ({ directory: "/backup", createdAt: new Date().toISOString() }),
    cleanupStorage: async () => ({ removed: 0 }),
  };
  return { state, service: new DeveloperCommandService({ instance, store }) };
}

test("command parser supports quoted values and rejects incomplete input", () => {
  assert.deepEqual(splitCommandLine('backup create "long secure passphrase"'), ["backup", "create", "long secure passphrase"]);
  assert.throws(() => splitCommandLine('backup create "broken'), /незавершённую/);
});

test("mutating command is audited without secret values", async () => {
  const { state, service } = fixture();
  const result = await service.execute("read-only on", { actor: "test" });
  assert.equal(result.data.enabled, true);
  assert.equal(state.settings.emergencyReadOnly, true);
  assert.equal(state.integrationAudit.length, 1);
  assert.equal(state.integrationAudit[0].command, "read-only on");
  assert.deepEqual(state.integrationAudit[0].details, { argumentCount: 0 });
});

test("unknown commands cannot execute arbitrary shell", async () => {
  const { service } = fixture();
  await assert.rejects(service.execute("rm -rf /"), (error) => error.code === "COMMAND_NOT_FOUND");
});
