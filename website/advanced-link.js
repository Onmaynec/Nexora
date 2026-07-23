(() => {
  "use strict";
  const MARKER = "nexora-advanced-documentation-link";
  const labels = { ru: "Продвинутая документация", en: "Advanced docs" };

  function language() {
    return document.documentElement.lang === "en" || document.querySelector('[data-lang="en"]')?.classList.contains("active") ? "en" : "ru";
  }

  function renderLabel(link) {
    const text = link.querySelector("span");
    if (text) text.textContent = labels[language()];
    link.setAttribute("aria-label", labels[language()]);
  }

  function mount() {
    if (document.getElementById(MARKER)) return;
    const actions = document.querySelector(".header-actions");
    const github = actions?.querySelector(".header-github");
    if (!actions || !github) return;
    const link = document.createElement("a");
    link.id = MARKER;
    link.className = "header-github advanced-docs-link";
    link.href = "advanced/";
    link.innerHTML = '<span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5v-16ZM4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>';
    renderLabel(link);
    actions.insertBefore(link, github);
    document.querySelectorAll("[data-lang]").forEach((button) => button.addEventListener("click", () => queueMicrotask(() => renderLabel(link))));
    new MutationObserver(() => renderLabel(link)).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount, { once: true });
  else mount();
})();
