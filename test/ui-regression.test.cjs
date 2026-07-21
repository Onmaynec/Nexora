"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const workspace = fs.readFileSync(path.join(root, "client/src/components/Workspace.jsx"), "utf8");
const messages = fs.readFileSync(path.join(root, "client/src/components/MessagePane.jsx"), "utf8");
const settings = fs.readFileSync(path.join(root, "client/src/components/SettingsPage.jsx"), "utf8");
const styles = fs.readFileSync(path.join(root, "client/src/styles.css"), "utf8");

test("нулевые счётчики непрочитанных не отображаются", () => {
  assert.match(workspace, /unreadTotal\s*>\s*0\s*&&\s*<b>/);
  assert.match(workspace, /conversation\.unreadCount\s*>\s*0\s*&&\s*<b className="unread-badge">/);
});

test("аватары открывают профиль во всех ключевых пользовательских списках", () => {
  assert.match(messages, /onOpenProfile\(message\.sender\)/);
  assert.match(workspace, /onOpenProfile\(conversation\.peer\)/);
  assert.match(workspace, /onOpenProfile\(member\)/);
  assert.match(workspace, /onOpenProfile\(request\.user\)/);
  assert.match(settings, /onOpenProfile\(user\)/);
});

test("меню реакций сохраняет кликабельную hover-зону", () => {
  assert.match(messages, /className="reaction-picker"[^>]+onPointerDown=/);
  assert.match(styles, /\.reaction-picker\s*\{[^}]*pointer-events\s*:\s*auto/s);
  assert.match(styles, /\.reaction-picker::after\s*\{[^}]*height\s*:\s*\.5rem/s);
});

test("панели действий и навигации не выходят за границы своих областей", () => {
  assert.match(styles, /\.hover-dock\s*\{[^}]*max-width\s*:\s*100%[^}]*overflow\s*:\s*hidden[^}]*contain\s*:\s*layout paint/s);
  assert.match(styles, /\.message-actions\s*\{[^}]*max-width\s*:\s*min\(355px,calc\(100vw - 2rem\)\)/s);
});
