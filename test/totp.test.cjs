"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { base32Decode, base32Encode, createTotpService, hotp, recoveryCodeHash, verifyTotp } = require("../server/totp.cjs");

test("TOTP соответствует RFC 4226 и принимает только соседнее временное окно", async (context) => {
  assert.equal(base32Encode(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ")), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.equal(hotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 0), "755224");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-totp-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const service = await createTotpService({ keyFile: path.join(directory, "totp.key") });
  const setup = service.generate("alex");
  const timestamp = 1_721_520_000_000;
  const code = require("../server/totp.cjs").totp(setup.secret, timestamp);
  assert.equal(verifyTotp(setup.secret, code, { timestamp }), true);
  assert.equal(verifyTotp(setup.secret, code, { timestamp: timestamp + 90_000 }), false);
  assert.equal(service.decrypt(service.encrypt(setup.secret)), setup.secret);
  const recovery = service.createRecoveryCodes();
  assert.equal(new Set(recovery.map(recoveryCodeHash)).size, 10);
});
