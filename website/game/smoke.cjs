"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = __dirname;
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
let source = fs.readFileSync(path.join(root, "game.js"), "utf8");
source = source.replace(
  "const engine = new AetherEngine(canvas, state.settings);",
  "const engine = globalThis.__aetherEngine = new AetherEngine(canvas, state.settings);",
);

class MockElement {
  constructor(dataset = {}) {
    this.dataset = { ...dataset };
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.attributes = {};
    this.type = "button";
    this.value = "";
    this.checked = false;
    this.textContent = "";
    this.hidden = false;
    this.files = [];
    this.tagName = "BUTTON";
  }

  addEventListener() {}
  setAttribute(key, value) { this.attributes[key] = value; }
  getAttribute(key) { return this.attributes[key]; }
  focus() {}
  click() {}
  append() {}
  querySelector() { return new MockElement(); }
}

const drawingContext = new Proxy({
  createRadialGradient() { return { addColorStop() {} }; },
  createLinearGradient() { return { addColorStop() {} }; },
  save() {},
  restore() {},
  setTransform() {},
  fillRect() {},
  beginPath() {},
  arc() {},
  fill() {},
  stroke() {},
  moveTo() {},
  lineTo() {},
  ellipse() {},
  translate() {},
  rotate() {},
  scale() {},
  closePath() {},
  setLineDash() {},
  fillText() {},
}, {
  get(target, property) {
    if (!(property in target)) target[property] = 0;
    return target[property];
  },
  set(target, property, value) {
    target[property] = value;
    return true;
  },
});

const canvas = new MockElement();
canvas.tagName = "CANVAS";
canvas.getContext = () => drawingContext;
canvas.getBoundingClientRect = () => ({ left: 0, top: 0 });
canvas.setPointerCapture = () => {};
canvas.releasePointerCapture = () => {};

const elements = new Map();
function element(selector) {
  if (selector === "#game-canvas") return canvas;
  if (!elements.has(selector)) elements.set(selector, new MockElement());
  return elements.get(selector);
}

function dataValues(attribute) {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<[^>]+${escaped}=["']([^"']+)["'][^>]*>`, "g");
  const values = [];
  let match;
  while ((match = pattern.exec(html))) values.push(match[1]);
  return values;
}

const settingElements = [...html.matchAll(/<input[^>]+data-setting=["']([^"']+)["'][^>]*>|<select[^>]+data-setting=["']([^"']+)["'][^>]*>/g)]
  .map((match) => {
    const markup = match[0];
    const control = new MockElement({ setting: match[1] || match[2] });
    control.tagName = markup.startsWith("<select") ? "SELECT" : "INPUT";
    control.type = markup.match(/type=["']([^"']+)/)?.[1] || (control.tagName === "SELECT" ? "select-one" : "text");
    return control;
  });
const outputElements = dataValues("data-output").map((key) => {
  const output = new MockElement({ output: key });
  output.tagName = "OUTPUT";
  return output;
});
const languageElements = ["ru", "en"].map((lang) => new MockElement({ lang }));
const toolElements = dataValues("data-tool").map((tool) => new MockElement({ tool }));
const presetElements = dataValues("data-preset").map((preset) => new MockElement({ preset }));
const tabElements = dataValues("data-settings-tab").map((settingsTab) => new MockElement({ settingsTab }));
const pageElements = dataValues("data-settings-page").map((settingsPage) => new MockElement({ settingsPage }));
const localizedElements = dataValues("data-i18n").map((i18n) => new MockElement({ i18n }));

const document = {
  documentElement: {
    clientWidth: 1280,
    clientHeight: 720,
    dataset: {},
    lang: "ru",
    requestFullscreen: async () => {},
  },
  fullscreenElement: null,
  hidden: false,
  activeElement: new MockElement(),
  querySelector: element,
  querySelectorAll(selector) {
    if (selector === "[data-setting]") return settingElements;
    if (selector === "[data-output]") return outputElements;
    if (selector === "[data-lang]") return languageElements;
    if (selector === "[data-tool]") return toolElements;
    if (selector === "[data-preset]") return presetElements;
    if (selector === "[data-settings-tab]") return tabElements;
    if (selector === "[data-settings-page]") return pageElements;
    if (selector === "[data-i18n]") return localizedElements;
    if (selector.includes("[data-settings-open]")) {
      return [element("[data-settings-open]"), element("[data-intro-settings]")];
    }
    if (selector === "[data-settings-close]") return [element(selector), new MockElement()];
    return [];
  },
  addEventListener() {},
  exitFullscreen: async () => {},
  createElement() { return new MockElement(); },
};

const storage = new Map();
let randomState = 1;
const seededMath = Object.create(Math);
seededMath.random = () => {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 4294967296;
};

const context = {
  console,
  document,
  navigator: {
    deviceMemory: 8,
    hardwareConcurrency: 8,
    clipboard: { writeText: async () => {} },
  },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  innerWidth: 1280,
  innerHeight: 720,
  devicePixelRatio: 1,
  performance: { now: () => 1000 },
  matchMedia: () => ({ matches: false }),
  requestAnimationFrame: () => 1,
  cancelAnimationFrame() {},
  addEventListener() {},
  setTimeout: () => 1,
  clearTimeout() {},
  Blob,
  URL: { createObjectURL: () => "", revokeObjectURL() {} },
  getComputedStyle: () => ({ getPropertyValue: () => "74" }),
  Uint8Array,
  Math: seededMath,
  JSON,
  Number,
  String,
  Object,
  Array,
  Map,
  Set,
  Date,
  RegExp,
  Error,
};
context.window = context;

vm.createContext(context);
vm.runInContext(source, context, { filename: "game.js" });

const engine = context.__aetherEngine;
assert.ok(engine, "Aether engine must initialize");
assert.equal(engine.particles.length, 220, "Default particle count must be deterministic");
assert.equal("planets" in engine, false, "Planet subsystem must remain removed");
assert.equal(engine.blackHoles.length, 0, "Black holes must not spawn manually at startup");

// Source-like boundary reflection.
const boundaryParticle = engine.particles[0];
boundaryParticle.x = engine.width - .1;
boundaryParticle.y = 100;
boundaryParticle.vx = 1;
boundaryParticle.vy = 0;
engine.updateParticles(1);
assert.ok(boundaryParticle.vx < 0, "Particles must bounce from the right boundary");

// Source-like continuous cursor repulsion.
engine.setTool("cursor");
engine.pointer.x = 640;
engine.pointer.y = 360;
const repelledParticle = engine.particles[1];
repelledParticle.x = 690;
repelledParticle.y = 360;
repelledParticle.vx = 0;
repelledParticle.vy = 0;
const beforeRepel = repelledParticle.x;
engine.applyRepel(1);
assert.ok(repelledParticle.x > beforeRepel, "Default cursor must push nearby particles away");

// Visible links must also behave as physical springs.
const first = engine.particles[2];
const second = engine.particles[3];
engine.particles = [first, second];
first.x = 300;
first.y = 300;
first.vx = 0;
first.vy = 0;
second.x = 420;
second.y = 300;
second.vx = 0;
second.vy = 0;
engine.updatePhysicalLinks(1);
assert.equal(engine.bonds.length, 1, "Nearby particles must form a physical link");
assert.ok(first.vx > 0 && second.vx < 0, "A stretched link must pull both particles together");

// A default magnetic cloud must reliably collapse without manual black-hole spawning.
engine.restartField();
engine.setTool("magnet");
engine.pointer.x = 640;
engine.pointer.y = 360;
engine.pointer.down = true;
let collapseFrame = 0;
for (; collapseFrame < 1800 && engine.blackHoles.length === 0; collapseFrame += 1) {
  engine.update(1, 1 / 60);
}
assert.equal(engine.blackHoles.length, 1, "Default magnet must create a black hole after a dense sustained collapse");
assert.ok(collapseFrame < 1800, "Magnetic collapse must complete within 30 seconds in the deterministic field");

// Black holes must evaporate instead of persisting forever.
const blackHole = engine.blackHoles[0];
blackHole.age = blackHole.lifetime;
engine.updateBlackHoles(1, 1 / 60);
assert.equal(engine.blackHoles.length, 0, "Expired black holes must evaporate");

// Predators must release the exact swallowed population when overloaded.
engine.restartField();
engine.addPredator(640, 360);
const predator = engine.predators[0];
predator.swallowed = engine.settings.predatorCapacity;
predator.burstTimer = 0;
engine.particles.length -= predator.swallowed;
const populationBeforeBurst = engine.particles.length;
engine.updatePredators(1, .1);
assert.equal(engine.predators.length, 0, "An overloaded predator must burst and disappear");
assert.equal(
  engine.particles.length,
  populationBeforeBurst + engine.settings.predatorCapacity,
  "Predator burst must return swallowed particles",
);

// Missing particles must regenerate slowly toward the manual target.
engine.particles.length = engine.settings.particleCount - 2;
engine.regenerationAccumulator = 0;
const beforeRegeneration = engine.particles.length;
engine.updateRegeneration(1);
assert.equal(engine.particles.length, beforeRegeneration + 1, "Regeneration must restore particles gradually");

// Automatic quality reduction must affect active workload, not only the slider value.
engine.restartField();
engine.settings.quality = "auto";
engine.settings.autoReduce = true;
engine.reducedOnce = false;
engine.lastQualityCheck = 0;
engine.fpsSamples = Array.from({ length: 60 }, () => 20);
engine.recordPerformance(6000, 50);
assert.ok(engine.settings.particleCount < 220, "Low sustained FPS must lower the particle target");
assert.equal(
  engine.particles.length,
  engine.settings.particleCount,
  "Automatic reduction must trim the active particle population immediately",
);

console.log("Aether sandbox runtime and mechanics smoke passed.");
