import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "./components/AppErrorBoundary";
import ProductOnboarding from "./components/ProductOnboarding";
import "./styles.css";
import "./secure-messaging.css";
import "./onboarding.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ProductOnboarding><App /></ProductOnboarding>
    </AppErrorBoundary>
  </React.StrictMode>,
);

if ("serviceWorker" in navigator && (location.protocol === "https:" || ["localhost", "127.0.0.1"].includes(location.hostname))) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.nexoraInstallPrompt = event;
  window.dispatchEvent(new Event("nexora:install-ready"));
});
