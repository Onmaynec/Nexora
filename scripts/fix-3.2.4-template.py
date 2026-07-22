from pathlib import Path

file = Path("scripts/apply-3.2.4-patch.cjs")
source = file.read_text(encoding="utf-8")

replacements = [
    ('    return String(value[\\`${"${kind}"}FeedUrl\\`] || "").trim();', '    return String(value[String(kind) + "FeedUrl"] || "").trim();'),
    ('    return String(value[\\`\\${kind}FeedUrl\\`] || "").trim();', '    return String(value[String(kind) + "FeedUrl"] || "").trim();'),
    ('  emit({ enabled: true, status: "idle", provider: provider.provider, channel: provider.provider === "github" ? `${"${provider.owner}"}/${"${provider.repo}"}` : provider.url });', '  emit({ enabled: true, status: "idle", provider: provider.provider, channel: provider.provider === "github" ? provider.owner + "/" + provider.repo : provider.url });'),
    ('    log(`Updater error: ${"${error?.stack || error}"}`, "error");', '    log("Updater error: " + (error?.stack || error), "error");'),
    ('        log(`Update check failed: ${"${error?.stack || error}"}`, "error");', '        log("Update check failed: " + (error?.stack || error), "error");'),
    ('        log(`Update download failed: ${"${error?.stack || error}"}`, "error");', '        log("Update download failed: " + (error?.stack || error), "error");'),
    ('    title: `Nexora ${"${currentVersion}"}`,', '    title: "Nexora " + currentVersion,'),
    ('    message: `Nexora обновлена до версии ${"${currentVersion}"}`,', '    message: "Nexora обновлена до версии " + currentVersion,'),
    ('  if (result.response === 0) await shellImpl.openExternal(`https://github.com/Onmaynec/Nexora/releases/tag/v${"${currentVersion}"}`);', '  if (result.response === 0) await shellImpl.openExternal("https://github.com/Onmaynec/Nexora/releases/tag/v" + currentVersion);'),
    ('  log(`Post-update notes displayed for ${"${currentVersion}"}`, "info");', '  log("Post-update notes displayed for " + currentVersion, "info");'),
    ('  return `\'${"${String(value).replace(/\'/g, "\'\'")}"}\'`;', '  return "\'" + String(value).replace(/\'/g, "\'\'") + "\'";'),
    ('    `if (!(Test-Path -LiteralPath ${"${powershellLiteral(logFile)}"})) { New-Item -ItemType File -Force -Path ${"${powershellLiteral(logFile)}"} | Out-Null }`,', '    "if (!(Test-Path -LiteralPath " + powershellLiteral(logFile) + ")) { New-Item -ItemType File -Force -Path " + powershellLiteral(logFile) + " | Out-Null }",'),
    ('    `Get-Content -LiteralPath ${"${powershellLiteral(logFile)}"} -Tail 200 -Wait`,', '    "Get-Content -LiteralPath " + powershellLiteral(logFile) + " -Tail 200 -Wait",'),
    ('      logClient(\\`update ${"${state.status}"}${"${state.availableVersion ? ` ${state.availableVersion}` : ""}"}\\`, state.status === "error" ? "error" : "info");', '      logClient("update " + state.status + (state.availableVersion ? " " + state.availableVersion : ""), state.status === "error" ? "error" : "info");'),
    ('        const result = await dialog.showMessageBox(mainWindow, { type: "info", title: "Обновление Nexora", message: \\`Nexora ${"${state.availableVersion}"} готова к установке.\\`, buttons: ["Перезапустить и установить", "Позже"], defaultId: 0, cancelId: 1 });', '        const result = await dialog.showMessageBox(mainWindow, { type: "info", title: "Обновление Nexora", message: "Nexora " + state.availableVersion + " готова к установке.", buttons: ["Перезапустить и установить", "Позже"], defaultId: 0, cancelId: 1 });'),
    ('  await logClient(\\`Client ${"${app.getVersion()}"} started${"${testModeRequested() ? " in test mode" : ""}"}\\`);', '  await logClient("Client " + app.getVersion() + " started" + (testModeRequested() ? " in test mode" : ""));'),
    ('  setTimeout(() => maybeShowPostUpdate({ appImpl: app, dialogImpl: dialog, shellImpl: shell, log: logClient }).catch((error) => logClient(\\`Post-update dialog failed: ${"${error?.stack || error}"}\\`, "error")), 900);', '  setTimeout(() => maybeShowPostUpdate({ appImpl: app, dialogImpl: dialog, shellImpl: shell, log: logClient }).catch((error) => logClient("Post-update dialog failed: " + (error?.stack || error), "error")), 900);'),
    ('    enforceRateLimit(trustRateLimits.recovery, \\`welcome-request:${"${request.trustAuth.user.id}"}:${"${requesterDeviceId}"}\\`, response, "Слишком много запросов MLS Welcome.");', '    enforceRateLimit(trustRateLimits.recovery, "welcome-request:" + request.trustAuth.user.id + ":" + requesterDeviceId, response, "Слишком много запросов MLS Welcome.");'),
    ('  await trustApi(\\`/conversations/${"${encodeURIComponent(conversationId)}"}/welcome/request\\`, { method: "POST", deviceId: device.id, body: {} });', '  await trustApi("/conversations/" + encodeURIComponent(conversationId) + "/welcome/request", { method: "POST", deviceId: device.id, body: {} });'),
]

applied = 0
for before, after in replacements:
    if before in source:
        source = source.replace(before, after)
        applied += 1

noop_anchor = 'replace("client/src/crypto/trust-client.js", "async function claimWelcome(device, conversationId) {", "async function claimWelcome(device, conversationId) {", "claimWelcome anchor");\n'
if noop_anchor in source:
    source = source.replace(noop_anchor, "")
    applied += 1

if applied < 19:
    raise SystemExit(f"Only {applied} patch corrections applied; expected at least 19")

file.write_text(source, encoding="utf-8")
print(f"Applied {applied} patch corrections")
