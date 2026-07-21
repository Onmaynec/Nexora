"use strict";

const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function read(file) { return fs.readFileSync(path.join(root, file), "utf8"); }
function write(file, content) { fs.writeFileSync(path.join(root, file), content, "utf8"); }
function replaceOnce(file, before, after) {
  const source = read(file);
  if (!source.includes(before)) throw new Error(`Pattern not found in ${file}: ${before.slice(0, 100)}`);
  if (source.indexOf(before) !== source.lastIndexOf(before)) throw new Error(`Pattern not unique in ${file}: ${before.slice(0, 100)}`);
  write(file, source.replace(before, after));
}

replaceOnce("electron/client-main.cjs",
  '  setTimeout(() => updateService.check().catch(() => {}), 12_000);',
  '  updateService.start();');
replaceOnce("electron/client-main.cjs",
  'app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });',
  'app.on("before-quit", () => updateService?.stop());\napp.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });');

replaceOnce("server/create-server-v31.cjs",
  'const { DeveloperCommandService } = require("./developer-commands.cjs");',
  'const { DeveloperCommandService } = require("./developer-commands.cjs");\nconst { PulseSandboxService } = require("./pulse-sandbox-service.cjs");');
replaceOnce("server/create-server-v31.cjs",
  '    const pulseRoutes = mountPulseV3Routes({',
  '    const sandbox = new PulseSandboxService({ store: instance.store, productionMode: client.status().mode === "production", clock: options.clock, log });\n\n    const pulseRoutes = mountPulseV3Routes({');
replaceOnce("server/create-server-v31.cjs",
  '      repository,\n      log,\n    });',
  '      repository,\n      sandbox,\n      log,\n    });');
replaceOnce("server/create-server-v31.cjs",
  '      pulseV3: { ...client.status(), sync: syncWorker.status() },',
  '      pulseV3: { ...client.status(), ...(sandbox.enabled() ? { mode: "sandbox", enabled: true, productionReady: false, testMode: true } : {}), sync: syncWorker.status() },');
replaceOnce("server/create-server-v31.cjs",
  '    instance.pulseMigration = migration;\n    instance.commandService = new DeveloperCommandService({ instance, store: instance.store, log, clock: options.clock });',
  '    instance.pulseMigration = migration;\n    instance.pulseSandbox = sandbox;\n    instance.commandService = new DeveloperCommandService({ instance, store: instance.store, pulseSandbox: sandbox, log, clock: options.clock });');

replaceOnce("server/pulse-v3-routes.cjs",
  'function mountPulseV3Routes({ app, store, io, serverId, client, repository, log = () => {} }) {',
  'function mountPulseV3Routes({ app, store, io, serverId, client, repository, sandbox = null, log = () => {} }) {');
replaceOnce("server/pulse-v3-routes.cjs",
  '      cloud: client.status(),\n      linked: repository.getLink(request.pulseAuth.user.id)?.status === "linked",',
  '      cloud: sandbox?.enabled() ? { ...client.status(), mode: "sandbox", enabled: true, productionReady: false, testMode: true } : client.status(),\n      linked: Boolean(sandbox?.enabled() || repository.getLink(request.pulseAuth.user.id)?.status === "linked"),');
replaceOnce("server/pulse-v3-routes.cjs",
  '  app.get("/api/v3/cloud-account", authRequired, (request, response) => {\n    const link = repository.getLink(request.pulseAuth.user.id);\n    response.json({ ok: true, requestId: request.pulseRequestId, account: link?.status === "linked" ? link : null });\n  });',
  '  app.get("/api/v3/cloud-account", authRequired, (request, response) => {\n    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, account: sandbox.overview(request.pulseAuth.user.id).account });\n    const link = repository.getLink(request.pulseAuth.user.id);\n    response.json({ ok: true, requestId: request.pulseRequestId, account: link?.status === "linked" ? link : null });\n  });');
replaceOnce("server/pulse-v3-routes.cjs",
  '  app.get("/api/v3/pulse/overview", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    repository.requireLinked(userId);',
  '  app.get("/api/v3/pulse/overview", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, ...sanitizeOverview(sandbox.overview(userId)) });\n    repository.requireLinked(userId);');
replaceOnce("server/pulse-v3-routes.cjs",
  '  app.get("/api/v3/pulse/wallet", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    repository.requireLinked(userId);',
  '  app.get("/api/v3/pulse/wallet", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, wallet: sandbox.overview(userId).wallet });\n    repository.requireLinked(userId);');
replaceOnce("server/pulse-v3-routes.cjs",
  '  app.get("/api/v3/pulse/transactions", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    repository.requireLinked(userId);\n    const limit',
  '  app.get("/api/v3/pulse/transactions", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    const limit = Math.max(1, Math.min(200, Number(request.query.limit) || 50));\n    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, transactions: sandbox.transactions(userId, limit) });\n    repository.requireLinked(userId);\n    const unusedLimitMarker');
replaceOnce("server/pulse-v3-routes.cjs", '    const unusedLimitMarker = Math.max(1, Math.min(200, Number(request.query.limit) || 50));', '');
replaceOnce("server/pulse-v3-routes.cjs",
  '  app.get("/api/v3/pulse/transactions/:id", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    repository.requireLinked(userId);',
  '  app.get("/api/v3/pulse/transactions/:id", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    if (sandbox?.enabled()) {\n      const transaction = sandbox.transactions(userId, 200).find((item) => item.id === request.params.id);\n      if (!transaction) throw new PulseRepositoryError("Операция не найдена.", "RESOURCE_NOT_FOUND", 404);\n      return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, transaction });\n    }\n    repository.requireLinked(userId);');
replaceOnce("server/pulse-v3-routes.cjs",
  '  async function createCheckout(request, response, productCode) {\n    const userId = request.pulseAuth.user.id;\n    repository.requireLinked(userId);',
  '  async function createCheckout(request, response, productCode) {\n    const userId = request.pulseAuth.user.id;\n    if (sandbox?.enabled()) throw new PulseRepositoryError("В тестовой модели покупки отключены. Используйте команды Nexora Server.", "PULSE_SANDBOX_NO_PAYMENTS", 409);\n    repository.requireLinked(userId);');
replaceOnce("server/pulse-v3-routes.cjs",
  '  app.get("/api/v3/pulse/subscription", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    repository.requireLinked(userId);',
  '  app.get("/api/v3/pulse/subscription", authRequired, asyncRoute(async (request, response) => {\n    const userId = request.pulseAuth.user.id;\n    if (sandbox?.enabled()) return response.json({ ok: true, requestId: request.pulseRequestId, cached: false, subscription: sandbox.overview(userId).subscription });\n    repository.requireLinked(userId);');

replaceOnce("server/developer-commands.cjs",
  '  constructor({ instance, store, log = () => {}, clock = () => new Date() } = {}) {',
  '  constructor({ instance, store, pulseSandbox = null, log = () => {}, clock = () => new Date() } = {}) {');
replaceOnce("server/developer-commands.cjs",
  '    this.store = store;\n    this.log = log;',
  '    this.store = store;\n    this.pulseSandbox = pulseSandbox;\n    this.log = log;');
replaceOnce("server/developer-commands.cjs",
  '        output: "help | status | health | users list | rooms list | backup create [passphrase] | storage cleanup | read-only on|off | audit tail [count]",',
  '        output: "help | status | health | users list | rooms list | backup create [passphrase] | storage cleanup | read-only on|off | pulse sandbox on|off | pulse user <user> | plus grant <user> [days] | plus revoke <user> | impulses grant|revoke <user> <amount> [reason] | audit tail [count]",');
replaceOnce("server/developer-commands.cjs",
  '    } else if (root === "audit" && action === "tail") {',
  '    } else if (root === "pulse" && action === "sandbox") {\n      if (!this.pulseSandbox) throw new DeveloperCommandError("Pulse sandbox недоступен.", "PULSE_SANDBOX_UNAVAILABLE");\n      const enabled = args[0] === "on" ? true : args[0] === "off" ? false : null;\n      if (enabled == null) throw new DeveloperCommandError("Используйте pulse sandbox on или pulse sandbox off.", "COMMAND_VALIDATION_FAILED");\n      result = { data: await this.pulseSandbox.setEnabled(enabled, actor), output: enabled ? "Pulse sandbox включён." : "Pulse sandbox выключен." };\n      mutated = true;\n    } else if (root === "pulse" && action === "user") {\n      if (!this.pulseSandbox || !args[0]) throw new DeveloperCommandError("Укажите пользователя.", "COMMAND_VALIDATION_FAILED");\n      result = { data: { overview: this.pulseSandbox.overview(args[0]), transactions: this.pulseSandbox.transactions(args[0], 20) }, output: "Тестовое состояние Pulse получено." };\n    } else if (root === "plus" && ["grant", "revoke"].includes(action)) {\n      if (!this.pulseSandbox || !args[0]) throw new DeveloperCommandError("Укажите пользователя.", "COMMAND_VALIDATION_FAILED");\n      result = action === "grant"\n        ? { data: await this.pulseSandbox.grantPlus(args[0], { days: args[1], actor }), output: "Тестовая подписка Plus выдана." }\n        : { data: await this.pulseSandbox.revokePlus(args[0], { actor }), output: "Тестовая подписка Plus отозвана." };\n      mutated = true;\n    } else if (root === "impulses" && ["grant", "revoke"].includes(action)) {\n      if (!this.pulseSandbox || !args[0]) throw new DeveloperCommandError("Укажите пользователя и количество.", "COMMAND_VALIDATION_FAILED");\n      const amount = Math.abs(Math.trunc(Number(args[1])));\n      if (!Number.isSafeInteger(amount) || amount < 1) throw new DeveloperCommandError("Количество должно быть положительным целым числом.", "COMMAND_VALIDATION_FAILED");\n      const delta = action === "grant" ? amount : -amount;\n      result = { data: await this.pulseSandbox.adjustImpulses(args[0], delta, { actor, reason: args.slice(2).join(" ") || "operator_adjustment" }), output: action === "grant" ? "Импульсы выданы." : "Импульсы изъяты." };\n      mutated = true;\n    } else if (root === "audit" && action === "tail") {');

replaceOnce("client/src/components/PulsePageV31.jsx",
  '  const cloudOnline = status?.cloud?.mode === "production" && !overview?.cached;',
  '  const sandboxMode = status?.cloud?.mode === "sandbox";\n  const cloudOnline = sandboxMode || (status?.cloud?.mode === "production" && !overview?.cached);');
replaceOnce("client/src/components/PulsePageV31.jsx",
  '{cloudOnline ? "Pulse Cloud online" : status?.cloud?.mode === "production" ? "Проверенный кэш" : "Cloud отключён"}</strong><small>{linked ? "Cloud Account связан" : "Требуется связь аккаунта"}',
  '{sandboxMode ? "Pulse Sandbox active" : cloudOnline ? "Pulse Cloud online" : status?.cloud?.mode === "production" ? "Проверенный кэш" : "Cloud отключён"}</strong><small>{sandboxMode ? "Тестовая модель управляется Nexora Server" : linked ? "Cloud Account связан" : "Требуется связь аккаунта"}');
replaceOnce("client/src/components/PulsePageV31.jsx",
  'detail={overview?.cached ? `Кэш от ${formatDate(overview.cachedAt)}` : "Подтверждено Pulse Cloud"}',
  'detail={sandboxMode ? "Локальный тестовый баланс" : overview?.cached ? `Кэш от ${formatDate(overview.cachedAt)}` : "Подтверждено Pulse Cloud"}');
replaceOnce("client/src/components/PulsePageV31.jsx",
  '<div className="pulse31-plus-actions">{plusActive ? <><button type="button" onClick={openPortal} disabled={busy}><ExternalLink size={16} /> Управление</button>{!field(subscription, "cancelAtPeriodEnd", "cancel_at_period_end", false) && <button type="button" className="secondary" onClick={cancelSubscription} disabled={busy}>Отменить продление</button>}</> : <button type="button" onClick={() => checkout("plus")} disabled={busy || !linked}>Подключить Plus <ExternalLink size={16} /></button>}</div>',
  '<div className="pulse31-plus-actions">{sandboxMode ? <span>Управляется через консоль Nexora Server</span> : plusActive ? <><button type="button" onClick={openPortal} disabled={busy}><ExternalLink size={16} /> Управление</button>{!field(subscription, "cancelAtPeriodEnd", "cancel_at_period_end", false) && <button type="button" className="secondary" onClick={cancelSubscription} disabled={busy}>Отменить продление</button>}</> : <button type="button" onClick={() => checkout("plus")} disabled={busy || !linked}>Подключить Plus <ExternalLink size={16} /></button>}</div>');
replaceOnce("client/src/components/PulsePageV31.jsx",
  '<button type="button" onClick={() => checkout("impulses")} disabled={!linked || busy}><PackagePlus size={16} /> Купить 500</button>',
  '<button type="button" onClick={() => checkout("impulses")} disabled={!linked || busy || sandboxMode}><PackagePlus size={16} /> {sandboxMode ? "Покупки отключены" : "Купить 500"}</button>');
replaceOnce("client/src/components/PulsePageV31.jsx",
  '{linked ? <button type="button" className="danger" onClick={unlinkAccount} disabled={busy}><Unlink size={16} /> Отвязать</button> : <button type="button" onClick={connectAccount} disabled={busy}><Link2 size={16} /> Подключить</button>}',
  '{sandboxMode ? <span>LOCAL TEST MODE</span> : linked ? <button type="button" className="danger" onClick={unlinkAccount} disabled={busy}><Unlink size={16} /> Отвязать</button> : <button type="button" onClick={connectAccount} disabled={busy}><Link2 size={16} /> Подключить</button>}');

const pkg = JSON.parse(read("package.json"));
pkg.version = "3.1.2";
write("package.json", `${JSON.stringify(pkg, null, 2)}\n`);

const changelog = read("CHANGELOG.md");
if (!changelog.includes("## [3.1.2]")) {
  write("CHANGELOG.md", changelog.replace("## [3.1.1]", '## [3.1.2] — 2026-07-21\n\n### Fixed\n\n- крестик глобальной voice-панели полностью очищает active audio state и удаляет source;\n- automatic Electron updater запускает initial check, использует single-flight и повторяет проверку каждые 6 часов;\n- отсутствие signed latest.yml отображается стабильной причиной вместо необработанной ошибки;\n- Pulse API v3 получил функциональную локальную sandbox-модель, управляемую Nexora Server.\n\n### Added\n\n- команды pulse sandbox, plus grant/revoke, impulses grant/revoke и pulse user;\n- тестовая Plus-подписка с разовой выдачей 400 Импульсов и локальным audit/ledger.\n\n### Security\n\n- sandbox блокируется при production Pulse Cloud, не создаёт production-подписи и не разрешает реальные покупки;\n- баланс sandbox не может стать отрицательным, все изменения выполняются сервером и журналируются.\n\n## [3.1.1]'));
}
write("docs/BUGFIX_3.1.2.md", '# Nexora 3.1.2 — Bug Fix\n\n## Voice dock\n\n`stopVoice()` теперь очищает идентификатор, URL, имя, время, длительность и скорость, удаляет `src` из HTMLAudioElement и вызывает `load()`. Dock размонтируется сразу после нажатия X.\n\n## Auto update\n\nClient updater запускается после `app.whenReady()`, выполняет initial check, затем проверяет канал каждые шесть часов. Запросы single-flight. Для реальной установки по-прежнему требуется подписанный NSIS release с `latest.yml`; неподписанные assets не принимаются.\n\n## Local Pulse sandbox\n\nКоманды Windows Server Admin и CLI:\n\n- `pulse sandbox on|off`;\n- `pulse user <user>`;\n- `plus grant <user> [days]`;\n- `plus revoke <user>`;\n- `impulses grant <user> <amount> [reason]`;\n- `impulses revoke <user> <amount> [reason]`.\n\nSandbox предназначен только для разработки и демонстрации, отключает checkout и автоматически недоступен при production Pulse Cloud.\n');
console.log("3.1.2 patch applied");
