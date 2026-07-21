"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const request = require("supertest");
const { createOperationalRuntime, redact } = require("../server/operational-runtime.cjs");

test("operational runtime exposes liveness, readiness and protected metrics", async () => {
  const app = express();
  const runtime = createOperationalRuntime({
    service: "test",
    version: "3.1.1",
    metricsToken: "a".repeat(32),
    healthProvider: async () => ({ ready: true, checks: { sqlite: "ok" } }),
  });
  runtime.mount(app);

  await request(app).get("/healthz/live").expect(200).expect("X-Content-Type-Options", "nosniff");
  await request(app).get("/healthz/ready").expect(503);
  runtime.markReady();
  const ready = await request(app).get("/healthz/ready").expect(200);
  assert.equal(ready.body.checks.sqlite, "ok");
  await request(app).get("/metrics").expect(403);
  const metrics = await request(app)
    .get("/metrics")
    .set("Authorization", `Bearer ${"a".repeat(32)}`)
    .expect(200);
  assert.match(metrics.text, /nexora_runtime_ready/);
  runtime.beginDrain();
  await request(app).get("/healthz/ready").expect(503);
  runtime.close();
});

test("operational logger redacts credentials recursively", () => {
  assert.deepEqual(
    redact({ authorization: "Bearer secret", nested: { password: "secret", safe: "ok" } }),
    { authorization: "[REDACTED]", nested: { password: "[REDACTED]", safe: "ok" } },
  );
});
