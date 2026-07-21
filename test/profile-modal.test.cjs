"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");

test("профиль рендерится до завершения запроса relationship", async () => {
  const previousSessionStorage = globalThis.sessionStorage;
  globalThis.sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };

  const { createServer } = await import("vite");
  const React = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const vite = await createServer({
    root: path.join(root, "client"),
    appType: "custom",
    logLevel: "silent",
    server: { middlewareMode: true },
  });

  try {
    const { default: UserProfileModal } = await vite.ssrLoadModule("/src/components/UserProfileModal.jsx");
    assert.doesNotThrow(() => renderToStaticMarkup(React.createElement(UserProfileModal, {
      initialUser: {
        id: "user-profile-regression",
        username: "profile",
        displayName: "Профиль без пустого экрана",
        createdAt: "2026-07-21T00:00:00.000Z",
      },
      onClose: () => {},
      onOpenConversation: () => {},
      onSendRequest: () => {},
      onBlock: () => {},
      onOpenSettings: () => {},
      showToast: () => {},
    })));
  } finally {
    await vite.close();
    if (previousSessionStorage === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previousSessionStorage;
  }
});
