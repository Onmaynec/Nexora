import React from "react";

const CELL_SIZE = 120;
const POINTER_RADIUS = 180;
const MAX_PARTICLES = 150;
const MAX_DPR = 1.75;

function createParticle(width, height) {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.24,
    vy: (Math.random() - 0.5) * 0.24,
    radius: 0.8 + Math.random() * 1.7,
  };
}

function cellKey(x, y) {
  return `${Math.floor(x / CELL_SIZE)}:${Math.floor(y / CELL_SIZE)}`;
}

export default function AetherField() {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)");
    const pointer = { x: null, y: null };
    let particles = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let frame = 0;
    let running = true;
    let lastTime = performance.now();

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = coarsePointer.matches ? 18000 : 12000;
      const count = Math.min(MAX_PARTICLES, Math.max(36, Math.floor((width * height) / density)));
      particles = Array.from({ length: count }, () => createParticle(width, height));
    };

    const onPointerMove = (event) => {
      if (coarsePointer.matches) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const clearPointer = () => {
      pointer.x = null;
      pointer.y = null;
    };

    const draw = (time) => {
      if (!running) return;
      const delta = Math.min(2, Math.max(0.3, (time - lastTime) / 16.67));
      lastTime = time;
      context.clearRect(0, 0, width, height);
      const gradient = context.createRadialGradient(width * 0.54, height * 0.18, 0, width * 0.54, height * 0.18, Math.max(width, height) * 0.85);
      gradient.addColorStop(0, "rgba(80, 38, 125, 0.18)");
      gradient.addColorStop(0.48, "rgba(27, 13, 43, 0.08)");
      gradient.addColorStop(1, "rgba(4, 3, 8, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      const grid = new Map();
      for (const particle of particles) {
        if (!reducedMotion.matches && document.visibilityState === "visible") {
          if (pointer.x !== null && pointer.y !== null) {
            const dx = pointer.x - particle.x;
            const dy = pointer.y - particle.y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared > 0.01 && distanceSquared < POINTER_RADIUS * POINTER_RADIUS) {
              const distance = Math.sqrt(distanceSquared);
              const force = (POINTER_RADIUS - distance) / POINTER_RADIUS;
              particle.x -= (dx / distance) * force * 2.8 * delta;
              particle.y -= (dy / distance) * force * 2.8 * delta;
            }
          }
          particle.x += particle.vx * delta;
          particle.y += particle.vy * delta;
          if (particle.x < -8) particle.x = width + 8;
          if (particle.x > width + 8) particle.x = -8;
          if (particle.y < -8) particle.y = height + 8;
          if (particle.y > height + 8) particle.y = -8;
        }
        const key = cellKey(particle.x, particle.y);
        const bucket = grid.get(key) || [];
        bucket.push(particle);
        grid.set(key, bucket);
      }

      context.lineWidth = 0.75;
      for (const particle of particles) {
        const cellX = Math.floor(particle.x / CELL_SIZE);
        const cellY = Math.floor(particle.y / CELL_SIZE);
        for (let x = cellX - 1; x <= cellX + 1; x += 1) {
          for (let y = cellY - 1; y <= cellY + 1; y += 1) {
            for (const other of grid.get(`${x}:${y}`) || []) {
              if (other === particle || other.x < particle.x) continue;
              const dx = particle.x - other.x;
              const dy = particle.y - other.y;
              const distanceSquared = dx * dx + dy * dy;
              if (distanceSquared >= CELL_SIZE * CELL_SIZE) continue;
              const alpha = Math.max(0, 0.17 * (1 - distanceSquared / (CELL_SIZE * CELL_SIZE)));
              context.strokeStyle = `rgba(190, 126, 255, ${alpha})`;
              context.beginPath();
              context.moveTo(particle.x, particle.y);
              context.lineTo(other.x, other.y);
              context.stroke();
            }
          }
        }
      }

      for (const particle of particles) {
        context.fillStyle = "rgba(205, 151, 255, 0.72)";
        context.beginPath();
        context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
        context.fill();
      }

      frame = window.requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      lastTime = performance.now();
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", clearPointer, { passive: true });
    window.addEventListener("blur", clearPointer);
    document.addEventListener("visibilitychange", onVisibility);
    frame = window.requestAnimationFrame(draw);

    return () => {
      running = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", clearPointer);
      window.removeEventListener("blur", clearPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="aether-field" aria-hidden="true" />;
}
