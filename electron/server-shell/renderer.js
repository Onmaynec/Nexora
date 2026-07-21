"use strict";

const elements = Object.fromEntries([
  "status-dot", "side-status-text", "server-toggle", "primary-url", "address-list", "qr",
  "metric-users", "metric-rooms", "metric-messages", "metric-storage", "metric-files", "first-admin",
  "users-body", "rooms-body", "log-list", "toast", "database-integrity", "database-details",
  "database-size", "storage-used", "storage-quota", "storage-quota-input", "retention-days", "backup-list",
  "password-modal", "password-form", "password-user", "password-user-id", "password-value", "backup-passphrase",
  "server-id", "certificate-fingerprint", "login-attempts-body", "security-form", "password-min-length",
  "password-upper", "password-lower", "password-number", "password-symbol", "login-max-attempts", "login-lock-minutes",
  "server-update-status", "check-server-update", "apply-server-update",
  "pulse-status-dot", "pulse-status-title", "pulse-status-detail",
].map((id) => [id, document.getElementById(id)]));
let status;
let logs = [];
let toastTimer;
let updateState = null;

function bytes(value) {
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} КБ`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} МБ`;
  return `${(value / 1024 ** 3).toFixed(2)} ГБ`;
}
function showToast(message) {
  clearTimeout(toastTimer); elements.toast.textContent = message; elements.toast.className = "visible";
  toastTimer = setTimeout(() => elements.toast.className = "", 2500);
}
function textCell(text, sub = "") {
  const td = document.createElement("td"); const strong = document.createElement("strong"); strong.textContent = text; td.append(strong);
  if (sub) { const small = document.createElement("small"); small.textContent = sub; td.append(small); }
  return td;
}
function simpleCell(text) { const td = document.createElement("td"); td.textContent = text; return td; }

function renderStatus(next) {
  status = next;
  elements["status-dot"].classList.toggle("online", next.running);
  elements["side-status-text"].textContent = `${next.running ? "Сервер работает" : "Сервер остановлен"} · v${next.version ?? "3.0.0"}`;
  elements["server-toggle"].textContent = next.running ? "Остановить" : "Запустить";
  elements["primary-url"].textContent = next.primaryUrl ?? "—";
  elements["server-id"].textContent = next.serverId ?? "—";
  elements["certificate-fingerprint"].textContent = next.fingerprint ?? "—";
  elements["metric-users"].textContent = next.stats?.users ?? 0;
  elements["metric-rooms"].textContent = next.stats?.rooms ?? 0;
  elements["metric-messages"].textContent = next.stats?.messages ?? 0;
  elements["metric-storage"].textContent = bytes(next.stats?.bytes ?? 0);
  elements["metric-files"].textContent = `${next.stats?.files ?? 0} файлов`;
  elements["database-integrity"].textContent = next.stats?.integrity === "ok" ? "Целостность подтверждена" : next.stats?.integrity === "closed" ? "База безопасно закрыта" : "Требуется проверка";
  elements["database-details"].textContent = `SQLite schema ${next.stats?.schemaVersion ?? "—"} · WAL · synchronous FULL`;
  elements["database-size"].textContent = bytes(next.stats?.databaseBytes ?? 0);
  elements["storage-used"].textContent = `${bytes(next.stats?.bytes ?? 0)} · ${next.stats?.quotaPercent ?? 0}%`;
  elements["storage-quota"].textContent = bytes(next.stats?.quotaBytes ?? 0);
  if (document.activeElement !== elements["storage-quota-input"]) elements["storage-quota-input"].value = ((next.stats?.quotaBytes ?? 0) / 1024 ** 3).toFixed(2).replace(/\.00$/, "");
  if (document.activeElement !== elements["retention-days"]) elements["retention-days"].value = String(next.stats?.fileRetentionDays ?? 0);
  elements["first-admin"].classList.toggle("hidden", !next.stats?.firstAccountPending);
  const pulse = next.pulse ?? { mode: "disabled", enabled: false };
  const pulseLabels = {
    production: ["Production подключён", pulse.billingAuthority || "Подписанный Nexora Billing"],
    sandbox: ["Sandbox активен", "Тестовые Plus и импульсы без реальных платежей"],
    misconfigured: ["Ошибка конфигурации", "Проверьте HTTPS URL, API key и публичный ключ"],
    disabled: ["Pulse отключён", "Nexora Free работает без платёжного сервиса"],
  };
  const [pulseTitle, pulseDetail] = pulseLabels[pulse.mode] ?? pulseLabels.disabled;
  elements["pulse-status-title"].textContent = pulseTitle;
  elements["pulse-status-detail"].textContent = pulseDetail;
  elements["pulse-status-dot"].className = pulse.mode;
  elements["address-list"].replaceChildren();
  (next.addresses ?? []).forEach((address) => {
    const button = document.createElement("button"); const label = document.createElement("span"); const type = document.createElement("b");
    label.textContent = address.url; type.textContent = address.isRadmin ? "RADMIN VPN" : "LOCAL";
    button.append(label, type); button.addEventListener("click", () => window.nexoraServer.copy(address.url).then(() => showToast("Адрес скопирован")));
    elements["address-list"].append(button);
  });
  if (next.qrCode) elements.qr.src = next.qrCode;
}

async function refreshAdmin() {
  const data = await window.nexoraServer.adminData();
  elements["users-body"].replaceChildren();
  data.users.forEach((user) => {
    const row = document.createElement("tr"); row.append(textCell(user.displayName, `@${user.username}`), simpleCell(user.role === "server_admin" ? "Администратор" : "Пользователь"), simpleCell(user.sessions));
    const state = document.createElement("td"); const pill = document.createElement("span"); pill.className = `status-pill${user.disabledAt ? " disabled" : ""}`; pill.textContent = user.disabledAt ? "Отключён" : "Активен"; state.append(pill); row.append(state);
    const action = document.createElement("td"); action.className = "row-actions";
    const reset = document.createElement("button"); reset.textContent = "Сбросить пароль"; reset.addEventListener("click", () => openPasswordModal(user)); action.append(reset);
    if (user.role !== "server_admin") { const button = document.createElement("button"); button.className = user.disabledAt ? "" : "danger"; button.textContent = user.disabledAt ? "Включить" : "Отключить"; button.addEventListener("click", async () => { await window.nexoraServer.toggleUser(user.id, !user.disabledAt); await refreshAdmin(); showToast("Статус пользователя изменён"); }); action.append(button); } row.append(action); elements["users-body"].append(row);
  });
  elements["rooms-body"].replaceChildren();
  data.rooms.forEach((room) => {
    const row = document.createElement("tr"); row.append(textCell(room.name, room.slug), simpleCell(room.privacy === "private" ? "Приватная" : "Публичная"), simpleCell(room.memberCount), simpleCell(room.messageCount));
    const action = document.createElement("td"); action.className = "row-actions"; const exportButton = document.createElement("button"); exportButton.textContent = "Экспорт"; exportButton.addEventListener("click", async () => { const result = await window.nexoraServer.exportRoom(room.id); if (!result.canceled) showToast("Сообщения комнаты экспортированы"); }); action.append(exportButton); if (room.slug !== "general") { const button = document.createElement("button"); button.className = "danger"; button.textContent = "Удалить"; button.addEventListener("click", async () => { if (!confirm(`Удалить комнату «${room.name}» и все её сообщения?`)) return; await window.nexoraServer.deleteRoom(room.id); await refreshAdmin(); showToast("Комната удалена"); }); action.append(button); } row.append(action); elements["rooms-body"].append(row);
  });
  const policy = data.securitySettings ?? {};
  elements["password-min-length"].value = policy.minLength ?? 10;
  elements["password-upper"].checked = policy.requireUpper !== false;
  elements["password-lower"].checked = policy.requireLower !== false;
  elements["password-number"].checked = policy.requireNumber !== false;
  elements["password-symbol"].checked = Boolean(policy.requireSymbol);
  elements["login-max-attempts"].value = policy.loginMaxAttempts ?? 5;
  elements["login-lock-minutes"].value = policy.loginLockMinutes ?? 15;
  elements["login-attempts-body"].replaceChildren();
  (data.loginAttempts ?? []).slice(0, 200).forEach((attempt) => {
    const row = document.createElement("tr");
    const state = document.createElement("td"); state.className = attempt.success ? "login-attempt-success" : "login-attempt-failed"; state.textContent = attempt.success ? "Успешно" : "Отказ";
    row.append(simpleCell(new Date(attempt.createdAt).toLocaleString("ru")), textCell(attempt.user?.displayName || attempt.username || "Неизвестный", attempt.user ? `@${attempt.user.username}` : ""), simpleCell(attempt.ip || "—"), state, simpleCell(attempt.reason || "—"));
    elements["login-attempts-body"].append(row);
  });
}

function openPasswordModal(user) {
  elements["password-user"].textContent = `${user.displayName} · @${user.username}`;
  elements["password-user-id"].value = user.id;
  elements["password-value"].value = "";
  elements["password-modal"].classList.add("visible");
  elements["password-modal"].setAttribute("aria-hidden", "false");
  elements["password-value"].focus();
}

function closePasswordModal() {
  elements["password-modal"].classList.remove("visible");
  elements["password-modal"].setAttribute("aria-hidden", "true");
}

async function refreshBackups() {
  const backups = await window.nexoraServer.listBackups();
  elements["backup-list"].replaceChildren();
  backups.slice(0, 12).forEach((backup) => {
    const row = document.createElement("article");
    const state = document.createElement("i"); state.className = backup.automatic ? "automatic" : "manual";
    const copy = document.createElement("span"); const title = document.createElement("strong"); const detail = document.createElement("small");
    title.textContent = backup.automatic ? "Автоматическая копия" : backup.reason === "pre-restore" ? "Перед восстановлением" : "Ручная копия";
    detail.textContent = `${new Date(backup.createdAt).toLocaleString("ru")} · ${bytes(backup.sizeBytes ?? 0)}`;
    copy.append(title, detail); const version = document.createElement("b"); version.textContent = `v${backup.appVersion ?? "—"}`;
    row.append(state, copy, version); elements["backup-list"].append(row);
  });
  if (!backups.length) { const empty = document.createElement("p"); empty.textContent = "Резервных копий пока нет"; elements["backup-list"].append(empty); }
}

function renderLogs() {
  elements["log-list"].replaceChildren();
  logs.slice(-300).forEach((entry) => {
    const row = document.createElement("div"); row.className = `log-row ${entry.level}`;
    const time = document.createElement("time"); time.textContent = new Date(entry.createdAt).toLocaleTimeString("ru");
    const level = document.createElement("b"); level.textContent = entry.level.toUpperCase();
    const message = document.createElement("span"); message.textContent = entry.message;
    row.append(time, level, message); elements["log-list"].append(row);
  });
  elements["log-list"].scrollTop = elements["log-list"].scrollHeight;
}

function renderUpdate(next) {
  updateState = next;
  const labels = {
    disabled: next.reason === "feed_not_configured" ? "Канал обновлений не настроен" : "Обновления недоступны в режиме разработки",
    idle: "Готов к ручной проверке", checking: "Проверяем обновления…", current: "Установлена актуальная версия",
    available: `Доступна версия ${next.availableVersion || "—"}`, downloading: `Загрузка ${next.progress || 0}%`,
    downloaded: `Версия ${next.availableVersion || "—"} готова к установке`, error: next.error || "Ошибка обновления",
  };
  elements["server-update-status"].textContent = labels[next.status] || "Готов к проверке";
  elements["apply-server-update"].disabled = !["available", "downloaded"].includes(next.status);
  elements["apply-server-update"].textContent = next.status === "downloaded" ? "Установить" : "Загрузить";
}

document.querySelectorAll("nav button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll("nav button,.view").forEach((item) => item.classList.remove("active"));
  button.classList.add("active"); document.getElementById(button.dataset.view).classList.add("active");
  document.getElementById("view-title").textContent = button.textContent;
  if (["users", "rooms", "security"].includes(button.dataset.view)) refreshAdmin();
  if (button.dataset.view === "storage") refreshBackups();
}));
elements["server-toggle"].addEventListener("click", async () => renderStatus(status?.running ? await window.nexoraServer.stop() : await window.nexoraServer.start()));
document.getElementById("copy-url").addEventListener("click", () => window.nexoraServer.copy(status.primaryUrl).then(() => showToast("Адрес скопирован")));
document.getElementById("copy-fingerprint").addEventListener("click", () => window.nexoraServer.copy(status.fingerprint).then(() => showToast("Отпечаток скопирован")));
document.getElementById("data-folder").addEventListener("click", () => window.nexoraServer.openDataFolder());
document.getElementById("export-cert").addEventListener("click", async () => { const result = await window.nexoraServer.exportCertificate(); if (!result.canceled) showToast("Сертификат экспортирован"); });
document.getElementById("open-cert").addEventListener("click", () => window.nexoraServer.openCertificate());
document.getElementById("refresh-users").addEventListener("click", refreshAdmin);
document.getElementById("refresh-rooms").addEventListener("click", refreshAdmin);
document.getElementById("create-backup").addEventListener("click", async () => { const password = elements["backup-passphrase"].value; if (password && password.length < 10) return showToast("Пароль копии должен содержать минимум 10 символов"); await window.nexoraServer.createBackup(password); await refreshBackups(); showToast(password ? "Зашифрованная резервная копия создана" : "Резервная копия создана"); });
document.getElementById("restore-backup").addEventListener("click", async () => { if (!confirm("Восстановить выбранную копию? Текущие данные будут предварительно сохранены.")) return; const result = await window.nexoraServer.restoreBackup(elements["backup-passphrase"].value); if (!result.canceled) { renderStatus(await window.nexoraServer.status()); await refreshAdmin(); await refreshBackups(); showToast("Данные восстановлены"); } });
document.getElementById("open-backups").addEventListener("click", () => window.nexoraServer.openBackups());
document.getElementById("cleanup-storage").addEventListener("click", async () => { const result = await window.nexoraServer.cleanupStorage(); renderStatus(await window.nexoraServer.status()); showToast(`Очистка завершена: ${result.orphans} потерянных файлов`); });
document.getElementById("save-storage").addEventListener("click", async () => { const quota = Number(elements["storage-quota-input"].value) * 1024 ** 3; const retention = Number(elements["retention-days"].value); await window.nexoraServer.updateStorage({ storageQuotaBytes: quota, fileRetentionDays: retention }); renderStatus(await window.nexoraServer.status()); showToast("Настройки хранения сохранены"); });
document.getElementById("password-cancel").addEventListener("click", closePasswordModal);
elements["password-modal"].addEventListener("mousedown", (event) => { if (event.target === elements["password-modal"]) closePasswordModal(); });
elements["password-form"].addEventListener("submit", async (event) => { event.preventDefault(); await window.nexoraServer.resetPassword(elements["password-user-id"].value, elements["password-value"].value); closePasswordModal(); await refreshAdmin(); showToast("Пароль сброшен, активные сессии завершены"); });
document.getElementById("refresh-security").addEventListener("click", refreshAdmin);
elements["security-form"].addEventListener("submit", async (event) => {
  event.preventDefault();
  await window.nexoraServer.updateSecurity({
    minLength: Number(elements["password-min-length"].value),
    requireUpper: elements["password-upper"].checked,
    requireLower: elements["password-lower"].checked,
    requireNumber: elements["password-number"].checked,
    requireSymbol: elements["password-symbol"].checked,
    loginMaxAttempts: Number(elements["login-max-attempts"].value),
    loginLockMinutes: Number(elements["login-lock-minutes"].value),
  });
  await refreshAdmin(); showToast("Политика безопасности сохранена");
});
elements["check-server-update"].addEventListener("click", async () => renderUpdate(await window.nexoraServer.checkForUpdates()));
elements["apply-server-update"].addEventListener("click", async () => {
  if (updateState?.status === "downloaded") { if (confirm("Остановить сервер и установить обновление?")) window.nexoraServer.installUpdate(); return; }
  renderUpdate(await window.nexoraServer.downloadUpdate());
});
document.getElementById("open-log-file").addEventListener("click", () => window.nexoraServer.openLogFile());
document.getElementById("clear-logs").addEventListener("click", () => { logs = []; renderLogs(); });
window.nexoraServer.onLog((entry) => { logs.push(entry); renderLogs(); });
window.nexoraServer.onStatus(renderStatus);
window.nexoraServer.onUpdate(renderUpdate);
window.nexoraServer.status().then(renderStatus);
window.nexoraServer.updateStatus().then(renderUpdate);
refreshAdmin();
