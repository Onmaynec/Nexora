(() => {
  "use strict";

  const STORAGE_KEY = "nexora-aether-settings-v1";
  const LANGUAGE_KEY = "nexora-site-language";
  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const random = (min, max) => min + Math.random() * (max - min);
  const distanceSquared = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
  };

  const defaults = Object.freeze({
    particleCount: 150,
    particleSize: 1.8,
    speed: 0.62,
    connectionDistance: 132,
    lineOpacity: 0.24,
    cursorMode: "repel",
    cursorRadius: 190,
    cursorForce: 2.4,
    cursorGlow: true,
    blackHoleForce: 2.6,
    blackHoleRadius: 145,
    blackHoleAbsorption: true,
    planetForce: 0.8,
    planetSize: 27,
    planetCollectors: true,
    predatorSpeed: 1.05,
    predatorSense: 280,
    predatorTrails: true,
    backgroundColor: "#07050b",
    particleColor: "#bf80ff",
    lineColor: "#b978ff",
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
    balanced: { ...defaults },
    nebula: { ...defaults, particleCount: 230, speed: 0.34, connectionDistance: 155, lineOpacity: 0.3, trails: true, glowStrength: 18, particleColor: "#c58cff", lineColor: "#8d63ff", cursorMode: "vortex" },
    chaos: { ...defaults, particleCount: 300, speed: 1.4, connectionDistance: 95, cursorForce: 4.2, cursorRadius: 240, lineOpacity: 0.15, pulse: true, glowStrength: 15, predatorSpeed: 2.1, predatorSense: 420 },
    mobile: { ...defaults, particleCount: 70, speed: 0.45, connectionDistance: 95, lineOpacity: 0.16, glowStrength: 4, quality: "low", fpsLimit: "30", trails: false, predatorTrails: false },
  };

  const dictionary = {
    ru: {
      skip: "Перейти к интерактиву", score: "СЧЁТ", time: "ВРЕМЯ", particles: "ТОЧКИ", pause: "Пауза", settings: "Настройки", close: "Закрыть",
      title: "Aether Field", lead: "Управляйте потоком частиц курсором, создавайте планеты, хищников и чёрные дыры. Все параметры можно изменить в реальном времени.", start: "Начать", openSettings: "Открыть настройки", hint: "Клик по сцене использует выбранный инструмент. Space — пауза, S — настройки.",
      toolCursor: "Курсор", toolBlackHole: "Чёрная дыра", toolPlanet: "Планета", toolPredator: "Хищник", clearObjects: "Очистить",
      gameTitle: "Собирайте энергию", gameText: "Направляйте частицы к планетам-коллекторам. Хищники и чёрные дыры отнимают энергию. Наберите 500 очков за 60 секунд.", startRound: "Начать раунд",
      tabField: "Поле", tabObjects: "Объекты", tabVisual: "Вид", tabSystem: "Система", particlesGroup: "Частицы", particleCount: "Количество", particleSize: "Размер", speed: "Скорость", connectionDistance: "Дальность связей", lineOpacity: "Яркость линий",
      cursorGroup: "Курсор", cursorMode: "Режим", repel: "Отталкивание", attract: "Притяжение", vortex: "Вихрь", off: "Выключен", cursorRadius: "Радиус", cursorForce: "Сила", cursorGlow: "Свечение курсора", cursorGlowHint: "Мягкий свет вокруг указателя",
      blackHolesGroup: "Чёрные дыры", blackHoleForce: "Сила", blackHoleRadius: "Радиус", absorption: "Поглощение", absorptionHint: "Удаляет частицы в ядре", planetsGroup: "Планеты", planetForce: "Гравитация", planetSize: "Размер", planetCollectors: "Коллекторы энергии", planetCollectorsHint: "Дают очки в режиме Game", predatorsGroup: "Хищники", predatorSpeed: "Скорость", predatorSense: "Радиус поиска", predatorTrails: "Следы хищников", predatorTrailsHint: "Показывает направление движения",
      colorsGroup: "Цвета", backgroundColor: "Фон", particleColor: "Частицы", lineColor: "Линии", cursorColor: "Курсор", effectsGroup: "Эффекты", trails: "Следы частиц", trailsHint: "Плавное затухание предыдущего кадра", pulse: "Пульсация", pulseHint: "Изменение размера точек", showGrid: "Фоновая сетка", showGridHint: "Техническая сетка Nexora", glowStrength: "Интенсивность свечения",
      performanceGroup: "Производительность", quality: "Качество", auto: "Авто", low: "Низкое", medium: "Среднее", high: "Высокое", fpsLimit: "Ограничение FPS", autoReduce: "Автоснижение качества", autoReduceHint: "Уменьшает нагрузку при падении FPS", respectMotion: "Учитывать системное уменьшение движения", respectMotionHint: "Можно отключить вручную",
      presetsGroup: "Пресеты", presetBalanced: "Баланс", presetNebula: "Туманность", presetChaos: "Хаос", presetMobile: "Mobile", configGroup: "Конфигурация", copyConfig: "Скопировать", importConfig: "Импорт", reset: "Сбросить", configHint: "Настройки сохраняются только в вашем браузере.", fullscreen: "Полный экран", done: "Готово",
      objectBlackHole: "Чёрная дыра создана", objectPlanet: "Планета создана", objectPredator: "Хищник создан", objectsCleared: "Объекты удалены", paused: "Пауза", resumed: "Продолжено", configCopied: "Конфигурация скопирована", configImported: "Конфигурация импортирована", configInvalid: "Некорректный файл конфигурации", configReset: "Настройки сброшены", presetApplied: "Пресет применён", gameStarted: "Раунд начался", gameWon: "Цель достигнута", gameLost: "Время вышло", gameNeedPlanet: "Создана планета-коллектор", reducedQuality: "Качество автоматически снижено",
    },
    en: {
      skip: "Skip to the interactive canvas", score: "SCORE", time: "TIME", particles: "POINTS", pause: "Pause", settings: "Settings", close: "Close",
      title: "Aether Field", lead: "Shape the particle flow with your cursor, then create planets, predators and black holes. Every parameter can be changed in real time.", start: "Start", openSettings: "Open settings", hint: "Click the scene to use the selected tool. Space pauses, S opens settings.",
      toolCursor: "Cursor", toolBlackHole: "Black hole", toolPlanet: "Planet", toolPredator: "Predator", clearObjects: "Clear",
      gameTitle: "Harvest energy", gameText: "Guide particles into collector planets. Predators and black holes drain energy. Reach 500 points in 60 seconds.", startRound: "Start round",
      tabField: "Field", tabObjects: "Objects", tabVisual: "Visual", tabSystem: "System", particlesGroup: "Particles", particleCount: "Count", particleSize: "Size", speed: "Speed", connectionDistance: "Connection range", lineOpacity: "Line brightness",
      cursorGroup: "Cursor", cursorMode: "Mode", repel: "Repel", attract: "Attract", vortex: "Vortex", off: "Off", cursorRadius: "Radius", cursorForce: "Force", cursorGlow: "Cursor glow", cursorGlowHint: "Soft light around the pointer",
      blackHolesGroup: "Black holes", blackHoleForce: "Force", blackHoleRadius: "Radius", absorption: "Absorption", absorptionHint: "Removes particles inside the core", planetsGroup: "Planets", planetForce: "Gravity", planetSize: "Size", planetCollectors: "Energy collectors", planetCollectorsHint: "Award points in Game mode", predatorsGroup: "Predators", predatorSpeed: "Speed", predatorSense: "Search radius", predatorTrails: "Predator trails", predatorTrailsHint: "Shows the movement direction",
      colorsGroup: "Colors", backgroundColor: "Background", particleColor: "Particles", lineColor: "Lines", cursorColor: "Cursor", effectsGroup: "Effects", trails: "Particle trails", trailsHint: "Softly fades the previous frame", pulse: "Pulse", pulseHint: "Changes particle size", showGrid: "Background grid", showGridHint: "Nexora technical grid", glowStrength: "Glow strength",
      performanceGroup: "Performance", quality: "Quality", auto: "Auto", low: "Low", medium: "Medium", high: "High", fpsLimit: "FPS limit", autoReduce: "Automatic quality reduction", autoReduceHint: "Reduces load when FPS drops", respectMotion: "Respect reduced motion", respectMotionHint: "Can be overridden manually",
      presetsGroup: "Presets", presetBalanced: "Balanced", presetNebula: "Nebula", presetChaos: "Chaos", presetMobile: "Mobile", configGroup: "Configuration", copyConfig: "Copy", importConfig: "Import", reset: "Reset", configHint: "Settings are stored only in your browser.", fullscreen: "Fullscreen", done: "Done",
      objectBlackHole: "Black hole created", objectPlanet: "Planet created", objectPredator: "Predator created", objectsCleared: "Objects cleared", paused: "Paused", resumed: "Resumed", configCopied: "Configuration copied", configImported: "Configuration imported", configInvalid: "Invalid configuration file", configReset: "Settings reset", presetApplied: "Preset applied", gameStarted: "Round started", gameWon: "Target reached", gameLost: "Time is up", gameNeedPlanet: "Collector planet created", reducedQuality: "Quality was reduced automatically",
    },
  };

  const safeStorage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch {} },
  };

  function loadSettings() {
    try {
      const parsed = JSON.parse(safeStorage.get(STORAGE_KEY) || "{}");
      return sanitizeSettings({ ...defaults, ...parsed });
    } catch {
      return { ...defaults };
    }
  }

  function sanitizeSettings(candidate) {
    const next = { ...defaults };
    for (const key of Object.keys(defaults)) {
      const original = defaults[key];
      const value = candidate[key];
      if (typeof original === "boolean") next[key] = Boolean(value);
      else if (typeof original === "number" && Number.isFinite(Number(value))) next[key] = Number(value);
      else if (typeof original === "string" && typeof value === "string") next[key] = value;
    }
    next.particleCount = clamp(Math.round(next.particleCount / 10) * 10, 30, 420);
    next.particleSize = clamp(next.particleSize, .7, 4);
    next.speed = clamp(next.speed, .1, 2.2);
    next.connectionDistance = clamp(next.connectionDistance, 40, 240);
    next.cursorRadius = clamp(next.cursorRadius, 40, 320);
    next.cursorForce = clamp(next.cursorForce, .1, 5);
    if (!["repel", "attract", "vortex", "none"].includes(next.cursorMode)) next.cursorMode = defaults.cursorMode;
    if (!["auto", "low", "medium", "high"].includes(next.quality)) next.quality = defaults.quality;
    if (!["30", "60", "120"].includes(String(next.fpsLimit))) next.fpsLimit = defaults.fpsLimit;
    return next;
  }

  class Particle {
    constructor(engine) {
      this.reset(engine);
      this.phase = Math.random() * TAU;
      this.seed = Math.random();
    }
    reset(engine, x = random(0, engine.width), y = random(0, engine.height)) {
      this.x = x;
      this.y = y;
      const angle = Math.random() * TAU;
      const speed = random(.25, 1);
      this.vx = Math.cos(angle) * speed;
      this.vy = Math.sin(angle) * speed;
      this.cooldown = 0;
    }
  }

  class AetherEngine {
    constructor(canvas, settings) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
      this.settings = settings;
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.particles = [];
      this.blackHoles = [];
      this.planets = [];
      this.predators = [];
      this.pointer = { x: null, y: null, down: false };
      this.tool = "cursor";
      this.mode = "sandbox";
      this.paused = false;
      this.running = false;
      this.frame = 0;
      this.lastFrame = 0;
      this.frameAccumulator = 0;
      this.score = 0;
      this.timeLeft = Infinity;
      this.roundActive = false;
      this.roundDuration = 60;
      this.targetScore = 500;
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
      addEventListener("resize", this.handleResize, { passive: true });
      canvas.addEventListener("pointermove", this.handlePointerMove, { passive: true });
      canvas.addEventListener("pointerdown", this.handlePointerDown);
      canvas.addEventListener("pointerup", this.handlePointerUp, { passive: true });
      canvas.addEventListener("pointercancel", this.handlePointerUp, { passive: true });
      canvas.addEventListener("pointerleave", this.handlePointerLeave, { passive: true });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) this.paused = true;
      });
      this.handleResize();
      this.syncParticleCount();
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
        particleMultiplier: level === "low" ? .55 : level === "medium" ? .78 : 1,
        dpr: level === "low" ? 1 : level === "medium" ? 1.35 : 1.7,
        connections: level !== "low",
        maxConnections: level === "high" ? 190 : 110,
      };
    }

    handleResize() {
      const profile = this.qualityProfile();
      this.width = document.documentElement.clientWidth || innerWidth;
      this.height = Math.round(window.visualViewport?.height || innerHeight);
      this.dpr = Math.min(devicePixelRatio || 1, profile.dpr);
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.canvas.style.width = `${this.width}px`;
      this.canvas.style.height = `${this.height}px`;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.syncParticleCount();
    }

    effectiveParticleCount() {
      return Math.max(20, Math.round(this.settings.particleCount * this.qualityProfile().particleMultiplier));
    }

    syncParticleCount() {
      const target = this.effectiveParticleCount();
      while (this.particles.length < target) this.particles.push(new Particle(this));
      if (this.particles.length > target) this.particles.length = target;
      this.callbacks.onParticleCount?.(this.particles.length);
    }

    updateSettings(settings) {
      this.settings = settings;
      this.handleResize();
      document.documentElement.dataset.grid = String(settings.showGrid);
    }

    setTool(tool) { this.tool = tool; }
    setMode(mode) {
      this.mode = mode;
      this.roundActive = false;
      this.score = 0;
      this.timeLeft = mode === "game" ? this.roundDuration : Infinity;
      this.callbacks.onScore?.(this.score);
      this.callbacks.onTime?.(this.timeLeft);
    }

    startRound() {
      this.mode = "game";
      this.roundActive = true;
      this.score = 0;
      this.timeLeft = this.roundDuration;
      this.paused = false;
      this.blackHoles = [];
      this.predators = [];
      this.planets = [];
      this.addPlanet(this.width * .67, this.height * .48, true);
      this.addPredator(this.width * .82, this.height * .68);
      this.particles.forEach((particle) => particle.reset(this));
      this.callbacks.onScore?.(this.score);
      this.callbacks.onTime?.(this.timeLeft);
    }

    togglePause(force) {
      this.paused = typeof force === "boolean" ? force : !this.paused;
      this.callbacks.onPause?.(this.paused);
    }

    handlePointerMove(event) {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = event.clientX - rect.left;
      this.pointer.y = event.clientY - rect.top;
    }
    handlePointerDown(event) {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      this.canvas.setPointerCapture?.(event.pointerId);
      this.handlePointerMove(event);
      this.pointer.down = true;
      if (this.tool === "blackHole") this.addBlackHole(this.pointer.x, this.pointer.y);
      else if (this.tool === "planet") this.addPlanet(this.pointer.x, this.pointer.y, this.settings.planetCollectors);
      else if (this.tool === "predator") this.addPredator(this.pointer.x, this.pointer.y);
      else this.createPulse(this.pointer.x, this.pointer.y);
    }
    handlePointerUp() { this.pointer.down = false; }
    handlePointerLeave() { this.pointer.x = null; this.pointer.y = null; this.pointer.down = false; }

    addBlackHole(x, y) {
      this.blackHoles.push({ x, y, age: 0, radius: 8, targetRadius: this.settings.blackHoleRadius, spin: Math.random() * TAU });
      if (this.blackHoles.length > 8) this.blackHoles.shift();
      if (this.mode === "game" && this.roundActive) this.addScore(-20);
      this.callbacks.onObject?.("blackHole");
    }
    addPlanet(x, y, collector = false) {
      this.planets.push({ x, y, radius: this.settings.planetSize, collector, energy: 0, phase: Math.random() * TAU, colorShift: Math.random() * 70 });
      if (this.planets.length > 10) this.planets.shift();
      this.callbacks.onObject?.("planet");
    }
    addPredator(x, y) {
      this.predators.push({ x, y, vx: random(-.5, .5), vy: random(-.5, .5), size: 10, phase: Math.random() * TAU, trail: [] });
      if (this.predators.length > 10) this.predators.shift();
      this.callbacks.onObject?.("predator");
    }
    clearObjects() {
      this.blackHoles = [];
      this.planets = [];
      this.predators = [];
      this.callbacks.onClear?.();
    }
    createPulse(x, y) {
      for (const particle of this.particles) {
        const dx = particle.x - x;
        const dy = particle.y - y;
        const dist = Math.hypot(dx, dy) || 1;
        if (dist > this.settings.cursorRadius * 1.4) continue;
        const strength = (1 - dist / (this.settings.cursorRadius * 1.4)) * this.settings.cursorForce * 2.2;
        const sign = this.settings.cursorMode === "attract" ? -1 : 1;
        particle.vx += (dx / dist) * strength * sign;
        particle.vy += (dy / dist) * strength * sign;
      }
    }
    addScore(delta) {
      this.score = Math.max(0, this.score + delta);
      this.callbacks.onScore?.(this.score);
    }

    start() {
      if (this.running) return;
      this.running = true;
      this.lastFrame = performance.now();
      this.frame = requestAnimationFrame(this.animate);
    }

    animate(time) {
      if (!this.running) return;
      const fpsLimit = Number(this.settings.fpsLimit || 60);
      const frameInterval = 1000 / fpsLimit;
      const elapsed = time - this.lastFrame;
      if (elapsed < frameInterval - .5) {
        this.frame = requestAnimationFrame(this.animate);
        return;
      }
      this.lastFrame = time - (elapsed % frameInterval);
      const delta = clamp(elapsed / 16.67, .25, 2.5);
      this.recordPerformance(time, elapsed);
      if (!this.paused) this.update(delta, elapsed / 1000);
      this.draw(time);
      this.frame = requestAnimationFrame(this.animate);
    }

    recordPerformance(time, elapsed) {
      const fps = elapsed > 0 ? 1000 / elapsed : 60;
      this.fpsSamples.push(fps);
      if (this.fpsSamples.length > 90) this.fpsSamples.shift();
      if (!this.settings.autoReduce || this.settings.quality !== "auto" || this.reducedOnce || time - this.lastQualityCheck < 5000) return;
      this.lastQualityCheck = time;
      if (this.fpsSamples.length < 45) return;
      const average = this.fpsSamples.reduce((sum, value) => sum + value, 0) / this.fpsSamples.length;
      if (average < 36 && this.settings.particleCount > 70) {
        this.settings.particleCount = Math.max(70, Math.round(this.settings.particleCount * .72 / 10) * 10);
        this.reducedOnce = true;
        this.syncParticleCount();
        this.callbacks.onAutoReduce?.(this.settings.particleCount);
      }
    }

    update(delta, seconds) {
      if (this.roundActive) {
        this.timeLeft = Math.max(0, this.timeLeft - seconds);
        this.callbacks.onTime?.(this.timeLeft);
        if (this.score >= this.targetScore) this.finishRound(true);
        else if (this.timeLeft <= 0) this.finishRound(false);
      }

      const speedScale = this.settings.speed * delta;
      const pointerActive = this.pointer.x !== null && this.pointer.y !== null && this.settings.cursorMode !== "none";

      for (const particle of this.particles) {
        if (particle.cooldown > 0) particle.cooldown -= seconds;
        if (pointerActive) this.applyCursorForce(particle, delta);
        for (const hole of this.blackHoles) this.applyBlackHole(particle, hole, delta);
        for (const planet of this.planets) this.applyPlanet(particle, planet, delta);

        const velocity = Math.hypot(particle.vx, particle.vy);
        const maxVelocity = 5.5 + this.settings.speed * 3;
        if (velocity > maxVelocity) {
          particle.vx = particle.vx / velocity * maxVelocity;
          particle.vy = particle.vy / velocity * maxVelocity;
        }
        particle.x += particle.vx * speedScale;
        particle.y += particle.vy * speedScale;
        particle.vx *= .998;
        particle.vy *= .998;
        if (particle.x < -8) particle.x = this.width + 8;
        if (particle.x > this.width + 8) particle.x = -8;
        if (particle.y < -8) particle.y = this.height + 8;
        if (particle.y > this.height + 8) particle.y = -8;
      }

      for (const hole of this.blackHoles) {
        hole.age += seconds;
        hole.radius += (hole.targetRadius - hole.radius) * .035 * delta;
        hole.spin += .018 * delta;
      }
      this.updatePredators(delta);
    }

    applyCursorForce(particle, delta) {
      const dx = particle.x - this.pointer.x;
      const dy = particle.y - this.pointer.y;
      const distSq = dx * dx + dy * dy;
      const radius = this.settings.cursorRadius;
      if (distSq <= .01 || distSq >= radius * radius) return;
      const dist = Math.sqrt(distSq);
      const force = (1 - dist / radius) * this.settings.cursorForce * .055 * delta;
      if (this.settings.cursorMode === "repel") {
        particle.vx += dx / dist * force;
        particle.vy += dy / dist * force;
      } else if (this.settings.cursorMode === "attract") {
        particle.vx -= dx / dist * force;
        particle.vy -= dy / dist * force;
      } else if (this.settings.cursorMode === "vortex") {
        particle.vx += (-dy / dist) * force * 1.3 - (dx / dist) * force * .18;
        particle.vy += (dx / dist) * force * 1.3 - (dy / dist) * force * .18;
      }
    }

    applyBlackHole(particle, hole, delta) {
      const dx = hole.x - particle.x;
      const dy = hole.y - particle.y;
      const distSq = dx * dx + dy * dy;
      const radius = hole.radius;
      if (distSq > radius * radius || distSq <= .01) return;
      const dist = Math.sqrt(distSq);
      const normalized = 1 - dist / radius;
      const force = normalized * this.settings.blackHoleForce * .09 * delta;
      particle.vx += dx / dist * force + (-dy / dist) * force * .18;
      particle.vy += dy / dist * force + (dx / dist) * force * .18;
      if (this.settings.blackHoleAbsorption && dist < Math.max(5, radius * .075)) {
        particle.reset(this, random(0, this.width), random(0, this.height));
        if (this.roundActive) this.addScore(-2);
      }
    }

    applyPlanet(particle, planet, delta) {
      const dx = planet.x - particle.x;
      const dy = planet.y - particle.y;
      const distSq = dx * dx + dy * dy;
      const influence = planet.radius * 6;
      if (distSq > influence * influence || distSq <= .01) return;
      const dist = Math.sqrt(distSq);
      const force = (1 - dist / influence) * this.settings.planetForce * .035 * delta;
      particle.vx += dx / dist * force;
      particle.vy += dy / dist * force;
      if (planet.collector && dist < planet.radius * .72 && particle.cooldown <= 0) {
        planet.energy += 1;
        particle.cooldown = .6;
        particle.reset(this, random(0, this.width), random(0, this.height));
        if (this.roundActive) this.addScore(5);
      }
    }

    updatePredators(delta) {
      for (const predator of this.predators) {
        let nearest = null;
        let nearestDistance = this.settings.predatorSense * this.settings.predatorSense;
        for (const particle of this.particles) {
          const dist = distanceSquared(predator, particle);
          if (dist < nearestDistance) { nearest = particle; nearestDistance = dist; }
        }
        if (nearest) {
          const dx = nearest.x - predator.x;
          const dy = nearest.y - predator.y;
          const dist = Math.sqrt(nearestDistance) || 1;
          predator.vx += dx / dist * this.settings.predatorSpeed * .035 * delta;
          predator.vy += dy / dist * this.settings.predatorSpeed * .035 * delta;
          if (dist < predator.size + 3) {
            nearest.reset(this, random(0, this.width), random(0, this.height));
            predator.size = clamp(predator.size + .18, 9, 19);
            if (this.roundActive) this.addScore(-3);
          }
        }
        const velocity = Math.hypot(predator.vx, predator.vy) || 1;
        const maxVelocity = this.settings.predatorSpeed * 1.55;
        if (velocity > maxVelocity) {
          predator.vx = predator.vx / velocity * maxVelocity;
          predator.vy = predator.vy / velocity * maxVelocity;
        }
        predator.x += predator.vx * delta;
        predator.y += predator.vy * delta;
        predator.vx *= .985;
        predator.vy *= .985;
        if (predator.x < 0 || predator.x > this.width) predator.vx *= -1;
        if (predator.y < 0 || predator.y > this.height) predator.vy *= -1;
        predator.x = clamp(predator.x, 0, this.width);
        predator.y = clamp(predator.y, 0, this.height);
        predator.phase += .04 * delta;
        if (this.settings.predatorTrails) {
          predator.trail.push({ x: predator.x, y: predator.y });
          if (predator.trail.length > 18) predator.trail.shift();
        } else predator.trail.length = 0;
      }
    }

    finishRound(won) {
      this.roundActive = false;
      this.callbacks.onRoundEnd?.(won, this.score);
    }

    draw(time) {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (this.settings.trails && !this.paused) {
        ctx.fillStyle = `${this.settings.backgroundColor}33`;
        ctx.fillRect(0, 0, this.width, this.height);
      } else {
        ctx.fillStyle = this.settings.backgroundColor;
        ctx.fillRect(0, 0, this.width, this.height);
      }
      this.drawConnections(ctx);
      this.drawParticles(ctx, time);
      this.drawPlanets(ctx, time);
      this.drawBlackHoles(ctx, time);
      this.drawPredators(ctx, time);
      this.drawCursor(ctx);
      if (this.paused) this.drawPaused(ctx);
      ctx.restore();
    }

    drawConnections(ctx) {
      const profile = this.qualityProfile();
      if (!profile.connections || this.settings.lineOpacity <= 0) return;
      const limit = Math.min(this.particles.length, profile.maxConnections);
      const range = this.settings.connectionDistance;
      const rangeSq = range * range;
      ctx.lineWidth = .65;
      for (let a = 0; a < limit; a += 1) {
        for (let b = a + 1; b < limit; b += 1) {
          const first = this.particles[a];
          const second = this.particles[b];
          const dx = first.x - second.x;
          const dy = first.y - second.y;
          const distSq = dx * dx + dy * dy;
          if (distSq >= rangeSq) continue;
          const alpha = (1 - distSq / rangeSq) * this.settings.lineOpacity;
          ctx.strokeStyle = this.hexToRgba(this.settings.lineColor, alpha);
          ctx.beginPath();
          ctx.moveTo(first.x, first.y);
          ctx.lineTo(second.x, second.y);
          ctx.stroke();
        }
      }
    }

    drawParticles(ctx, time) {
      if (this.settings.glowStrength > 0) {
        ctx.shadowColor = this.settings.particleColor;
        ctx.shadowBlur = this.settings.glowStrength;
      }
      for (const particle of this.particles) {
        const pulse = this.settings.pulse ? .82 + Math.sin(time * .0013 + particle.phase) * .22 : 1;
        const radius = this.settings.particleSize * (.7 + particle.seed * .7) * pulse;
        ctx.fillStyle = this.hexToRgba(this.settings.particleColor, .62 + particle.seed * .34);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, TAU);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }

    drawPlanets(ctx, time) {
      for (const planet of this.planets) {
        const pulse = 1 + Math.sin(time * .0015 + planet.phase) * .05;
        const radius = planet.radius * pulse;
        const gradient = ctx.createRadialGradient(planet.x - radius * .28, planet.y - radius * .32, radius * .1, planet.x, planet.y, radius);
        gradient.addColorStop(0, "rgba(255,255,255,.96)");
        gradient.addColorStop(.18, planet.collector ? "rgba(202,157,255,.95)" : "rgba(112,216,255,.95)");
        gradient.addColorStop(1, planet.collector ? "rgba(80,28,140,.82)" : "rgba(18,64,94,.82)");
        ctx.shadowColor = planet.collector ? "rgba(169,104,255,.75)" : "rgba(112,216,255,.58)";
        ctx.shadowBlur = 22;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(planet.x, planet.y, radius, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = planet.collector ? "rgba(222,193,255,.6)" : "rgba(146,229,255,.45)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.ellipse(planet.x, planet.y, radius * 1.55, radius * .52, -.25, 0, TAU);
        ctx.stroke();
        if (planet.collector) {
          const ring = radius * (1.25 + (planet.energy % 12) * .018);
          ctx.strokeStyle = "rgba(169,104,255,.18)";
          ctx.beginPath();
          ctx.arc(planet.x, planet.y, ring, 0, TAU);
          ctx.stroke();
        }
      }
    }

    drawBlackHoles(ctx, time) {
      for (const hole of this.blackHoles) {
        const radius = hole.radius;
        const gradient = ctx.createRadialGradient(hole.x, hole.y, radius * .02, hole.x, hole.y, radius);
        gradient.addColorStop(0, "rgba(0,0,0,1)");
        gradient.addColorStop(.13, "rgba(0,0,0,1)");
        gradient.addColorStop(.22, "rgba(231,205,255,.72)");
        gradient.addColorStop(.34, "rgba(139,64,225,.28)");
        gradient.addColorStop(1, "rgba(20,8,31,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(hole.x, hole.y, radius, 0, TAU);
        ctx.fill();
        ctx.save();
        ctx.translate(hole.x, hole.y);
        ctx.rotate(hole.spin + time * .00015);
        ctx.strokeStyle = "rgba(206,159,255,.38)";
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 3; i += 1) {
          ctx.beginPath();
          ctx.ellipse(0, 0, radius * (.45 + i * .16), radius * (.11 + i * .035), i * .7, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    drawPredators(ctx) {
      for (const predator of this.predators) {
        if (predator.trail.length > 1) {
          ctx.beginPath();
          predator.trail.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
          ctx.strokeStyle = "rgba(255,95,143,.22)";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
        const angle = Math.atan2(predator.vy, predator.vx);
        ctx.save();
        ctx.translate(predator.x, predator.y);
        ctx.rotate(angle);
        ctx.shadowColor = "rgba(255,84,135,.72)";
        ctx.shadowBlur = 16;
        ctx.fillStyle = "rgba(255,95,143,.88)";
        ctx.beginPath();
        ctx.moveTo(predator.size * 1.25, 0);
        ctx.lineTo(-predator.size, predator.size * .72);
        ctx.lineTo(-predator.size * .55, 0);
        ctx.lineTo(-predator.size, -predator.size * .72);
        ctx.closePath();
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(predator.size * .35, -predator.size * .18, 1.4, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    }

    drawCursor(ctx) {
      if (this.pointer.x === null || this.pointer.y === null || this.settings.cursorMode === "none") return;
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
      ctx.strokeStyle = this.hexToRgba(this.settings.cursorColor, .26);
      ctx.lineWidth = .8;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      ctx.arc(this.pointer.x, this.pointer.y, radius * .36, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    drawPaused(ctx) {
      ctx.fillStyle = "rgba(7,5,11,.42)";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = "rgba(255,255,255,.86)";
      ctx.font = "700 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("PAUSED", this.width / 2, this.height / 2);
    }

    hexToRgba(hex, alpha) {
      const normalized = String(hex || "#ffffff").replace("#", "");
      const value = normalized.length === 3 ? normalized.split("").map((char) => char + char).join("") : normalized.padEnd(6, "f").slice(0, 6);
      const number = Number.parseInt(value, 16);
      const r = number >> 16 & 255;
      const g = number >> 8 & 255;
      const b = number & 255;
      return `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
    }
  }

  const state = {
    lang: safeStorage.get(LANGUAGE_KEY) === "en" ? "en" : "ru",
    settings: loadSettings(),
    settingsOpen: false,
    toastTimer: 0,
  };
  const t = (key) => dictionary[state.lang][key] || dictionary.ru[key] || key;

  const canvas = document.querySelector("#game-canvas");
  const engine = new AetherEngine(canvas, state.settings);
  const scoreElement = document.querySelector("[data-score]");
  const timeElement = document.querySelector("[data-time]");
  const countElement = document.querySelector("[data-particle-count]");
  const pauseButton = document.querySelector("[data-pause]");
  const intro = document.querySelector("[data-intro]");
  const gameCard = document.querySelector("[data-game-card]");
  const gameMessage = document.querySelector("[data-game-message]");
  const toast = document.querySelector("[data-toast]");
  const settingsPanel = document.querySelector("[data-settings-panel]") || document.querySelector("#settings-panel");
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
    updateSettingSelectOptions();
  }

  function updateSettingSelectOptions() {
    document.querySelectorAll("select option[data-i18n]").forEach((option) => {
      option.textContent = t(option.dataset.i18n);
    });
  }

  function showToast(message) {
    clearTimeout(state.toastTimer);
    toast.textContent = message;
    toast.classList.add("visible");
    state.toastTimer = setTimeout(() => toast.classList.remove("visible"), 2400);
  }

  function showGameMessage(message) {
    gameMessage.textContent = message;
    gameMessage.classList.add("visible");
    clearTimeout(showGameMessage.timer);
    showGameMessage.timer = setTimeout(() => gameMessage.classList.remove("visible"), 1800);
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
    if (["particleSize", "speed", "cursorForce", "blackHoleForce", "planetForce", "predatorSpeed"].includes(key)) return Number(value).toFixed(1);
    if (key === "lineOpacity") return `${Math.round(Number(value) * 100)}%`;
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
      const value = input.type === "checkbox" ? input.checked : input.type === "range" ? Number(input.value) : input.value;
      applySettings({ [key]: value });
    });
  });

  document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => applyLanguage(button.dataset.lang)));
  document.querySelectorAll("[data-settings-open], [data-intro-settings]").forEach((button) => button.addEventListener("click", openSettings));
  document.querySelectorAll("[data-settings-close]").forEach((button) => button.addEventListener("click", closeSettings));
  backdrop.addEventListener("click", closeSettings);

  document.querySelectorAll("[data-settings-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.settingsTab;
      document.querySelectorAll("[data-settings-tab]").forEach((candidate) => {
        const active = candidate === button;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll("[data-settings-page]").forEach((page) => page.classList.toggle("active", page.dataset.settingsPage === tab));
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
    });
  });

  document.querySelector("[data-clear-objects]").addEventListener("click", () => engine.clearObjects());
  document.querySelector("[data-intro-start]").addEventListener("click", () => intro.classList.add("dismissed"));

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const mode = button.dataset.mode;
      engine.setMode(mode);
      document.querySelectorAll("[data-mode]").forEach((candidate) => {
        const active = candidate.dataset.mode === mode;
        candidate.classList.toggle("active", active);
        candidate.setAttribute("aria-pressed", String(active));
      });
      intro.classList.add("dismissed");
      gameCard.hidden = mode !== "game";
    });
  });

  document.querySelector("[data-game-start]").addEventListener("click", () => {
    gameCard.hidden = true;
    engine.startRound();
    showGameMessage(t("gameStarted"));
  });

  pauseButton.addEventListener("click", () => engine.togglePause());

  document.querySelectorAll("[data-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      const preset = presets[button.dataset.preset];
      if (!preset) return;
      applySettings({ ...preset });
      showToast(t("presetApplied"));
    });
  });

  document.querySelector("[data-export-config]").addEventListener("click", async () => {
    const text = JSON.stringify(state.settings, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      showToast(t("configCopied"));
    } catch {
      const blob = new Blob([text], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "nexora-aether-config.json";
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(t("configCopied"));
    }
  });

  const importFile = document.querySelector("[data-import-file]");
  document.querySelector("[data-import-config]").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files?.[0];
    importFile.value = "";
    if (!file || file.size > 100_000) return showToast(t("configInvalid"));
    try {
      const parsed = JSON.parse(await file.text());
      applySettings(parsed);
      showToast(t("configImported"));
    } catch {
      showToast(t("configInvalid"));
    }
  });

  document.querySelector("[data-reset-config]").addEventListener("click", () => {
    applySettings({ ...defaults });
    showToast(t("configReset"));
  });

  document.querySelector("[data-fullscreen]").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });

  addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.settingsOpen) closeSettings();
    if (event.key === " " && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName || "")) {
      event.preventDefault();
      engine.togglePause();
    }
    if ((event.key === "s" || event.key === "S") && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) {
      event.preventDefault();
      state.settingsOpen ? closeSettings() : openSettings();
    }
  });

  engine.callbacks.onScore = (score) => { scoreElement.textContent = Math.round(score).toLocaleString(state.lang === "ru" ? "ru-RU" : "en-US"); };
  engine.callbacks.onTime = (seconds) => { timeElement.textContent = Number.isFinite(seconds) ? `${Math.ceil(seconds)}s` : "∞"; };
  engine.callbacks.onParticleCount = (count) => { countElement.textContent = String(count); };
  engine.callbacks.onPause = (paused) => {
    pauseButton.setAttribute("aria-pressed", String(paused));
    showGameMessage(t(paused ? "paused" : "resumed"));
  };
  engine.callbacks.onObject = (type) => showGameMessage(t(type === "blackHole" ? "objectBlackHole" : type === "planet" ? "objectPlanet" : "objectPredator"));
  engine.callbacks.onClear = () => showGameMessage(t("objectsCleared"));
  engine.callbacks.onAutoReduce = (count) => {
    state.settings.particleCount = count;
    syncControls();
    saveSettings();
    showToast(t("reducedQuality"));
  };
  engine.callbacks.onRoundEnd = (won) => {
    showGameMessage(t(won ? "gameWon" : "gameLost"));
    gameCard.hidden = false;
  };

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  if (reduceMotion.matches && state.settings.respectReducedMotion) {
    applySettings({ particleCount: Math.min(state.settings.particleCount, 70), speed: Math.min(state.settings.speed, .35), trails: false, quality: state.settings.quality === "auto" ? "low" : state.settings.quality }, false);
  } else {
    engine.updateSettings(state.settings);
  }

  applyLanguage(state.lang);
  syncControls();
  engine.callbacks.onScore(0);
  engine.callbacks.onTime(Infinity);
  engine.callbacks.onParticleCount(engine.particles.length);
})();
