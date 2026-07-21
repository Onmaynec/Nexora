"use strict";

const form = document.querySelector("#connect-form");
const input = document.querySelector("#server-url");
const error = document.querySelector("#error");
const savedServers = document.querySelector("#saved-servers");
const confirmBox = document.querySelector("#fingerprint-confirm");
const confirmTitle = document.querySelector("#confirm-title");
const confirmFingerprint = document.querySelector("#confirm-fingerprint");
const confirmWarning = document.querySelector("#confirm-warning");
const connectionHelp = document.querySelector("#connection-help");
const canvas = document.querySelector("#particles");
const context = canvas.getContext("2d");
let points = [];
let pendingServer = null;

function resize() {
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  points = Array.from({ length: Math.min(90, Math.max(35, Math.floor(innerWidth * innerHeight / 16000))) }, () => ({ x: Math.random() * innerWidth, y: Math.random() * innerHeight, vx: (Math.random() - .5) * .2, vy: (Math.random() - .5) * .2 }));
}
function animate() {
  context.fillStyle = "#050308"; context.fillRect(0, 0, canvas.width, canvas.height);
  points.forEach((point, index) => {
    point.x += point.vx; point.y += point.vy;
    if (point.x < 0 || point.x > innerWidth) point.vx *= -1;
    if (point.y < 0 || point.y > innerHeight) point.vy *= -1;
    for (let other = index + 1; other < points.length; other += 1) {
      const target = points[other]; const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance < 135) { context.strokeStyle = `rgba(155,92,255,${(1 - distance / 135) * .3})`; context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(target.x, target.y); context.stroke(); }
    }
    context.fillStyle = "rgba(198,156,255,.75)"; context.beginPath(); context.arc(point.x, point.y, 1.2, 0, Math.PI * 2); context.fill();
  });
  requestAnimationFrame(animate);
}
resize(); animate(); addEventListener("resize", resize);

function setBusy(value) {
  const button = form.querySelector("button");
  button.disabled = value;
  button.firstChild.textContent = value ? "Проверяем сервер " : "Подключиться ";
}
function showConfirmation(result) {
  pendingServer = result.server;
  confirmBox.hidden = false;
  confirmTitle.textContent = result.changed ? "Сертификат сервера изменился" : "Новый сервер Nexora";
  confirmFingerprint.textContent = result.server.fingerprint;
  confirmWarning.textContent = result.changed
    ? `Внимание: сохранённый отпечаток был ${result.previousFingerprint}. Подтверждайте только после сверки на компьютере владельца.`
    : `Server ID: ${result.server.id} · версия ${result.server.version}`;
}
async function connect(url, confirmation = null) {
  error.textContent = "";
  connectionHelp.hidden = true;
  setBusy(true);
  try {
    const result = await window.nexoraClient.connect(url, confirmation);
    if (result.requiresConfirmation) showConfirmation(result);
  } catch (requestError) {
    error.textContent = requestError.message;
    connectionHelp.hidden = false;
  }
  finally { setBusy(false); }
}
function renderServers(config) {
  savedServers.replaceChildren();
  for (const server of config.servers || []) {
    const row = document.createElement("article");
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "saved-connect";
    const title = document.createElement("strong"); title.textContent = server.url;
    const detail = document.createElement("small"); detail.textContent = `v${server.version || "—"} · ${server.fingerprint}`;
    copy.append(title, detail); copy.addEventListener("click", () => { input.value = server.url; connect(server.url); });
    const remove = document.createElement("button"); remove.type = "button"; remove.className = "saved-remove"; remove.textContent = "×";
    remove.addEventListener("click", async () => renderServers(await window.nexoraClient.forgetServer(server.id)));
    row.append(copy, remove); savedServers.append(row);
  }
  if (!config.servers?.length) { const empty = document.createElement("p"); empty.textContent = "Список пуст — первое подключение потребует сверки отпечатка."; savedServers.append(empty); }
  if (config.legacyUrl) input.value = config.legacyUrl;
}

const queryError = new URLSearchParams(location.search).get("error");
const queryAddress = new URLSearchParams(location.search).get("address");
if (queryAddress) input.value = queryAddress;
if (queryError) { error.textContent = queryError; connectionHelp.hidden = false; }
window.nexoraClient.getConfig().then(renderServers);
form.addEventListener("submit", (event) => { event.preventDefault(); connect(input.value); });
document.querySelector("#confirm-server").addEventListener("click", () => pendingServer && connect(pendingServer.url, { serverId: pendingServer.id, fingerprint: pendingServer.fingerprint }));
document.querySelector("#cancel-confirm").addEventListener("click", () => { pendingServer = null; confirmBox.hidden = true; });
input.addEventListener("input", () => { pendingServer = null; confirmBox.hidden = true; error.textContent = ""; connectionHelp.hidden = true; });
