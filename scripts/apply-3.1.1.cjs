"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function write(file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
}
function replaceOnce(file, before, after) {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Pattern not found in ${file}: ${before.slice(0, 100)}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Pattern is not unique in ${file}: ${before.slice(0, 100)}`);
  write(file, source.replace(before, after));
}

write("server/operational-runtime.cjs", `"use strict";

const crypto = require("node:crypto");
const { monitorEventLoopDelay } = require("node:perf_hooks");

const SECRET_KEY = /authorization|cookie|token|secret|password|signature|api[-_]?key/i;

function safeRequestId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(text) ? text : crypto.randomUUID();
}

function redact(value, depth = 0) {
  if (depth > 5) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (!value || typeof value !== "object") return typeof value === "string" && value.length > 2_000 ? value.slice(0, 2_000) + "…" : value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1)]));
}

function timingSafeToken(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function localAddress(request) {
  const address = String(request.socket?.remoteAddress || "");
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function createOperationalRuntime({ service, version, metricsToken = "", healthProvider = async () => ({ ready: true, checks: {} }), log = () => {}, clock = () => new Date() } = {}) {
  if (!service || !version) throw new Error("Operational runtime requires service and version.");
  const startedAt = clock();
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const counters = new Map();
  let ready = false;
  let draining = false;
  let closed = false;

  function increment(method, route, status) {
    const key = [method, route, status].join("|");
    counters.set(key, (counters.get(key) || 0) + 1);
  }

  function snapshot() {
    const memory = process.memoryUsage();
    return {
      service,
      version,
      ready,
      draining,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: { rssBytes: memory.rss, heapUsedBytes: memory.heapUsed, externalBytes: memory.external },
      eventLoopDelayMs: Number.isFinite(loop.mean) ? Number((loop.mean / 1e6).toFixed(3)) : 0,
    };
  }

  function middleware(request, response, next) {
    const requestId = safeRequestId(request.headers["x-request-id"]);
    request.nexoraRequestId = requestId;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    const started = process.hrtime.bigint();
    response.on("finish", () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      const route = String(request.route?.path || request.path || "/").slice(0, 200);
      increment(request.method, route, response.statusCode);
      if (response.statusCode >= 400 || elapsedMs >= 1_000) {
        log(JSON.stringify(redact({ type: "http", requestId, method: request.method, route, status: response.statusCode, elapsedMs: Number(elapsedMs.toFixed(2)), ip: request.ip })), response.statusCode >= 500 ? "error" : "warn");
      }
    });
    next();
  }

  async function readiness(_request, response) {
    try {
      const provided = await healthProvider();
      const available = ready && !draining && provided?.ready !== false;
      response.status(available ? 200 : 503).json({ ok: available, ...snapshot(), checks: redact(provided?.checks || {}) });
    } catch (error) {
      log(`Readiness check failed: ${error.message}`, "error");
      response.status(503).json({ ok: false, ...snapshot(), checks: { runtime: "error" } });
    }
  }

  function metrics(request, response) {
    const token = String(request.headers.authorization || "").replace(/^Bearer\\s+/i, "");
    if (metricsToken ? !timingSafeToken(token, metricsToken) : !localAddress(request)) {
      return response.status(403).type("text/plain").send("Forbidden\\n");
    }
    const state = snapshot();
    const lines = [
      "# HELP nexora_process_uptime_seconds Process uptime.",
      "# TYPE nexora_process_uptime_seconds gauge",
      `nexora_process_uptime_seconds{service="${service}"} ${state.uptimeSeconds}`,
      "# HELP nexora_process_rss_bytes Resident memory.",
      "# TYPE nexora_process_rss_bytes gauge",
      `nexora_process_rss_bytes{service="${service}"} ${state.memory.rssBytes}`,
      "# HELP nexora_event_loop_delay_ms Mean event-loop delay.",
      "# TYPE nexora_event_loop_delay_ms gauge",
      `nexora_event_loop_delay_ms{service="${service}"} ${state.eventLoopDelayMs}`,
      "# HELP nexora_runtime_ready Readiness state.",
      "# TYPE nexora_runtime_ready gauge",
      `nexora_runtime_ready{service="${service}"} ${state.ready && !state.draining ? 1 : 0}`,
      "# HELP nexora_http_requests_total Completed HTTP requests.",
      "# TYPE nexora_http_requests_total counter",
    ];
    for (const [key, count] of [...counters.entries()].sort()) {
      const [method, route, status] = key.split("|");
      const escaped = route.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\\n/g, " ");
      lines.push(`nexora_http_requests_total{service="${service}",method="${method}",route="${escaped}",status="${status}"} ${count}`);
    }
    response.type("text/plain; version=0.0.4").send(lines.join("\\n") + "\\n");
  }

  return {
    mount(app) {
      app.use(middleware);
      app.get("/healthz/live", (_request, response) => response.json({ ok: !closed, ...snapshot() }));
      app.get("/healthz/ready", readiness);
      app.get("/metrics", metrics);
    },
    markReady() { ready = true; draining = false; },
    markNotReady() { ready = false; },
    beginDrain() { draining = true; ready = false; },
    snapshot,
    redact,
    close() { closed = true; draining = true; ready = false; loop.disable(); },
  };
}

module.exports = { createOperationalRuntime, redact, safeRequestId, timingSafeToken };
`);

write("server/developer-commands.cjs", `"use strict";

const crypto = require("node:crypto");

class DeveloperCommandError extends Error {
  constructor(message, code = "COMMAND_INVALID") { super(message); this.name = "DeveloperCommandError"; this.code = code; }
}

function splitCommandLine(value) {
  const input = String(value || "").trim();
  if (!input) return [];
  const values = [];
  let current = "";
  let quote = null;
  let escaping = false;
  for (const character of input) {
    if (escaping) { current += character; escaping = false; continue; }
    if (character === "\\\\") { escaping = true; continue; }
    if (quote) { if (character === quote) quote = null; else current += character; continue; }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (/\\s/.test(character)) { if (current) { values.push(current); current = ""; } continue; }
    current += character;
  }
  if (escaping || quote) throw new DeveloperCommandError("Команда содержит незавершённую кавычку или escape.");
  if (current) values.push(current);
  return values;
}

function compactStatus(status) {
  return {
    version: status.version || null,
    running: Boolean(status.running),
    serverId: status.serverId,
    schemaVersion: status.schemaVersion || status.stats?.schemaVersion,
    users: status.stats?.users || 0,
    rooms: status.stats?.rooms || 0,
    messages: status.stats?.messages || 0,
    integrity: status.stats?.integrity || "unknown",
    readOnly: Boolean(status.emergencyReadOnly),
    pulseMode: status.pulseV3?.mode || status.pulse?.mode || "disabled",
    operations: status.operations || null,
  };
}

class DeveloperCommandService {
  constructor({ instance, store, log = () => {}, clock = () => new Date() } = {}) {
    if (!instance || !store) throw new DeveloperCommandError("Command service requires server instance and store.", "COMMAND_SERVICE_MISCONFIGURED");
    this.instance = instance;
    this.store = store;
    this.log = log;
    this.clock = clock;
  }

  async audit(actor, command, details = {}) {
    await this.store.mutate((state) => {
      state.integrationAudit ||= [];
      state.integrationAudit.push({
        id: crypto.randomUUID(),
        type: "developer.command",
        actor: String(actor || "unknown").slice(0, 80),
        command,
        details,
        createdAt: this.clock().toISOString(),
      });
      if (state.integrationAudit.length > 10_000) state.integrationAudit.splice(0, state.integrationAudit.length - 10_000);
    });
  }

  async execute(line, { actor = "console" } = {}) {
    const parts = splitCommandLine(line);
    if (!parts.length) return { ok: true, command: "", output: "" };
    const [root, action, ...args] = parts.map((part, index) => index < 2 ? part.toLowerCase() : part);
    const command = [root, action].filter(Boolean).join(" ");
    let result;
    let mutated = false;

    if (root === "help") {
      result = { output: "help | status | health | users list | rooms list | backup create [passphrase] | storage cleanup | read-only on|off | audit tail [count]" };
    } else if (root === "status") {
      result = { data: compactStatus(this.instance.status()), output: "Статус сервера получен." };
    } else if (root === "health") {
      const status = this.instance.status();
      result = { data: { integrity: status.stats?.integrity, operations: status.operations }, output: status.stats?.integrity === "ok" ? "Проверка пройдена." : "Проверка требует внимания." };
    } else if (root === "users" && action === "list") {
      const data = await this.instance.listAdminData();
      result = { data: data.users.map(({ id, username, displayName, role, disabledAt, sessions }) => ({ id, username, displayName, role, disabled: Boolean(disabledAt), sessions })), output: `Пользователей: ${data.users.length}` };
    } else if (root === "rooms" && action === "list") {
      const data = await this.instance.listAdminData();
      result = { data: data.rooms.map(({ id, slug, name, privacy, memberCount, messageCount }) => ({ id, slug, name, privacy, memberCount, messageCount })), output: `Комнат: ${data.rooms.length}` };
    } else if (root === "backup" && action === "create") {
      const passphrase = args.join(" ");
      if (passphrase && passphrase.length < 10) throw new DeveloperCommandError("Пароль резервной копии должен содержать минимум 10 символов.", "COMMAND_VALIDATION_FAILED");
      const backup = await this.instance.createBackup(passphrase);
      mutated = true;
      result = { data: { directory: backup.directory, createdAt: backup.createdAt, encrypted: Boolean(passphrase) }, output: "Резервная копия создана." };
    } else if (root === "storage" && action === "cleanup") {
      result = { data: await this.instance.cleanupStorage(), output: "Очистка хранилища завершена." };
      mutated = true;
    } else if (root === "read-only" && ["on", "off"].includes(action)) {
      const enabled = action === "on";
      await this.store.mutate((state) => { state.settings.emergencyReadOnly = enabled; });
      mutated = true;
      result = { data: { enabled }, output: enabled ? "Emergency read-only включён." : "Emergency read-only выключен." };
    } else if (root === "audit" && action === "tail") {
      const count = Math.max(1, Math.min(200, Number(args[0]) || 50));
      const rows = this.store.read((state) => (state.integrationAudit || []).slice(-count).reverse());
      result = { data: rows, output: `Записей аудита: ${rows.length}` };
    } else {
      throw new DeveloperCommandError("Неизвестная или неполная команда. Выполните help.", "COMMAND_NOT_FOUND");
    }

    if (mutated) await this.audit(actor, command, { argumentCount: args.length });
    this.log(`developer command ${command || root} by ${String(actor).slice(0, 80)}`, "info");
    return { ok: true, command: command || root, mutated, ...result };
  }
}

module.exports = { DeveloperCommandError, DeveloperCommandService, compactStatus, splitCommandLine };
`);

replaceOnce("server/create-server.cjs",
  'const { version: APP_VERSION } = require("../package.json");',
  'const { version: APP_VERSION } = require("../package.json");\nconst { createOperationalRuntime } = require("./operational-runtime.cjs");');
replaceOnce("server/create-server.cjs",
  '  const app = express();\n  const server = tlsEnabled',
  `  const app = express();
  const operational = createOperationalRuntime({
    service: "nexora-local-server",
    version: APP_VERSION,
    metricsToken: options.metricsToken ?? process.env.NEXORA_METRICS_TOKEN ?? "",
    healthProvider: async () => {
      const stats = store.stats();
      return { ready: stats.integrity === "ok", checks: { sqlite: stats.integrity, schemaVersion: stats.schemaVersion, emergencyReadOnly: store.read((state) => Boolean(state.settings.emergencyReadOnly)) } };
    },
    log: (message, level = "info") => {
      const entry = { level, message, createdAt: nowIso() };
      events.emit("log", entry);
      if (!options.quiet) console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](\`[Nexora] \${message}\`);
    },
  });
  operational.mount(app);
  const server = tlsEnabled`);
replaceOnce("server/create-server.cjs",
  '    log(`Сервер запущен: ${tlsEnabled ? "https" : "http"}://localhost:${actualPort}`);',
  '    operational.markReady();\n    log(`Сервер запущен: ${tlsEnabled ? "https" : "http"}://localhost:${actualPort}`);');
replaceOnce("server/create-server.cjs",
  '      pulse: pulse.status(),\n      dataDir,',
  '      pulse: pulse.status(),\n      operations: operational.snapshot(),\n      emergencyReadOnly: store.read((state) => Boolean(state.settings.emergencyReadOnly)),\n      dataDir,');
replaceOnce("server/create-server.cjs",
  '  async function close() {\n    v3Features?.stop();',
  '  async function close() {\n    operational.beginDrain();\n    v3Features?.stop();');
replaceOnce("server/create-server.cjs",
  '    await store.close();\n    events.emit("status", status());',
  '    await store.close();\n    operational.close();\n    events.emit("status", status());');
replaceOnce("server/create-server.cjs",
  '    events,\n    dataDir,',
  '    events,\n    operational,\n    dataDir,');

replaceOnce("server/create-server-v31.cjs",
  'const { PulseSyncWorker } = require("./pulse-sync-worker.cjs");',
  'const { PulseSyncWorker } = require("./pulse-sync-worker.cjs");\nconst { DeveloperCommandService } = require("./developer-commands.cjs");');
replaceOnce("server/create-server-v31.cjs",
  '    instance.pulseMigration = migration;\n    return instance;',
  `    instance.pulseMigration = migration;
    instance.commandService = new DeveloperCommandService({ instance, store: instance.store, log, clock: options.clock });
    return instance;`);

replaceOnce("cloud/create-cloud-server-v12.cjs",
  'const { mountBillingManagementRoutes } = require("./billing-management-routes.cjs");',
  'const { mountBillingManagementRoutes } = require("./billing-management-routes.cjs");\nconst { createOperationalRuntime } = require("../server/operational-runtime.cjs");\nconst { version: APP_VERSION } = require("../package.json");');
replaceOnce("cloud/create-cloud-server-v12.cjs",
  '  const app = express();\n  app.disable("x-powered-by");',
  `  const app = express();
  const operational = createOperationalRuntime({
    service: "nexora-pulse-cloud",
    version: APP_VERSION,
    metricsToken: options.metricsToken || process.env.CLOUD_METRICS_TOKEN || "",
    healthProvider: async () => {
      const ledger = base.database.ledgerInvariant();
      const identityCount = base.database.db.prepare("SELECT COUNT(*) AS count FROM cloud_identities").get();
      const balanced = ledger?.balanced !== false && ledger?.ok !== false;
      return { ready: balanced, checks: { ledger: balanced ? "ok" : "unbalanced", identities: Number(identityCount?.count || 0), workers: workers.status() } };
    },
    log: options.log || (() => {}),
  });
  operational.mount(app);
  app.disable("x-powered-by");`);
replaceOnce("cloud/create-cloud-server-v12.cjs", '      version: "3.1.0",', '      version: APP_VERSION,');
replaceOnce("cloud/create-cloud-server-v12.cjs", '  return { ...base, app, identity, workers };', '  return { ...base, app, identity, workers, operational };');

replaceOnce("cloud/cli.cjs",
  '    workerTimeoutMs: Number(process.env.CLOUD_WORKER_TIMEOUT_MS || 10_000),',
  '    workerTimeoutMs: Number(process.env.CLOUD_WORKER_TIMEOUT_MS || 10_000),\n    metricsToken: optional("CLOUD_METRICS_TOKEN"),');
replaceOnce("cloud/cli.cjs",
  '  const { app, database, workers } = createCloudAppV12({ ...options, log:',
  '  const { app, database, workers, operational } = createCloudAppV12({ ...options, log:');
replaceOnce("cloud/cli.cjs",
  '    stopping = true;\n    try { await workers.stop();',
  '    stopping = true;\n    operational.beginDrain();\n    try { await workers.stop();');
replaceOnce("cloud/cli.cjs",
  '      try { database.close(); } catch (closeError)',
  '      try { database.close(); operational.close(); } catch (closeError)');
replaceOnce("cloud/cli.cjs",
  '  server.listen(port, host, () => {\n    workers.start(options.workerIntervalMs);',
  '  server.listen(port, host, () => {\n    operational.markReady();\n    workers.start(options.workerIntervalMs);');
replaceOnce("cloud/cli.cjs", '  return { server, database, workers };', '  return { server, database, workers, operational };');

replaceOnce("server/cli.cjs", 'const path = require("node:path");', 'const path = require("node:path");\nconst readline = require("node:readline");');
replaceOnce("server/cli.cjs",
  'async function main() {',
  `function attachCommandConsole(instance) {
  if (!process.stdin.isTTY || !instance.commandService) return null;
  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, prompt: "nexora> " });
  terminal.on("line", async (line) => {
    try {
      const result = await instance.commandService.execute(line, { actor: "cli" });
      if (result.output) console.log(result.output);
      if (result.data != null) console.log(JSON.stringify(result.data, null, 2));
    } catch (error) { console.error(\`Команда отклонена (\${error.code || "COMMAND_FAILED"}): \${error.message}\`); }
    terminal.prompt();
  });
  terminal.on("SIGINT", () => terminal.close());
  terminal.prompt();
  return terminal;
}

async function main() {`);
replaceOnce("server/cli.cjs",
  '  if (status.stats.firstAccountPending) console.log("\\nПервый зарегистрированный аккаунт получит права администратора сервера.");\n\n  let stopping = false;',
  '  if (status.stats.firstAccountPending) console.log("\\nПервый зарегистрированный аккаунт получит права администратора сервера.");\n  const commandConsole = attachCommandConsole(instance);\n\n  let stopping = false;');
replaceOnce("server/cli.cjs",
  '    stopping = true;\n    await instance.close();',
  '    stopping = true;\n    commandConsole?.close();\n    await instance.close();');
replaceOnce("server/cli.cjs", 'main().catch((error) => {', 'main().catch((error) => {');

replaceOnce("electron/server-main.cjs",
  '  ipcMain.handle("server:update-status", () => updateService?.status() ?? { enabled: false, status: "initializing" });',
  '  ipcMain.handle("server:command", async (_event, command) => { if (!instance?.commandService) throw new Error("Сервер не запущен."); return instance.commandService.execute(command, { actor: "electron-admin" }); });\n  ipcMain.handle("server:update-status", () => updateService?.status() ?? { enabled: false, status: "initializing" });');
replaceOnce("electron/server-preload.cjs",
  '  openLogFile: () => ipcRenderer.invoke("server:open-log-file"),',
  '  openLogFile: () => ipcRenderer.invoke("server:open-log-file"),\n  runCommand: (command) => ipcRenderer.invoke("server:command", command),');

replaceOnce("electron/server-shell/index.html",
  '        <button data-view="logs">Журнал</button>',
  '        <button data-view="logs">Журнал</button>\n        <button data-view="console">Консоль</button>');
replaceOnce("electron/server-shell/index.html",
  '      <section id="logs" class="view"><div class="table-head"><div><span>RUNTIME</span><h2>Журнал событий</h2></div><div class="table-actions"><button id="open-log-file">Открыть журнал</button><button id="clear-logs">Очистить экран</button></div></div><div id="log-list" class="log-list"></div></section>',
  '      <section id="logs" class="view"><div class="table-head"><div><span>RUNTIME</span><h2>Журнал событий</h2></div><div class="table-actions"><button id="open-log-file">Открыть журнал</button><button id="clear-logs">Очистить экран</button></div></div><div id="log-list" class="log-list"></div></section>\n      <section id="console" class="view"><div class="table-head"><div><span>DEVELOPER CONTROL</span><h2>Команды сервера</h2></div><button id="console-help">Справка</button></div><article class="command-console"><div id="command-output" class="command-output" aria-live="polite"></div><form id="command-form"><label for="command-input">Команда</label><div><input id="command-input" autocomplete="off" spellcheck="false" placeholder="help" /><button class="primary" type="submit">Выполнить</button></div></form><p>Команды выполняются только через фиксированный registry. Shell, файловая система и произвольный JavaScript недоступны.</p></article></section>');

replaceOnce("electron/server-shell/renderer.js",
  '  "pulse-status-dot", "pulse-status-title", "pulse-status-detail",',
  '  "pulse-status-dot", "pulse-status-title", "pulse-status-detail",\n  "command-output", "command-form", "command-input", "console-help",');
replaceOnce("electron/server-shell/renderer.js",
  'function renderUpdate(next) {',
  `function appendCommandResult(command, result, error = null) {
  const row = document.createElement("div");
  row.className = error ? "command-result error" : "command-result";
  const prompt = document.createElement("code"); prompt.textContent = \`> \${command}\`;
  const message = document.createElement("pre");
  message.textContent = error ? \`[\${error.code || "COMMAND_FAILED"}] \${error.message}\` : [result.output, result.data == null ? "" : JSON.stringify(result.data, null, 2)].filter(Boolean).join("\\n");
  row.append(prompt, message); elements["command-output"].append(row); elements["command-output"].scrollTop = elements["command-output"].scrollHeight;
}

async function runCommand(command) {
  const value = String(command || "").trim();
  if (!value) return;
  elements["command-input"].disabled = true;
  try { appendCommandResult(value, await window.nexoraServer.runCommand(value)); }
  catch (error) { appendCommandResult(value, null, error); }
  finally { elements["command-input"].disabled = false; elements["command-input"].focus(); }
}

function renderUpdate(next) {`);
replaceOnce("electron/server-shell/renderer.js",
  'elements["server-toggle"].addEventListener("click", async () => renderStatus(status?.running ? await window.nexoraServer.stop() : await window.nexoraServer.start()));',
  'elements["server-toggle"].addEventListener("click", async () => renderStatus(status?.running ? await window.nexoraServer.stop() : await window.nexoraServer.start()));\nelements["command-form"].addEventListener("submit", (event) => { event.preventDefault(); const value = elements["command-input"].value; elements["command-input"].value = ""; runCommand(value); });\nelements["console-help"].addEventListener("click", () => runCommand("help"));');

write("electron/server-shell/extras.css", read("electron/server-shell/extras.css") + `
.command-console{display:grid;gap:1rem;padding:1.2rem;border:1px solid rgba(198,156,255,.16);border-radius:1rem;background:#08050d}.command-output{min-height:340px;max-height:55vh;overflow:auto;padding:1rem;border:1px solid rgba(198,156,255,.12);border-radius:.75rem;background:#030205;font-family:Consolas,monospace}.command-result{padding:.65rem 0;border-bottom:1px solid rgba(198,156,255,.08)}.command-result:last-child{border-bottom:0}.command-result code{color:#c896ff}.command-result pre{margin:.35rem 0 0;white-space:pre-wrap;word-break:break-word;color:#c7bdcf;font:600 .66rem/1.6 Consolas,monospace}.command-result.error pre{color:#ff7897}.command-console form label{display:block;margin-bottom:.4rem;color:#968da1;font-size:.66rem}.command-console form>div{display:grid;grid-template-columns:1fr auto;gap:.6rem}.command-console input{min-width:0;padding:.8rem;border:1px solid rgba(198,156,255,.16);border-radius:.6rem;background:#050308;color:#f4eff8;font-family:Consolas,monospace}.command-console>p{margin:0;color:#81788a;font-size:.62rem}
`);

write("test/operational-runtime.test.cjs", `"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const express = require("express");
const request = require("supertest");
const { createOperationalRuntime, redact } = require("../server/operational-runtime.cjs");

test("operational runtime exposes liveness, readiness and protected metrics", async () => {
  const app = express();
  const runtime = createOperationalRuntime({ service: "test", version: "3.1.1", metricsToken: "a".repeat(32), healthProvider: async () => ({ ready: true, checks: { sqlite: "ok" } }) });
  runtime.mount(app);
  await request(app).get("/healthz/live").expect(200).expect("X-Content-Type-Options", "nosniff");
  await request(app).get("/healthz/ready").expect(503);
  runtime.markReady();
  const ready = await request(app).get("/healthz/ready").expect(200);
  assert.equal(ready.body.checks.sqlite, "ok");
  await request(app).get("/metrics").expect(403);
  const metrics = await request(app).get("/metrics").set("Authorization", `Bearer ${"a".repeat(32)}`).expect(200);
  assert.match(metrics.text, /nexora_runtime_ready/);
  runtime.beginDrain();
  await request(app).get("/healthz/ready").expect(503);
  runtime.close();
});

test("operational logger redacts credentials recursively", () => {
  assert.deepEqual(redact({ authorization: "Bearer secret", nested: { password: "secret", safe: "ok" } }), { authorization: "[REDACTED]", nested: { password: "[REDACTED]", safe: "ok" } });
});
`);

write("test/developer-commands.test.cjs", `"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { DeveloperCommandService, splitCommandLine } = require("../server/developer-commands.cjs");

function fixture() {
  const state = { settings: { emergencyReadOnly: false }, integrationAudit: [], users: [], rooms: [] };
  const store = { read: (callback) => callback ? callback(state) : structuredClone(state), mutate: async (callback) => callback(state) };
  const instance = {
    store,
    status: () => ({ running: true, stats: { integrity: "ok", schemaVersion: 7, users: 1, rooms: 1, messages: 2 }, pulseV3: { mode: "sandbox" }, operations: { ready: true } }),
    listAdminData: async () => ({ users: [{ id: "u1", username: "admin", displayName: "Admin", role: "server_admin", disabledAt: null, sessions: 1 }], rooms: [{ id: "r1", slug: "general", name: "General", privacy: "public", memberCount: 1, messageCount: 2 }] }),
    createBackup: async () => ({ directory: "/backup", createdAt: new Date().toISOString() }),
    cleanupStorage: async () => ({ removed: 0 }),
  };
  return { state, service: new DeveloperCommandService({ instance, store }) };
}

test("command parser supports quoted values and rejects incomplete input", () => {
  assert.deepEqual(splitCommandLine('backup create "long secure passphrase"'), ["backup", "create", "long secure passphrase"]);
  assert.throws(() => splitCommandLine('backup create "broken'), /незавершённую/);
});

test("mutating developer command is audited without secret values", async () => {
  const { state, service } = fixture();
  const result = await service.execute("read-only on", { actor: "test" });
  assert.equal(result.data.enabled, true);
  assert.equal(state.settings.emergencyReadOnly, true);
  assert.equal(state.integrationAudit.length, 1);
  assert.equal(state.integrationAudit[0].command, "read-only on");
  assert.deepEqual(state.integrationAudit[0].details, { argumentCount: 0 });
});

test("unknown developer commands cannot execute arbitrary shell", async () => {
  const { service } = fixture();
  await assert.rejects(service.execute("rm -rf /"), (error) => error.code === "COMMAND_NOT_FOUND");
});
`);

write("docs/PRODUCTION_HARDENING_3.1.1.md", `# Nexora 3.1.1 — Production Hardening

## Runtime health

Local Server и Pulse Cloud публикуют:

- \`GET /healthz/live\` — процесс работает;
- \`GET /healthz/ready\` — процесс готов принимать трафик и не находится в drain mode;
- \`GET /metrics\` — Prometheus text format.

\`/metrics\` доступен только с \`Authorization: Bearer <token>\`, если настроен \`NEXORA_METRICS_TOKEN\` или \`CLOUD_METRICS_TOKEN\`. Без токена endpoint доступен только с loopback-интерфейса.

Readiness Local Server включает SQLite integrity, schema version и emergency read-only. Readiness Pulse Cloud включает ledger invariant, Cloud Identity и worker status.

## Безопасные логи

Operational runtime выдаёт request ID, считает HTTP requests и журналирует медленные/ошибочные запросы. Credentials, cookies, passwords, tokens, API keys и signatures удаляются рекурсивным redaction до записи.

## Graceful shutdown

Перед закрытием процесс переводится в drain state: readiness становится 503, workers останавливаются, HTTP/Socket.IO соединения закрываются, затем закрывается SQLite.

## Developer command service

CLI и Windows Server Admin используют один фиксированный registry:

\`help\`, \`status\`, \`health\`, \`users list\`, \`rooms list\`, \`backup create [passphrase]\`, \`storage cleanup\`, \`read-only on|off\`, \`audit tail [count]\`.

Произвольные shell-команды и JavaScript не выполняются. Изменяющие команды записываются в \`integrationAudit\`, аргументы с секретами не журналируются.
`);

const pkg = JSON.parse(read("package.json"));
pkg.version = "3.1.1";
write("package.json", JSON.stringify(pkg, null, 2) + "\n");

const changelog = read("CHANGELOG.md");
if (!changelog.includes("## [3.1.1]")) {
  write("CHANGELOG.md", changelog.replace("## [3.1.0]", `## [3.1.1] — 2026-07-21

### Added

- liveness, readiness и защищённые Prometheus metrics для Local Server и Pulse Cloud;
- единый developer command registry для CLI и Windows Server Admin;
- аудит изменяющих административных команд без сохранения секретных аргументов.

### Changed

- graceful shutdown переводит сервисы в drain state до остановки workers, HTTP, Socket.IO и SQLite;
- Cloud health использует версию из package metadata вместо жёстко заданной строки.

### Security

- operational HTTP logs получают request ID и рекурсивно скрывают credentials, cookies, passwords, tokens, API keys и signatures;
- metrics endpoint требует bearer token либо loopback source;
- административная консоль не предоставляет shell или eval.

## [3.1.0]`));
}

console.log("3.1.1 production hardening patch applied");
