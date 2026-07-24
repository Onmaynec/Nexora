(() => {
  "use strict";

  const root = document.documentElement;
  const mobileMenuQuery = matchMedia("(max-width: 1040px)");
  const menu = document.querySelector("[data-menu]");
  const menuButton = document.querySelector("[data-menu-button]");
  const navLinks = [...document.querySelectorAll(".site-nav a[href^='#']")];
  const ambientSections = [
    document.querySelector(".hero-stage"),
    document.querySelector(".bento-grid"),
    document.querySelector(".architecture-board"),
    document.querySelector(".data-path"),
    document.querySelector(".trust-lifecycle"),
  ].filter(Boolean);

  let focusBeforeMenu = null;
  let menuOpenedByKeyboard = false;

  const isMenuOpen = () => menuButton?.getAttribute("aria-expanded") === "true";

  function setMenuState(open, { restoreFocus = false, focusFirst = false } = {}) {
    if (!menu || !menuButton) return;
    menuButton.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("open", open);
    document.body.classList.toggle("menu-open", open);

    updateMenuLabel(open);
    if (mobileMenuQuery.matches) {
      menu.setAttribute("aria-hidden", String(!open));
    } else {
      menu.removeAttribute("aria-hidden");
    }

    if (open) {
      focusBeforeMenu = document.activeElement instanceof HTMLElement ? document.activeElement : menuButton;
      if (focusFirst) queueMicrotask(() => navLinks[0]?.focus({ preventScroll: true }));
    } else if (restoreFocus) {
      const target = focusBeforeMenu?.isConnected ? focusBeforeMenu : menuButton;
      queueMicrotask(() => target?.focus({ preventScroll: true }));
    }
  }

  function updateMenuLabel(open) {
    if (!menuButton) return;
    const english = root.lang === "en";
    menuButton.setAttribute("aria-label", open
      ? (english ? "Close menu" : "Закрыть меню")
      : (english ? "Open menu" : "Открыть меню"));
  }

  function syncMenuState() {
    if (!menu || !menuButton) return;
    const open = isMenuOpen();
    updateMenuLabel(open);
    if (mobileMenuQuery.matches) menu.setAttribute("aria-hidden", String(!open));
    else menu.removeAttribute("aria-hidden");

    if (open && menuOpenedByKeyboard) {
      menuOpenedByKeyboard = false;
      queueMicrotask(() => navLinks[0]?.focus({ preventScroll: true }));
    }
  }

  menuButton?.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && !isMenuOpen()) menuOpenedByKeyboard = true;
  });

  menuButton?.addEventListener("click", syncMenuState);

  document.addEventListener("keydown", (event) => {
    if (!mobileMenuQuery.matches || !isMenuOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      setMenuState(false, { restoreFocus: true });
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = [menuButton, ...navLinks].filter((element) => element && !element.hasAttribute("disabled"));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!mobileMenuQuery.matches || !isMenuOpen()) return;
    if (menu?.contains(event.target) || menuButton?.contains(event.target)) return;
    setMenuState(false);
  }, { passive: true });

  navLinks.forEach((link) => {
    link.addEventListener("click", () => setMenuState(false));
  });

  const onMenuViewportChange = () => {
    if (!mobileMenuQuery.matches) setMenuState(false);
    else syncMenuState();
  };
  mobileMenuQuery.addEventListener?.("change", onMenuViewportChange);

  function syncCurrentNavigation() {
    navLinks.forEach((link) => {
      if (link.classList.contains("active")) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  navLinks.forEach((link) => {
    new MutationObserver(syncCurrentNavigation).observe(link, { attributes: true, attributeFilter: ["class"] });
  });
  syncCurrentNavigation();

  new MutationObserver(() => updateMenuLabel(isMenuOpen())).observe(root, {
    attributes: true,
    attributeFilter: ["lang"],
  });
  updateMenuLabel(isMenuOpen());

  const dynamicStatusNodes = [
    document.querySelector("[data-selected-release-state]"),
    document.querySelector("[data-ci-updated]"),
    ...document.querySelectorAll("[data-asset-name]"),
  ].filter(Boolean);
  dynamicStatusNodes.forEach((element) => element.setAttribute("aria-live", "polite"));

  function inferAssetState(card) {
    const name = card.querySelector("[data-asset-name]")?.textContent?.trim() || "";
    const link = card.querySelector("[data-download-link]");
    if (!name || /загруз|loading|checking|провер/i.test(name)) return "loading";
    if (link?.classList.contains("unavailable") || /отсутств|unavailable|not published|не опубликован/i.test(name)) return "unavailable";
    return "available";
  }

  function syncDownloadStates() {
    document.querySelectorAll(".download-card[data-platform]").forEach((card) => {
      const state = inferAssetState(card);
      card.dataset.assetState = state;
      card.setAttribute("aria-busy", String(state === "loading"));
      const link = card.querySelector("[data-download-link]");
      if (link) link.dataset.assetState = state;
    });
  }

  document.querySelectorAll("[data-asset-name], [data-selected-release-state]").forEach((element) => {
    new MutationObserver(syncDownloadStates).observe(element, { childList: true, characterData: true, subtree: true });
  });
  syncDownloadStates();

  if ("IntersectionObserver" in window) {
    const ambientObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        entry.target.dataset.uxOffscreen = String(!entry.isIntersecting);
      });
    }, { rootMargin: "160px 0px", threshold: 0 });
    ambientSections.forEach((section) => ambientObserver.observe(section));
  }

  function syncPageVisibility() {
    root.dataset.pageHidden = String(document.hidden);
  }
  document.addEventListener("visibilitychange", syncPageVisibility);
  syncPageVisibility();

  const pressableSelector = "a, button, select, [role='button']";
  let pressedElement = null;

  function clearPressed() {
    pressedElement?.classList.remove("is-pressed");
    pressedElement = null;
  }

  document.addEventListener("pointerdown", (event) => {
    const target = event.target.closest?.(pressableSelector);
    if (!target || target.hasAttribute("disabled")) return;
    clearPressed();
    pressedElement = target;
    target.classList.add("is-pressed");
  }, { passive: true });

  addEventListener("pointerup", clearPressed, { passive: true });
  addEventListener("pointercancel", clearPressed, { passive: true });
  addEventListener("blur", clearPressed);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab") root.dataset.inputMode = "keyboard";
  });

  document.addEventListener("pointerdown", () => {
    root.dataset.inputMode = "pointer";
  }, { passive: true });

  requestAnimationFrame(() => {
    root.dataset.uxPolish = "ready";
  });
})();
