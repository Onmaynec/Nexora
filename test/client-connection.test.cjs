"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { test } = require("node:test");

const {
  certificateFingerprint,
  inspectNexoraServer,
  loadErrorMessage,
  matchesPinnedCertificate,
  normalizeServerUrl,
} = require("../electron/client-connection.cjs");
const { ensureCertificates } = require("../server/certificates.cjs");

test("нормализует полный Radmin/LAN-адрес и не превращает 26. в 0.0.0.26", () => {
  assert.equal(normalizeServerUrl("26.4.1.76"), "https://26.4.1.76:3443");
  assert.equal(normalizeServerUrl("https://192.168.0.200:3443/"), "https://192.168.0.200:3443");
  assert.equal(normalizeServerUrl("172.16.5.4:4567"), "https://172.16.5.4:4567");
  assert.equal(normalizeServerUrl("chat.example.com"), "https://chat.example.com:443");
  assert.throws(() => normalizeServerUrl("https://26."), (error) => error.code === "IPV4_INCOMPLETE");
  assert.throws(() => normalizeServerUrl("https://8.8.8.8:3443"), (error) => error.code === "ADDRESS_NOT_ALLOWED");
  assert.throws(() => normalizeServerUrl("https://172.32.0.1:3443"), (error) => error.code === "ADDRESS_NOT_ALLOWED");
  assert.throws(() => normalizeServerUrl("https://single-label"), (error) => error.code === "ADDRESS_NOT_ALLOWED");
  assert.throws(() => normalizeServerUrl("http://26.4.1.76:3443"), (error) => error.code === "HTTPS_REQUIRED");
});

test("использует SHA-256 из PEM при проверке закреплённого сертификата Electron", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-client-cert-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const certificates = await ensureCertificates(directory);
  const pem = await fs.readFile(certificates.serverCertificate, "utf8");
  const expected = new crypto.X509Certificate(pem).fingerprint256;
  const electronCertificate = { data: pem, fingerprint: "AA:BB:CC:DD" };
  assert.equal(certificateFingerprint(electronCertificate), expected);
  assert.equal(matchesPinnedCertificate([
    { id: "server-1", url: "https://127.0.0.1:3443", fingerprint: expected },
  ], { hostname: "127.0.0.1", certificate: electronCertificate }), true);
  assert.equal(matchesPinnedCertificate([
    { id: "server-1", url: "https://127.0.0.1:3443", fingerprint: expected },
  ], { url: "https://127.0.0.1:3444", certificate: electronCertificate }), false);
});

test("проверяет Nexora health по самоподписанному HTTPS и сверяет SAN/отпечаток", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "nexora-client-probe-"));
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const certificates = await ensureCertificates(directory);
  const fingerprint = new crypto.X509Certificate(certificates.cert).fingerprint256;
  const server = https.createServer({ key: certificates.key, cert: certificates.cert }, (request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ service: "nexora", serverId: "server-test", version: "3.0.0", fingerprint, compatibility: { apiVersion: 3 } }));
  });
  context.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  const result = await inspectNexoraServer(`https://127.0.0.1:${port}`, { clientVersion: "3.0.0" });
  assert.equal(result.id, "server-test");
  assert.equal(result.fingerprint, fingerprint);
  assert.equal(result.url, `https://127.0.0.1:${port}`);
});

test("объясняет ошибку локального CA вместо показа Chromium-кода -202", () => {
  const message = loadErrorMessage(-202, "ERR_CERT_AUTHORITY_INVALID", "https://192.168.0.200:3443/");
  assert.match(message, /сертификат/i);
  assert.match(message, /SHA-256/);
  assert.doesNotMatch(message, /\(-202\)$/);
});
