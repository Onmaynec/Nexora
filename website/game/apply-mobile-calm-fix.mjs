import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const websiteRoot = path.resolve(root, "..");

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`Patch target not found: ${label}`);
  return source.replace(before, after);
}

const mobileCss = `

/* Mobile cascade guard: site-fixes.css is appended after styles.css in Pages builds.
   Restate the narrow layout after the broad 1240px rule so mobile content cannot
   be squeezed into a desktop column. */
@media (max-width: 1040px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 2rem;
  }

  .hero-copy,
  .hero-stage,
  .product-window,
  .section,
  main {
    min-width: 0;
    max-width: 100%;
  }
}

@media (max-width: 760px) {
  html,
  body {
    width: 100%;
    max-width: 100%;
    overflow-x: hidden;
    overflow-x: clip;
  }

  .site-header {
    width: 100%;
    max-width: 100%;
    gap: .55rem;
    padding-inline: .75rem;
  }

  .header-actions {
    min-width: 0;
    gap: .4rem;
    padding-right: 47px;
  }

  .language-switch button {
    padding: .4rem .45rem;
  }

  .menu-button {
    right: .75rem;
  }

  .hero {
    width: min(calc(100% - 1.5rem), var(--max));
    padding-top: calc(var(--header) + 54px);
  }

  .hero-copy {
    width: 100%;
    max-width: none;
  }

  html[lang="ru"] .hero h1,
  .hero h1,
  html[lang="ru"] .section-heading h2,
  html[lang="ru"] .final-cta h2,
  .section-heading h2,
  .final-cta h2 {
    max-width: 100%;
    overflow-wrap: normal;
    word-break: normal;
    hyphens: none;
    text-wrap: balance;
  }

  .hero h1 span,
  .hero h1 em {
    width: 100%;
  }

  .hero-status {
    width: fit-content;
    max-width: 100%;
  }

  .hero-stage {
    width: 100%;
    min-height: 460px;
  }

  .product-window,
  .section-heading,
  .final-cta,
  .live-panel,
  .activity-card,
  .architecture-board,
  .trust-lifecycle,
  .data-path,
  .release-selector,
  .assessment-card,
  .doc-link {
    min-width: 0;
    max-width: 100%;
  }
}

@media (max-width: 520px) {
  .section,
  .hero,
  .site-footer {
    width: min(calc(100% - 1rem), var(--max));
  }

  html[lang="ru"] .hero h1,
  .hero h1 {
    font-size: clamp(2.55rem, 13.5vw, 3.65rem);
    line-height: .96;
    letter-spacing: -.04em;
  }

  .hero-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .hero-actions .button {
    width: 100%;
    min-width: 0;
    white-space: normal;
  }

  .hero-stage {
    min-height: 420px;
  }

  .product-window {
    width: 100%;
    height: 380px;
  }
}
`;
const fixesPath = path.join(websiteRoot, "site-fixes.css");
let fixes = fs.readFileSync(fixesPath, "utf8");
if (!fixes.includes("Mobile cascade guard")) fixes += mobileCss;
fs.writeFileSync(fixesPath, fixes);

const gamePath = path.join(root, "game.js");
let game = fs.readFileSync(gamePath, "utf8");
game = replaceOnce(game, 'const STORAGE_KEY = "nexora-aether-settings-v2";', 'const STORAGE_KEY = "nexora-aether-settings-v3";', "settings generation");
game = replaceOnce(game, `    particleSize: 1.8,\n    speed: 0.62,\n    regenerationRate: 1.25,`, `    particleSize: 1.7,\n    speed: 0.75,\n    regenerationRate: 0.8,`, "calm particle defaults");
game = replaceOnce(game, `    connectionDistance: 132,\n    lineOpacity: 0.26,\n    linkStrength: 0.0025,\n    maxLinks: 3,\n    separation: 0.45,\n    impulseForce: 4.2,\n    vortexForce: 2.2,`, `    connectionDistance: 138,\n    lineOpacity: 0.23,\n    linkStrength: 0.0001,\n    maxLinks: 2,\n    separation: 0.1,\n    impulseForce: 2.2,\n    vortexForce: 1.4,`, "calm physics defaults");
game = replaceOnce(game, `    pulse: true,\n    showGrid: true,\n    glowStrength: 10,`, `    pulse: false,\n    showGrid: true,\n    glowStrength: 6,`, "calm visual defaults");
game = replaceOnce(game, `      const angle = Number.isFinite(options.angle) ? options.angle : Math.random() * TAU;\n      const baseSpeed = Number.isFinite(options.velocity) ? options.velocity : random(.08, .28);\n      this.vx = Number.isFinite(options.vx) ? options.vx : Math.cos(angle) * baseSpeed;\n      this.vy = Number.isFinite(options.vy) ? options.vy : Math.sin(angle) * baseSpeed;`, `      const angle = Number.isFinite(options.angle) ? options.angle : Math.random() * TAU;\n      if (Number.isFinite(options.vx) || Number.isFinite(options.vy)) {\n        this.vx = Number.isFinite(options.vx) ? options.vx : 0;\n        this.vy = Number.isFinite(options.vy) ? options.vy : 0;\n      } else if (Number.isFinite(options.velocity)) {\n        this.vx = Math.cos(angle) * options.velocity;\n        this.vy = Math.sin(angle) * options.velocity;\n      } else {\n        this.vx = random(-.2, .2);\n        this.vy = random(-.2, .2);\n      }\n      this.driftVx = clamp(this.vx, -.2, .2);\n      this.driftVy = clamp(this.vy, -.2, .2);`, "source-like particle drift");
game = replaceOnce(game, `        particle.x -= dx / distance * displacement;\n        particle.y -= dy / distance * displacement;\n        particle.vx -= dx / distance * force * .018 * this.settings.cursorForce;\n        particle.vy -= dy / distance * force * .018 * this.settings.cursorForce;`, `        // Match the original component: move particles away without storing\n        // cursor energy in their velocity.\n        particle.x -= dx / distance * displacement;\n        particle.y -= dy / distance * displacement;`, "non-accumulating cursor response");
game = replaceOnce(game, `    applyMagnet(delta, seconds) {\n      const radius = this.settings.cursorRadius * 1.35;\n      const coreRadius = this.settings.collapseRadius;\n      let density = 0;\n\n      for (const particle of this.particles) {\n        const dx = this.pointer.x - particle.x;\n        const dy = this.pointer.y - particle.y;\n        const distance = Math.hypot(dx, dy) || 1;\n        if (distance <= coreRadius) density += 1;\n        if (distance > radius) continue;\n        const normalized = 1 - distance / radius;\n        const force = normalized * this.settings.cursorForce * .065 * delta;\n        const trailX = this.pointer.velocityX * .0045 * normalized;\n        const trailY = this.pointer.velocityY * .0045 * normalized;\n        particle.vx += dx / distance * force - dy / distance * force * .16 + trailX;\n        particle.vy += dy / distance * force + dx / distance * force * .16 + trailY;\n      }`, `    applyMagnet(delta, seconds) {\n      const radius = Math.max(this.settings.cursorRadius * 2.25, this.settings.collapseRadius * 3.4);\n      const coreRadius = this.settings.collapseRadius;\n      let density = 0;\n\n      for (const particle of this.particles) {\n        const dx = this.pointer.x - particle.x;\n        const dy = this.pointer.y - particle.y;\n        const distance = Math.hypot(dx, dy) || 1;\n        if (distance <= coreRadius) density += 1;\n        if (distance > radius) continue;\n        const normalized = 1 - distance / radius;\n        const damping = Math.max(.82, 1 - normalized * .075 * delta);\n        const force = normalized * this.settings.cursorForce * .014 * delta;\n        const trailX = this.pointer.velocityX * .0025 * normalized;\n        const trailY = this.pointer.velocityY * .0025 * normalized;\n        particle.vx = particle.vx * damping + dx / distance * force - dy / distance * force * .1 + trailX;\n        particle.vy = particle.vy * damping + dy / distance * force + dx / distance * force * .1 + trailY;\n      }`, "damped magnet convergence");
game = replaceOnce(game, `    updateParticles(delta) {\n      const movementScale = this.settings.speed * delta;\n      for (const particle of this.particles) {\n        const velocity = Math.hypot(particle.vx, particle.vy);\n        const maxVelocity = 6 + this.settings.speed * 3;\n        if (velocity > maxVelocity) {\n          particle.vx = particle.vx / velocity * maxVelocity;\n          particle.vy = particle.vy / velocity * maxVelocity;\n        }\n\n        particle.x += particle.vx * movementScale;\n        particle.y += particle.vy * movementScale;\n        particle.vx *= .997;\n        particle.vy *= .997;\n\n        const radius = this.settings.particleSize * (1 + particle.seed * .35);\n        if (particle.x > this.width - radius) {\n          particle.x = this.width - radius;\n          particle.vx = -Math.abs(particle.vx);\n        } else if (particle.x < radius) {\n          particle.x = radius;\n          particle.vx = Math.abs(particle.vx);\n        }\n        if (particle.y > this.height - radius) {\n          particle.y = this.height - radius;\n          particle.vy = -Math.abs(particle.vy);\n        } else if (particle.y < radius) {\n          particle.y = radius;\n          particle.vy = Math.abs(particle.vy);\n        }\n      }\n    }`, `    updateParticles(delta) {\n      const movementScale = this.settings.speed * delta;\n      const calmField = this.tool === "cursor" && this.predators.length === 0 && this.blackHoles.length === 0;\n      for (const particle of this.particles) {\n        if (calmField) {\n          const relaxation = Math.min(.045, .012 * delta);\n          particle.vx += (particle.driftVx - particle.vx) * relaxation;\n          particle.vy += (particle.driftVy - particle.vy) * relaxation;\n        }\n\n        const velocity = Math.hypot(particle.vx, particle.vy);\n        const maxVelocity = calmField ? Math.max(.3, this.settings.speed * .46) : 6 + this.settings.speed * 3;\n        if (velocity > maxVelocity) {\n          particle.vx = particle.vx / velocity * maxVelocity;\n          particle.vy = particle.vy / velocity * maxVelocity;\n        }\n\n        particle.x += particle.vx * movementScale;\n        particle.y += particle.vy * movementScale;\n        const damping = calmField ? .9995 : .997;\n        particle.vx *= damping;\n        particle.vy *= damping;\n\n        const radius = this.settings.particleSize * (1 + particle.seed * .35);\n        if (particle.x > this.width - radius) {\n          particle.x = this.width - radius;\n          particle.vx = -Math.abs(particle.vx);\n          particle.driftVx = -Math.abs(particle.driftVx);\n        } else if (particle.x < radius) {\n          particle.x = radius;\n          particle.vx = Math.abs(particle.vx);\n          particle.driftVx = Math.abs(particle.driftVx);\n        }\n        if (particle.y > this.height - radius) {\n          particle.y = this.height - radius;\n          particle.vy = -Math.abs(particle.vy);\n          particle.driftVy = -Math.abs(particle.driftVy);\n        } else if (particle.y < radius) {\n          particle.y = radius;\n          particle.vy = Math.abs(particle.vy);\n          particle.driftVy = Math.abs(particle.driftVy);\n        }\n      }\n    }`, "calm energy cap and drift relaxation");
fs.writeFileSync(gamePath, game);

const indexPath = path.join(root, "index.html");
let html = fs.readFileSync(indexPath, "utf8");
html = replaceOnce(html, 'min="0" max="0.012" step="0.0005" data-setting="linkStrength"', 'min="0" max="0.012" step="0.0001" data-setting="linkStrength"', "spring slider step");
fs.writeFileSync(indexPath, html);

const smokePath = path.join(root, "smoke.cjs");
let smoke = fs.readFileSync(smokePath, "utf8");
const anchor = 'assert.equal(engine.blackHoles.length, 0, "Black holes must not spawn manually at startup");\n';
const checks = `\nassert.equal(engine.settings.speed, 0.75, "Default speed must match the calm Aether drift profile");\nassert.equal(engine.settings.linkStrength, 0.0001, "Default spring force must remain subtle");\nassert.equal(engine.settings.maxLinks, 2, "Default links must not form a dense energetic mesh");\nassert.equal(engine.settings.pulse, false, "Default particles must not pulse like an action effect");\nassert.ok(source.includes("nexora-aether-settings-v3"), "Calm defaults must use a fresh settings generation");\n\nengine.pointer.x = null;\nengine.pointer.y = null;\nengine.setTool("cursor");\nlet peakIdleVelocity = 0;\nfor (let frame = 0; frame < 1200; frame += 1) {\n  engine.updatePhysicalLinks(1);\n  engine.updateParticles(1);\n  for (const particle of engine.particles) peakIdleVelocity = Math.max(peakIdleVelocity, Math.hypot(particle.vx, particle.vy));\n}\nassert.ok(peakIdleVelocity <= 0.36, \`Idle field accumulated excessive velocity: \${peakIdleVelocity}\`);\n`;
if (!smoke.includes("peakIdleVelocity")) {
  if (!smoke.includes(anchor)) throw new Error("Smoke anchor missing");
  smoke = smoke.replace(anchor, anchor + checks);
}
smoke = smoke.replace("engine.updateRegeneration(1);", "engine.updateRegeneration(1.25);");
fs.writeFileSync(smokePath, smoke);

const validationPath = path.join(websiteRoot, "validate-restored.mjs");
let validation = fs.readFileSync(validationPath, "utf8");
validation = replaceOnce(validation, `  ".signature-badge",\n]) {`, `  ".signature-badge",\n  "Mobile cascade guard",\n  "grid-template-columns: minmax(0, 1fr)",\n  "overflow-x: clip",\n  "word-break: normal",\n  "hyphens: none",\n]) {`, "mobile CSS validation markers");
const validationAnchor = `if (/animation\\s*:\\s*none\\s*!important/is.test(fixesCss)) {\n  throw new Error("Targeted fixes must not globally disable original animations");\n}\n\n`;
const orderingCheck = `const broadHeroRule = fixesCss.lastIndexOf("grid-template-columns: minmax(0, .95fr) minmax(480px, 1.05fr)");\nconst narrowHeroRule = fixesCss.lastIndexOf("grid-template-columns: minmax(0, 1fr)");\nif (narrowHeroRule <= broadHeroRule) throw new Error("Mobile single-column hero override must follow the broad compatibility rule");\nif (!fixesCss.includes('@media (max-width: 520px)') || !fixesCss.includes('width: min(calc(100% - 1rem), var(--max))')) throw new Error("Narrow mobile width guard is missing");\n\n`;
if (!validation.includes("broadHeroRule")) {
  if (!validation.includes(validationAnchor)) throw new Error("Validation anchor missing");
  validation = validation.replace(validationAnchor, validationAnchor + orderingCheck);
}
fs.writeFileSync(validationPath, validation);

console.log("Mobile layout and calm Aether patch applied.");
