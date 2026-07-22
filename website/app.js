(() => {
  "use strict";

  const REPO = "Onmaynec/Nexora";
  const API = `https://api.github.com/repos/${REPO}`;
  const RAW_PACKAGE = `https://raw.githubusercontent.com/${REPO}/main/package.json`;
  const FALLBACK_VERSION = "3.3.0";
  const RELEASES_URL = `https://github.com/${REPO}/releases`;
  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  };
  const state = {
    lang: storage.get("nexora-site-language") === "en" ? "en" : "ru",
    releases: [],
    selectedRelease: null,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
    mobile: matchMedia("(hover: none), (pointer: coarse)").matches,
  };

  const ru = {
    skip: "Перейти к содержимому", menuOpen: "Открыть меню", navProduct: "Продукт", navArchitecture: "Архитектура", navSecurity: "Безопасность", navPulse: "Pulse", navDownloads: "Загрузки", navDocs: "Документация",
    heroStatus: "Линия выпуска", ciLoading: "проверяем CI…", heroTitleA: "Коммуникации", heroTitleB: "под вашим контролем.", heroLead: "Nexora объединяет Local Server, Windows Client, PWA, Android, Trust Core и отдельный Pulse-контур. Сообщения и комнаты остаются на выбранном вами сервере.",
    downloadNexora: "Скачать Nexora", openGithub: "Открыть GitHub", heroFactPlatforms: "Платформы", heroFactProtocols: "Протоколы", heroFactLicense: "Лицензия", conversations: "РАЗГОВОРЫ", architectureReady: "Архитектура готова", membersSecure: "8 участников · secure conversation", today: "СЕГОДНЯ", mockOne: "Local Server остаётся authority для комнат, ролей и доставки ciphertext.", mockTwo: "Импульсы расходуются на оформление и возможности комнат, а не на базовое общение.", mockThree: "Принято. Проверяем release evidence и публикуем артефакты.", you: "Вы", delivered: "доставлено · 2", messagePlaceholder: "Сообщение в Nexora Team",
    repositoryTitle: "Состояние проекта — из GitHub, а не из макета.", openReleases: "Открыть Releases", metricVersion: "Актуальная версия", liveValue: "live value", metricIssues: "Открытые issues", metricReleases: "Релизы", checking: "проверяем…", evidenceDatabase: "SQLite WAL/FULL, migration и integrity gates", evidenceTrust: "Device-scoped delivery и ciphertext-only persistence", evidenceAssets: "SHA-256, SBOM и явная маркировка подписи",
    productTitle: "Не просто чат.<br><em>Полный коммуникационный контур.</em>", productLead: "Диалоги, комнаты, медиа, offline-first поведение, эксплуатация, Trust Core и Pulse собраны в одной архитектуре без обязательной передачи локальной переписки в централизованное облако.", messagingTitle: "Диалоги, комнаты и рабочие сценарии", messagingText: "Replies, threads, reactions, mentions, polls, edit history, drafts, bookmarks, scheduled send и durable outbox.", trustCardTitle: "Device-scoped secure messaging", trustCardText: "Ed25519 identity, verified devices, MLS epochs, replay protection и encrypted local state.", adminTitle: "Server-side policies", adminText: "Owner, moderator, member, bans, invites, join requests, read-only, slow mode и media restrictions.", mediaTitle: "Validated and encrypted media", mediaText: "Actual MIME detection, SHA-256, safe names, previews, voice waveform и AES-256-GCM secure attachments.", pulseCardTitle: "Импульсы с реальным назначением", pulseCardText: "Каталог оформления профиля, сообщений и комнат, коллективные цели, double-entry ledger, idempotency и подписанные права.",
    architectureTitle: "Три контура.<br><em>Чёткие authority-границы.</em>", architectureLead: "Клиент хранит приватное состояние, Local Server управляет доступом и доставкой, Pulse Cloud отвечает только за Cloud Identity, ledger и production entitlements.", archClient: "UI, offline state, device keys, MLS encryption/decryption и verified media preview.", archServerTitle: "Локальный источник истины", archServer: "Accounts, sessions, rooms, roles, policies, ordering, ciphertext delivery, audit и backup.", archCloudTitle: "Опциональный Cloud authority", archCloud: "Subscriptions, provider reconciliation, Impulse ledger и signed production entitlements.", matrixClient: "Private MLS state и attachment keys остаются на устройстве.", matrixServer: "Роли, bans и room restrictions проверяются сервером.", matrixCloud: "Pulse не хранит локальные сообщения.",
    securityTitle: "Проверяемые ограничения.<br><em>Без вымышленных процентов.</em>", securityLead: "Числа ниже закреплены в серверном коде и проверяются автоматическими тестами.", limitDevices: "Активных Trust devices", perAccount: "на учётную запись", atomicLimit: "атомарный лимит", totalInventory: "общий inventory", lifeOne: "Клиент создаёт локальный Ed25519 identity key.", lifeTwo: "Регистрация подтверждает владение private key.", lifeThree: "Устройство получает подписанное подтверждение.", lifeFour: "Ciphertext доставляется verified devices.", lifeFive: "Отзыв прекращает secure delivery и очищает local state.",
    pulseTitle: "Импульсы можно<br><em>действительно потратить.</em>", pulseLead: "Каталог не блокирует сообщения, безопасность или базовые функции. Все списания выполняются сервером атомарно и идемпотентно.", catalogProfile: "Неоновая рамка", catalogMessages: "Стиль Prism", catalogReactions: "Набор Nova", catalogRoom: "Тема Midnight",
    downloadsTitle: "Выберите версию.<br><em>Затем платформу.</em>", downloadsLead: "Карточки получают реальные assets из GitHub Releases. Неподписанные тестовые сборки маркируются явно и не подключаются к production updater.", versionLabel: "Версия", releaseLoading: "загружаем release metadata…", clientDownloadText: "Desktop shell, auto-update, certificate pinning и test-mode diagnostics.", serverDownloadText: "Local Server shell, audited console, backup, health и controlled shutdown.", pwaDownloadText: "Installable web client with Service Worker, IndexedDB cache и durable outbox.", androidDownloadText: "WebView shell with system TLS trust store and shared product UI.", sourceTitle: "Исходный код", sourceDownloadText: "Полный repository snapshot для проверки и самостоятельной сборки.", downloadButton: "Скачать", downloadSource: "Скачать source", signatureTitle: "Подпись видна до скачивания", signatureText: "Signed production builds и UNSIGNED TEST builds не смешиваются. Updater принимает только подписанный Windows-канал.",
    docsTitle: "От продукта<br><em>до эксплуатации.</em>", docsLead: "Документация разделена по ответственности: продукт, архитектура, security model, deployment, operations, testing и Pulse.", docProduct: "Назначение, возможности и product boundaries.", docArchitecture: "Authority boundaries, data flow и storage.", docSecurity: "Threat model, Trust/MLS boundary и residual risks.", docDeployment: "HTTPS, firewall, origins и backups.", docOperations: "Startup, monitoring, restore и incidents.", docPulse: "Plus, Impulse catalog и entitlements.",
    ctaTitle: "Разверните собственный<br><em>контур коммуникаций.</em>", ctaText: "Скачайте проверяемый artifact, изучите исходный код и сопоставьте ограничения с release evidence.", ctaEvidence: "Факты публикации проверяются по GitHub Actions и assets выбранного релиза.", footerText: "Self-hosted messenger для Windows, browser/PWA и Android.",
    ciSuccess: "CI пройден", ciFailure: "CI завершён с ошибкой", ciUnknown: "CI недоступен", updatedAt: "обновлено", releaseFallback: "Опубликованные релизы пока недоступны", releaseSelected: "Выбран релиз", releasePrerelease: "prerelease", releaseStable: "stable", assetUnavailable: "Asset не опубликован", sourceArchive: "Source archive", apiUnavailable: "Live-данные GitHub временно недоступны",
  };
  const en = {
    skip: "Skip to content", menuOpen: "Open menu", navProduct: "Product", navArchitecture: "Architecture", navSecurity: "Security", navPulse: "Pulse", navDownloads: "Downloads", navDocs: "Documentation",
    heroStatus: "Release line", ciLoading: "checking CI…", heroTitleA: "Communication", heroTitleB: "under your control.", heroLead: "Nexora combines a Local Server, Windows Client, PWA, Android, Trust Core and an isolated Pulse boundary. Messages and rooms remain on the server you choose.",
    downloadNexora: "Download Nexora", openGithub: "Open GitHub", heroFactPlatforms: "Platforms", heroFactProtocols: "Protocols", heroFactLicense: "License", conversations: "CONVERSATIONS", architectureReady: "Architecture ready", membersSecure: "8 members · secure conversation", today: "TODAY", mockOne: "The Local Server remains the authority for rooms, roles and ciphertext delivery.", mockTwo: "Impulses fund visual customization and room capabilities, never basic messaging.", mockThree: "Accepted. Verifying release evidence and publishing artifacts.", you: "You", delivered: "delivered · 2", messagePlaceholder: "Message Nexora Team",
    repositoryTitle: "Project state from GitHub, not from a mockup.", openReleases: "Open Releases", metricVersion: "Current version", liveValue: "live value", metricIssues: "Open issues", metricReleases: "Releases", checking: "checking…", evidenceDatabase: "SQLite WAL/FULL, migration and integrity gates", evidenceTrust: "Device-scoped delivery and ciphertext-only persistence", evidenceAssets: "SHA-256, SBOM and explicit signature labels",
    productTitle: "More than chat.<br><em>A complete communication boundary.</em>", productLead: "Conversations, rooms, media, offline-first behavior, operations, Trust Core and Pulse share one architecture without requiring local messages to enter a centralized cloud.", messagingTitle: "Conversations, rooms and workflows", messagingText: "Replies, threads, reactions, mentions, polls, edit history, drafts, bookmarks, scheduled send and durable outbox.", trustCardTitle: "Device-scoped secure messaging", trustCardText: "Ed25519 identity, verified devices, MLS epochs, replay protection and encrypted local state.", adminTitle: "Server-side policies", adminText: "Owner, moderator, member, bans, invites, join requests, read-only, slow mode and media restrictions.", mediaTitle: "Validated and encrypted media", mediaText: "Actual MIME detection, SHA-256, safe names, previews, voice waveform and AES-256-GCM secure attachments.", pulseCardTitle: "Impulses with a real purpose", pulseCardText: "Profile, message and room customization, collective goals, a double-entry ledger, idempotency and signed entitlements.",
    architectureTitle: "Three boundaries.<br><em>Clear authority ownership.</em>", architectureLead: "The Client keeps private state, the Local Server controls access and delivery, and Pulse Cloud handles only Cloud Identity, ledger and production entitlements.", archClient: "UI, offline state, device keys, MLS encryption/decryption and verified media preview.", archServerTitle: "Local source of truth", archServer: "Accounts, sessions, rooms, roles, policies, ordering, ciphertext delivery, audit and backup.", archCloudTitle: "Optional Cloud authority", archCloud: "Subscriptions, provider reconciliation, Impulse ledger and signed production entitlements.", matrixClient: "Private MLS state and attachment keys stay on the device.", matrixServer: "Roles, bans and room restrictions are enforced by the server.", matrixCloud: "Pulse never stores local messages.",
    securityTitle: "Verifiable limits.<br><em>No invented percentages.</em>", securityLead: "The numbers below are fixed in server code and covered by automated tests.", limitDevices: "Active Trust devices", perAccount: "per account", atomicLimit: "atomic limit", totalInventory: "total inventory", lifeOne: "The Client creates a local Ed25519 identity key.", lifeTwo: "Registration proves private-key possession.", lifeThree: "The device receives signed verification.", lifeFour: "Ciphertext is delivered to verified devices.", lifeFive: "Revocation stops secure delivery and clears local state.",
    pulseTitle: "Impulses can be<br><em>actually spent.</em>", pulseLead: "The catalog never gates messages, security or core features. Every debit is atomic and idempotent on the server.", catalogProfile: "Neon frame", catalogMessages: "Prism style", catalogReactions: "Nova pack", catalogRoom: "Midnight theme",
    downloadsTitle: "Choose a version.<br><em>Then a platform.</em>", downloadsLead: "Cards resolve real GitHub Release assets. Unsigned test builds are clearly labelled and never connected to the production updater.", versionLabel: "Version", releaseLoading: "loading release metadata…", clientDownloadText: "Desktop shell, auto-update, certificate pinning and test-mode diagnostics.", serverDownloadText: "Local Server shell, audited console, backup, health and controlled shutdown.", pwaDownloadText: "Installable web client with Service Worker, IndexedDB cache and durable outbox.", androidDownloadText: "WebView shell with system TLS trust store and shared product UI.", sourceTitle: "Source code", sourceDownloadText: "Complete repository snapshot for review and independent builds.", downloadButton: "Download", downloadSource: "Download source", signatureTitle: "Signature status is visible before download", signatureText: "Signed production builds and UNSIGNED TEST builds are never mixed. The updater accepts only the signed Windows channel.",
    docsTitle: "From product<br><em>to operations.</em>", docsLead: "Documentation is split by responsibility: product, architecture, security model, deployment, operations, testing and Pulse.", docProduct: "Purpose, capabilities and product boundaries.", docArchitecture: "Authority boundaries, data flow and storage.", docSecurity: "Threat model, Trust/MLS boundary and residual risks.", docDeployment: "HTTPS, firewall, origins and backups.", docOperations: "Startup, monitoring, restore and incidents.", docPulse: "Plus, Impulse catalog and entitlements.",
    ctaTitle: "Deploy your own<br><em>communication boundary.</em>", ctaText: "Download a verifiable artifact, inspect the source and compare limitations against release evidence.", ctaEvidence: "Publication facts are verifiable through GitHub Actions and selected release assets.", footerText: "Self-hosted messenger for Windows, browser/PWA and Android.",
    ciSuccess: "CI passed", ciFailure: "CI failed", ciUnknown: "CI unavailable", updatedAt: "updated", releaseFallback: "Published releases are currently unavailable", releaseSelected: "Selected release", releasePrerelease: "prerelease", releaseStable: "stable", assetUnavailable: "Asset not published", sourceArchive: "Source archive", apiUnavailable: "GitHub live data is temporarily unavailable",
  };
  const dictionaries = { ru, en };
  const t = (key) => dictionaries[state.lang][key] || ru[key] || key;

  function applyLanguage(language) {
    state.lang = language === "en" ? "en" : "ru";
    storage.set("nexora-site-language", state.lang);
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-lang]").forEach((button) => {
      const active = button.dataset.lang === state.lang;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const value = t(element.dataset.i18n);
      if (/<(?:br|em)>/.test(value)) element.innerHTML = value;
      else element.textContent = value;
    });
    renderRelease();
    updateWorkflowCopy();
  }

  document.addEventListener("click", (event) => {
    const languageButton = event.target.closest("[data-lang]");
    if (languageButton) {
      event.preventDefault();
      event.stopPropagation();
      applyLanguage(languageButton.dataset.lang);
    }
  });

  const header = document.querySelector("[data-header]");
  const menu = document.querySelector("[data-menu]");
  const menuButton = document.querySelector("[data-menu-button]");
  const progress = document.querySelector("[data-scroll-progress]");
  const navLinks = [...document.querySelectorAll(".site-nav a")];
  function closeMenu() {
    menu?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  }
  menuButton?.addEventListener("click", (event) => {
    event.preventDefault();
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(open));
    menu?.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
  });
  navLinks.forEach((link) => link.addEventListener("click", closeMenu));
  addEventListener("resize", () => { if (innerWidth > 1040) closeMenu(); }, { passive: true });

  let scrollScheduled = false;
  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    if (progress) progress.style.width = `${Math.min(100, Math.max(0, scrollY / max * 100))}%`;
    header?.classList.toggle("scrolled", scrollY > 18);
    scrollScheduled = false;
  }
  addEventListener("scroll", () => {
    if (!scrollScheduled) { scrollScheduled = true; requestAnimationFrame(updateScroll); }
  }, { passive: true });
  updateScroll();

  const revealObserver = new IntersectionObserver((entries) => entries.forEach((entry) => {
    if (entry.isIntersecting) { entry.target.classList.add("visible"); revealObserver.unobserve(entry.target); }
  }), { threshold: .08, rootMargin: "0px 0px -6%" });
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));
  const sectionObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-26% 0px -60%", threshold: [.05, .2, .5] });
  navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean).forEach((section) => sectionObserver.observe(section));

  class AetherField {
    constructor(canvas) {
      this.canvas = canvas;
      this.context = canvas?.getContext("2d", { alpha: true });
      this.points = [];
      this.frame = 0;
      this.pointer = { x: null, y: null };
      if (!this.context) return;
      this.resize = this.resize.bind(this);
      this.draw = this.draw.bind(this);
      addEventListener("resize", this.resize, { passive: true });
      if (!state.mobile) {
        addEventListener("pointermove", (event) => { this.pointer.x = event.clientX; this.pointer.y = event.clientY; }, { passive: true });
        addEventListener("pointerleave", () => { this.pointer.x = null; this.pointer.y = null; });
      }
      this.resize();
      if (state.reducedMotion) this.render(0); else this.frame = requestAnimationFrame(this.draw);
    }
    resize() {
      const ratio = Math.min(devicePixelRatio || 1, 1.5);
      this.width = document.documentElement.clientWidth || innerWidth;
      this.height = innerHeight;
      this.canvas.width = Math.floor(this.width * ratio);
      this.canvas.height = Math.floor(this.height * ratio);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
      const count = Math.max(24, Math.min(state.mobile ? 52 : 115, Math.round(this.width * this.height / 15000)));
      this.points = Array.from({ length: count }, () => ({ x: Math.random() * this.width, y: Math.random() * this.height, vx: (Math.random() - .5) * .25, vy: (Math.random() - .5) * .25, size: .7 + Math.random() * 1.6 }));
    }
    draw(time) { this.render(time); this.frame = requestAnimationFrame(this.draw); }
    render(time) {
      const context = this.context;
      context.clearRect(0, 0, this.width, this.height);
      const maxDistance = state.mobile ? 105 : 135;
      for (const point of this.points) {
        point.x += point.vx; point.y += point.vy;
        if (point.x < -5) point.x = this.width + 5; if (point.x > this.width + 5) point.x = -5;
        if (point.y < -5) point.y = this.height + 5; if (point.y > this.height + 5) point.y = -5;
        const pointerDistance = this.pointer.x == null ? Infinity : Math.hypot(point.x - this.pointer.x, point.y - this.pointer.y);
        if (pointerDistance < 170 && pointerDistance > 1) { point.x += (point.x - this.pointer.x) / pointerDistance * 1.2; point.y += (point.y - this.pointer.y) / pointerDistance * 1.2; }
        context.beginPath(); context.arc(point.x, point.y, point.size * (.85 + Math.sin(time * .001 + point.x) * .15), 0, Math.PI * 2);
        context.fillStyle = pointerDistance < 170 ? "rgba(255,255,255,.78)" : "rgba(195,135,255,.54)"; context.fill();
      }
      for (let first = 0; first < this.points.length; first += 1) for (let second = first + 1; second < this.points.length; second += 1) {
        const a = this.points[first]; const b = this.points[second]; const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance >= maxDistance) continue;
        context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y);
        context.strokeStyle = `rgba(185,120,255,${(1 - distance / maxDistance) * .18})`; context.lineWidth = .65; context.stroke();
      }
    }
  }
  const canvas = document.querySelector("[data-aether]");
  if (canvas) new AetherField(canvas);

  function formatNumber(value) {
    return new Intl.NumberFormat(state.lang === "ru" ? "ru-RU" : "en-US", { notation: Number(value) >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(Number(value || 0));
  }
  function formatBytes(value) {
    const bytes = Number(value || 0);
    if (!bytes) return "—";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
    return `${(bytes / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  }
  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(state.lang === "ru" ? "ru-RU" : "en-US", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }
  async function fetchJson(url, options = {}) {
    const response = await fetch(url, { ...options, headers: { Accept: "application/vnd.github+json", ...(options.headers || {}) } });
    if (!response.ok) throw new Error(`GitHub API ${response.status}`);
    return response.json();
  }

  let workflowState = null;
  function updateWorkflowCopy() {
    const label = document.querySelector("[data-ci-label]");
    const updated = document.querySelector("[data-ci-updated]");
    if (!workflowState) { if (label) label.textContent = t("ciUnknown"); if (updated) updated.textContent = t("ciUnknown"); return; }
    const success = workflowState.conclusion === "success";
    if (label) label.textContent = success ? t("ciSuccess") : t("ciFailure");
    if (updated) updated.textContent = `${t("updatedAt")} ${formatDate(workflowState.updated_at || workflowState.run_started_at)}`;
  }
  function setWorkflow(workflow) {
    workflowState = workflow || null;
    const metric = document.querySelector("[data-stat-ci]");
    if (metric) {
      metric.classList.remove("success", "failure");
      metric.textContent = !workflow ? "—" : workflow.conclusion === "success" ? "PASS" : String(workflow.conclusion || "UNKNOWN").toUpperCase();
      if (workflow) metric.classList.add(workflow.conclusion === "success" ? "success" : "failure");
    }
    updateWorkflowCopy();
  }

  const releaseSelect = document.querySelector("[data-release-select]");
  function assetScore(name, platform) {
    const value = String(name || "").toLowerCase();
    if (platform === "client") return /nexora.*client.*(?:setup|installer).*(?:\.exe|\.msi)$/.test(value) ? 100 : !/server/.test(value) && /nexora.*(?:setup|installer).*(?:\.exe|\.msi)$/.test(value) ? 60 : 0;
    if (platform === "server") return /nexora.*server.*(?:setup|installer).*(?:\.exe|\.msi)$/.test(value) ? 100 : 0;
    if (platform === "pwa") return /(?:nexora[-_. ]*)?pwa.*\.zip$/.test(value) ? 100 : 0;
    if (platform === "android") return /(?:nexora[-_. ]*)?(?:android|mobile).*\.apk$/.test(value) ? 100 : /(?:android|mobile).*\.zip$/.test(value) ? 60 : 0;
    return 0;
  }
  function findAsset(release, platform) {
    return [...(release?.assets || [])].map((asset) => ({ asset, score: assetScore(asset.name, platform) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || Number(b.asset.size) - Number(a.asset.size))[0]?.asset || null;
  }
  function signatureState(asset) {
    const name = String(asset?.name || "");
    if (/unsigned|test-build|test\.exe/i.test(name)) return "unsigned";
    if (/\.exe$|\.msi$/i.test(name)) return "signed";
    return "neutral";
  }
  function populateReleaseSelect(version) {
    if (!releaseSelect) return;
    releaseSelect.replaceChildren();
    if (!state.releases.length) {
      releaseSelect.add(new Option(version || FALLBACK_VERSION, "fallback"));
      state.selectedRelease = null;
      renderRelease();
      return;
    }
    state.releases.forEach((release, index) => releaseSelect.add(new Option(`${release.tag_name}${release.prerelease ? " · prerelease" : ""}`, String(index))));
    state.selectedRelease = state.releases[0];
    releaseSelect.value = "0";
    renderRelease();
  }
  releaseSelect?.addEventListener("change", () => {
    const index = Number(releaseSelect.value);
    state.selectedRelease = Number.isInteger(index) ? state.releases[index] || null : null;
    renderRelease();
  });
  function renderRelease() {
    const release = state.selectedRelease;
    const url = release?.html_url || RELEASES_URL;
    const status = document.querySelector("[data-selected-release-state]");
    const link = document.querySelector("[data-selected-release-link]");
    const latest = document.querySelector("[data-latest-release-link]");
    if (link) link.href = url;
    if (latest) latest.href = url;
    if (status) status.textContent = release ? `${t("releaseSelected")}: ${release.tag_name} · ${release.prerelease ? t("releasePrerelease") : t("releaseStable")} · ${formatDate(release.published_at)}` : t("releaseFallback");
    ["client", "server", "pwa", "android"].forEach((platform) => {
      const asset = findAsset(release, platform);
      const card = document.querySelector(`[data-platform="${platform}"]`);
      const download = document.querySelector(`[data-download-link="${platform}"]`);
      const name = document.querySelector(`[data-asset-name="${platform}"]`);
      const size = document.querySelector(`[data-asset-size="${platform}"]`);
      if (download) { download.href = asset?.browser_download_url || url; download.classList.toggle("unavailable", !asset); }
      if (name) name.textContent = asset?.name || t("assetUnavailable");
      if (size) size.textContent = asset ? formatBytes(asset.size) : "GitHub";
      if (card) card.dataset.signature = asset ? signatureState(asset) : "neutral";
    });
    const sourceLink = document.querySelector('[data-download-link="source"]');
    const sourceName = document.querySelector('[data-asset-name="source"]');
    if (sourceLink) sourceLink.href = release?.zipball_url || `https://github.com/${REPO}/archive/refs/heads/main.zip`;
    if (sourceName) sourceName.textContent = release ? `${release.tag_name} · ${t("sourceArchive")}` : t("sourceArchive");
  }

  async function loadGitHubData() {
    const results = await Promise.allSettled([
      fetchJson(API),
      fetchJson(RAW_PACKAGE, { headers: {} }),
      fetchJson(`${API}/releases?per_page=16`),
      fetchJson(`${API}/actions/workflows/ci.yml/runs?branch=main&status=completed&per_page=1`),
    ]);
    const repo = results[0].status === "fulfilled" ? results[0].value : null;
    const packageData = results[1].status === "fulfilled" ? results[1].value : null;
    state.releases = results[2].status === "fulfilled" && Array.isArray(results[2].value) ? results[2].value : [];
    const workflow = results[3].status === "fulfilled" ? results[3].value?.workflow_runs?.[0] : null;
    const version = String(packageData?.version || state.releases[0]?.tag_name || FALLBACK_VERSION).replace(/^v/, "");
    document.querySelectorAll("[data-current-version]").forEach((element) => { element.textContent = version; });
    if (repo) {
      document.querySelector("[data-stat-stars]")?.replaceChildren(document.createTextNode(formatNumber(repo.stargazers_count)));
      document.querySelector("[data-stat-forks]")?.replaceChildren(document.createTextNode(formatNumber(repo.forks_count)));
      document.querySelector("[data-stat-issues]")?.replaceChildren(document.createTextNode(formatNumber(repo.open_issues_count)));
    }
    document.querySelector("[data-stat-releases]")?.replaceChildren(document.createTextNode(formatNumber(state.releases.length)));
    populateReleaseSelect(version);
    setWorkflow(workflow);
    if (!repo && !packageData && !state.releases.length && !workflow) showToast(t("apiUnavailable"));
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
  }
  document.querySelectorAll("[data-year]").forEach((element) => { element.textContent = String(new Date().getFullYear()); });
  applyLanguage(state.lang);
  loadGitHubData().catch(() => showToast(t("apiUnavailable")));
})();
