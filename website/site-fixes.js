(() => {
  "use strict";

  const FALLBACK_VERSION = "3.3.3";

  const ruCorrections = {
    heroLead: "Самостоятельно размещаемая платформа для частных серверов, команд и сообществ. Единый интерфейс для Windows, PWA и Android, локальный сервер как источник полномочий и отдельный контур Pulse.",
    membersSecure: "8 участников · защищённый разговор",
    mockOne: "Локальный сервер остаётся источником истины для комнат, ролей и доставки зашифрованных данных.",
    mockTwo: "Облачная учётная запись и производственные права Pulse изолированы от локального обмена сообщениями.",
    mockThree: "Принято. Публикуем документацию и результаты проверки релиза.",
    deviceVerified: "Устройство проверено",
    outboxDelivered: "Очередь отправлена",
    metricVersionHint: "основная ветка / метаданные пакета",
    liveValue: "актуальное значение",
    fromGithub: "данные GitHub API",
    productLead: "Nexora объединяет сообщения, комнаты, медиа, автономную работу, эксплуатационные инструменты, Trust Core и отдельный облачный контур, не требуя передавать локальные сообщения в централизованное облако.",
    messagingText: "Ответы, ветки, реакции, упоминания, опросы, история изменений, тихая и отложенная отправка, черновики, закладки и надёжная очередь исходящих сообщений.",
    trustCardTitle: "Защищённые сообщения с привязкой к устройству",
    trustCardText: "Идентичность Ed25519, проверенные устройства, эпохи MLS, защита от повторов, хранение только шифротекста и зашифрованное локальное состояние.",
    adminTitle: "Политики на стороне сервера",
    adminText: "Владелец, модератор, участник, настраиваемые роли, блокировки, приглашения, заявки на вступление, режим только чтения, медленный режим и ограничения медиа.",
    mediaTitle: "Проверенные и зашифрованные медиа",
    mediaText: "Возобновляемые загрузки, определение фактического MIME-типа, SHA-256, безопасные имена, предпросмотр, голосовые сообщения и защищённые вложения AES-256-GCM.",
    pulseTitle: "Изолированный облачный контур",
    pulseText: "Облачная учётная запись, подтверждение почты, MFA, OAuth 2.1 с PKCE, журнал Импульсов, квитанции и подписанные производственные права.",
    architectureTitle: "Три контура.<br><em>Чёткие границы полномочий.</em>",
    architectureLead: "Клиент хранит приватное состояние, локальный сервер управляет доступом и порядком доставки, а Pulse Cloud отвечает только за облачную учётную запись, журнал операций и производственные права.",
    archClient: "Интерфейс, автономное состояние, ключи устройств, шифрование и расшифрование MLS, а также проверенный предпросмотр медиа.",
    archServerTitle: "Локальный источник истины",
    archServer: "Учётные записи, сессии, комнаты, роли, блокировки, политики, порядок доставки, шифротекст, хранилище, аудит и резервное копирование.",
    archCloudTitle: "Необязательный облачный контур",
    archCloud: "Подписки, сверка с платёжным провайдером, журнал Импульсов и подписанные производственные права.",
    matrixClientTitle: "Приватное состояние",
    matrixClient: "Приватное состояние MLS и ключи вложений не передаются локальному серверу.",
    matrixServerTitle: "Управление доступом",
    matrixServer: "Роли, блокировки, ограничения комнат и доступ к событиям в реальном времени проверяются сервером.",
    matrixCloudTitle: "Коммерческая граница",
    matrixCloud: "Pulse не становится хранилищем локальных сообщений.",
    deliveryTitle: "От поля ввода до проверенного устройства.",
    deliveryText: "Каждый переход отражает реальную границу ответственности, а не условный маркетинговый показатель.",
    deliveryOneTitle: "Подготовка",
    deliveryOne: "Клиент проверяет введённые данные",
    deliveryTwoTitle: "Шифрование",
    deliveryTwo: "Формируется прикладной шифротекст MLS",
    deliveryThreeTitle: "Авторизация",
    deliveryThree: "Проверяются сессия, устройство, участие и эпоха",
    deliveryFourTitle: "Сохранение",
    deliveryFour: "Сохраняются шифротекст и состояние доставки",
    deliveryFiveTitle: "Доставка",
    deliveryFive: "Только проверенным устройствам участников",
    deliverySixTitle: "Расшифрование",
    deliverySix: "Локально на устройстве получателя",
    trustTitle: "Проверяемые ограничения.<br><em>Без вымышленных процентов.</em>",
    trustLead: "Сайт показывает только ограничения, закреплённые в коде и документации текущей линии Nexora.",
    limitDevices: "Активные доверенные устройства",
    perAccount: "на одну учётную запись",
    atomicLimit: "атомарное ограничение",
    unclaimed: "неиспользованные пакеты",
    totalInventory: "общий запас пользователя",
    lifecycleTitle: "Идентичность устройства становится частью управления доступом.",
    lifeOneTitle: "Ключ идентичности",
    lifeOne: "Клиент создаёт неизвлекаемый ключ идентичности Ed25519.",
    lifeTwoTitle: "Подтверждение владения",
    lifeTwo: "Регистрация подтверждает владение закрытым ключом.",
    lifeThreeTitle: "Проверка",
    lifeThree: "Дополнительное устройство получает подписанное подтверждение.",
    lifeFourTitle: "Адресная доставка",
    lifeFour: "Шифротекст доставляется конкретным проверенным устройствам.",
    lifeFiveTitle: "Отзыв",
    lifeFive: "Отзыв отключает защищённое соединение и очищает локальное состояние.",
    downloadsLead: "Версии и файлы загружаются из GitHub Releases. Если готового файла для платформы нет, сайт честно открывает страницу выбранного релиза.",
    releaseLoading: "загрузка данных о релизах…",
    clientDownloadText: "Настольный клиент, автоматические обновления, проверка сертификатов и диагностический тестовый режим.",
    serverDownloadText: "Оболочка локального сервера, контролируемая консоль, резервное копирование, проверка состояния и корректное завершение работы.",
    pwaDownloadText: "Устанавливаемый веб-клиент с Service Worker, кэшем IndexedDB и надёжной очередью исходящих сообщений.",
    androidDownloadText: "Android-оболочка WebView, использующая системное хранилище доверенных TLS-сертификатов и общий интерфейс продукта.",
    sourceDownloadText: "Полный снимок репозитория для разработки, проверки и самостоятельной сборки.",
    downloadSource: "Скачать исходный код",
    assessmentLead: "Матрица показывает, что готово, что распространяется как предварительная сборка и какие проверки остаются внешними.",
    strengthsTitle: "Контроль и полнота продукта",
    strengthOneTitle: "Локальный источник полномочий",
    strengthOne: "Сообщения, комнаты и файлы не требуют централизованного облака.",
    strengthTwoTitle: "Проверки на стороне сервера",
    strengthTwo: "Роли, блокировки, ограничения медиа и доступ к событиям проверяются сервером.",
    strengthThreeTitle: "Единый интерфейс на разных платформах",
    strengthThree: "Windows, браузер/PWA и Android используют общий интерфейс React.",
    strengthFourTitle: "Открытый исходный код",
    strengthFour: "Лицензия MIT разрешает использование, изменение и распространение.",
    boundariesTitle: "Предварительные сборки и видимость метаданных",
    boundaryOneTitle: "Независимый аудит",
    boundaryOne: "Текущая линия не заявляется как независимо проверенная система сквозного шифрования.",
    boundaryTwoTitle: "Служебные метаданные",
    boundaryTwo: "Сервер видит участие в комнатах, время событий, сетевой контекст, размер шифротекста и события доставки.",
    boundaryThreeTitle: "Подпись Windows",
    boundaryThree: "Переход к стабильному выпуску зависит от Authenticode и проверок упакованной сборки.",
    boundaryFourTitle: "Звонки",
    boundaryFour: "Голосовые и видеозвонки, а также демонстрация экрана не входят в текущий релиз.",
    matrixTitle: "Каналы распространения",
    prerelease: "Предварительная сборка",
    sourceVerified: "Исходный код проверен",
    docsLead: "Документация разделена по зонам ответственности: продукт, архитектура, модель безопасности, развёртывание, эксплуатация, тестирование и Pulse.",
    docProduct: "Назначение, возможности, платформы и границы продукта.",
    docArchitecture: "Границы полномочий, потоки данных, авторизация и хранение.",
    docSecurity: "Модель угроз, границы Trust/MLS и остаточные риски.",
    docDeployment: "HTTPS, обратный прокси, межсетевой экран, разрешённые источники и резервные копии.",
    docOperations: "Запуск, наблюдение, резервное копирование, восстановление и работа с инцидентами.",
    docPulse: "Nexora Plus, Импульсы, привязка учётных записей и права.",
    ctaText: "Скачайте актуальную версию, изучите исходный код или ознакомьтесь с результатами проверки релиза.",
    footerText: "Самостоятельно размещаемый мессенджер для Windows, браузера/PWA и Android.",
    releaseFallback: "GitHub Releases пока не вернул опубликованные версии",
    releaseSelected: "Выбран релиз",
    releasePrerelease: "предварительный",
    releaseStable: "стабильный",
    assetUnavailable: "Файл отсутствует — открыть страницу релиза",
    sourceArchive: "Архив исходного кода",
    apiUnavailable: "Данные GitHub временно недоступны",
    noActivity: "Статистика активности пока формируется"
  };

  const staticLabels = [
    [".live-panel-head .section-kicker", "ДАННЫЕ РЕПОЗИТОРИЯ", "LIVE REPOSITORY DATA"],
    [".activity-copy .section-kicker", "АКТИВНОСТЬ ЗА 12 НЕДЕЛЬ", "12 WEEK ACTIVITY"],
    ["#product .section-kicker", "01 / ПРОДУКТ", "01 / PRODUCT SYSTEM"],
    ["#architecture .section-heading .section-kicker", "02 / АРХИТЕКТУРА", "02 / ARCHITECTURE"],
    [".data-path-copy .section-kicker", "ПУТЬ ДОСТАВКИ СООБЩЕНИЯ", "MESSAGE DELIVERY PATH"],
    ["#trust .section-heading .section-kicker", "03 / ДОВЕРИЕ И БЕЗОПАСНОСТЬ", "03 / TRUST & SECURITY"],
    [".lifecycle-content .section-kicker", "ЖИЗНЕННЫЙ ЦИКЛ ДОВЕРИЯ К УСТРОЙСТВУ", "DEVICE TRUST LIFECYCLE"],
    ["#downloads .section-kicker", "04 / ЗАГРУЗКИ", "04 / DOWNLOADS"],
    [".assessment-section .section-kicker", "05 / ОБЪЕКТИВНАЯ ОЦЕНКА", "05 / OBJECTIVE ASSESSMENT"],
    ["#docs .section-kicker", "06 / ДОКУМЕНТАЦИЯ", "06 / DOCUMENTATION"],
    [".final-cta .section-kicker", "ОТКРЫТЫЙ КОД · СОБСТВЕННЫЙ СЕРВЕР · НЕСКОЛЬКО ПЛАТФОРМ", "OPEN SOURCE · SELF-HOSTED · MULTIPLATFORM"],
    [".bento-card:nth-child(1) > span:not(.tilt-glare)", "СООБЩЕНИЯ", "MESSAGING"],
    [".bento-card:nth-child(2) > span:not(.tilt-glare)", "ДОВЕРИЕ И MLS", "TRUST CORE"],
    [".bento-card:nth-child(3) > span:not(.tilt-glare)", "УПРАВЛЕНИЕ КОМНАТАМИ", "ROOM CONTROL"],
    [".bento-card:nth-child(4) > span:not(.tilt-glare)", "МЕДИА", "MEDIA"],
    [".arch-node.client-node header b", "Клиентские платформы", "Client platforms"],
    [".arch-node.server-node header b", "Локальный сервер", "Local Server"],
    [".authority-matrix > div:nth-child(1) > span", "ПРИВАТНАЯ ЗОНА КЛИЕНТА", "CLIENT PRIVATE"],
    [".authority-matrix > div:nth-child(2) > span", "ПОЛНОМОЧИЯ СЕРВЕРА", "SERVER AUTHORITY"],
    [".authority-matrix > div:nth-child(3) > span", "ИЗОЛЯЦИЯ ОБЛАКА", "CLOUD ISOLATION"],
    [".download-card[data-platform='client'] > span", "КЛИЕНТ WINDOWS", "WINDOWS CLIENT"],
    [".download-card[data-platform='server'] > span", "СЕРВЕР WINDOWS", "WINDOWS SERVER"],
    [".download-card[data-platform='source'] > span", "ИСХОДНЫЙ КОД", "SOURCE"],
    [".docs-grid .doc-link:nth-child(1) small", "ПРОДУКТ", "PRODUCT"],
    [".docs-grid .doc-link:nth-child(2) small", "ИНЖЕНЕРИЯ", "ENGINEERING"],
    [".docs-grid .doc-link:nth-child(3) small", "БЕЗОПАСНОСТЬ", "SECURITY"],
    [".docs-grid .doc-link:nth-child(4) small", "РАЗВЁРТЫВАНИЕ", "DEPLOYMENT"],
    [".docs-grid .doc-link:nth-child(5) small", "ЭКСПЛУАТАЦИЯ", "OPERATIONS"],
    [".docs-grid .doc-link:nth-child(6) small", "ОБЛАКО", "CLOUD"],
    ["[data-selected-release-link]", "Описание релиза ↗", "Release notes ↗"],
    [".site-footer nav a:nth-child(2)", "Релизы", "Releases"],
    [".site-footer nav a:nth-child(3)", "Документация", "Docs"]
  ];

  function currentLanguage() {
    return document.documentElement.lang === "en" ? "en" : "ru";
  }

  function applyVersionFallback() {
    document.querySelectorAll("[data-current-version]").forEach((element) => {
      if (!element.textContent.trim() || element.textContent.trim() === "3.2.4") {
        element.textContent = FALLBACK_VERSION;
      }
    });
    const fallbackOption = document.querySelector('[data-release-select] option[value="fallback"]');
    if (fallbackOption && fallbackOption.textContent.trim() === "3.2.4") {
      fallbackOption.textContent = FALLBACK_VERSION;
    }
  }

  function applyLocalization() {
    const lang = currentLanguage();
    if (lang === "ru") {
      document.querySelectorAll("[data-i18n]").forEach((element) => {
        const value = ruCorrections[element.dataset.i18n];
        if (!value) return;
        if (value.includes("<br>") || value.includes("<em>")) element.innerHTML = value;
        else element.textContent = value;
      });
    }
    staticLabels.forEach(([selector, ru, en]) => {
      const element = document.querySelector(selector);
      if (element) element.textContent = lang === "ru" ? ru : en;
    });
    applySignatureBadges();
  }

  function signatureState(assetName) {
    const name = String(assetName || "").trim();
    if (!name || /файл отсутствует|asset unavailable|release page/i.test(name)) return "unavailable";
    if (/unsigned[-_ ]?test|test-build|test\.exe/i.test(name)) return "unsigned-test";
    if (/\.(exe|msi|apk)$/i.test(name)) return "signed";
    return "not-applicable";
  }

  function signatureLabel(state, lang) {
    const labels = {
      ru: {
        "unsigned-test": "НЕПОДПИСАННАЯ ТЕСТОВАЯ СБОРКА",
        signed: "ПОДПИСАННАЯ СБОРКА",
        "not-applicable": "ПОДПИСЬ НЕ ПРИМЕНЯЕТСЯ",
        unavailable: "ФАЙЛ НЕ ОПУБЛИКОВАН"
      },
      en: {
        "unsigned-test": "UNSIGNED TEST BUILD",
        signed: "SIGNED BUILD",
        "not-applicable": "SIGNATURE NOT APPLICABLE",
        unavailable: "ASSET NOT PUBLISHED"
      }
    };
    return labels[lang][state] || labels[lang].unavailable;
  }

  function applySignatureBadges() {
    const lang = currentLanguage();
    document.querySelectorAll(".download-card[data-platform]").forEach((card) => {
      const platform = card.dataset.platform;
      const assetName = card.querySelector(`[data-asset-name="${platform}"]`)?.textContent || "";
      const state = signatureState(assetName);
      card.dataset.signature = state;
      let badge = card.querySelector(".signature-badge");
      if (!badge) {
        badge = document.createElement("small");
        badge.className = "signature-badge";
        card.querySelector(".download-meta")?.append(badge);
      }
      if (badge) badge.textContent = signatureLabel(state, lang);
    });
  }

  function scheduleApply() {
    queueMicrotask(() => {
      applyVersionFallback();
      applyLocalization();
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-lang]")) scheduleApply();
  });

  const languageObserver = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === "attributes" && mutation.attributeName === "lang")) {
      scheduleApply();
    }
  });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  document.querySelectorAll("[data-asset-name]").forEach((element) => {
    new MutationObserver(scheduleApply).observe(element, { childList: true, characterData: true, subtree: true });
  });

  scheduleApply();
})();
