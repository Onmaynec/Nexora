"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, source) {
  fs.writeFileSync(path.join(root, file), source);
}

function replaceExact(file, before, after) {
  let source = read(file);
  if (source.includes(after)) return;
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${file}: expected exactly one match, found ${count}`);
  write(file, source.replace(before, after));
}

replaceExact(
  "server/v3-features.cjs",
  `function fail(response, status, error, code = "REQUEST_FAILED") {\n  return response.status(status).json({ ok: false, error, code });\n}`,
  `function fail(response, status, error, code = "REQUEST_FAILED", details = {}) {\n  const requestId = response.locals?.requestId || crypto.randomUUID();\n  return response.status(status).json({ ok: false, error, message: error, code, requestId, details });\n}`,
);

for (const file of ["server/v3-features.cjs", "server/create-server.cjs"]) {
  let source = read(file);
  const before = source;
  source = source.replace(/(fail|apiError)\(response,\s*409,([\s\S]{0,260}?),\s*"LEGACY_READ_ONLY"\)/g, '$1(response, 410,$2, "LEGACY_READ_ONLY")');
  source = source.replace(/(fail|apiError)\(response,\s*409,([\s\S]{0,260}?),\s*error\.code\s*\|\|\s*"LEGACY_READ_ONLY"\)/g, '$1(response, 410,$2, error.code || "LEGACY_READ_ONLY")');
  if (before === source && !source.includes('response, 410')) {
    throw new Error(`${file}: no legacy HTTP status was migrated`);
  }
  write(file, source);
}

let security = read("test/security-hardening-3.2.3.test.cjs");
const retirementPattern = /test\("Trust device enrollment API returns stable RATE_LIMITED with Retry-After",[\s\S]*?\n\}\);\n\ntest\("maintenance removes expired sessions/;
if (retirementPattern.test(security)) {
  security = security.replace(retirementPattern, `test("retired Trust API is terminal LEGACY_READ_ONLY and never consumes enrollment rate limits", async (t) => {\n  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-security-api-"));\n  const instance = await createNexoraServer({\n    dataDir: directory,\n    clientDir: path.join(__dirname, "..", "client", "dist"),\n    tls: false,\n    redirect: false,\n    port: 0,\n    host: "127.0.0.1",\n    quiet: true,\n  });\n  await instance.listen();\n  const agent = request.agent(instance.app);\n  t.after(async () => {\n    await instance.close();\n    await fs.rm(directory, { recursive: true, force: true });\n  });\n\n  const registered = await agent.post("/api/auth/register")\n    .set("X-Nexora-Client-Version", "3.4.0")\n    .set("X-Nexora-Device-ID", "retired-trust-api-device")\n    .send({\n      displayName: "Security API",\n      username: \`security_api_\${crypto.randomBytes(4).toString("hex")}\`,\n      password: "SecurityApiPass123!",\n    })\n    .expect(201);\n  const csrf = registered.body.csrfToken;\n\n  for (let index = 0; index < 12; index += 1) {\n    const response = await agent.post("/api/v4/trust/devices")\n      .set("X-Nexora-Client-Version", "3.4.0")\n      .set("X-Nexora-CSRF", csrf)\n      .send({})\n      .expect(410);\n    assert.equal(response.body.code, "LEGACY_READ_ONLY");\n    assert.match(response.body.requestId, /^[A-Za-z0-9_.:-]{8,128}$/);\n    assert.equal(response.headers["retry-after"], undefined);\n  }\n  assert.equal(instance.status().stableCore.trustRuntime, "retired");\n});\n\ntest("maintenance removes expired sessions`);
} else if (!security.includes("retired Trust API is terminal LEGACY_READ_ONLY")) {
  throw new Error("security-hardening test: retirement block not found");
}
write("test/security-hardening-3.2.3.test.cjs", security);

console.log("Stable Core error contracts applied");
