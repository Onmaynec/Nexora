(() => {
  const officialIcon = "assets/nexora-icon.png";
  const header = document.querySelector("[data-header]");
  const menu = document.querySelector("[data-menu]");
  const menuButton = document.querySelector("[data-menu-button]");
  const toast = document.querySelector("[data-toast]");
  const navLinks = [...document.querySelectorAll(".site-nav a")];
  const sections = navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);

  const applyOfficialBrand = () => {
    const favicon = document.querySelector('link[rel="icon"]');
    if (favicon) {
      favicon.href = officialIcon;
      favicon.type = "image/png";
    }

    const socialImage = document.querySelector('meta[property="og:image"]');
    if (socialImage) socialImage.content = officialIcon;

    document.querySelectorAll(".brand-mark").forEach((mark) => {
      mark.replaceChildren();
      mark.style.display = "block";
      mark.style.width = "30px";
      mark.style.height = "30px";
      mark.style.borderRadius = "9px";
      mark.style.background = `url("${officialIcon}") center / contain no-repeat`;
      mark.style.filter = "drop-shadow(0 0 12px rgba(155, 92, 255, .4))";
    });

    document.querySelectorAll(".mini-mark").forEach((mark) => {
      mark.style.width = "18px";
      mark.style.height = "18px";
      mark.style.borderRadius = "5px";
      mark.style.clipPath = "none";
      mark.style.background = `url("${officialIcon}") center / contain no-repeat`;
      mark.style.boxShadow = "0 0 12px rgba(155, 92, 255, .32)";
    });
  };

  applyOfficialBrand();

  const closeMenu = () => {
    menu?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  };

  menuButton?.addEventListener("click", () => {
    const next = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(next));
    menu?.classList.toggle("open", next);
    document.body.classList.toggle("menu-open", next);
  });

  navLinks.forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("resize", () => {
    if (window.innerWidth > 1100) closeMenu();
  });

  const updateHeader = () => header?.classList.toggle("scrolled", window.scrollY > 18);
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: "0px 0px -8%", threshold: 0.08 });

  document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
  }, { rootMargin: "-25% 0px -60%", threshold: [0.05, 0.2, 0.5] });

  sections.forEach((section) => navObserver.observe(section));

  let toastTimer;
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy || "");
        button.textContent = "Скопировано";
        toast?.classList.add("visible");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast?.classList.remove("visible"), 1800);
        setTimeout(() => { button.textContent = "Копировать"; }, 1600);
      } catch {
        button.textContent = "Выделите вручную";
      }
    });
  });

  document.querySelectorAll("[data-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
})();