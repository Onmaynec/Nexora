"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { SqliteStore } = require("../server/store.cjs");

test("a rejected mutation reaches its caller without poisoning flush or later mutations", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-store-queue-"));
  const store = new SqliteStore(path.join(directory, "nexora.sqlite"), { legacyJsonPath: path.join(directory, "nexora.json") });
  await store.init();
  context.after(async () => {
    await store.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const before = store.read((state) => state.settings.serverName);
  await assert.rejects(
    store.mutate((state) => {
      state.settings.serverName = "must not persist";
      throw Object.assign(new Error("EXPECTED_MUTATION_REJECTION"), { code: "EXPECTED_MUTATION_REJECTION" });
    }),
    (error) => error.code === "EXPECTED_MUTATION_REJECTION",
  );

  assert.equal(store.read((state) => state.settings.serverName), before);
  await assert.doesNotReject(store.flush());

  const result = await store.mutate((state) => {
    state.settings.serverName = "queue recovered";
    return { saved: true };
  });
  assert.deepEqual(result, { saved: true });
  await assert.doesNotReject(store.flush());
  assert.equal(store.read((state) => state.settings.serverName), "queue recovered");
});
