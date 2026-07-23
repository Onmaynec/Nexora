(() => {
  "use strict";

  const STORAGE_KEY = "nexora-aether-settings-v2";
  const LANGUAGE_KEY = "nexora-site-language";
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const isHexColor = (value) => /^#[0-9a-f]{6}$/i.test(String(value || ""));
  const distanceSquared = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  const defaults = Object.freeze({
    particleCount: 220,
    particleSize: 1.8,
    speed: 0.62,
    regenerationRate: 1.25,
    cursorRadius: 200,
    cursorForce: 3.1,
    cursorGlow: true,
    connectionDistance: 132,
    lineOpacity: 0.26,
    linkStrength: 0.0025,
    maxLinks: 3,
    separation: 0.45,
    impulseForce: 4.2,
    vortexForce: 2.2,
    collapseThreshold: 100,
    collapseRadius: 82,
    collapseHold: 3.5,
    blackHoleForce: 2.8,
    blackHoleRadius: 155,
    blackHoleLifetime: 30,
    predatorSpeed: 1.15,
    predatorSense: 300,
    predatorCapacity: 34,
    predatorTrails: true,
    backgroundColor: "#050308",
    particleColor: "#bf80ff",
    lineColor: "#c896ff",
    cursorColor: "#ead7ff",
    trails: false,
    pulse: true,
    showGrid: true,
    glowStrength: 10,
    quality: "auto",
    fpsLimit: "60",
    autoReduce: true,
    respectReducedMotion: true,
  });

  const presets = {
    original: { ...defaults },
    elastic: {
      ...defaults,
      particleCount: 260,
      connectionDistance: 158,
      linkStrength: 0.006,
      maxLinks: 4,
      separation: 0.6,
      lineOpacity: 0.34,
      speed: 0.48,
    },
    nebula: {
      ...defaults,
      particleCount: 300,
      speed: 0.34,
      connectionDistance: 150,
      lineOpacity: 0.32,
      linkStrength: 0.0015,
      trails: true,
      glowStrength: 18,
      particleColor: "#c58cff",
      lineColor: "#8d63ff",
      vortexForce: 3.2,
    },
    predator: {
      ...defaults,
      particleCount: 280,
      speed: 0.72,
      connectionDistance: 110,
      lineOpacity: 0.18,
      predatorSpeed: 1.75,
      predatorSense: 420,
      predatorCapacity: 24,
      glowStrength: 14,
    },
  };

  const dictionary = {
    ru: {
      skip: "Перейти к интерактиву",
      particles: "ТОЧКИ",
      predators: "ХИЩНИКИ",
      singularities: "ДЫРЫ",
      pause: "Пауза",
      settings: "Настройки",
      close: "Закрыть",
      lead: "Живое поле частиц: мягкие физические связи, магнитный коллапс, испаряющиеся чёрные дыры и хищники, возвращающие съеденные точки после перегрузки.",
      start: "Начать",
      openSettings: "Открыть настройки",
      hint: "Курсор отталкивает точки. Удерживайте магнит над плотным облаком для коллапса. Правый клик удаляет объект.",
      toolCursor: "Курсор",
      toolMagnet: "Магнит",
      toolVortex: "Вихрь",
      toolPredator: "Хищник",
      toolEraser: "Ластик",
      restart: "Перезапуск",
      tabField: "Поле",
      tabPhysics: "Физика",
      tabEntities: "Объекты",
      tabVisual: "Вид",
      tabSystem: "Система",
      particlesGroup: "Частицы",
      particleCount: "Количество",
      particleSize: "Размер",
      speed: "Скорость",
      regeneration: "Регенерация",
      cursorGroup: "Курсор",
      cursorRadius: "Радиус",
      cursorForce: "Сила",
      cursorGlow: "Свечение курсора",
      cursorGlowHint: "Мягкий свет и подсветка ближайших связей",
      linksGroup: "Физические связи",
      connectionDistance: "Дальность связи",
      lineOpacity: "Яркость линий",
      linkStrength: "Сила пружины",
      maxLinks: "Связей на точку",
      separation: "Ближнее отталкивание",
      impulseGroup: "Импульс и вихрь",
      impulseForce: "Сила импульса",
      vortexForce: "Сила вихря",
      collapseGroup: "Магнитный коллапс",
      collapseThreshold: "Порог частиц",
      collapseRadius: "Радиус ядра",
      collapseHold: "Время удержания",
      blackHolesGroup: "Чёрные дыры",
      blackHoleForce: "Сила",
      blackHoleRadius: "Радиус",
      blackHoleLifetime: "Время жизни",
      predatorsGroup: "Хищники",
      predatorSpeed: "Скорость",
      predatorSense: "Радиус поиска",
      predatorCapacity: "Вместимость",
      predatorTrails: "Следы хищников",
      predatorTrailsHint: "Неоновый след показывает направление атаки",
      colorsGroup: "Цвета",
      backgroundColor: "Фон",
      particleColor: "Частицы",
      lineColor: "Линии",
      cursorColor: "Курсор",
      effectsGroup: "Эффекты",
      trails: "Следы частиц",
      trailsHint: "Плавное затухание предыдущего кадра",
      pulse: "Пульсация",
      pulseHint: "Небольшое изменение размера точек",
      showGrid: "Фоновая сетка",
      showGridHint: "Техническая сетка Nexora",
      glowStrength: "Интенсивность свечения",
      performanceGroup: "Производительность",
      quality: "Качество",
      auto: "Авто",
      low: "Низкое",
      medium: "Среднее",
      high: "Высокое",
      fpsLimit: "Ограничение FPS",
      autoReduce: "Автоснижение качества",
      autoReduceHint: "Уменьшает нагрузку при устойчивом падении FPS",
      respectMotion: "Учитывать уменьшение движения",
      respectMotionHint: "Можно отключить вручную",
      presetsGroup: "Пресеты",
      presetOriginal: "Original",
      presetElastic: "Elastic",
      presetNebula: "Nebula",
      presetPredator: "Predator",
      configGroup: "Конфигурация",
      copyConfig: "Скопировать",
      importConfig: "Импорт",
      reset: "Сбросить",
      configHint: "Настройки сохраняются только в вашем браузере.",
      fullscreen: "Полный экран",
      done: "Готово",
      predatorCreated: "Хищник создан",
      predatorBurst: "Перегруженный хищник лопнул",
      objectRemoved: "Объект удалён",
      nothingToRemove: "Рядом нет объекта",
      fieldRestarted: "Поле перезапущено",
      singularityFormed: "Облако коллапсировало в чёрную дыру",
      singularityEvaporated: "Чёрная дыра испарилась",
      paused: "Пауза",
      resumed: "Продолжено",
      configCopied: "Конфигурация скопирована",
      configImported: "Конфигурация импортирована",
      configInvalid: "Некорректный файл конфигурации",
      configReset: "Настройки сброшены",
      presetApplied: "Пресет применён",
      reducedQuality: "Качество автоматически снижено",
      fullscreenUnavailable: "Полноэкранный режим недоступен",
    },
    en: {
      skip: "Skip to the interactive canvas",
      particles: "POINTS",
      predators: "PREDATORS",
      singularities: "HOLES",
      pause: "Pause",
      settings: "Settings",
      close: "Close",
      lead: "A living particle field with soft physical links, magnetic collapse, evaporating black holes and predators that release swallowed particles when overloaded.",
      start: "Start",
      openSettings: "Open settings",
      hint: "The cursor repels particles. Hold the magnet over a dense cloud to trigger collapse. Right-click removes an object.",
      toolCursor: "Cursor",
      toolMagnet: "Magnet",
      toolVortex: "Vortex",
      toolPredator: "Predator",
      toolEraser: "Eraser",
      restart: "Restart",
      tabField: "Field",
      tabPhysics: "Physics",
      tabEntities: "Entities",
      tabVisual: "Visual",
      tabSystem: "System",
      particlesGroup: "Particles",
      particleCount: "Count",
      particleSize: "Size",
      speed: "Speed",
      regeneration: "Regeneration",
      cursorGroup: "Cursor",
      cursorRadius: "Radius",
      cursorForce: "Force",
      cursorGlow: "Cursor glow",
      cursorGlowHint: "Soft light and brighter nearby links",
      linksGroup: "Physical links",
      connectionDistance: "Link range",
      lineOpacity: "Line brightness",
      linkStrength: "Spring strength",
      maxLinks: "Links per particle",
      separation: "Close separation",
      impulseGroup: "Impulse and vortex",
      impulseForce: "Impulse force",
      vortexForce: "Vortex force",
      collapseGroup: "Magnetic collapse",
      collapseThreshold: "Particle threshold",
      collapseRadius: "Core radius",
      collapseHold: "Hold time",
      blackHolesGroup: "Black holes",
      blackHoleForce: "Force",
      blackHoleRadius: "Radius",
      blackHoleLifetime: "Lifetime",
      predatorsGroup: "Predators",
      predatorSpeed: "Speed",
      predatorSense: "Search radius",
      predatorCapacity: "Capacity",
      predatorTrails: "Predator trails",
      predatorTrailsHint: "A neon trail shows the attack direction",
      colorsGroup: "Colors",
      backgroundColor: "Background",
      particleColor: "Particles",
      lineColor: "Lines",
      cursorColor: "Cursor",
      effectsGroup: "Effects",
      trails: "Particle trails",
      trailsHint: "Softly fades the previous frame",
      pulse: "Pulse",
      pulseHint: "Slightly changes point size",
      showGrid: "Background grid",
      showGridHint: "Nexora technical grid",
      glowStrength: "Glow strength",
      performanceGroup: "Performance",
      quality: "Quality",
      auto: "Auto",
      low: "Low",
      medium: "Medium",
      high: "High",
      fpsLimit: "FPS limit",
      autoReduce: "Automatic quality reduction",
      autoReduceHint: "Reduces load after a sustained FPS drop",
      respectMotion: "Respect reduced motion",
      respectMotionHint: "Can be overridden manually",
      presetsGroup: "Presets",
      presetOriginal: "Original",
      presetElastic: "Elastic",
      presetNebula: "Nebula",
      presetPredator: "Predator",
      configGroup: "Configuration",
      copyConfig: "Copy",
      importConfig: "Import",
      reset: "Reset",
      configHint: "Settings are stored only in your browser.",
      fullscreen: "Fullscreen",
      done: "Done",
      predatorCreated: "Predator created",
      predatorBurst: "Overloaded predator burst",
      objectRemoved: "Object removed",
      nothingToRemove: "No object nearby",
      fieldRestarted: "Field restarted",
      singularityFormed: "The cloud collapsed into a black hole",
      singularityEvaporated: "Black hole evaporated",
      paused: "Paused",
      resumed: "Resumed",
      configCopied: "Configuration copied",
      configImported: "Configuration imported",
      configInvalid: "Invalid configuration file",
      configReset: "Settings reset",
      presetApplied: "Preset applied",
      reducedQuality: "Quality was reduced automatically",
      fullscreenUnavailable: "Fullscreen is unavailable",
    },
  };

  const safeStorage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch (error) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (error) {
        return false;
      }
    },
  };

  function sanitizeSettings(candidate) {
    const source = candidate && typeof candidate === "object" && !Array.isArray(candidate) ? candidate : {};
    const next = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const original = defaults[key];
      const value = source[key];
      if (typeof original === "boolean") {
        if (typeof value === "boolean") next[key] = value;
      } else if (typeof original === "number") {
        if (Number.isFinite(Number(value))) next[key] = Number(value);
      } else if (typeof original === "string") {
        if (typeof value === "string") next[key] = value;
      }
    }

    next.particleCount = clamp(Math.round(next.particleCount / 10) * 10, 60, 420);
    next.particleSize = clamp(next.particleSize, .8, 4);
    next.speed = clamp(next.speed, .1, 2);
    next.regenerationRate = clamp(next.regenerationRate, 0, 5);
    next.cursorRadius = clamp(next.cursorRadius, 60, 320);
    next.cursorForce = clamp(next.cursorForce, .5, 7);
    next.connectionDistance = clamp(next.connectionDistance, 45, 220);
    next.lineOpacity = clamp(next.lineOpacity, 0, .8);
    next.linkStrength = clamp(next.linkStrength, 0, .012);
    next.maxLinks = clamp(Math.round(next.maxLinks), 1, 6);
    next.separation = clamp(next.separation, 0, 1);
    next.impulseForce = clamp(next.impulseForce, .5, 9);
    next.vortexForce = clamp(next.vortexForce, .2, 6);
    next.collapseThreshold = clamp(Math.round(next.collapseThreshold / 5) * 5, 80, 120);
    next.collapseRadius = clamp(next.collapseRadius, 55, 120);
    next.collapseHold = clamp(next.collapseHold, 2, 6);
    next.blackHoleForce = clamp(next.blackHoleForce, .5, 6);
    next.blackHoleRadius = clamp(next.blackHoleRadius, 70, 220);
    next.blackHoleLifetime = clamp(next.blackHoleLifetime, 20, 40);
    next.predatorSpeed = clamp(next.predatorSpeed, .3, 3);
    next.predatorSense = clamp(next.predatorSense, 100, 520);
    next.predatorCapacity = clamp(Math.round(next.predatorCapacity / 2) * 2, 14, 60);
    next.glowStrength = clamp(next.glowStrength, 0, 30);
    if (!["auto", "low", "medium", "high"].includes(next.quality)) next.quality = defaults.quality;
    if (!["30", "60", "120"].includes(String(next.fpsLimit))) next.fpsLimit = defaults.fpsLimit;
    for (const key of ["backgroundColor", "particleColor", "lineColor", "cursorColor"]) {
      if (!isHexColor(next[key])) next[key] = defaults[key];
    }
    return next;
  }

  function loadSettings() {
    try {
      return sanitizeSettings(JSON.parse(safeStorage.get(STORAGE_KEY) || "{}"));
    } catch (error) {
      return { ...defaults };
    }
  }

  let particleSequence = 0;

  class Particle {
    constructor(engine, options = {}) {
      this.id = ++particleSequence;
      this.phase = Math.random() * TAU;
      this.seed = Math.random();
      this.x = Number.isFinite(options.x) ? options.x : random(4, Math.max(5, engine.width - 4));
      this.y = Number.isFinite(options.y) ? options.y : random(4, Math.max(5, engine.height - 4));
      const angle = Number.isFinite(options.angle) ? options.angle : Math.random() * TAU;
      const baseSpeed = Number.isFinite(options.velocity) ? options.velocity : random(.08, .28);
      this.vx = Number.isFinite(options.vx) ? options.vx : Math.cos(angle) * baseSpeed;
      this.vy = Number.isFinite(options.vy) ? options.vy : Math.sin(angle) * baseSpeed;
    }
  }

  class AetherEngine {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      if (!this.ctx) throw new Error("Canvas 2D context is unavailable");
      this.settings = settings;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.particles = [];
      this.predators = [];
      this.blackHoles = [];
      this.bonds = [];
      this.previousBonds = new Map();
      this.effects = [];
      this.pointer = {
        x: null,
        y: null,
        down: false,
        button: 0,
        downAt: 0,
        startX: 0,
        startY: 0,
        lastX: null,
        lastY: null,
        velocityX: 0,
        velocityY: 0,
      };
      this.tool = "cursor";
      this.paused = false;
      this.running = false;
      this.frameRequest = 0;
      this.lastFrame = 0;
      this.regenerationAccumulator = 0;
      this.collapseProgress = 0;
      this.collapseDensity = 0;
      this.fpsSamples = [];
      this.lastQualityCheck = 0;
      this.reducedOnce = false;
      this.callbacks = {};

      this.handleResize = this.handleResize.bind(this);
      this.animate = this.animate.bind(this);
      this.handlePointerMove = this.handlePointerMove.bind(this);
      this.handlePointerDown = this.handlePointerDown.bind(this);
      this.handlePointerUp = this.handlePointerUp.bind(this);
      this.handlePointerLeave = this.handlePointerLeave.bind(this);
      this.handleContextMenu = this.handleContextMenu.bind(this);

      addEventListener("resize", this.handleResize, { passive: true });
      canvas.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      canvas.addEventListener("pointerdown", this.handlePointerDown);
      canvas.addEventListener("pointerup", this.handlePointerUp, { passive: true });
      canvas.addEventListener("pointercancel", this.handlePointerUp, { passive: true });
      canvas.addEventListener("pointerleave", this.handlePointerLeave, { passive: true });
      canvas.addEventListener("contextmenu", this.handleContextMenu);
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && !this.paused) this.togglePause(true);
      });

      this.handleResize();
      this.restartField();
      this.start();
    }

    qualityProfile() {
      const mobile = matchMedia("(hover: none), (pointer: coarse)").matches;
      const memory = Number(navigator.deviceMemory || 8);
      const cores = Number(navigator.hardwareConcurrency || 8);
      const automatic = mobile || memory <= 4 || cores <= 4 ? "low" : "high";
      const level = this.settings.quality === "auto" ? automatic : this.settings.quality;
      return {
        level,
        dpr: level === "low" ? 1 : level === "medium" ? 1.35 : 1.7,
        physicsMultiplier: level === "low" ? .75 : level === "medium" ? .9 : 1,
        maxEffects: level === "low" ? 22 : level === "medium" ? 36 : 56,
      };
    }

    handleResize() {
      const previousWidth = this.width || 1;
      const previousHeight = this.height || 1;
      const profile = this.qualityProfile();
      this.width = document.documentElement.clientWidth || innerWidth;
      this.height = Math.round(window.visualViewport?.height || innerHeight);
      this.dpr = Math.min(devicePixelRatio || 1, profile.dpr);
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

      const scaleX = this.width / previousWidth;
      const scaleY = this.height / previousHeight;
      for (const particle of this.particles) {
        particle.x = clamp(particle.x * scaleX, 2, Math.max(2, this.width - 2));
        particle.y = clamp(particle.y * scaleY, 2, Math.max(2, this.height - 2));
      }
      for (const entity of [...this.predators, ...this.blackHoles]) {
        entity.x = clamp(entity.x * scaleX, 10, Math.max(10, this.width - 10));
        entity.y = clamp(entity.y * scaleY, 10, Math.max(10, this.height - 10));
      }
    }

    updateSettings(settings) {
      this.settings = settings;
      if (this.particles.length > settings.particleCount) {
        this.particles.length = settings.particleCount;
      }
      this.handleResize();
      document.documentElement.dataset.grid = String(settings.showGrid);
      this.emitCounts();
    }

    setTool(tool) {
      if (!["cursor", "magnet", "vortex", "predator", "eraser"].includes(tool)) return;
      this.tool = tool;
      this.collapseProgress = 0;
      this.callbacks.onCollapse?.(0, 0, false);
    }

    restartField() {
      this.particles = [];
      this.predators = [];
      this.blackHoles = [];
      this.bonds = [];
      this.previousBonds.clear();
      this.effects = [];
      this.collapseProgress = 0;
      this.regenerationAccumulator = 0;
      for (let index = 0; index < this.settings.particleCount; index += 1) {
        this.particles.push(new Particle(this));
      }
      this.emitCounts();
      this.callbacks.onCollapse?.(0, 0, false);
      this.callbacks.onRestart?.();
    }

    emitCounts() {
      this.callbacks.onParticleCount?.(this.particles.length);
      this.callbacks.onPredatorCount?.(this.predators.length);
      this.callbacks.onBlackHoleCount?.(this.blackHoles.length);
    }

    togglePause(force) {
      this.paused = typeof force === "boolean" ? force : !this.paused;
      this.callbacks.onPause?.(this.paused);
    }

    pointerPosition(event) {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: clamp(event.clientX - rect.left, 0, this.width),
        y: clamp(event.clientY - rect.top, 0, this.height),
      };
    }

    handlePointerMove(event) {
      const next = this.pointerPosition(event);
      const previousX = this.pointer.x ?? next.x;
      const previousY = this.pointer.y ?? next.y;
      this.pointer.lastX = previousX;
      this.pointer.lastY = previousY;
      this.pointer.x = next.x;
      this.pointer.y = next.y;
      this.pointer.velocityX = this.pointer.velocityX * .55 + (next.x - previousX) * .45;
      this.pointer.velocityY = this.pointer.velocityY * .55 + (next.y - previousY) * .45;
    }

    handlePointerDown(event) {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      this.canvas.setPointerCapture?.(event.pointerId);
      this.handlePointerMove(event);
      this.pointer.down = true;
      this.pointer.button = event.button;
      this.pointer.downAt = performance.now();
      this.pointer.startX = this.pointer.x;
      this.pointer.startY = this.pointer.y;

      if (this.tool === "predator") {
        this.addPredator(this.pointer.x, this.pointer.y);
      } else if (this.tool === "eraser") {
        this.removeNearestObject(this.pointer.x, this.pointer.y);
      }
    }

    handlePointerUp(event) {
      if (!this.pointer.down) return;
      const heldFor = performance.now() - this.pointer.downAt;
      const moved = Math.hypot(
        (this.pointer.x ?? this.pointer.startX) - this.pointer.startX,
        (this.pointer.y ?? this.pointer.startY) - this.pointer.startY,
      );
      this.pointer.down = false;
      if (this.tool === "cursor" && heldFor < 260 && moved < 18) {
        this.createImpulse(this.pointer.x, this.pointer.y, this.settings.impulseForce);
      }
      if (this.tool === "magnet") {
        this.collapseProgress = Math.max(0, this.collapseProgress - .12);
        this.callbacks.onCollapse?.(this.collapseProgress, this.collapseDensity, false);
      }
      this.canvas.releasePointerCapture?.(event.pointerId);
    }

    handlePointerLeave() {
      this.pointer.x = null;
      this.pointer.y = null;
      this.pointer.down = false;
      this.pointer.velocityX = 0;
      this.pointer.velocityY = 0;
      this.collapseProgress = 0;
      this.callbacks.onCollapse?.(0, 0, false);
    }

    handleContextMenu(event) {
      event.preventDefault();
      const position = this.pointerPosition(event);
      this.removeNearestObject(position.x, position.y);
    }

    addPredator(x, y) {
      this.predators.push({
        id: `predator-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        x,
        y,
        vx: random(-.18, .18),
        vy: random(-.18, .18),
        size: 11,
        phase: Math.random() * TAU,
        swallowed: 0,
        burstTimer: null,
        trail: [],
      });
      if (this.predators.length > 10) {
        const removed = this.predators.shift();
        this.releaseSwallowed(removed, .9);
      }
      this.createEffect("pulse", x, y, { color: "#ff4f91", radius: 52, life: .6 });
      this.emitCounts();
      this.callbacks.onPredatorCreated?.();
    }

    createBlackHole(x, y) {
      const radius = this.settings.blackHoleRadius;
      this.blackHoles.push({
        id: `hole-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        x,
        y,
        age: 0,
        lifetime: this.settings.blackHoleLifetime,
        radius: 8,
        targetRadius: radius,
        absorbed: 0,
        spin: Math.random() * TAU,
        satellites: Array.from({ length: 6 }, (_, index) => ({
          angle: index / 6 * TAU + Math.random() * .35,
          distance: random(.46, .88),
          speed: random(.35, .8) * (index % 2 ? -1 : 1),
          size: random(1.1, 2.2),
        })),
      });
      if (this.blackHoles.length > 4) this.evaporateBlackHole(this.blackHoles.shift(), false);
      this.createEffect("burst", x, y, { color: "#cf8cff", radius: radius * 1.15, life: 1.05 });
      this.emitCounts();
      this.callbacks.onSingularity?.();
    }

    removeNearestObject(x, y) {
      let nearest = null;
      let nearestType = "";
      let nearestDistance = 72 * 72;

      for (const predator of this.predators) {
        const dist = (predator.x - x) ** 2 + (predator.y - y) ** 2;
        if (dist < nearestDistance) {
          nearest = predator;
          nearestType = "predator";
          nearestDistance = dist;
        }
      }
      for (const hole of this.blackHoles) {
        const dist = (hole.x - x) ** 2 + (hole.y - y) ** 2;
        const threshold = Math.max(72, hole.radius * .65);
        if (dist < threshold * threshold && dist < nearestDistance * 2.5) {
          nearest = hole;
          nearestType = "hole";
          nearestDistance = dist;
        }
      }

      if (!nearest) {
        this.callbacks.onNothingToRemove?.();
        return false;
      }

      if (nearestType === "predator") {
        this.predators = this.predators.filter((item) => item !== nearest);
        this.releaseSwallowed(nearest, 1.3);
        this.createEffect("burst", nearest.x, nearest.y, { color: "#ff4f91", radius: 80, life: .65 });
      } else {
        this.blackHoles = this.blackHoles.filter((item) => item !== nearest);
        this.evaporateBlackHole(nearest, false);
      }
      this.emitCounts();
      this.callbacks.onObjectRemoved?.();
      return true;
    }

    createImpulse(x, y, strength) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      const radius = this.settings.cursorRadius * 1.15;
      for (const particle of this.particles) {
        const dx = particle.x - x;
        const dy = particle.y - y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > radius) continue;
        const force = (1 - distance / radius) * strength;
        particle.vx += dx / distance * force;
        particle.vy += dy / distance * force;
      }
      this.createEffect("pulse", x, y, { color: this.settings.cursorColor, radius, life: .55 });
    }

    createEffect(type, x, y, options = {}) {
      const profile = this.qualityProfile();
      this.effects.push({
        type,
        x,
        y,
        age: 0,
        life: options.life ?? .5,
        radius: options.radius ?? 50,
        color: options.color ?? this.settings.particleColor,
        alpha: options.alpha ?? 1,
      });
      if (this.effects.length > profile.maxEffects) {
        this.effects.splice(0, this.effects.length - profile.maxEffects);
      }
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastFrame = performance.now();
      this.frameRequest = requestAnimationFrame(this.animate);
    }

    animate(time) {
      if (!this.running) return;
      const fpsLimit = Number(this.settings.fpsLimit || 60);
      const frameInterval = 1000 / fpsLimit;
      const elapsed = time - this.lastFrame;
      if (elapsed < frameInterval - .5) {
        this.frameRequest = requestAnimationFrame(this.animate);
        return;
      }

      this.lastFrame = time - (elapsed % frameInterval);
      const delta = clamp(elapsed / 16.67, .25, 2.4);
      const seconds = clamp(elapsed / 1000, .001, .05);
      this.recordPerformance(time, elapsed);
      if (!this.paused) this.update(delta, seconds);
      this.draw(time);
      this.frameRequest = requestAnimationFrame(this.animate);
    }

    recordPerformance(time, elapsed) {
      const fps = elapsed > 0 ? 1000 / elapsed : 60;
      this.fpsSamples.push(fps);
      if (this.fpsSamples.length > 90) this.fpsSamples.shift();
      if (!this.settings.autoReduce || this.settings.quality !== "auto" || this.reducedOnce || time - this.lastQualityCheck < 5000) return;
      this.lastQualityCheck = time;
      if (this.fpsSamples.length < 45) return;
      const average = this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length;
      if (average < 34 && this.settings.particleCount > 100) {
        this.settings.particleCount = Math.max(100, Math.round(this.settings.particleCount * .78 / 10) * 10);
        this.reducedOnce = true;
        this.callbacks.onAutoReduce?.(this.settings.particleCount);
      }
    }

    update(delta, seconds) {
      this.updateRegeneration(seconds);
      this.applyPointerForces(delta, seconds);
      this.updatePhysicalLinks(delta);
      this.updateBlackHoles(delta, seconds);
      this.updatePredators(delta, seconds);
      this.updateParticles(delta);
      this.updateEffects(seconds);
      this.emitCounts();
    }

    updateRegeneration(seconds) {
      if (this.particles.length >= this.settings.particleCount || this.settings.regenerationRate <= 0) return;
      this.regenerationAccumulator += this.settings.regenerationRate * seconds;
      const amount = Math.floor(this.regenerationAccumulator);
      if (amount <= 0) return;
      this.regenerationAccumulator -= amount;
      for (let index = 0; index < amount && this.particles.length < this.settings.particleCount; index += 1) {
        const edge = Math.floor(Math.random() * 4);
        const position = edge === 0
          ? { x: 3, y: random(3, this.height - 3) }
          : edge === 1
            ? { x: this.width - 3, y: random(3, this.height - 3) }
            : edge === 2
              ? { x: random(3, this.width - 3), y: 3 }
              : { x: random(3, this.width - 3), y: this.height - 3 };
        this.particles.push(new Particle(this, position));
      }
    }

    applyPointerForces(delta, seconds) {
      if (this.pointer.x === null || this.pointer.y === null) {
        this.collapseProgress = Math.max(0, this.collapseProgress - seconds * .9);
        this.callbacks.onCollapse?.(this.collapseProgress, 0, false);
        return;
      }

      if (this.tool === "cursor") {
        this.applyRepel(delta);
      } else if (this.tool === "magnet" && this.pointer.down) {
        this.applyMagnet(delta, seconds);
      } else if (this.tool === "vortex") {
        this.applyVortex(delta);
      } else {
        this.collapseProgress = Math.max(0, this.collapseProgress - seconds * .7);
        this.callbacks.onCollapse?.(this.collapseProgress, 0, false);
      }
    }

    applyRepel(delta) {
      const radius = this.settings.cursorRadius;
      for (const particle of this.particles) {
        const dx = this.pointer.x - particle.x;
        const dy = this.pointer.y - particle.y;
        const distance = Math.hypot(dx, dy);
        if (distance <= .001 || distance >= radius + this.settings.particleSize) continue;
        const force = (radius - distance) / radius;
        const displacement = force * this.settings.cursorForce * .32 * delta;
        particle.x -= dx / distance * displacement;
        particle.y -= dy / distance * displacement;
        particle.vx -= dx / distance * force * .018 * this.settings.cursorForce;
        particle.vy -= dy / distance * force * .018 * this.settings.cursorForce;
      }
    }

    applyMagnet(delta, seconds) {
      const radius = this.settings.cursorRadius * 1.35;
      const coreRadius = this.settings.collapseRadius;
      let density = 0;

      for (const particle of this.particles) {
        const dx = this.pointer.x - particle.x;
        const dy = this.pointer.y - particle.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance <= coreRadius) density += 1;
        if (distance > radius) continue;
        const normalized = 1 - distance / radius;
        const force = normalized * this.settings.cursorForce * .065 * delta;
        const trailX = this.pointer.velocityX * .0045 * normalized;
        const trailY = this.pointer.velocityY * .0045 * normalized;
        particle.vx += dx / distance * force - dy / distance * force * .16 + trailX;
        particle.vy += dy / distance * force + dx / distance * force * .16 + trailY;
      }

      this.collapseDensity = density;
      if (density >= this.settings.collapseThreshold) {
        this.collapseProgress += seconds / this.settings.collapseHold;
      } else {
        const ratio = density / this.settings.collapseThreshold;
        this.collapseProgress = Math.max(0, this.collapseProgress - seconds * (1.05 - ratio * .6));
      }
      this.collapseProgress = clamp(this.collapseProgress, 0, 1);
      this.callbacks.onCollapse?.(this.collapseProgress, density, true);

      if (this.collapseProgress >= 1) {
        this.collapseMagneticCloud(this.pointer.x, this.pointer.y);
        this.collapseProgress = 0;
        this.callbacks.onCollapse?.(0, 0, false);
      }
    }

    applyVortex(delta) {
      const radius = this.settings.cursorRadius * 1.15;
      for (const particle of this.particles) {
        const dx = this.pointer.x - particle.x;
        const dy = this.pointer.y - particle.y;
        const distance = Math.hypot(dx, dy) || 1;
        if (distance > radius) continue;
        const force = (1 - distance / radius) * this.settings.vortexForce * .055 * delta;
        particle.vx += -dy / distance * force + dx / distance * force * .1;
        particle.vy += dx / distance * force + dy / distance * force * .1;
      }
    }

    collapseMagneticCloud(x, y) {
      const radius = this.settings.collapseRadius * 1.1;
      const candidates = [];
      for (let index = this.particles.length - 1; index >= 0; index -= 1) {
        const particle = this.particles[index];
        const dx = particle.x - x;
        const dy = particle.y - y;
        const distance = Math.hypot(dx, dy);
        if (distance <= radius) candidates.push({ index, particle, distance, dx, dy });
      }
      candidates.sort((a, b) => a.distance - b.distance);
      const consumeCount = Math.min(candidates.length, Math.max(20, Math.round(candidates.length * .24)));
      const consumed = new Set(candidates.slice(0, consumeCount).map((item) => item.particle.id));
      this.particles = this.particles.filter((particle) => !consumed.has(particle.id));

      for (const item of candidates.slice(consumeCount)) {
        const distance = item.distance || 1;
        const force = random(1.5, 4.2);
        item.particle.vx += item.dx / distance * force - item.dy / distance * .35;
        item.particle.vy += item.dy / distance * force + item.dx / distance * .35;
      }

      this.createBlackHole(x, y);
    }

    updatePhysicalLinks(delta) {
      const particles = this.particles;
      const range = this.settings.connectionDistance;
      const rangeSquared = range * range;
      const restDistance = range * .56;
      const closeDistance = restDistance * .42;
      const linkCounts = new Uint8Array(particles.length);
      const nextBonds = [];
      const nextMap = new Map();
      const profile = this.qualityProfile();
      const physicsScale = profile.physicsMultiplier;

      for (let firstIndex = 0; firstIndex < particles.length; firstIndex += 1) {
        if (linkCounts[firstIndex] >= this.settings.maxLinks) continue;
        const first = particles[firstIndex];
        for (let secondIndex = firstIndex + 1; secondIndex < particles.length; secondIndex += 1) {
          if (linkCounts[firstIndex] >= this.settings.maxLinks) break;
          if (linkCounts[secondIndex] >= this.settings.maxLinks) continue;
          const second = particles[secondIndex];
          const dx = second.x - first.x;
          const dy = second.y - first.y;
          const distanceSq = dx * dx + dy * dy;
          if (distanceSq <= .0001 || distanceSq >= rangeSquared) continue;

          const distance = Math.sqrt(distanceSq);
          const ux = dx / distance;
          const uy = dy / distance;
          const spring = (distance - restDistance) * this.settings.linkStrength * delta * physicsScale;
          first.vx += ux * spring;
          first.vy += uy * spring;
          second.vx -= ux * spring;
          second.vy -= uy * spring;

          if (distance < closeDistance && this.settings.separation > 0) {
            const repel = (1 - distance / closeDistance) * this.settings.separation * .045 * delta;
            first.vx -= ux * repel;
            first.vy -= uy * repel;
            second.vx += ux * repel;
            second.vy += uy * repel;
          }

          linkCounts[firstIndex] += 1;
          linkCounts[secondIndex] += 1;
          const key = first.id < second.id ? `${first.id}:${second.id}` : `${second.id}:${first.id}`;
          const bond = {
            key,
            first,
            second,
            distance,
            alpha: (1 - distanceSq / rangeSquared) * this.settings.lineOpacity,
          };
          nextBonds.push(bond);
          nextMap.set(key, {
            x: (first.x + second.x) * .5,
            y: (first.y + second.y) * .5,
            distance,
          });
        }
      }

      for (const [key, previous] of this.previousBonds) {
        if (nextMap.has(key) || previous.distance > range * .82 || Math.random() > .035) continue;
        this.createEffect("flash", previous.x, previous.y, {
          color: this.settings.lineColor,
          radius: random(8, 18),
          life: random(.18, .34),
          alpha: .65,
        });
      }

      this.bonds = nextBonds;
      this.previousBonds = nextMap;
    }

    updateBlackHoles(delta, seconds) {
      const expired = [];
      for (const hole of this.blackHoles) {
        hole.age += seconds;
        const remainingRatio = clamp(1 - hole.age / hole.lifetime, 0, 1);
        const growth = Math.min(1, hole.age / 1.15);
        hole.radius += (hole.targetRadius * growth * (.62 + remainingRatio * .38) - hole.radius) * .055 * delta;
        hole.spin += .018 * delta;

        for (let index = this.particles.length - 1; index >= 0; index -= 1) {
          const particle = this.particles[index];
          const dx = hole.x - particle.x;
          const dy = hole.y - particle.y;
          const distance = Math.hypot(dx, dy) || 1;
          const influence = hole.radius;
          if (distance > influence) continue;
          const normalized = 1 - distance / influence;
          const force = normalized * this.settings.blackHoleForce * .09 * delta;
          particle.vx += dx / distance * force + (-dy / distance) * force * .28;
          particle.vy += dy / distance * force + (dx / distance) * force * .28;
          if (distance < Math.max(5, hole.radius * .075)) {
            this.particles.splice(index, 1);
            hole.absorbed += 1;
          }
        }

        if (hole.age >= hole.lifetime) expired.push(hole);
      }

      if (expired.length) {
        this.blackHoles = this.blackHoles.filter((hole) => !expired.includes(hole));
        for (const hole of expired) this.evaporateBlackHole(hole, true);
        this.emitCounts();
      }
    }

    evaporateBlackHole(hole, natural) {
      if (!hole) return;
      const releaseCount = Math.min(24, Math.round(hole.absorbed * .28));
      for (let index = 0; index < releaseCount; index += 1) {
        const angle = index / Math.max(1, releaseCount) * TAU + random(-.2, .2);
        const velocity = random(1.2, 3.6);
        this.particles.push(new Particle(this, {
          x: hole.x + Math.cos(angle) * random(4, 18),
          y: hole.y + Math.sin(angle) * random(4, 18),
          angle,
          velocity,
        }));
      }
      this.createEffect("burst", hole.x, hole.y, {
        color: "#cf8cff",
        radius: Math.max(80, hole.radius * 1.4),
        life: .9,
      });
      if (natural) this.callbacks.onEvaporation?.();
    }

    updatePredators(delta, seconds) {
      const bursting = [];
      for (const predator of this.predators) {
        if (predator.burstTimer !== null) {
          predator.burstTimer -= seconds;
          predator.phase += .18 * delta;
          if (predator.burstTimer <= 0) bursting.push(predator);
          continue;
        }

        let nearest = null;
        let nearestIndex = -1;
        let nearestDistance = this.settings.predatorSense * this.settings.predatorSense;
        for (let index = 0; index < this.particles.length; index += 1) {
          const particle = this.particles[index];
          const distance = distanceSquared(predator, particle);
          if (distance < nearestDistance) {
            nearest = particle;
            nearestIndex = index;
            nearestDistance = distance;
          }
        }

        if (nearest) {
          const dx = nearest.x - predator.x;
          const dy = nearest.y - predator.y;
          const distance = Math.sqrt(nearestDistance) || 1;
          const chase = this.settings.predatorSpeed * .034 * delta;
          predator.vx += dx / distance * chase;
          predator.vy += dy / distance * chase;
          if (distance < predator.size * .72 + 3) {
            this.particles.splice(nearestIndex, 1);
            predator.swallowed += 1;
            predator.size = clamp(11 + Math.sqrt(predator.swallowed) * 2.35, 11, 28);
            this.createEffect("flash", nearest.x, nearest.y, {
              color: "#57dfff",
              radius: 16,
              life: .22,
            });
            if (predator.swallowed >= this.settings.predatorCapacity) {
              predator.burstTimer = 1.25;
            }
          }
        } else {
          predator.vx += Math.cos(predator.phase) * .002 * delta;
          predator.vy += Math.sin(predator.phase) * .002 * delta;
        }

        const velocity = Math.hypot(predator.vx, predator.vy) || 1;
        const maxVelocity = this.settings.predatorSpeed * 1.75;
        if (velocity > maxVelocity) {
          predator.vx = predator.vx / velocity * maxVelocity;
          predator.vy = predator.vy / velocity * maxVelocity;
        }
        predator.x += predator.vx * delta;
        predator.y += predator.vy * delta;
        predator.vx *= .985;
        predator.vy *= .985;

        const margin = predator.size;
        if (predator.x < margin || predator.x > this.width - margin) predator.vx *= -1;
        if (predator.y < margin || predator.y > this.height - margin) predator.vy *= -1;
        predator.x = clamp(predator.x, margin, Math.max(margin, this.width - margin));
        predator.y = clamp(predator.y, margin, Math.max(margin, this.height - margin));
        predator.phase += .04 * delta;

        if (this.settings.predatorTrails) {
          predator.trail.push({ x: predator.x, y: predator.y, alpha: 1 });
          if (predator.trail.length > 22) predator.trail.shift();
          for (const point of predator.trail) point.alpha *= .95;
        } else {
          predator.trail.length = 0;
        }
      }

      if (bursting.length) {
        for (const predator of bursting) this.burstPredator(predator);
        this.predators = this.predators.filter((predator) => !bursting.includes(predator));
        this.emitCounts();
      }
    }

    burstPredator(predator) {
      this.releaseSwallowed(predator, 2.8);
      this.createEffect("burst", predator.x, predator.y, {
        color: "#ff4f91",
        radius: 130,
        life: .9,
      });

      for (const other of this.predators) {
        if (other === predator || other.burstTimer !== null) continue;
        const distance = Math.hypot(other.x - predator.x, other.y - predator.y);
        if (distance < 180 && other.swallowed >= this.settings.predatorCapacity * .65) {
          other.burstTimer = .42;
        }
      }
      this.callbacks.onPredatorBurst?.();
    }

    releaseSwallowed(predator, velocityScale) {
      const count = Math.max(0, Math.round(predator?.swallowed || 0));
      if (!predator || count === 0) return;
      const maximum = Math.min(count, Math.max(0, Math.round(this.settings.particleCount * 1.6 - this.particles.length)));
      for (let index = 0; index < maximum; index += 1) {
        const angle = index / Math.max(1, maximum) * TAU + random(-.28, .28);
        const velocity = random(.8, 2.6) * velocityScale;
        this.particles.push(new Particle(this, {
          x: predator.x + Math.cos(angle) * random(2, predator.size),
          y: predator.y + Math.sin(angle) * random(2, predator.size),
          angle,
          velocity,
        }));
      }
    }

    updateParticles(delta) {
      const movementScale = this.settings.speed * delta;
      for (const particle of this.particles) {
        const velocity = Math.hypot(particle.vx, particle.vy);
        const maxVelocity = 6 + this.settings.speed * 3;
        if (velocity > maxVelocity) {
          particle.vx = particle.vx / velocity * maxVelocity;
          particle.vy = particle.vy / velocity * maxVelocity;
        }

        particle.x += particle.vx * movementScale;
        particle.y += particle.vy * movementScale;
        particle.vx *= .997;
        particle.vy *= .997;

        const radius = this.settings.particleSize * (1 + particle.seed * .35);
        if (particle.x > this.width - radius) {
          particle.x = this.width - radius;
          particle.vx = -Math.abs(particle.vx);
        } else if (particle.x < radius) {
          particle.x = radius;
          particle.vx = Math.abs(particle.vx);
        }
        if (particle.y > this.height - radius) {
          particle.y = this.height - radius;
          particle.vy = -Math.abs(particle.vy);
        } else if (particle.y < radius) {
          particle.y = radius;
          particle.vy = Math.abs(particle.vy);
        }
      }
    }

    updateEffects(seconds) {
      for (const effect of this.effects) effect.age += seconds;
      this.effects = this.effects.filter((effect) => effect.age < effect.life);
    }

    draw(time) {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.settings.trails && !this.paused) {
        ctx.fillStyle = `${this.settings.backgroundColor}30`;
      } else {
        ctx.fillStyle = this.settings.backgroundColor;
      }
      ctx.fillRect(0, 0, this.width, this.height);

      this.drawConnections(ctx);
      this.drawEffects(ctx);
      this.drawParticles(ctx, time);
      this.drawPredators(ctx, time);
      this.drawBlackHoles(ctx, time);
      this.drawCursor(ctx, time);
      if (this.paused) this.drawPaused(ctx);
      ctx.restore();
    }

    drawConnections(ctx) {
      if (this.settings.lineOpacity <= 0) return;
      const pointerActive = this.pointer.x !== null && this.pointer.y !== null;
      ctx.lineWidth = .8;
      for (const bond of this.bonds) {
        let color = this.settings.lineColor;
        let alpha = bond.alpha;
        if (pointerActive) {
          const firstDistance = Math.hypot(bond.first.x - this.pointer.x, bond.first.y - this.pointer.y);
          const secondDistance = Math.hypot(bond.second.x - this.pointer.x, bond.second.y - this.pointer.y);
          if (Math.min(firstDistance, secondDistance) < this.settings.cursorRadius) {
            color = "#ffffff";
            alpha = Math.min(.8, alpha * 1.35);
          }
        }
        ctx.strokeStyle = this.hexToRgba(color, alpha);
        ctx.beginPath();
        ctx.moveTo(bond.first.x, bond.first.y);
        ctx.lineTo(bond.second.x, bond.second.y);
        ctx.stroke();
      }
    }

    drawParticles(ctx, time) {
      if (this.settings.glowStrength > 0) {
        ctx.shadowColor = this.settings.particleColor;
        ctx.shadowBlur = this.settings.glowStrength;
      }
      for (const particle of this.particles) {
        const pulse = this.settings.pulse ? .88 + Math.sin(time * .0014 + particle.phase) * .18 : 1;
        const radius = this.settings.particleSize * (.68 + particle.seed * .72) * pulse;
        ctx.fillStyle = this.hexToRgba(this.settings.particleColor, .66 + particle.seed * .3);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    drawPredators(ctx, time) {
      for (const predator of this.predators) {
        if (predator.trail.length > 1) {
          for (let index = 1; index < predator.trail.length; index += 1) {
            const previous = predator.trail[index - 1];
            const current = predator.trail[index];
            ctx.strokeStyle = `rgba(255,58,130,${current.alpha * .24})`;
            ctx.lineWidth = 1 + index / predator.trail.length * 2;
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(current.x, current.y);
            ctx.stroke();
          }
        }

        const angle = Math.atan2(predator.vy, predator.vx);
        const capacityRatio = clamp(predator.swallowed / this.settings.predatorCapacity, 0, 1);
        const warning = predator.burstTimer !== null ? .55 + Math.sin(time * .022) * .45 : 0;

        ctx.save();
        ctx.translate(predator.x, predator.y);
        ctx.rotate(angle);
        ctx.scale(predator.size / 12, predator.size / 12);

        ctx.shadowColor = `rgba(255,31,116,${.72 + warning * .25})`;
        ctx.shadowBlur = 18 + warning * 16;
        const bodyGradient = ctx.createLinearGradient(-12, 0, 14, 0);
        bodyGradient.addColorStop(0, "#6d0734");
        bodyGradient.addColorStop(.42, "#ff0f6f");
        bodyGradient.addColorStop(1, "#ff4f91");
        ctx.fillStyle = bodyGradient;
        ctx.strokeStyle = warning > .2 ? "#ffffff" : "#ff76ac";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(1.5, 8.2);
        ctx.lineTo(3.5, 3.2);
        ctx.lineTo(-9.5, 9.3);
        ctx.lineTo(-5.5, 1.8);
        ctx.lineTo(-14, 0);
        ctx.lineTo(-5.5, -1.8);
        ctx.lineTo(-9.5, -9.3);
        ctx.lineTo(3.5, -3.2);
        ctx.lineTo(1.5, -8.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowColor = "#30ddff";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "#051020";
        ctx.strokeStyle = "#3be4ff";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8.6, 0);
        ctx.lineTo(-.8, 5.2);
        ctx.lineTo(1.2, 0);
        ctx.lineTo(-.8, -5.2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = "#65ebff";
        ctx.globalAlpha = .75 + capacityRatio * .25;
        ctx.beginPath();
        ctx.moveTo(5.2, 0);
        ctx.lineTo(0, 2.7);
        ctx.lineTo(1.2, 0);
        ctx.lineTo(0, -2.7);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }

    drawBlackHoles(ctx, time) {
      for (const hole of this.blackHoles) {
        const remaining = clamp(1 - hole.age / hole.lifetime, 0, 1);
        const radius = Math.max(8, hole.radius);
        const glow = ctx.createRadialGradient(hole.x, hole.y, radius * .12, hole.x, hole.y, radius * 1.1);
        glow.addColorStop(0, "rgba(0,0,0,1)");
        glow.addColorStop(.3, "rgba(0,0,0,1)");
        glow.addColorStop(.36, "rgba(255,222,255,.98)");
        glow.addColorStop(.43, "rgba(218,112,255,.82)");
        glow.addColorStop(.66, "rgba(115,45,202,.22)");
        glow.addColorStop(1, "rgba(67,20,120,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, radius * 1.1, 0, TAU);
        ctx.fill();

        ctx.save();
        ctx.translate(hole.x, hole.y);
        ctx.rotate(hole.spin + time * .00018);
        ctx.shadowColor = "rgba(202,113,255,.92)";
        ctx.shadowBlur = 16;
        for (let index = 0; index < 4; index += 1) {
          ctx.strokeStyle = `rgba(${220 - index * 12},${156 - index * 18},255,${.72 - index * .11})`;
          ctx.lineWidth = index === 0 ? 2 : 1.15;
          ctx.beginPath();
          ctx.ellipse(
            0,
            0,
            radius * (.72 + index * .12),
            radius * (.28 + index * .035),
            index * .72,
            0,
            TAU,
          );
          ctx.stroke();
        }
        ctx.shadowBlur = 0;

        for (const satellite of hole.satellites) {
          const angle = satellite.angle + hole.age * satellite.speed;
          const x = Math.cos(angle) * radius * satellite.distance;
          const y = Math.sin(angle) * radius * satellite.distance * .62;
          ctx.fillStyle = `rgba(236,190,255,${.45 + remaining * .5})`;
          ctx.beginPath();
          ctx.arc(x, y, satellite.size, 0, TAU);
          ctx.fill();
        }
        ctx.restore();

        const core = ctx.createRadialGradient(hole.x - radius * .16, hole.y - radius * .18, 0, hole.x, hole.y, radius * .36);
        core.addColorStop(0, "#08000f");
        core.addColorStop(.55, "#020003");
        core.addColorStop(1, "#000000");
        ctx.fillStyle = core;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, radius * .34, 0, TAU);
        ctx.fill();

        if (remaining < .2) {
          ctx.strokeStyle = `rgba(255,255,255,${(.2 - remaining) * 3.5})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.arc(hole.x, hole.y, radius * (.46 + Math.sin(time * .02) * .04), 0, TAU);
          ctx.stroke();
        }
      }
    }

    drawEffects(ctx) {
      for (const effect of this.effects) {
        const progress = clamp(effect.age / effect.life, 0, 1);
        const alpha = (1 - progress) * effect.alpha;
        if (effect.type === "flash") {
          ctx.fillStyle = this.hexToRgba(effect.color, alpha);
          ctx.shadowColor = effect.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(effect.x, effect.y, effect.radius * (1 - progress * .45), 0, TAU);
          ctx.fill();
          ctx.shadowBlur = 0;
          continue;
        }

        const radius = effect.radius * (effect.type === "burst" ? .25 + progress * .9 : .18 + progress);
        ctx.strokeStyle = this.hexToRgba(effect.color, alpha * .82);
        ctx.lineWidth = effect.type === "burst" ? 2.2 : 1.25;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, radius, 0, TAU);
        ctx.stroke();

        if (effect.type === "burst") {
          ctx.strokeStyle = this.hexToRgba(effect.color, alpha * .28);
          for (let ray = 0; ray < 8; ray += 1) {
            const angle = ray / 8 * TAU;
            ctx.beginPath();
            ctx.moveTo(
              effect.x + Math.cos(angle) * radius * .45,
              effect.y + Math.sin(angle) * radius * .45,
            );
            ctx.lineTo(
              effect.x + Math.cos(angle) * radius,
              effect.y + Math.sin(angle) * radius,
            );
            ctx.stroke();
          }
        }
      }
    }

    drawCursor(ctx, time) {
      if (this.pointer.x === null || this.pointer.y === null) return;
      const radius = this.settings.cursorRadius;
      if (this.settings.cursorGlow) {
        const gradient = ctx.createRadialGradient(this.pointer.x, this.pointer.y, 0, this.pointer.x, this.pointer.y, radius);
        gradient.addColorStop(0, this.hexToRgba(this.settings.cursorColor, .13));
        gradient.addColorStop(.42, this.hexToRgba(this.settings.cursorColor, .04));
        gradient.addColorStop(1, this.hexToRgba(this.settings.cursorColor, 0));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.pointer.x, this.pointer.y, radius, 0, TAU);
        ctx.fill();
      }

      if (this.tool === "magnet") {
        const progress = this.collapseProgress;
        ctx.strokeStyle = this.hexToRgba(progress > .65 ? "#ffffff" : this.settings.cursorColor, .3 + progress * .6);
        ctx.lineWidth = 1 + progress * 2;
        ctx.setLineDash([5, 8]);
        ctx.beginPath();
        ctx.arc(this.pointer.x, this.pointer.y, this.settings.collapseRadius, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(.02, progress));
        ctx.stroke();
        ctx.setLineDash([]);
        if (this.pointer.down) {
          ctx.strokeStyle = this.hexToRgba("#cf8cff", .18 + progress * .42);
          ctx.beginPath();
          ctx.arc(this.pointer.x, this.pointer.y, this.settings.collapseRadius * (1.12 + Math.sin(time * .006) * .04), 0, TAU);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = this.hexToRgba(this.settings.cursorColor, .27);
        ctx.lineWidth = .8;
        ctx.setLineDash([3, 7]);
        ctx.beginPath();
        ctx.arc(this.pointer.x, this.pointer.y, radius * .34, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    drawPaused(ctx) {
      ctx.fillStyle = "rgba(5,3,8,.48)";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = "rgba(255,255,255,.88)";
      ctx.font = "700 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", this.width / 2, this.height / 2);
    }

    hexToRgba(hex, alpha) {
      const normalized = String(hex || "#ffffff").replace("#", "");
      const value = normalized.length === 3
        ? normalized.split("").map((char) => char + char).join("")
        : normalized.padEnd(6, "f").slice(0, 6);
      const number = Number.parseInt(value, 16);
      const red = number >> 16 & 255;
      const green = number >> 8 & 255;
      const blue = number & 255;
      return `rgba(${red},${green},${blue},${clamp(alpha, 0, 1)})`;
    }
  }

  const state = {
    lang: safeStorage.get(LANGUAGE_KEY) === "en" ? "en" : "ru",
    settings: loadSettings(),
    settingsOpen: false,
    toastTimer: 0,
    messageTimer: 0,
  };
  const t = (key) => dictionary[state.lang][key] || dictionary.ru[key] || key;

  const canvas = document.querySelector("#game-canvas");
  const engine = new AetherEngine(canvas, state.settings);
  const particleCount = document.querySelector("[data-particle-count]");
  const predatorCount = document.querySelector("[data-predator-count]");
  const blackHoleCount = document.querySelector("[data-black-hole-count]");
  const pauseButton = document.querySelector("[data-pause]");
  const intro = document.querySelector("[data-intro]");
  const fieldMessage = document.querySelector("[data-field-message]");
  const collapseMeter = document.querySelector("[data-collapse-meter]");
  const collapseLabel = document.querySelector("[data-collapse-label]");
  const toast = document.querySelector("[data-toast]");
  const settingsPanel = document.querySelector("#settings-panel");
  const backdrop = document.querySelector("[data-settings-backdrop]");

  function applyLanguage(lang) {
    state.lang = lang === "en" ? "en" : "ru";
    safeStorage.set(LANGUAGE_KEY, state.lang);
    document.documentElement.lang = state.lang;
    document.querySelectorAll("[data-lang]").forEach((button) => {
      const active = button.dataset.lang === state.lang;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(element.dataset.i18n);
    });
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("visible");
    state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
  }

  function showFieldMessage(message) {
    clearTimeout(state.messageTimer);
    fieldMessage.textContent = message;
    fieldMessage.classList.add("visible");
    state.messageTimer = setTimeout(() => fieldMessage.classList.remove("visible"), 1800);
  }

  function openSettings() {
    state.settingsOpen = true;
    settingsPanel.classList.add("open");
    settingsPanel.setAttribute("aria-hidden", "false");
    backdrop.hidden = false;
    document.querySelector("[data-settings-open]")?.setAttribute("aria-expanded", "true");
    settingsPanel.querySelector("button")?.focus();
  }

  function closeSettings() {
    state.settingsOpen = false;
    settingsPanel.classList.remove("open");
    settingsPanel.setAttribute("aria-hidden", "true");
    backdrop.hidden = true;
    document.querySelector("[data-settings-open]")?.setAttribute("aria-expanded", "false");
  }

  function saveSettings() {
    safeStorage.set(STORAGE_KEY, JSON.stringify(state.settings));
  }

  function formatOutput(key, value) {
    if (["particleSize", "speed", "regenerationRate", "cursorForce", "impulseForce", "vortexForce", "blackHoleForce", "predatorSpeed"].includes(key)) {
      return Number(value).toFixed(1);
    }
    if (key === "lineOpacity" || key === "separation") return `${Math.round(Number(value) * 100)}%`;
    if (key === "linkStrength") return Number(value).toFixed(4);
    if (key === "collapseHold") return `${Number(value).toFixed(2)}s`;
    if (key === "blackHoleLifetime") return `${Math.round(Number(value))}s`;
    return String(Math.round(Number(value)));
  }

  function syncControls() {
    document.querySelectorAll("[data-setting]").forEach((input) => {
      const key = input.dataset.setting;
      const value = state.settings[key];
      if (input.type === "checkbox") input.checked = Boolean(value);
      else input.value = String(value);
    });
    document.querySelectorAll("[data-output]").forEach((output) => {
      const key = output.dataset.output;
      output.value = formatOutput(key, state.settings[key]);
      output.textContent = output.value;
    });
    document.documentElement.dataset.grid = String(state.settings.showGrid);
  }

  function applySettings(next, persist = true) {
    state.settings = sanitizeSettings({ ...state.settings, ...next });
    engine.updateSettings(state.settings);
    syncControls();
    if (persist) saveSettings();
  }

  document.querySelectorAll("[data-setting]").forEach((input) => {
    const eventName = input.type === "range" || input.type === "color" ? "input" : "change";
    input.addEventListener(eventName, () => {
      const key = input.dataset.setting;
      const value = input.type === "checkbox"
        ? input.checked
        : input.type === "range"
          ? Number(input.value)
          : input.value;
      applySettings({ [key]: value });
    });
  });

  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });
  document.querySelectorAll("[data-settings-open], [data-intro-settings]").forEach((button) => {
    button.addEventListener("click", openSettings);
  });
  document.querySelectorAll("[data-settings-close]").forEach((button) => {
    button.addEventListener("click", closeSettings);
  });
  backdrop.addEventListener("click", closeSettings);

  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.settingsTab;
      document.querySelectorAll("[data-settings-tab]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("[data-settings-page]").forEach((page) => {
        page.classList.toggle("active", page.dataset.settingsPage === tab);
      });
    });
  });

  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => {
      engine.setTool(button.dataset.tool);
      document.querySelectorAll("[data-tool]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      intro.classList.add("dismissed");
    });
  });

  document.querySelector("[data-intro-start]").addEventListener("click", () => {
    intro.classList.add("dismissed");
  });
  document.querySelector("[data-restart-field]").addEventListener("click", () => {
    intro.classList.add("dismissed");
    engine.restartField();
  });
  pauseButton.addEventListener("click", () => engine.togglePause());

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = presets[button.dataset.preset];
      if (!preset) return;
      applySettings({ ...preset });
      engine.restartField();
      showToast(t("presetApplied"));
    });
  });

  document.querySelector("[data-export-config]").addEventListener("click", async () => {
    const text = JSON.stringify(state.settings, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("configCopied"));
    } catch (error) {
      const blob = new Blob([text], { type: "application/json" });
      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);
      link.href = objectUrl;
      link.download = "nexora-aether-config.json";
      link.click();
      URL.revokeObjectURL(objectUrl);
      showToast(t("configCopied"));
    }
  });

  const importFile = document.querySelector("[data-import-file]");
  document.querySelector("[data-import-config]").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file || file.size > 100_000 || !/json/i.test(file.type || file.name)) {
      showToast(t("configInvalid"));
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Configuration must be an object");
      applySettings(parsed);
      showToast(t("configImported"));
    } catch (error) {
      showToast(t("configInvalid"));
    }
  });

  document.querySelector("[data-reset-config]").addEventListener("click", () => {
    applySettings({ ...defaults });
    engine.restartField();
    showToast(t("configReset"));
  });

  document.querySelector("[data-fullscreen]").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch (error) {
      showToast(t("fullscreenUnavailable"));
    }
  });

  addEventListener("keydown", (event) => {
    const tag = document.activeElement?.tagName || "";
    if (event.key === "Escape" && state.settingsOpen) closeSettings();
    if (event.key === " " && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(tag)) {
      event.preventDefault();
      engine.togglePause();
    }
    if ((event.key === "s" || event.key === "S") && !/INPUT|SELECT|TEXTAREA/.test(tag)) {
      event.preventDefault();
      state.settingsOpen ? closeSettings() : openSettings();
    }
    if ((event.key === "r" || event.key === "R") && !/INPUT|SELECT|TEXTAREA/.test(tag)) {
      event.preventDefault();
      engine.restartField();
    }
  });

  engine.callbacks.onParticleCount = (count) => {
    particleCount.textContent = count.toLocaleString(state.lang === "ru" ? "ru-RU" : "en-US");
  };
  engine.callbacks.onPredatorCount = (count) => {
    predatorCount.textContent = String(count);
  };
  engine.callbacks.onBlackHoleCount = (count) => {
    blackHoleCount.textContent = String(count);
  };
  engine.callbacks.onPause = (paused) => {
    pauseButton.setAttribute("aria-pressed", String(paused));
    showFieldMessage(t(paused ? "paused" : "resumed"));
  };
  engine.callbacks.onPredatorCreated = () => showFieldMessage(t("predatorCreated"));
  engine.callbacks.onPredatorBurst = () => showFieldMessage(t("predatorBurst"));
  engine.callbacks.onObjectRemoved = () => showFieldMessage(t("objectRemoved"));
  engine.callbacks.onNothingToRemove = () => showFieldMessage(t("nothingToRemove"));
  engine.callbacks.onRestart = () => showFieldMessage(t("fieldRestarted"));
  engine.callbacks.onSingularity = () => showFieldMessage(t("singularityFormed"));
  engine.callbacks.onEvaporation = () => showFieldMessage(t("singularityEvaporated"));
  engine.callbacks.onCollapse = (progress, density, active) => {
    const visible = active && engine.tool === "magnet" && engine.pointer.down;
    collapseMeter.classList.toggle("visible", visible);
    collapseMeter.setAttribute("aria-hidden", String(!visible));
    if (engine.pointer.x !== null && engine.pointer.y !== null) {
      collapseMeter.style.left = `${engine.pointer.x}px`;
      const headerHeight = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 74;
      collapseMeter.style.top = `${Math.max(0, engine.pointer.y - headerHeight)}px`;
    }
    collapseMeter.style.setProperty("--progress", `${Math.round(progress * 100)}%`);
    collapseLabel.textContent = `${Math.round(progress * 100)}% · ${density}/${state.settings.collapseThreshold}`;
  };
  engine.callbacks.onAutoReduce = (count) => {
    state.settings.particleCount = count;
    syncControls();
    saveSettings();
    showToast(t("reducedQuality"));
  };

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches && state.settings.respectReducedMotion) {
    applySettings({
      particleCount: Math.min(state.settings.particleCount, 100),
      speed: Math.min(state.settings.speed, .35),
      trails: false,
      quality: state.settings.quality === "auto" ? "low" : state.settings.quality,
      fpsLimit: "30",
    }, false);
    engine.restartField();
  } else {
    engine.updateSettings(state.settings);
    engine.emitCounts();
  }

  applyLanguage(state.lang);
  syncControls();
})();
