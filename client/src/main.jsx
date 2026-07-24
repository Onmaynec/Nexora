import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import ProductOnboarding from "./components/ProductOnboarding";
import ReleaseAnnouncement from "./components/ReleaseAnnouncement";
import "./styles.css";
import "./secure-messaging.css";
import "./trust-devices.css";
import "./onboarding.css";
import "./confirm-dialog.css";
import "./pulse-effects.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ProductOnboarding><App /></ProductOnboarding>
      <ReleaseAnnouncement />
    </AppErrorBoundary>
  </React.StrictMode>,
);

function pwaState(state, details = {}) {
  window.dispatchEvent(new CustomEvent("nexora:pwa-update", { detail: { state, ...details } }));
}

if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
      window.nexoraServiceWorkerRegistration = registration;
      if (registration.waiting) pwaState("ready");
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        pwaState("downloading");
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) pwaState("ready");
          if (worker.state === "activated") pwaState("active");
          if (worker.state === "redundant") pwaState("error", { message: "service_worker_redundant" });
        });
      });
      await registration.update().catch((error) => pwaState("error", { message: error.message }));
    } catch (error) {
      console.error("Nexora service worker registration failed", error);
      pwaState("error", { message: error.message });
    }
  });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "NEXORA_PWA_UPDATE") pwaState(event.data.state || "idle", event.data);
    if (event.data?.type === "NEXORA_OUTBOX_RETRY") window.dispatchEvent(new Event("online"));
    if (event.data?.type === "NEXORA_NOTIFICATION_OPEN") window.dispatchEvent(new CustomEvent("nexora:notification-open", { detail: event.data.data || {} }));
  });

  let applyingUpdate = false;
  window.addEventListener("nexora:apply-update", () => {
    const waiting = window.nexoraServiceWorkerRegistration?.waiting;
    if (!waiting) return pwaState("error", { message: "update_not_waiting" });
    applyingUpdate = true;
    pwaState("applying");
    waiting.postMessage({ type: "NEXORA_SKIP_WAITING" });
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (applyingUpdate) location.reload();
  });
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.nexoraInstallPrompt = event;
  window.dispatchEvent(new Event("nexora:install-ready"));
});
