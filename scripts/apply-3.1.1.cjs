"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");

function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function write(file, content) { fs.writeFileSync(path.join(root, file), content, "utf8"); }
function replaceOnce(file, before, after) {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Pattern not found in ${file}: ${before.slice(0, 100)}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Pattern is not unique in ${file}: ${before.slice(0, 100)}`);
  write(file, source.replace(before, after));
}
function appendOnce(file, marker, value) {
  const source = read(file);
  if (!source.includes(marker)) write(file, `${source.trimEnd()}\n${value}\n`);
}

replaceOnce("server/create-server.cjs",
  'const { version: APP_VERSION } = require("../package.json");',
  'const { version: APP_VERSION } = require("../package.json");\nconst { createOperationalRuntime } = require("./operational-runtime.cjs");');
replaceOnce("server/create-server.cjs",
  '  const app = express();\n  const server = tlsEnabled',
  '  const app = express();\n  const operational = createOperationalRuntime({\n    service: "nexora-local-server",\n    version: APP_VERSION,\n    metricsToken: options.metricsToken ?? process.env.NEXORA_METRICS_TOKEN ?? "",\n    healthProvider: async () => {\n      const stats = store.stats();\n      return { ready: stats.integrity === "ok", checks: { sqlite: stats.integrity, schemaVersion: stats.schemaVersion, emergencyReadOnly: store.read((state) => Boolean(state.settings.emergencyReadOnly)) } };\n    },\n    log: (message, level = "info") => {\n      const entry = { level, message, createdAt: nowIso() };\n      events.emit("log", entry);\n      if (!options.quiet) console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](`[Nexora] ${message}`);\n    },\n  });\n  operational.mount(app);\n  const server = tlsEnabled');
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
  '    instance.pulseMigration = migration;\n    instance.commandService = new DeveloperCommandService({ instance, store: instance.store, log, clock: options.clock });\n    return instance;');

replaceOnce("cloud/create-cloud-server-v12.cjs",
  'const { mountBillingManagementRoutes } = require("./billing-management-routes.cjs");',
  'const { mountBillingManagementRoutes } = require("./billing-management-routes.cjs");\nconst { createOperationalRuntime } = require("../server/operational-runtime.cjs");\nconst { version: APP_VERSION } = require("../package.json");');
replaceOnce("cloud/create-cloud-server-v12.cjs",
  '  const app = express();\n  app.disable("x-powered-by");',
  '  const app = express();\n  const operational = createOperationalRuntime({\n    service: "nexora-pulse-cloud",\n    version: APP_VERSION,\n    metricsToken: options.metricsToken || process.env.CLOUD_METRICS_TOKEN || "",\n    healthProvider: async () => {\n      const ledger = base.database.ledgerInvariant();\n      const identityCount = base.database.db.prepare("SELECT COUNT(*) AS count FROM cloud_identities").get();\n      const balanced = ledger?.balanced !== false && ledger?.ok !== false;\n      return { ready: balanced, checks: { ledger: balanced ? "ok" : "unbalanced", identities: Number(identityCount?.count || 0), workers: workers.status() } };\n    },\n    log: options.log || (() => {}),\n  });\n  operational.mount(app);\n  app.disable("x-powered-by");');
replaceOnce("cloud/create-cloud-server-v12.cjs", '      version: "3.1.0",', '      version: APP_VERSION,');
replaceOnce("cloud/create-cloud-server-v12.cjs", '  return { ...base, app, identity, workers };', '  return { ...base, app, identity, workers, operational };');

replaceOnce("cloud/cli.cjs",
  '    workerTimeoutMs: Number(process.env.CLOUD_WORKER_TIMEOUT_MS || 10_000),',
  '    workerTimeoutMs: Number(process.env.CLOUD_WORKER_TIMEOUT_MS || 10_000),\n    metricsToken: optional("CLOUD_METRICS_TOKEN"),');
replaceOnce("cloud/cli.cjs",
  '  const { app, database, workers } = createCloudAppV12({ ...options, log:',
  '  const { app, database, workers, operational } = createCloudAppV12({ ...options, log:');
replaceOnce("cloud/cli.cjs", '    stopping = true;\n    try { await workers.stop();', '    stopping = true;\n    operational.beginDrain();\n    try { await workers.stop();');
replaceOnce("cloud/cli.cjs", '      try { database.close(); } catch (closeError)', '      try { database.close(); operational.close(); } catch (closeError)');
replaceOnce("cloud/cli.cjs", '  server.listen(port, host, () => {\n    workers.start(options.workerIntervalMs);', '  server.listen(port, host, () => {\n    operational.markReady();\n    workers.start(options.workerIntervalMs);');
replaceOnce("cloud/cli.cjs", '  return { server, database, workers };', '  return { server, database, workers, operational };');

replaceOnce("server/cli.cjs", 'const path = require("node:path");', 'const path = require("node:path");\nconst readline = require("node:readline");');
replaceOnce("server/cli.cjs", 'async function main() {', 'function attachCommandConsole(instance) {\n  if (!process.stdin.isTTY || !instance.commandService) return null;\n  const terminal = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true, prompt: "nexora> " });\n  terminal.on("line", async (line) => {\n    try {\n      const result = await instance.commandService.execute(line, { actor: "cli" });\n      if (result.output) console.log(result.output);\n      if (result.data != null) console.log(JSON.stringify(result.data, null, 2));\n    } catch (error) { console.error(`Команда отклонена (${error.code || "COMMAND_FAILED"}): ${error.message}`); }\n    terminal.prompt();\n  });\n  terminal.on("SIGINT", () => terminal.close());\n  terminal.prompt();\n  return terminal;\n}\n\nasync function main() {');
replaceOnce("server/cli.cjs", '  if (status.stats.firstAccountPending) console.log("\\nПервый зарегистрированный аккаунт получит права администратора сервера.");\n\n  let stopping = false;', '  if (status.stats.firstAccountPending) console.log("\\nПервый зарегистрированный аккаунт получит права администратора сервера.");\n  const commandConsole = attachCommandConsole(instance);\n\n  let stopping = false;');
replaceOnce("server/cli.cjs", '    stopping = true;\n    await instance.close();', '    stopping = true;\n    commandConsole?.close();\n    await instance.close();');

replaceOnce("electron/server-main.cjs", '  ipcMain.handle("server:update-status", () => updateService?.status() ?? { enabled: false, status: "initializing" });', '  ipcMain.handle("server:command", async (_event, command) => { if (!instance?.commandService) throw new Error("Сервер не запущен."); return instance.commandService.execute(command, { actor: "electron-admin" }); });\n  ipcMain.handle("server:update-status", () => updateService?.status() ?? { enabled: false, status: "initializing" });');
replaceOnce("electron/server-preload.cjs", '  openLogFile: () => ipcRenderer.invoke("server:open-log-file"),', '  openLogFile: () => ipcRenderer.invoke("server:open-log-file"),\n  runCommand: (command) => ipcRenderer.invoke("server:command", command),');

replaceOnce("electron/server-shell/index.html", '        <button data-view="logs">Журнал</button>', '        <button data-view="logs">Журнал</button>\n        <button data-view="console">Консоль</button>');
replaceOnce("electron/server-shell/index.html", '      <section id="logs" class="view"><div class="table-head"><div><span>RUNTIME</span><h2>Журнал событий</h2></div><div class="table-actions"><button id="open-log-file">Открыть журнал</button><button id="clear-logs">Очистить экран</button></div></div><div id="log-list" class="log-list"></div></section>', '      <section id="logs" class="view"><div class="table-head"><div><span>RUNTIME</span><h2>Журнал событий</h2></div><div class="table-actions"><button id="open-log-file">Открыть журнал</button><button id="clear-logs">Очистить экран</button></div></div><div id="log-list" class="log-list"></div></section>\n      <section id="console" class="view"><div class="table-head"><div><span>DEVELOPER CONTROL</span><h2>Команды сервера</h2></div><button id="console-help">Справка</button></div><article class="command-console"><div id="command-output" class="command-output" aria-live="polite"></div><form id="command-form"><label for="command-input">Команда</label><div><input id="command-input" autocomplete="off" spellcheck="false" placeholder="help" /><button class="primary" type="submit">Выполнить</button></div></form><p>Команды выполняются только через фиксированный registry. Shell, файловая система и произвольный JavaScript недоступны.</p></article></section>');

replaceOnce("electron/server-shell/renderer.js", '  "pulse-status-dot", "pulse-status-title", "pulse-status-detail",', '  "pulse-status-dot", "pulse-status-title", "pulse-status-detail",\n  "command-output", "command-form", "command-input", "console-help",');
replaceOnce("electron/server-shell/renderer.js", 'function renderUpdate(next) {', 'function appendCommandResult(command, result, error = null) {\n  const row = document.createElement("div");\n  row.className = error ? "command-result error" : "command-result";\n  const prompt = document.createElement("code"); prompt.textContent = `> ${command}`;\n  const message = document.createElement("pre");\n  message.textContent = error ? `[${error.code || "COMMAND_FAILED"}] ${error.message}` : [result.output, result.data == null ? "" : JSON.stringify(result.data, null, 2)].filter(Boolean).join("\\n");\n  row.append(prompt, message); elements["command-output"].append(row); elements["command-output"].scrollTop = elements["command-output"].scrollHeight;\n}\n\nasync function runCommand(command) {\n  const value = String(command || "").trim();\n  if (!value) return;\n  elements["command-input"].disabled = true;\n  try { appendCommandResult(value, await window.nexoraServer.runCommand(value)); }\n  catch (error) { appendCommandResult(value, null, error); }\n  finally { elements["command-input"].disabled = false; elements["command-input"].focus(); }\n}\n\nfunction renderUpdate(next) {');
replaceOnce("electron/server-shell/renderer.js", 'elements["server-toggle"].addEventListener("click", async () => renderStatus(status?.running ? await window.nexoraServer.stop() : await window.nexoraServer.start()));', 'elements["server-toggle"].addEventListener("click", async () => renderStatus(status?.running ? await window.nexoraServer.stop() : await window.nexoraServer.start()));\nelements["command-form"].addEventListener("submit", (event) => { event.preventDefault(); const value = elements["command-input"].value; elements["command-input"].value = ""; runCommand(value); });\nelements["console-help"].addEventListener("click", () => runCommand("help"));');
appendOnce("electron/server-shell/extras.css", ".command-console{", '.command-console{display:grid;gap:1rem;padding:1.2rem;border:1px solid rgba(198,156,255,.16);border-radius:1rem;background:#08050d}.command-output{min-height:340px;max-height:55vh;overflow:auto;padding:1rem;border:1px solid rgba(198,156,255,.12);border-radius:.75rem;background:#030205;font-family:Consolas,monospace}.command-result{padding:.65rem 0;border-bottom:1px solid rgba(198,156,255,.08)}.command-result:last-child{border-bottom:0}.command-result code{color:#c896ff}.command-result pre{margin:.35rem 0 0;white-space:pre-wrap;word-break:break-word;color:#c7bdcf;font:600 .66rem/1.6 Consolas,monospace}.command-result.error pre{color:#ff7897}.command-console form label{display:block;margin-bottom:.4rem;color:#968da1;font-size:.66rem}.command-console form>div{display:grid;grid-template-columns:1fr auto;gap:.6rem}.command-console input{min-width:0;padding:.8rem;border:1px solid rgba(198,156,255,.16);border-radius:.6rem;background:#050308;color:#f4eff8;font-family:Consolas,monospace}.command-console>p{margin:0;color:#81788a;font-size:.62rem}');

const pkg = JSON.parse(read("package.json"));
pkg.version = "3.1.1";
write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

const changelog = read("CHANGELOG.md");
if (!changelog.includes("## [3.1.1]")) {
  write("CHANGELOG.md", changelog.replace("## [3.1.0]", '## [3.1.1] — 2026-07-21\n\n### Added\n\n- liveness, readiness и защищённые Prometheus metrics для Local Server и Pulse Cloud;\n- единый developer command registry для CLI и Windows Server Admin;\n- аудит изменяющих административных команд без сохранения секретных аргументов.\n\n### Changed\n\n- graceful shutdown переводит сервисы в drain state до остановки workers, HTTP, Socket.IO и SQLite;\n- Cloud health использует версию из package metadata вместо жёстко заданной строки.\n\n### Security\n\n- operational HTTP logs получают request ID и рекурсивно скрывают credentials, cookies, passwords, tokens, API keys и signatures;\n- metrics endpoint требует bearer token либо loopback source;\n- административная консоль не предоставляет shell или eval.\n\n## [3.1.0]'));
}

console.log("3.1.1 production hardening patch applied");
