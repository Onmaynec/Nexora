import { useEffect, useRef } from "react";

export default function ParticleField({ quiet = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const context = canvas.getContext("2d", { alpha: false });
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: null, y: null, radius: quiet ? 110 : 200 };
    let particles = [];
    let frame = 0;
    let running = true;
    let width = 0;
    let height = 0;
    let dpr = 1;

    function reset() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const density = quiet ? 24_000 : 9_000;
      const count = Math.max(24, Math.min(quiet ? 68 : 155, Math.floor((width * height) / density)));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * (quiet ? 0.16 : 0.4),
        vy: (Math.random() - 0.5) * (quiet ? 0.16 : 0.4),
        size: 0.8 + Math.random() * (quiet ? 1.4 : 1.9),
      }));
    }

    function render() {
      if (!running) return;
      context.fillStyle = quiet ? "#07050b" : "#050308";
      context.fillRect(0, 0, width, height);
      const maxDistance = quiet ? 115 : 158;

      for (const particle of particles) {
        if (!reducedMotion) {
          if (pointer.x !== null) {
            const dx = pointer.x - particle.x;
            const dy = pointer.y - particle.y;
            const distance = Math.hypot(dx, dy) || 1;
            if (distance < pointer.radius) {
              const force = (pointer.radius - distance) / pointer.radius;
              particle.x -= (dx / distance) * force * (quiet ? 1.7 : 3.2);
              particle.y -= (dy / distance) * force * (quiet ? 1.7 : 3.2);
            }
          }
          particle.x += particle.vx;
          particle.y += particle.vy;
          if (particle.x <= 0 || particle.x >= width) particle.vx *= -1;
          if (particle.y <= 0 || particle.y >= height) particle.vy *= -1;
        }
      }

      for (let first = 0; first < particles.length; first += 1) {
        for (let second = first + 1; second < particles.length; second += 1) {
          const a = particles[first];
          const b = particles[second];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > maxDistance) continue;
          const opacity = (1 - distance / maxDistance) * (quiet ? 0.14 : 0.48);
          const pointerDistance = pointer.x === null ? Infinity : Math.min(Math.hypot(a.x - pointer.x, a.y - pointer.y), Math.hypot(b.x - pointer.x, b.y - pointer.y));
          context.strokeStyle = pointerDistance < pointer.radius ? `rgba(235, 218, 255, ${opacity * 1.8})` : `rgba(155, 92, 255, ${opacity})`;
          context.lineWidth = quiet ? 0.7 : 0.85;
          context.beginPath();
          context.moveTo(a.x, a.y);
          context.lineTo(b.x, b.y);
          context.stroke();
        }
      }

      for (const particle of particles) {
        context.fillStyle = quiet ? "rgba(155, 92, 255, .34)" : "rgba(198, 156, 255, .86)";
        context.beginPath();
        context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      frame = requestAnimationFrame(render);
    }

    const onPointerMove = (event) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const onPointerLeave = (event) => {
      if (event?.relatedTarget) return;
      pointer.x = null;
      pointer.y = null;
    };
    const onVisibility = () => {
      running = !document.hidden;
      if (running) render();
      else cancelAnimationFrame(frame);
    };

    reset();
    render();
    window.addEventListener("resize", reset);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerout", onPointerLeave, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", reset);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerout", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [quiet]);

  return <canvas ref={canvasRef} className={`particle-field particle-field-${quiet ? "quiet" : "active"}`} aria-hidden="true" />;
}
