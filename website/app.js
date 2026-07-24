(() => {
  "use strict";

  const REPO = "Onmaynec/Nexora";
  const API = `https://api.github.com/repos/${REPO}`;
  const RAW_PACKAGE = `https://raw.githubusercontent.com/${REPO}/main/package.json`;
  const FALLBACK_VERSION = "3.4.0";
  const FALLBACK_RELEASE_URL = `https://github.com/${REPO}/releases`;
  const safeStorage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch {}
    },
  };
  const state = {
    lang: safeStorage.get("nexora-site-language") === "en" ? "en" : "ru",
    releases: [],
    selectedRelease: null,
    lowPower: false,
    mobile: matchMedia("(hover: none), (pointer: coarse)").matches,
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  };

  const dictionary = {
    ru: {
      skip: "Перейти к содержимому",
      menuOpen: "Открыть меню",
      navProduct: "Продукт",
      navArchitecture: "Архитектура",
      navSecurity: "Безопасность",
      navDownloads: "Загрузки",
      navDocs: "Документация",
      heroStatus: "Актуальная линия",
      ciLoading: "проверка CI…",
      heroTitleA: "Коммуникации",
      heroTitleB: "под вашим контролем.",
      heroLead: "Self-hosted платформа для частных серверов, команд и сообществ. Один интерфейс для Windows, PWA и Android, локальный authority-сервер и отдельный контур Pulse.",
      downloadNexora: "Скачать Nexora",
      openGithub: "Открыть GitHub",
      heroFactOneLabel: "Платформы",
      heroFactTwoLabel: "Протоколы",
      heroFactThreeLabel: "Лицензия",
      conversations: "РАЗГОВОРЫ",
      architectureReady: "Архитектура готова",
      threeDocs: "3 документа",
      membersSecure: "8 участников · server messaging",
      today: "СЕГОДНЯ",
      mockOne: "Local Server проверяет доступ, сохраняет и доставляет обычные сообщения.",
      mockTwo: "Cloud Identity и production entitlements изолированы от локального messaging-контура.",
      you: "Вы",
      mockThree: "Принято. Публикуем документацию и release evidence.",
      delivered: "доставлено · 2",
      messagePlaceholder: "Сообщение в Nexora Team",
      deviceVerified: "Legacy read-only",
      outboxDelivered: "Outbox delivered",
      liveTitle: "Состояние проекта прямо из GitHub.",
      openReleases: "Открыть Releases",
      metricVersion: "Актуальная версия",
      metricVersionHint: "main / package metadata",
      liveValue: "актуальное значение",
      metricIssues: "Открытые issues",
      metricReleases: "Релизы",
      fromGithub: "из GitHub API",
      checking: "проверка…",
      activityTitle: "Динамика коммитов",
      activityText: "График строится из открытой статистики GitHub и не содержит вымышленных показателей.",
      activityTotal: "коммитов за 12 недель",
      productTitle: "Не просто чат.<br><em>Полный коммуникационный контур.</em>",
      productLead: "Nexora объединяет messaging, комнаты, медиа, offline-first поведение, эксплуатацию, immutable legacy history и отдельный Cloud authority.",
      messagingTitle: "Диалоги, комнаты и рабочие сценарии",
      messagingText: "Replies, threads, reactions, mentions, polls, edit history, silent и scheduled send, drafts, bookmarks и durable outbox.",
      trustCardTitle: "Immutable legacy secure history",
      trustCardText: "Legacy ciphertext, IDs, epochs and timestamps remain read-only; new Trust/MLS writes are rejected.",
      adminTitle: "Server-side policies",
      adminText: "Owner, moderator, member, custom roles, bans, invites, join requests, read-only, slow mode и media restrictions.",
      mediaTitle: "Validated ordinary media",
      mediaText: "Resumable uploads, actual MIME detection, SHA-256, safe names, previews and responsive voice playback.",
      pulseTitle: "Изолированный Cloud authority",
      pulseText: "Cloud Identity, email verification, MFA, OAuth 2.1 + PKCE, Impulse ledger, receipts и подписанные production entitlements.",
      architectureTitle: "Три контура.<br><em>Чёткие authority-границы.</em>",
      architectureLead: "Клиент хранит приватное состояние, Local Server управляет доступом и порядком доставки, Pulse Cloud отвечает только за Cloud Identity, ledger и production entitlements.",
      archClient: "UI, offline cache, drafts, bounded outbox, uploads, voice and local legacy-cache viewing.",
      archServerTitle: "Локальный источник истины",
      archServer: "Accounts, sessions, rooms, roles, bans, policies, ordinary message delivery, storage, audit and backup.",
      archCloudTitle: "Опциональный Cloud authority",
      archCloud: "Subscriptions, provider reconciliation, Impulse ledger и signed production entitlements.",
      matrixClientTitle: "Private state",
      matrixClient: "Previously decrypted legacy content remains local and read-only; server export keeps ciphertext.",
      matrixServerTitle: "Access control",
      matrixServer: "Роли, bans, room restrictions и realtime-доступ проверяются сервером.",
      matrixCloudTitle: "Commercial boundary",
      matrixCloud: "Pulse не становится хранилищем локальных сообщений.",
      deliveryTitle: "От composer до активной сессии.",
      deliveryText: "Каждый переход показывает реальную границу ответственности, а не маркетинговый рейтинг.",
      deliveryOneTitle: "Compose",
      deliveryOne: "Client validates input",
      deliveryTwoTitle: "Validate",
      deliveryTwo: "Input, policy and media validation",
      deliveryThreeTitle: "Authorize",
      deliveryThree: "Session, membership, role and ban",
      deliveryFourTitle: "Persist",
      deliveryFour: "Message + delivery state",
      deliveryFiveTitle: "Deliver",
      deliveryFive: "Только активным участникам",
      deliverySixTitle: "Sync",
      deliverySix: "Realtime, cache and read state",
      trustTitle: "Проверяемая совместимость.<br><em>Legacy без новых записей.</em>",
      trustLead: "Schema 8 сохраняет legacy metadata и ciphertext, а все новые Trust/MLS mutations завершаются кодом LEGACY_READ_ONLY.",
      limitDevices: "SQLite schema",
      perAccount: "compatibility layer",
      atomicLimit: "terminal HTTP status",
      unclaimed: "MiB per ordinary file",
      totalInventory: "seconds per voice message",
      lifecycleTitle: "Legacy scope сохраняется без продолжения протокола.",
      lifeOneTitle: "Detect",
      lifeOne: "Schema 8 records identify legacy conversations and ciphertext.",
      lifeTwoTitle: "Preserve",
      lifeTwo: "IDs, epochs, timestamps and audit provenance remain unchanged.",
      lifeThreeTitle: "Lock",
      lifeThree: "HTTP and Socket.IO writes return LEGACY_READ_ONLY.",
      lifeFourTitle: "Read locally",
      lifeFour: "Existing local decrypted cache may be viewed without mutation.",
      lifeFiveTitle: "Export",
      lifeFive: "Immutable export records ciphertext and serverDecrypted=false.",
      downloadsTitle: "Выберите версию.<br><em>Затем платформу.</em>",
      downloadsLead: "Список версий и assets загружается из GitHub Releases. Если для платформы нет готового файла, сайт честно переводит на страницу выбранного релиза.",
      versionLabel: "Версия",
      releaseLoading: "загрузка release metadata…",
      clientDownloadText: "Desktop shell, auto-update, certificate pinning и test-mode diagnostics.",
      serverDownloadText: "Local Server shell, audited console, backup, health и controlled shutdown.",
      pwaDownloadText: "Installable web client with Service Worker, IndexedDB cache и durable outbox.",
      androidDownloadText: "WebView shell with system TLS trust store and shared product UI.",
      sourceTitle: "Исходный код",
      sourceDownloadText: "Полный repository snapshot для разработки, проверки и самостоятельной сборки.",
      downloadButton: "Скачать",
      downloadSource: "Скачать source",
      assessmentTitle: "Сильные стороны.<br><em>И реальные границы.</em>",
      assessmentLead: "Вместо общей пары пустых карточек — конкретная матрица: что готово, что распространяется как prerelease и какие проверки остаются внешними.",
      strengthsLabel: "СИЛЬНЫЕ СТОРОНЫ",
      strengthsTitle: "Контроль и полнота контура",
      strengthOneTitle: "Local-first authority",
      strengthOne: "Сообщения, комнаты и файлы не требуют централизованного Cloud.",
      strengthTwoTitle: "Server-side enforcement",
      strengthTwo: "Роли, bans, media restrictions и realtime access проверяются сервером.",
      strengthThreeTitle: "Cross-platform UI",
      strengthThree: "Windows, Browser/PWA и Android используют общий React-контур.",
      strengthFourTitle: "Open source",
      strengthFour: "MIT разрешает использование, изменение и распространение.",
      boundariesLabel: "ТЕКУЩИЕ ГРАНИЦЫ",
      boundariesTitle: "Prerelease и metadata visibility",
      boundaryOneTitle: "Independent audit",
      boundaryOne: "3.4.0 является post-MLS prerequisite и не заявляется как независимо проверенный stable-релиз.",
      boundaryTwoTitle: "Traffic metadata",
      boundaryTwo: "Сервер хранит обычные сообщения и видит membership, timing, IP context и delivery events.",
      boundaryThreeTitle: "Windows signing",
      boundaryThree: "Stable promotion зависит от Authenticode и packaged runtime gates.",
      boundaryFourTitle: "Calls",
      boundaryFour: "Voice/video calls и screen sharing не входят в текущий релиз.",
      matrixTitle: "Каналы распространения",
      prerelease: "Prerelease",
      available: "Доступно",
      sourceVerified: "Source verified",
      docsTitle: "От продукта<br><em>до эксплуатации.</em>",
      docsLead: "Документация разделена по ответственности: продукт, архитектура, security model, deployment, operations, testing и Pulse.",
      docProduct: "Назначение, возможности, платформы и product boundaries.",
      docArchitecture: "Authority boundaries, data flow, authorization и storage.",
      docSecurity: "Threat model, post-MLS legacy boundary and residual risks.",
      docDeployment: "HTTPS, reverse proxy, firewall, origins и backups.",
      docOperations: "Startup, monitoring, backup, restore и incidents.",
      docPulse: "Plus, Impulse, account linking и entitlements.",
      ctaTitle: "Разверните собственный<br><em>контур коммуникаций.</em>",
      ctaText: "Скачайте актуальную версию, изучите исходный код или проверьте release evidence.",
      footerText: "Self-hosted messenger для Windows, browser/PWA и Android.",
      ciSuccess: "CI пройден",
      ciFailure: "CI завершён с ошибкой",
      ciUnknown: "CI недоступен",
      updatedAt: "обновлено",
      releaseFallback: "GitHub Releases пока не вернул опубликованные версии",
      releaseSelected: "Выбран релиз",
      releasePrerelease: "prerelease",
      releaseStable: "stable",
      assetUnavailable: "Файл отсутствует — открыть релиз",
      sourceArchive: "Source archive",
      apiUnavailable: "Live-данные GitHub временно недоступны",
      noActivity: "Статистика активности ещё формируется",
    },
    en: {
      skip: "Skip to content",
      menuOpen: "Open menu",
      navProduct: "Product",
      navArchitecture: "Architecture",
      navSecurity: "Security",
      navDownloads: "Downloads",
      navDocs: "Documentation",
      heroStatus: "Current line",
      ciLoading: "checking CI…",
      heroTitleA: "Communication",
      heroTitleB: "under your control.",
      heroLead: "A self-hosted platform for private servers, teams and communities. One interface for Windows, PWA and Android, a local authority server and an isolated Pulse boundary.",
      downloadNexora: "Download Nexora",
      openGithub: "Open GitHub",
      heroFactOneLabel: "Platforms",
      heroFactTwoLabel: "Protocols",
      heroFactThreeLabel: "License",
      conversations: "CONVERSATIONS",
      architectureReady: "Architecture is ready",
      threeDocs: "3 documents",
      membersSecure: "8 members · server messaging",
      today: "TODAY",
      mockOne: "Local Server authorizes, stores and delivers ordinary messages.",
      mockTwo: "Cloud Identity and production entitlements are isolated from local messaging.",
      you: "You",
      mockThree: "Accepted. Publishing documentation and release evidence.",
      delivered: "delivered · 2",
      messagePlaceholder: "Message Nexora Team",
      deviceVerified: "Legacy read-only",
      outboxDelivered: "Outbox delivered",
      liveTitle: "Project state, directly from GitHub.",
      openReleases: "Open Releases",
      metricVersion: "Current version",
      metricVersionHint: "main / package metadata",
      liveValue: "live value",
      metricIssues: "Open issues",
      metricReleases: "Releases",
      fromGithub: "from GitHub API",
      checking: "checking…",
      activityTitle: "Commit activity",
      activityText: "The chart is built from public GitHub statistics and does not use invented performance values.",
      activityTotal: "commits over 12 weeks",
      productTitle: "More than chat.<br><em>A complete communication system.</em>",
      productLead: "Nexora combines messaging, rooms, media, offline-first behaviour, operations, immutable legacy history and an isolated Cloud authority.",
      messagingTitle: "Dialogs, rooms and work scenarios",
      messagingText: "Replies, threads, reactions, mentions, polls, edit history, silent and scheduled send, drafts, bookmarks and a durable outbox.",
      trustCardTitle: "Immutable legacy secure history",
      trustCardText: "Legacy ciphertext, IDs, epochs and timestamps remain read-only; new Trust/MLS writes are rejected.",
      adminTitle: "Server-side policies",
      adminText: "Owner, moderator, member, custom roles, bans, invites, join requests, read-only, slow mode and media restrictions.",
      mediaTitle: "Validated ordinary media",
      mediaText: "Resumable uploads, actual MIME detection, SHA-256, safe names, previews and responsive voice playback.",
      pulseTitle: "An isolated Cloud authority",
      pulseText: "Cloud Identity, email verification, MFA, OAuth 2.1 + PKCE, Impulse ledger, receipts and signed production entitlements.",
      architectureTitle: "Three boundaries.<br><em>Explicit authority.</em>",
      architectureLead: "The Client owns private state, Local Server controls access and delivery order, and Pulse Cloud is limited to Cloud Identity, ledger and production entitlements.",
      archClient: "UI, offline cache, drafts, bounded outbox, uploads, voice and local legacy-cache viewing.",
      archServerTitle: "Local source of truth",
      archServer: "Accounts, sessions, rooms, roles, bans, policies, ordinary message delivery, storage, audit and backup.",
      archCloudTitle: "Optional Cloud authority",
      archCloud: "Subscriptions, provider reconciliation, Impulse ledger and signed production entitlements.",
      matrixClientTitle: "Private state",
      matrixClient: "Private MLS state and attachment keys are not sent to Local Server.",
      matrixServerTitle: "Access control",
      matrixServer: "Roles, bans, room restrictions and realtime access are enforced by the server.",
      matrixCloudTitle: "Commercial boundary",
      matrixCloud: "Pulse does not become a store for local messages.",
      deliveryTitle: "From composer to a verified device.",
      deliveryText: "Each transition represents a real authority boundary, not a marketing score.",
      deliveryOneTitle: "Compose",
      deliveryOne: "Client validates input",
      deliveryTwoTitle: "Validate",
      deliveryTwo: "Input, policy and media validation",
      deliveryThreeTitle: "Authorize",
      deliveryThree: "Session, membership, role and ban",
      deliveryFourTitle: "Persist",
      deliveryFour: "Message + delivery state",
      deliveryFiveTitle: "Deliver",
      deliveryFive: "Verified member devices only",
      deliverySixTitle: "Sync",
      deliverySix: "Locally on recipient device",
      trustTitle: "Verifiable compatibility.<br><em>Legacy without new writes.</em>",
      trustLead: "The site presents only values enforced by code and documented by Nexora 3.2.x release evidence.",
      limitDevices: "SQLite schema",
      perAccount: "compatibility layer",
      atomicLimit: "atomic limit",
      unclaimed: "MiB per ordinary file",
      totalInventory: "total inventory",
      lifecycleTitle: "Device identity becomes part of access control.",
      lifeOneTitle: "Detect",
      lifeOne: "The Client creates a non-extractable Ed25519 identity key.",
      lifeTwoTitle: "Preserve",
      lifeTwo: "IDs, epochs, timestamps and audit provenance remain unchanged.",
      lifeThreeTitle: "Lock",
      lifeThree: "An additional device receives signed approval.",
      lifeFourTitle: "Read locally",
      lifeFour: "Existing local decrypted cache may be viewed without mutation.",
      lifeFiveTitle: "Export",
      lifeFive: "Revocation disconnects the secure socket and clears local state.",
      downloadsTitle: "Choose a version.<br><em>Then a platform.</em>",
      downloadsLead: "Versions and assets are loaded from GitHub Releases. When a platform file is unavailable, the site links to the selected release instead of inventing a download.",
      versionLabel: "Version",
      releaseLoading: "loading release metadata…",
      clientDownloadText: "Desktop shell, auto-update, certificate pinning and test-mode diagnostics.",
      serverDownloadText: "Local Server shell, audited console, backup, health and controlled shutdown.",
      pwaDownloadText: "Installable web client with Service Worker, IndexedDB cache and durable outbox.",
      androidDownloadText: "WebView shell with the system TLS trust store and shared product UI.",
      sourceTitle: "Source code",
      sourceDownloadText: "A complete repository snapshot for development, review and self-builds.",
      downloadButton: "Download",
      downloadSource: "Download source",
      assessmentTitle: "Strengths.<br><em>And real boundaries.</em>",
      assessmentLead: "Instead of two sparse generic cards, this matrix states what is ready, what ships as prerelease and which checks remain external.",
      strengthsLabel: "STRENGTHS",
      strengthsTitle: "Control and product coverage",
      strengthOneTitle: "Local-first authority",
      strengthOne: "Messages, rooms and files do not require a central cloud.",
      strengthTwoTitle: "Server-side enforcement",
      strengthTwo: "Roles, bans, media restrictions and realtime access are enforced by the server.",
      strengthThreeTitle: "Cross-platform UI",
      strengthThree: "Windows, Browser/PWA and Android share the React product layer.",
      strengthFourTitle: "Open source",
      strengthFour: "MIT permits use, modification and distribution.",
      boundariesLabel: "CURRENT BOUNDARIES",
      boundariesTitle: "Prerelease and metadata visibility",
      boundaryOneTitle: "Independent audit",
      boundaryOne: "The 3.2.x line is not presented as an independently audited E2EE system.",
      boundaryTwoTitle: "Traffic metadata",
      boundaryTwo: "The server observes membership, timing, IP context, ciphertext size and delivery events.",
      boundaryThreeTitle: "Windows signing",
      boundaryThree: "Stable promotion depends on Authenticode and packaged runtime gates.",
      boundaryFourTitle: "Calls",
      boundaryFour: "Voice/video calls and screen sharing are outside the current release.",
      matrixTitle: "Distribution channels",
      prerelease: "Prerelease",
      available: "Available",
      sourceVerified: "Source verified",
      docsTitle: "From product<br><em>to operations.</em>",
      docsLead: "Documentation is separated by responsibility: product, architecture, security model, deployment, operations, testing and Pulse.",
      docProduct: "Purpose, capabilities, platforms and product boundaries.",
      docArchitecture: "Authority boundaries, data flow, authorization and storage.",
      docSecurity: "Threat model, Trust/MLS boundary and residual risks.",
      docDeployment: "HTTPS, reverse proxy, firewall, origins and backups.",
      docOperations: "Startup, monitoring, backup, restore and incidents.",
      docPulse: "Plus, Impulse, account linking and entitlements.",
      ctaTitle: "Deploy your own<br><em>communication boundary.</em>",
      ctaText: "Download the current version, inspect the source or review release evidence.",
      footerText: "Self-hosted messenger for Windows, browser/PWA and Android.",
      ciSuccess: "CI passed",
      ciFailure: "CI failed",
      ciUnknown: "CI unavailable",
      updatedAt: "updated",
      releaseFallback: "GitHub Releases has not returned published versions",
      releaseSelected: "Selected release",
      releasePrerelease: "prerelease",
      releaseStable: "stable",
      assetUnavailable: "Asset unavailable — open release",
      sourceArchive: "Source archive",
      apiUnavailable: "Live GitHub data is temporarily unavailable",
      noActivity: "Activity statistics are still being generated",
    },
  };

  const t = (key) => dictionary[state.lang][key] || dictionary.ru[key] || key;

  function applyLanguage(lang) {
    state.lang = lang === "en" ? "en" : "ru";
    safeStorage.set("nexora-site-language", state.lang);
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-lang]").forEach((button) => {
      button.classList.toggle("active", button.dataset.lang === state.lang);
      button.setAttribute("aria-pressed", String(button.dataset.lang === state.lang));
    });
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const value = t(element.dataset.i18n);
      if (value.includes("<br>") || value.includes("<em>")) element.innerHTML = value;
      else element.textContent = value;
    });
    renderSelectedRelease();
    updateCiCopy();
    const activityStatus = document.querySelector("[data-chart-status]");
    if (activityStatus && activityStatus.style.display !== "none") activityStatus.textContent = t("noActivity");
  }

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });

  const header = document.querySelector("[data-header]");
  const menu = document.querySelector("[data-menu]");
  const menuButton = document.querySelector("[data-menu-button]");
  const navLinks = [...document.querySelectorAll(".site-nav a")];
  const navSections = navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
  const progress = document.querySelector("[data-scroll-progress]");
  const cursorLight = document.querySelector("[data-cursor-light]");
  let scrollTicking = false;

  const closeMenu = () => {
    menu?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  };

  menuButton?.addEventListener("click", () => {
    const open = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(open));
    menu?.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);
  });
  navLinks.forEach((link) => link.addEventListener("click", closeMenu));
  addEventListener("resize", () => {
    if (innerWidth > 1040) closeMenu();
  }, { passive: true });

  function onScrollFrame() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const ratio = Math.min(1, Math.max(0, scrollY / max));
    if (progress) progress.style.width = `${ratio * 100}%`;
    header?.classList.toggle("scrolled", scrollY > 18);
    document.querySelectorAll("[data-parallax]").forEach((element) => {
      if (state.mobile || state.reducedMotion || state.lowPower) {
        element.style.translate = "";
        return;
      }
      const rect = element.getBoundingClientRect();
      const offset = (rect.top + rect.height / 2 - innerHeight / 2) * Number(element.dataset.parallax || 0);
      element.style.translate = `0 ${Math.max(-44, Math.min(44, -offset))}px`;
    });
    scrollTicking = false;
  }

  addEventListener("scroll", () => {
    if (!scrollTicking) {
      scrollTicking = true;
      requestAnimationFrame(onScrollFrame);
    }
  }, { passive: true });
  onScrollFrame();

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
      entry.target.querySelectorAll?.("[data-count]").forEach(animateCount);
      if (entry.target.matches?.("[data-count]")) animateCount(entry.target);
    });
  }, { threshold: .1, rootMargin: "0px 0px -7%" });
  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting)
      .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-28% 0px -58%", threshold: [.05, .2, .5] });
  navSections.forEach((section) => navObserver.observe(section));

  function animateCount(element) {
    if (element.dataset.counted === "true") return;
    element.dataset.counted = "true";
    const target = Number(element.dataset.count || 0);
    if (state.reducedMotion) {
      element.textContent = String(target);
      return;
    }
    const start = performance.now();
    const duration = 900;
    const frame = (time) => {
      const progressValue = Math.min(1, (time - start) / duration);
      const eased = 1 - Math.pow(1 - progressValue, 3);
      element.textContent = Math.round(target * eased).toLocaleString(state.lang === "ru" ? "ru-RU" : "en-US");
      if (progressValue < 1) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  if (finePointer.matches && !state.reducedMotion) {
    addEventListener("pointermove", (event) => {
      if (cursorLight) {
        cursorLight.classList.add("visible");
        cursorLight.style.left = `${event.clientX}px`;
        cursorLight.style.top = `${event.clientY}px`;
      }
    }, { passive: true });
    addEventListener("pointerleave", () => cursorLight?.classList.remove("visible"));

    document.querySelectorAll("[data-tilt]").forEach((card) => {
      let frame;
      const reset = () => {
        cancelAnimationFrame(frame);
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
        card.style.setProperty("--tz", "0px");
      };
      card.addEventListener("pointermove", (event) => {
        if (state.lowPower) return;
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width;
          const y = (event.clientY - rect.top) / rect.height;
          card.style.setProperty("--rx", `${(0.5 - y) * 7}deg`);
          card.style.setProperty("--ry", `${(x - 0.5) * 8}deg`);
          card.style.setProperty("--tz", "5px");
          card.style.setProperty("--gx", `${x * 100}%`);
          card.style.setProperty("--gy", `${y * 100}%`);
        });
      }, { passive: true });
      card.addEventListener("pointerleave", reset);
      card.addEventListener("blur", reset, true);
    });
  }

  function detectPerformanceTier() {
    const memory = Number(navigator.deviceMemory || 8);
    const cores = Number(navigator.hardwareConcurrency || 8);
    state.lowPower = state.mobile || memory <= 4 || cores <= 4;
    document.documentElement.dataset.performance = state.lowPower ? "reduced" : "full";
  }
  detectPerformanceTier();

  class AetherField {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas?.getContext("2d", { alpha: true });
      this.particles = [];
      this.mouse = { x: null, y: null, radius: 185 };
      this.running = false;
      this.frame = 0;
      this.last = 0;
      this.dpr = 1;
      this.resizeObserver = null;
      if (!this.ctx) return;
      this.resize = this.resize.bind(this);
      this.animate = this.animate.bind(this);
      this.pointerMove = this.pointerMove.bind(this);
      this.pointerLeave = this.pointerLeave.bind(this);
      this.visibility = this.visibility.bind(this);
      addEventListener("resize", this.resize, { passive: true });
      if (!state.mobile) {
        addEventListener("pointermove", this.pointerMove, { passive: true });
        addEventListener("pointerleave", this.pointerLeave, { passive: true });
      }
      document.addEventListener("visibilitychange", this.visibility);
      this.resize();
      this.start();
    }

    resize() {
      const maxDpr = state.lowPower ? 1.15 : 1.55;
      this.dpr = Math.min(devicePixelRatio || 1, maxDpr);
      this.width = document.documentElement.clientWidth || innerWidth;
      this.height = Math.round(window.visualViewport?.height || innerHeight);
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.initParticles();
    }

    initParticles() {
      const area = this.width * this.height;
      const divisor = state.lowPower ? 25000 : 13500;
      const cap = state.lowPower ? 54 : 132;
      const count = Math.max(24, Math.min(cap, Math.round(area / divisor)));
      this.particles = Array.from({ length: count }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        vx: (Math.random() - .5) * (state.lowPower ? .18 : .31),
        vy: (Math.random() - .5) * (state.lowPower ? .18 : .31),
        size: .7 + Math.random() * 1.7,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    pointerMove(event) {
      this.mouse.x = event.clientX;
      this.mouse.y = event.clientY;
    }

    pointerLeave() {
      this.mouse.x = null;
      this.mouse.y = null;
    }

    visibility() {
      if (document.hidden) this.stop();
      else this.start();
    }

    start() {
      if (this.running || document.hidden || state.reducedMotion) {
        if (state.reducedMotion) this.drawStatic();
        return;
      }
      this.running = true;
      this.last = performance.now();
      this.frame = requestAnimationFrame(this.animate);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.frame);
    }

    drawStatic() {
      this.ctx.clearRect(0, 0, this.width, this.height);
      this.particles.slice(0, 36).forEach((particle) => {
        this.ctx.beginPath();
        this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        this.ctx.fillStyle = "rgba(190,135,255,.34)";
        this.ctx.fill();
      });
    }

    animate(time) {
      if (!this.running) return;
      const delta = Math.min(2, Math.max(.4, (time - this.last) / 16.67));
      this.last = time;
      this.draw(delta, time);
      this.frame = requestAnimationFrame(this.animate);
    }

    draw(delta, time) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const mouseActive = this.mouse.x !== null && this.mouse.y !== null && !state.mobile;
      const connectDistance = state.lowPower ? 104 : 138;
      const connectSquared = connectDistance * connectDistance;

      for (const particle of this.particles) {
        if (mouseActive) {
          const dx = particle.x - this.mouse.x;
          const dy = particle.y - this.mouse.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared < this.mouse.radius * this.mouse.radius && distanceSquared > .01) {
            const distance = Math.sqrt(distanceSquared);
            const force = (1 - distance / this.mouse.radius) * (state.lowPower ? 1.2 : 2.8);
            particle.x += (dx / distance) * force;
            particle.y += (dy / distance) * force;
          }
        }

        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        if (particle.x < -8) particle.x = this.width + 8;
        if (particle.x > this.width + 8) particle.x = -8;
        if (particle.y < -8) particle.y = this.height + 8;
        if (particle.y > this.height + 8) particle.y = -8;

        const pulse = .7 + Math.sin(time * .0008 + particle.phase) * .25;
        const nearMouse = mouseActive && Math.hypot(particle.x - this.mouse.x, particle.y - this.mouse.y) < this.mouse.radius;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * pulse, 0, Math.PI * 2);
        ctx.fillStyle = nearMouse ? "rgba(255,255,255,.88)" : "rgba(191,128,255,.62)";
        ctx.fill();
      }

      for (let a = 0; a < this.particles.length; a += 1) {
        for (let b = a + 1; b < this.particles.length; b += 1) {
          const first = this.particles[a];
          const second = this.particles[b];
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= connectSquared) continue;
          const opacity = (1 - distanceSquared / connectSquared) * (state.lowPower ? .14 : .23);
          const nearMouse = mouseActive && (
            Math.hypot(first.x - this.mouse.x, first.y - this.mouse.y) < this.mouse.radius ||
            Math.hypot(second.x - this.mouse.x, second.y - this.mouse.y) < this.mouse.radius
          );
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(second.x, second.y);
          ctx.strokeStyle = nearMouse ? `rgba(255,255,255,${opacity * 1.75})` : `rgba(185,120,255,${opacity})`;
          ctx.lineWidth = nearMouse ? .9 : .65;
          ctx.stroke();
        }
      }
    }
  }

  const canvas = document.querySelector("[data-aether]");
  if (canvas) new AetherField(canvas);

  const formatNumber = (value) => {
    const number = Number(value || 0);
    return new Intl.NumberFormat(state.lang === "ru" ? "ru-RU" : "en-US", {
      notation: number >= 10000 ? "compact" : "standard",
      maximumFractionDigits: 1,
    }).format(number);
  };

  const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (!value) return "—";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
    return `${(value / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
  };

  const formatDate = (value) => {
    if (!value) return "";
    try {
      return new Intl.DateTimeFormat(state.lang === "ru" ? "ru-RU" : "en-US", {
        year: "numeric", month: "short", day: "numeric",
      }).format(new Date(value));
    } catch {
      return "";
    }
  };

  const githubHeaders = { Accept: "application/vnd.github+json" };
  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { ...githubHeaders, ...(options.headers || {}) },
    });
    if (!response.ok) {
      const error = new Error(`GitHub API ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function fetchCommitActivity() {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`${API}/stats/commit_activity`, { headers: githubHeaders });
      if (response.status === 202) {
        await new Promise((resolve) => setTimeout(resolve, 1600));
        continue;
      }
      if (!response.ok) throw new Error(`Commit activity ${response.status}`);
      return response.json();
    }
    return [];
  }

  async function loadGitHubData() {
    const results = await Promise.allSettled([
      fetchJson(API),
      fetchJson(RAW_PACKAGE, { headers: {} }),
      fetchJson(`${API}/releases?per_page=12`),
      fetchJson(`${API}/actions/workflows/ci.yml/runs?branch=main&status=completed&per_page=1`),
      fetchCommitActivity(),
    ]);

    const [repoResult, packageResult, releasesResult, workflowResult, activityResult] = results;
    const repo = repoResult.status === "fulfilled" ? repoResult.value : null;
    const packageData = packageResult.status === "fulfilled" ? packageResult.value : null;
    const releases = releasesResult.status === "fulfilled" && Array.isArray(releasesResult.value) ? releasesResult.value : [];
    const workflow = workflowResult.status === "fulfilled" ? workflowResult.value?.workflow_runs?.[0] : null;
    const activity = activityResult.status === "fulfilled" && Array.isArray(activityResult.value) ? activityResult.value : [];

    const version = String(packageData?.version || releases[0]?.tag_name || FALLBACK_VERSION).replace(/^v/, "");
    document.querySelectorAll("[data-current-version]").forEach((element) => { element.textContent = version; });

    if (repo) {
      document.querySelector("[data-stat-stars]")?.replaceChildren(document.createTextNode(formatNumber(repo.stargazers_count)));
      document.querySelector("[data-stat-forks]")?.replaceChildren(document.createTextNode(formatNumber(repo.forks_count)));
      document.querySelector("[data-stat-issues]")?.replaceChildren(document.createTextNode(formatNumber(repo.open_issues_count)));
    }

    state.releases = releases;
    document.querySelector("[data-stat-releases]")?.replaceChildren(document.createTextNode(formatNumber(releases.length)));
    populateReleaseSelector(version);
    renderActivity(activity.slice(-12));
    setWorkflow(workflow);

    if (!repo && !packageData && !releases.length && !workflow) showToast(t("apiUnavailable"));
  }

  let workflowState = null;
  function setWorkflow(workflow) {
    workflowState = workflow || null;
    const metric = document.querySelector("[data-stat-ci]");
    if (!metric) return;
    metric.classList.remove("success", "failure");
    if (!workflow) {
      metric.textContent = "—";
    } else if (workflow.conclusion === "success") {
      metric.textContent = "PASS";
      metric.classList.add("success");
    } else {
      metric.textContent = String(workflow.conclusion || "UNKNOWN").toUpperCase();
      metric.classList.add("failure");
    }
    updateCiCopy();
  }

  function updateCiCopy() {
    const label = document.querySelector("[data-ci-label]");
    const updated = document.querySelector("[data-ci-updated]");
    if (!workflowState) {
      if (label) label.textContent = t("ciUnknown");
      if (updated) updated.textContent = t("ciUnknown");
      return;
    }
    const ok = workflowState.conclusion === "success";
    if (label) label.textContent = ok ? t("ciSuccess") : t("ciFailure");
    if (updated) updated.textContent = `${t("updatedAt")} ${formatDate(workflowState.updated_at || workflowState.run_started_at)}`;
  }

  function renderActivity(activity) {
    const chart = document.querySelector("[data-activity-chart]");
    const line = chart?.querySelector("[data-chart-line]");
    const area = chart?.querySelector("[data-chart-area]");
    const pointsGroup = chart?.querySelector("[data-chart-points]");
    const statusText = chart?.querySelector("[data-chart-status]");
    const totalElement = document.querySelector("[data-activity-total]");
    if (!chart || !line || !area || !pointsGroup || !activity.length) {
      if (totalElement) totalElement.textContent = "—";
      if (statusText) {
        statusText.textContent = t("noActivity");
        statusText.style.display = "";
      }
      return;
    }
    if (statusText) statusText.style.display = "none";
    const values = activity.map((week) => Number(week.total || 0));
    const max = Math.max(1, ...values);
    const left = 40;
    const right = 700;
    const top = 28;
    const bottom = 200;
    const step = (right - left) / Math.max(1, values.length - 1);
    const points = values.map((value, index) => {
      const x = left + index * step;
      const y = bottom - (value / max) * (bottom - top);
      return [x, y];
    });
    const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    line.setAttribute("d", path);
    area.setAttribute("d", `${path} L${right} ${bottom} L${left} ${bottom} Z`);
    pointsGroup.replaceChildren(...points.map(([x, y], index) => {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", x.toFixed(1));
      circle.setAttribute("cy", y.toFixed(1));
      circle.setAttribute("r", index === points.length - 1 ? "4.6" : "3.2");
      const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
      title.textContent = `${values[index]} commits`;
      circle.append(title);
      return circle;
    }));
    if (totalElement) totalElement.textContent = formatNumber(values.reduce((sum, value) => sum + value, 0));
  }

  const releaseSelect = document.querySelector("[data-release-select]");
  function populateReleaseSelector(version) {
    if (!releaseSelect) return;
    releaseSelect.replaceChildren();
    const releases = state.releases;
    if (!releases.length) {
      const option = new Option(version, "fallback");
      releaseSelect.add(option);
      state.selectedRelease = null;
      renderSelectedRelease();
      return;
    }
    releases.forEach((release, index) => {
      const label = `${release.tag_name}${release.prerelease ? " · prerelease" : ""}`;
      const option = new Option(label, String(index));
      releaseSelect.add(option);
    });
    state.selectedRelease = releases[0];
    releaseSelect.value = "0";
    renderSelectedRelease();
  }

  releaseSelect?.addEventListener("change", () => {
    const index = Number(releaseSelect.value);
    state.selectedRelease = Number.isInteger(index) ? state.releases[index] || null : null;
    renderSelectedRelease();
  });

  function findAsset(release, platform) {
    const assets = Array.isArray(release?.assets) ? release.assets : [];
    const candidates = {
      client: assets.filter((asset) => !/server/i.test(asset.name) && /(client|nexora).*(setup|installer|win).*\.(exe|msi|zip)$/i.test(asset.name)),
      server: assets.filter((asset) => /server.*(setup|installer|win).*\.(exe|msi|zip)$/i.test(asset.name)),
      pwa: assets.filter((asset) => /pwa.*\.zip$/i.test(asset.name)),
      android: assets.filter((asset) => /(android|mobile).*\.(apk|zip)$/i.test(asset.name)),
    };
    return candidates[platform]?.[0] || null;
  }

  function renderSelectedRelease() {
    const release = state.selectedRelease;
    const stateLabel = document.querySelector("[data-selected-release-state]");
    const releaseLink = document.querySelector("[data-selected-release-link]");
    const latestLink = document.querySelector("[data-latest-release-link]");
    const releaseUrl = release?.html_url || FALLBACK_RELEASE_URL;
    if (releaseLink) releaseLink.href = releaseUrl;
    if (latestLink) latestLink.href = releaseUrl;
    if (stateLabel) {
      stateLabel.textContent = release
        ? `${t("releaseSelected")}: ${release.tag_name} · ${release.prerelease ? t("releasePrerelease") : t("releaseStable")} · ${formatDate(release.published_at)}`
        : t("releaseFallback");
    }

    ["client", "server", "pwa", "android"].forEach((platform) => {
      const asset = findAsset(release, platform);
      const link = document.querySelector(`[data-download-link="${platform}"]`);
      const name = document.querySelector(`[data-asset-name="${platform}"]`);
      const size = document.querySelector(`[data-asset-size="${platform}"]`);
      if (!link || !name || !size) return;
      link.href = asset?.browser_download_url || releaseUrl;
      link.classList.toggle("unavailable", !asset);
      name.textContent = asset?.name || t("assetUnavailable");
      size.textContent = asset ? formatBytes(asset.size) : "GitHub";
    });

    const sourceLink = document.querySelector('[data-download-link="source"]');
    const sourceName = document.querySelector('[data-asset-name="source"]');
    const sourceSize = document.querySelector('[data-asset-size="source"]');
    if (sourceLink) sourceLink.href = release?.zipball_url || `https://github.com/${REPO}/archive/refs/heads/main.zip`;
    if (sourceName) sourceName.textContent = release ? `${release.tag_name} · ${t("sourceArchive")}` : t("sourceArchive");
    if (sourceSize) sourceSize.textContent = "ZIP";
  }

  let toastTimer;
  function showToast(message) {
    const toast = document.querySelector("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  }

  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });

  applyLanguage(state.lang);
  loadGitHubData().catch(() => showToast(t("apiUnavailable")));
})();
