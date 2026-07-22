"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function write(relativePath, content) {
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function replaceOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`Patch target not found: ${label}`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`Patch target is ambiguous: ${label}`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

let app = read("client/src/App.jsx");
app = replaceOnce(
  app,
  `  }, []);\n\n  useEffect(() => {\n    const serverId = bootstrap?.server?.id;`,
  `  }, []);\n\n  useEffect(() => {\n    if (authState !== "authenticated" || !me?.id || me.mustChangePassword || bootstrap) return undefined;\n    refresh();\n    return undefined;\n  }, [authState, bootstrap, me?.id, me?.mustChangePassword, refresh]);\n\n  useEffect(() => {\n    const serverId = bootstrap?.server?.id;`,
  "authenticated bootstrap effect",
);
write("client/src/App.jsx", app);

let pulseClient = read("server/pulse-cloud-client.cjs");
pulseClient = replaceOnce(
  pulseClient,
  `  status() {\n    return {\n      mode: this.mode,\n      enabled: this.mode === "production" || this.mode === "sandbox",\n      productionReady: this.mode === "production",\n      cloudOrigin: this.cloudUrl ? new URL(this.cloudUrl).origin : null,\n      keyCount: this.repository?.keyRegistry?.().size || 0,\n      errorCode: this.configurationError?.code || null,\n    };\n  }`,
  `  status() {\n    let keyCount = 0;\n    try {\n      keyCount = this.repository?.keyRegistry?.().size || 0;\n    } catch (error) {\n      if (error?.code !== "PULSE_LOCAL_STORE_UNAVAILABLE") throw error;\n    }\n    return {\n      mode: this.mode,\n      enabled: this.mode === "production" || this.mode === "sandbox",\n      productionReady: this.mode === "production",\n      cloudOrigin: this.cloudUrl ? new URL(this.cloudUrl).origin : null,\n      keyCount,\n      errorCode: this.configurationError?.code || null,\n    };\n  }`,
  "Pulse status closed-store guard",
);
write("server/pulse-cloud-client.cjs", pulseClient);

let serverMain = read("electron/server-main.cjs");
serverMain = replaceOnce(
  serverMain,
  `let starting = null;\nlet logFile;`,
  `let starting = null;\nlet stopping = null;\nlet logFile;`,
  "Electron stopping state",
);
serverMain = replaceOnce(
  serverMain,
  `async function startServer() {\n  if (instance?.status().running) return decoratedStatus();`,
  `async function startServer() {\n  if (stopping) await stopping;\n  if (instance?.status().running) return decoratedStatus();`,
  "start waits for stop",
);
serverMain = replaceOnce(
  serverMain,
  `async function stopServer() {\n  if (instance) await instance.close();\n  const status = await decoratedStatus();\n  send("server:status-changed", status);\n  return status;\n}`,
  `async function stopServer() {\n  if (stopping) return stopping;\n  const current = instance;\n  if (!current) return decoratedStatus();\n  instance = null;\n  stopping = (async () => {\n    await current.close();\n    const status = await decoratedStatus();\n    send("server:status-changed", status);\n    return status;\n  })();\n  try {\n    return await stopping;\n  } finally {\n    stopping = null;\n  }\n}`,
  "serialized server stop",
);
serverMain = replaceOnce(
  serverMain,
  `app.on("before-quit", (event) => {\n  if (instance?.status().running) {\n    event.preventDefault();\n    stopServer().finally(() => { instance = null; app.quit(); });\n  }\n});`,
  `app.on("before-quit", (event) => {\n  if (instance || starting || stopping) {\n    event.preventDefault();\n    stopServer()\n      .catch((error) => persistLog({ level: "error", message: \`Server shutdown failed: \${error?.stack || error}\`, createdAt: new Date().toISOString() }))\n      .finally(() => app.quit());\n  }\n});`,
  "before-quit rejection handling",
);
write("electron/server-main.cjs", serverMain);

write("test/regression-3.2.1.test.cjs", `"use strict";\n\nconst assert = require("node:assert/strict");\nconst fs = require("node:fs");\nconst fsPromises = require("node:fs/promises");\nconst os = require("node:os");\nconst path = require("node:path");\nconst { test } = require("node:test");\nconst { PulseCloudClient } = require("../server/pulse-cloud-client.cjs");\nconst { createNexoraServer } = require("../server/create-server-v31.cjs");\n\nconst root = path.resolve(__dirname, "..");\n\ntest("Pulse status remains readable after the local SQLite repository closes during shutdown", () => {\n  const closedStoreError = Object.assign(new Error("SQLite store закрыт."), {\n    code: "PULSE_LOCAL_STORE_UNAVAILABLE",\n  });\n  const client = new PulseCloudClient({\n    mode: "sandbox",\n    serverId: "server-1",\n    repository: {\n      keyRegistry() {\n        throw closedStoreError;\n      },\n    },\n  });\n\n  assert.doesNotThrow(() => client.status());\n  assert.equal(client.status().keyCount, 0);\n});\n\ntest("unexpected repository failures are not hidden by Pulse status", () => {\n  const client = new PulseCloudClient({\n    mode: "sandbox",\n    serverId: "server-1",\n    repository: {\n      keyRegistry() {\n        throw Object.assign(new Error("corrupt"), { code: "SQLITE_CORRUPT" });\n      },\n    },\n  });\n  assert.throws(() => client.status(), (error) => error.code === "SQLITE_CORRUPT");\n});\n\ntest("authenticated client requests bootstrap before a Trust device exists", () => {\n  const appSource = fs.readFileSync(path.join(root, "client", "src", "App.jsx"), "utf8");\n  assert.match(\n    appSource,\n    /useEffect\\(\\(\\) => \\{\\s*if \\(authState !== "authenticated" \\|\\| !me\\?\\.id \\|\\| me\\.mustChangePassword \\|\\| bootstrap\\) return undefined;\\s*refresh\\(\\);\\s*return undefined;\\s*\\}, \\[authState, bootstrap, me\\?\\.id, me\\?\\.mustChangePassword, refresh\\]\\);/,\n    "App must load /api/bootstrap immediately after authentication instead of waiting for Trust initialization",\n  );\n});\n\ntest("schema 8 status remains readable after server close", async () => {\n  const directory = await fsPromises.mkdtemp(path.join(os.tmpdir(), "nexora-shutdown-regression-"));\n  const instance = await createNexoraServer({\n    dataDir: directory,\n    clientDir: path.join(root, "client", "dist"),\n    tls: false,\n    redirect: false,\n    port: 0,\n    host: "127.0.0.1",\n    quiet: true,\n    pulseMode: "sandbox",\n  });\n  try {\n    await instance.listen();\n    await instance.close();\n    const status = instance.status();\n    assert.equal(status.running, false);\n    assert.equal(status.schemaVersion, 8);\n    assert.equal(status.pulseV3.keyCount, 0);\n  } finally {\n    await instance.close().catch(() => {});\n    await fsPromises.rm(directory, { recursive: true, force: true });\n  }\n});\n`);

const packageFile = path.join(root, "package.json");
const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8"));
if (packageJson.version !== "3.2.0") throw new Error(`Expected 3.2.0 before patch, got ${packageJson.version}`);
packageJson.version = "3.2.1";
fs.writeFileSync(packageFile, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");
require("./sync-release-metadata.cjs");

console.log("Applied Nexora 3.2.1 login/bootstrap and shutdown fix.");
