"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const forge = require("node-forge");

function ipv4Addresses() {
  let interfaces = {};
  try {
    interfaces = os.networkInterfaces();
  } catch {
    return ["127.0.0.1"];
  }
  const addresses = Object.values(interfaces)
    .flatMap((items) => items ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal)
    .map((item) => item.address);
  return [...new Set(["127.0.0.1", ...addresses])];
}

function networkAddresses(port) {
  return ipv4Addresses()
    .filter((address) => address !== "127.0.0.1")
    .sort((a, b) => Number(b.startsWith("26.")) - Number(a.startsWith("26.")))
    .map((address) => ({
      address,
      isRadmin: address.startsWith("26."),
      url: `https://${address}:${port}`,
    }));
}

function randomSerial() {
  return forge.util.bytesToHex(forge.random.getBytesSync(16)).replace(/^0+/, "1");
}

function createCertificateAuthority() {
  const pki = forge.pki;
  const keys = pki.rsa.generateKeyPair(2048);
  const certificate = pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = randomSerial();
  certificate.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  certificate.validity.notAfter = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);
  const attrs = [{ name: "commonName", value: "Nexora Local CA" }, { name: "organizationName", value: "Nexora" }];
  certificate.setSubject(attrs);
  certificate.setIssuer(attrs);
  certificate.setExtensions([
    { name: "basicConstraints", cA: true },
    { name: "keyUsage", keyCertSign: true, cRLSign: true, digitalSignature: true },
    { name: "subjectKeyIdentifier" },
  ]);
  certificate.sign(keys.privateKey, forge.md.sha256.create());
  return {
    certificatePem: pki.certificateToPem(certificate),
    privateKeyPem: pki.privateKeyToPem(keys.privateKey),
  };
}

function createServerCertificate(caCertificatePem, caPrivateKeyPem, addresses) {
  const pki = forge.pki;
  const caCertificate = pki.certificateFromPem(caCertificatePem);
  const caPrivateKey = pki.privateKeyFromPem(caPrivateKeyPem);
  const keys = pki.rsa.generateKeyPair(2048);
  const certificate = pki.createCertificate();
  certificate.publicKey = keys.publicKey;
  certificate.serialNumber = randomSerial();
  certificate.validity.notBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  certificate.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  certificate.setSubject([{ name: "commonName", value: "Nexora Local Server" }, { name: "organizationName", value: "Nexora" }]);
  certificate.setIssuer(caCertificate.subject.attributes);
  certificate.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, keyEncipherment: true },
    { name: "extKeyUsage", serverAuth: true },
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" },
        ...addresses.map((address) => ({ type: 7, ip: address })),
      ],
    },
  ]);
  certificate.sign(caPrivateKey, forge.md.sha256.create());
  return {
    certificatePem: pki.certificateToPem(certificate),
    privateKeyPem: pki.privateKeyToPem(keys.privateKey),
  };
}

async function ensureCertificates(directory) {
  await fs.mkdir(directory, { recursive: true });
  const paths = {
    caCertificate: path.join(directory, "nexora-local-ca.crt"),
    caPrivateKey: path.join(directory, "nexora-local-ca.key"),
    serverCertificate: path.join(directory, "nexora-server.crt"),
    serverPrivateKey: path.join(directory, "nexora-server.key"),
    metadata: path.join(directory, "certificate-meta.json"),
  };

  let caCertificatePem;
  let caPrivateKeyPem;
  try {
    [caCertificatePem, caPrivateKeyPem] = await Promise.all([
      fs.readFile(paths.caCertificate, "utf8"),
      fs.readFile(paths.caPrivateKey, "utf8"),
    ]);
  } catch {
    const created = createCertificateAuthority();
    caCertificatePem = created.certificatePem;
    caPrivateKeyPem = created.privateKeyPem;
    await Promise.all([
      fs.writeFile(paths.caCertificate, caCertificatePem, "utf8"),
      fs.writeFile(paths.caPrivateKey, caPrivateKeyPem, { encoding: "utf8", mode: 0o600 }),
    ]);
  }

  const addresses = ipv4Addresses();
  let metadata = {};
  try {
    metadata = JSON.parse(await fs.readFile(paths.metadata, "utf8"));
  } catch {}

  const mustRegenerate =
    !(await fs.access(paths.serverCertificate).then(() => true).catch(() => false)) ||
    !(await fs.access(paths.serverPrivateKey).then(() => true).catch(() => false)) ||
    addresses.some((address) => !metadata.addresses?.includes(address));

  if (mustRegenerate) {
    const created = createServerCertificate(caCertificatePem, caPrivateKeyPem, addresses);
    await Promise.all([
      fs.writeFile(paths.serverCertificate, created.certificatePem, "utf8"),
      fs.writeFile(paths.serverPrivateKey, created.privateKeyPem, { encoding: "utf8", mode: 0o600 }),
      fs.writeFile(paths.metadata, JSON.stringify({ addresses, generatedAt: new Date().toISOString() }, null, 2), "utf8"),
    ]);
  }

  return {
    ...paths,
    key: await fs.readFile(paths.serverPrivateKey),
    cert: await fs.readFile(paths.serverCertificate),
    addresses,
  };
}

module.exports = { ensureCertificates, ipv4Addresses, networkAddresses };
