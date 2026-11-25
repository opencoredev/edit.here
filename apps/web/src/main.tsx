import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { initAnalytics, trackEvent } from "./lib/analytics";
import "./styles/app.css";

// Before the first render, so the shell's first events have somewhere to go.
initAnalytics();

const standalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  Reflect.get(navigator, "standalone") === true;
trackEvent("app_started", {
  display: standalone ? "standalone" : "browser",
  network: navigator.onLine ? "online" : "offline",
});
window.addEventListener("appinstalled", () => trackEvent("pwa_installed", {}));

const root = document.getElementById("root");
if (root === null) throw new Error("Missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// The service worker (emitted by vite.config.ts) caches the app so it keeps working offline.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Offline support is a bonus; the app works without it.
    });
  });
}
