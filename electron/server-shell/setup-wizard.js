"use strict";

(() => {
  const KEY = "nexora:server-setup:3.1.0";
  if (localStorage.getItem(KEY) === "complete") return;

  let step = 0;
  let status = null;
  const steps = [
    {
      eyebrow: "WELCOME",
      title: "Подготовим Nexora Server",
      text: "Мастер проверит локальный HTTPS, каталог данных, резервное копирование и состояние Pulse. Настройки можно изменить позже в панели управления.",
    },
    {
      eyebrow: "LOCAL DATA",
      title: "Данные остаются у вас",
      text: "Сообщения, комнаты и вложения сохраняются в локальной SQLite-базе. Перед приглашением пользователей создайте первую резервную копию.",
    },
    {
      eyebrow: "TRUST & NETWORK",
      title: "Защищённое подключение",
      text: "Клиенты проверяют Server ID и SHA-256 отпечаток сертификата. Передавайте адрес только участникам доверенной сети.",
    },
    {
      eyebrow: "PULSE & FINISH",
      title: "Сервер готов к работе",
      text: "Базовый мессенджер работает независимо от Pulse Cloud. Монетизация активируется только после настройки подписанных Cloud-ответов.",
    },
  ];

  const root = document.createElement("div");
  root.className = "setup-wizard";
  root.innerHTML = `
    <div class="setup-wizard-backdrop"></div>
    <section class="setup-wizard-panel" role="dialog" aria-modal="true" aria-labelledby="setup-wizard-title">
      <header><div class="setup-wizard-brand"><i></i><span>NEXORA <b>SERVER</b></span></div><span id="setup-wizard-progress"></span></header>
      <div class="setup-wizard-content"><span class="eyebrow" id="setup-wizard-eyebrow"></span><h1 id="setup-wizard-title"></h1><p id="setup-wizard-text"></p><div id="setup-wizard-details"></div></div>
      <footer><button id="setup-wizard-back" type="button">Назад</button><button id="setup-wizard-next" class="primary" type="button">Продолжить</button></footer>
    </section>`;
  document.body.append(root);

  const progress = root.querySelector("#setup-wizard-progress");
  const eyebrow = root.querySelector("#setup-wizard-eyebrow");
  const title = root.querySelector("#setup-wizard-title");
  const text = root.querySelector("#setup-wizard-text");
  const details = root.querySelector("#setup-wizard-details");
  const back = root.querySelector("#setup-wizard-back");
  const next = root.querySelector("#setup-wizard-next");

  function safe(value) {
    return String(value ?? "—").replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[char]);
  }

  function renderDetails() {
    if (step === 0) {
      details.innerHTML = `<div class="setup-wizard-checks"><span>✓ Schema 7</span><span>✓ Local HTTPS</span><span>✓ Backup & restore</span><span>✓ API v3</span></div>`;
    } else if (step === 1) {
      details.innerHTML = `<dl><div><dt>Каталог данных</dt><dd>${safe(status?.dataDir)}</dd></div><div><dt>База данных</dt><dd>${safe(status?.databaseFile)}</dd></div><div><dt>Схема</dt><dd>${safe(status?.schemaVersion ?? status?.stats?.schemaVersion)}</dd></div></dl><button type="button" id="setup-open-data">Открыть каталог данных</button>`;
      details.querySelector("#setup-open-data")?.addEventListener("click", () => window.nexoraServer.openDataFolder());
    } else if (step === 2) {
      details.innerHTML = `<dl><div><dt>Server ID</dt><dd>${safe(status?.serverId)}</dd></div><div><dt>SHA-256</dt><dd>${safe(status?.fingerprint)}</dd></div><div><dt>Адрес</dt><dd>${safe(status?.primaryUrl || status?.localUrl)}</dd></div></dl><div class="setup-wizard-actions"><button type="button" id="setup-copy-url">Копировать адрес</button><button type="button" id="setup-export-cert">Экспортировать сертификат</button></div>`;
      details.querySelector("#setup-copy-url")?.addEventListener("click", () => window.nexoraServer.copy(status?.primaryUrl || status?.localUrl || ""));
      details.querySelector("#setup-export-cert")?.addEventListener("click", () => window.nexoraServer.exportCertificate());
    } else {
      const pulse = status?.pulseV3 || status?.pulse || {};
      details.innerHTML = `<dl><div><dt>Local Server</dt><dd>${status?.running ? "Работает" : "Остановлен"}</dd></div><div><dt>Pulse</dt><dd>${safe(pulse.mode || "disabled")}</dd></div><div><dt>Cloud sync</dt><dd>${pulse.sync?.running ? "Активен" : "Не активен"}</dd></div></dl><p class="setup-wizard-note">Первый зарегистрированный аккаунт станет администратором сервера.</p>`;
    }
  }

  function render() {
    const current = steps[step];
    progress.textContent = `${step + 1} / ${steps.length}`;
    eyebrow.textContent = current.eyebrow;
    title.textContent = current.title;
    text.textContent = current.text;
    back.disabled = step === 0;
    next.textContent = step === steps.length - 1 ? "Завершить настройку" : "Продолжить";
    renderDetails();
  }

  back.addEventListener("click", () => { if (step > 0) { step -= 1; render(); } });
  next.addEventListener("click", () => {
    if (step < steps.length - 1) { step += 1; render(); return; }
    localStorage.setItem(KEY, "complete");
    root.remove();
  });

  window.nexoraServer.status().then((value) => { status = value; render(); }).catch(() => render());
})();
