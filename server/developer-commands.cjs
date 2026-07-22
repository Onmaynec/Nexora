"use strict";

const crypto = require("node:crypto");

class DeveloperCommandError extends Error {
  constructor(message, code = "COMMAND_INVALID") {
    super(message);
    this.name = "DeveloperCommandError";
    this.code = code;
  }
}

function splitCommandLine(value) {
  const input = String(value || "").trim();
  if (!input) return [];
  const values = [];
  let current = "";
  let quote = null;
  let escaping = false;
  for (const character of input) {
    if (escaping) {
      current += character;
      escaping = false;
      continue;
    }
    if (character === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        values.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (escaping || quote) throw new DeveloperCommandError("Команда содержит незавершённую кавычку или escape.");
  if (current) values.push(current);
  return values;
}

function unwrapPlaceholder(value) {
  const normalized = String(value ?? "").trim();
  const match = /^(?:<([^<>]+)>|\[([^\[\]]+)\])$/.exec(normalized);
  return String(match?.[1] || match?.[2] || normalized).trim();
}

function compactStatus(status) {
  return {
    version: status.version || null,
    running: Boolean(status.running),
    serverId: status.serverId,
    schemaVersion: status.schemaVersion || status.stats?.schemaVersion,
    users: status.stats?.users || 0,
    rooms: status.stats?.rooms || 0,
    messages: status.stats?.messages || 0,
    integrity: status.stats?.integrity || "unknown",
    readOnly: Boolean(status.emergencyReadOnly),
    pulseMode: status.pulseV3?.mode || status.pulse?.mode || "disabled",
    operations: status.operations || null,
  };
}

class DeveloperCommandService {
  constructor({ instance, store, pulseSandbox = null, log = () => {}, clock = () => new Date() } = {}) {
    if (!instance || !store) {
      throw new DeveloperCommandError("Command service requires server instance and store.", "COMMAND_SERVICE_MISCONFIGURED");
    }
    this.instance = instance;
    this.store = store;
    this.pulseSandbox = pulseSandbox;
    this.log = log;
    this.clock = clock;
  }

  async audit(actor, command, details = {}) {
    await this.store.mutate((state) => {
      state.integrationAudit ||= [];
      state.integrationAudit.push({
        id: crypto.randomUUID(),
        type: "developer.command",
        actor: String(actor || "unknown").slice(0, 80),
        command,
        details,
        createdAt: this.clock().toISOString(),
      });
      if (state.integrationAudit.length > 10_000) {
        state.integrationAudit.splice(0, state.integrationAudit.length - 10_000);
      }
    });
  }

  async execute(line, { actor = "console" } = {}) {
    const parts = splitCommandLine(line);
    if (!parts.length) return { ok: true, command: "", output: "" };
    const root = parts[0].toLowerCase();
    const action = parts[1]?.toLowerCase();
    const args = parts.slice(2);
    const command = [root, action].filter(Boolean).join(" ");
    let result;
    let mutated = false;

    if (root === "help") {
      result = {
        output: "Команды: help | status | health | users list | rooms list | backup create [passphrase] | storage cleanup | read-only on|off | pulse sandbox on|off | pulse user <user> | plus grant <user> [days] | plus revoke <user> | impulses grant|revoke <user> <amount> [reason] | audit tail [count]\nПример: plus grant netrox 30. Символы < > и [ ] в справке обозначают параметры; если вставить их буквально, консоль 3.2.4 безопасно удалит оболочку.",
      };
    } else if (root === "status") {
      result = { data: compactStatus(this.instance.status()), output: "Статус сервера получен." };
    } else if (root === "health") {
      const status = this.instance.status();
      result = {
        data: { integrity: status.stats?.integrity, operations: status.operations },
        output: status.stats?.integrity === "ok" ? "Проверка пройдена." : "Проверка требует внимания.",
      };
    } else if (root === "users" && action === "list") {
      const data = await this.instance.listAdminData();
      result = {
        data: data.users.map(({ id, username, displayName, role, disabledAt, sessions }) => ({
          id,
          username,
          displayName,
          role,
          disabled: Boolean(disabledAt),
          sessions,
        })),
        output: `Пользователей: ${data.users.length}`,
      };
    } else if (root === "rooms" && action === "list") {
      const data = await this.instance.listAdminData();
      result = {
        data: data.rooms.map(({ id, slug, name, privacy, memberCount, messageCount }) => ({
          id,
          slug,
          name,
          privacy,
          memberCount,
          messageCount,
        })),
        output: `Комнат: ${data.rooms.length}`,
      };
    } else if (root === "backup" && action === "create") {
      const passphrase = args.join(" ");
      if (passphrase && passphrase.length < 10) {
        throw new DeveloperCommandError("Пароль резервной копии должен содержать минимум 10 символов.", "COMMAND_VALIDATION_FAILED");
      }
      const backup = await this.instance.createBackup(passphrase);
      mutated = true;
      result = {
        data: { directory: backup.directory, createdAt: backup.createdAt, encrypted: Boolean(passphrase) },
        output: "Резервная копия создана.",
      };
    } else if (root === "storage" && action === "cleanup") {
      result = { data: await this.instance.cleanupStorage(), output: "Очистка хранилища завершена." };
      mutated = true;
    } else if (root === "read-only" && ["on", "off"].includes(action)) {
      const enabled = action === "on";
      await this.store.mutate((state) => {
        state.settings.emergencyReadOnly = enabled;
      });
      mutated = true;
      result = {
        data: { enabled },
        output: enabled ? "Emergency read-only включён." : "Emergency read-only выключен.",
      };
    } else if (root === "pulse" && action === "sandbox") {
      if (!this.pulseSandbox) throw new DeveloperCommandError("Pulse sandbox недоступен.", "PULSE_SANDBOX_UNAVAILABLE");
      const enabled = args[0] === "on" ? true : args[0] === "off" ? false : null;
      if (enabled == null) throw new DeveloperCommandError("Используйте pulse sandbox on или pulse sandbox off.", "COMMAND_VALIDATION_FAILED");
      result = { data: await this.pulseSandbox.setEnabled(enabled, actor), output: enabled ? "Pulse sandbox включён." : "Pulse sandbox выключен." };
      mutated = true;
    } else if (root === "pulse" && action === "user") {
      if (!this.pulseSandbox || !args[0]) throw new DeveloperCommandError("Укажите пользователя.", "COMMAND_VALIDATION_FAILED");
      result = { data: { overview: this.pulseSandbox.overview(unwrapPlaceholder(args[0])), transactions: this.pulseSandbox.transactions(args[0], 20) }, output: "Тестовое состояние Pulse получено." };
    } else if (root === "plus" && ["grant", "revoke"].includes(action)) {
      if (!this.pulseSandbox || !args[0]) throw new DeveloperCommandError("Укажите пользователя.", "COMMAND_VALIDATION_FAILED");
      result = action === "grant"
        ? { data: await this.pulseSandbox.grantPlus(unwrapPlaceholder(args[0]), { days: unwrapPlaceholder(args[1]), actor }), output: "Тестовая подписка Plus выдана." }
        : { data: await this.pulseSandbox.revokePlus(unwrapPlaceholder(args[0]), { actor }), output: "Тестовая подписка Plus отозвана." };
      mutated = true;
    } else if (root === "impulses" && ["grant", "revoke"].includes(action)) {
      if (!this.pulseSandbox || !args[0]) throw new DeveloperCommandError("Укажите пользователя и количество.", "COMMAND_VALIDATION_FAILED");
      const amount = Math.abs(Math.trunc(Number(unwrapPlaceholder(args[1]))));
      if (!Number.isSafeInteger(amount) || amount < 1) throw new DeveloperCommandError("Количество должно быть положительным целым числом.", "COMMAND_VALIDATION_FAILED");
      const delta = action === "grant" ? amount : -amount;
      result = { data: await this.pulseSandbox.adjustImpulses(unwrapPlaceholder(args[0]), delta, { actor, reason: args.slice(2).map(unwrapPlaceholder).join(" ") || "operator_adjustment" }), output: action === "grant" ? "Импульсы выданы." : "Импульсы изъяты." };
      mutated = true;
    } else if (root === "audit" && action === "tail") {
      const count = Math.max(1, Math.min(200, Number(args[0]) || 50));
      const rows = this.store.read((state) => (state.integrationAudit || []).slice(-count).reverse());
      result = { data: rows, output: `Записей аудита: ${rows.length}` };
    } else {
      throw new DeveloperCommandError("Неизвестная или неполная команда. Выполните help.", "COMMAND_NOT_FOUND");
    }

    if (mutated) await this.audit(actor, command, { argumentCount: args.length });
    this.log(`developer command ${command || root} by ${String(actor).slice(0, 80)}`, "info");
    return { ok: true, command: command || root, mutated, ...result };
  }
}

module.exports = {
  DeveloperCommandError,
  DeveloperCommandService,
  compactStatus,
  splitCommandLine,
  unwrapPlaceholder,
};
