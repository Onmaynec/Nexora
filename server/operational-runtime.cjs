"use strict";

const crypto = require("node:crypto");
const { monitorEventLoopDelay } = require("node:perf_hooks");

const SECRET_KEY = /authorization|cookie|token|secret|password|signature|api[-_]?key/i;

function safeRequestId(value) {
  const text = String(value || "").trim();
  return /^[A-Za-z0-9_.:-]{8,128}$/.test(text) ? text : crypto.randomUUID();
}

function redact(value, depth = 0) {
  if (depth > 5) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (!value || typeof value !== "object") {
    return typeof value === "string" && value.length > 2_000 ? `${value.slice(0, 2_000)}…` : value;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    SECRET_KEY.test(key) ? "[REDACTED]" : redact(item, depth + 1),
  ]));
}

function timingSafeToken(actual, expected) {
  const left = Buffer.from(String(actual || ""));
  const right = Buffer.from(String(expected || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function localAddress(request) {
  const address = String(request.socket?.remoteAddress || "");
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function createOperationalRuntime({
  service,
  version,
  metricsToken = "",
  healthProvider = async () => ({ ready: true, checks: {} }),
  log = () => {},
  clock = () => new Date(),
} = {}) {
  if (!service || !version) throw new Error("Operational runtime requires service and version.");
  const startedAt = clock();
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  const counters = new Map();
  let ready = false;
  let draining = false;
  let closed = false;

  function increment(method, route, status) {
    const key = [method, route, status].join("|");
    counters.set(key, (counters.get(key) || 0) + 1);
  }

  function snapshot() {
    const memory = process.memoryUsage();
    return {
      service,
      version,
      ready,
      draining,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
        externalBytes: memory.external,
      },
      eventLoopDelayMs: Number.isFinite(loop.mean) ? Number((loop.mean / 1e6).toFixed(3)) : 0,
    };
  }

  function middleware(request, response, next) {
    const requestId = safeRequestId(request.headers["x-request-id"]);
    request.nexoraRequestId = requestId;
    response.setHeader("X-Request-ID", requestId);
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()");
    response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    const started = process.hrtime.bigint();
    response.on("finish", () => {
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      const route = String(request.route?.path || request.path || "/").slice(0, 200);
      increment(request.method, route, response.statusCode);
      if (response.statusCode >= 400 || elapsedMs >= 1_000) {
        log(JSON.stringify(redact({
          type: "http",
          requestId,
          method: request.method,
          route,
          status: response.statusCode,
          elapsedMs: Number(elapsedMs.toFixed(2)),
          ip: request.ip,
        })), response.statusCode >= 500 ? "error" : "warn");
      }
    });
    next();
  }

  async function readiness(_request, response) {
    try {
      const provided = await healthProvider();
      const available = ready && !draining && provided?.ready !== false;
      response.status(available ? 200 : 503).json({
        ok: available,
        ...snapshot(),
        checks: redact(provided?.checks || {}),
      });
    } catch (error) {
      log(`Readiness check failed: ${error.message}`, "error");
      response.status(503).json({ ok: false, ...snapshot(), checks: { runtime: "error" } });
    }
  }

  function metrics(request, response) {
    const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (metricsToken ? !timingSafeToken(token, metricsToken) : !localAddress(request)) {
      return response.status(403).type("text/plain").send("Forbidden\n");
    }
    const state = snapshot();
    const lines = [
      "# HELP nexora_process_uptime_seconds Process uptime.",
      "# TYPE nexora_process_uptime_seconds gauge",
      `nexora_process_uptime_seconds{service="${service}"} ${state.uptimeSeconds}`,
      "# HELP nexora_process_rss_bytes Resident memory.",
      "# TYPE nexora_process_rss_bytes gauge",
      `nexora_process_rss_bytes{service="${service}"} ${state.memory.rssBytes}`,
      "# HELP nexora_event_loop_delay_ms Mean event-loop delay.",
      "# TYPE nexora_event_loop_delay_ms gauge",
      `nexora_event_loop_delay_ms{service="${service}"} ${state.eventLoopDelayMs}`,
      "# HELP nexora_runtime_ready Readiness state.",
      "# TYPE nexora_runtime_ready gauge",
      `nexora_runtime_ready{service="${service}"} ${state.ready && !state.draining ? 1 : 0}`,
      "# HELP nexora_http_requests_total Completed HTTP requests.",
      "# TYPE nexora_http_requests_total counter",
    ];
    for (const [key, count] of [...counters.entries()].sort()) {
      const [method, route, status] = key.split("|");
      const escaped = route.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, " ");
      lines.push(`nexora_http_requests_total{service="${service}",method="${method}",route="${escaped}",status="${status}"} ${count}`);
    }
    response.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
  }

  return {
    mount(app) {
      app.use(middleware);
      app.get("/healthz/live", (_request, response) => response.json({ ok: !closed, ...snapshot() }));
      app.get("/healthz/ready", readiness);
      app.get("/metrics", metrics);
    },
    markReady() { ready = true; draining = false; },
    markNotReady() { ready = false; },
    beginDrain() { draining = true; ready = false; },
    snapshot,
    redact,
    close() { closed = true; draining = true; ready = false; loop.disable(); },
  };
}

module.exports = { createOperationalRuntime, redact, safeRequestId, timingSafeToken };
