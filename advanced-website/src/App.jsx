import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ChevronRight,
  CircleDot, ExternalLink, FileCode2, Github, Languages, Menu, Moon, Search,
  ShieldCheck, Sun, X, Zap,
} from "lucide-react";
import AetherField from "./components/AetherField.jsx";
import { ContentBlock, SourceLinks } from "./components/ContentBlocks.jsx";
import { flattenSearch, localized, navigation, pageById, pages, renderTokens, versionLines } from "./content.mjs";
import reference from "./generated/reference.json";
import releaseFallback from "./generated/release-fallback.json";

const CURRENT_VERSION = typeof __NEXORA_VERSION__ === "string" ? __NEXORA_VERSION__ : reference.currentVersion;
const REPOSITORY = typeof __NEXORA_REPOSITORY__ === "string" ? __NEXORA_REPOSITORY__ : "Onmaynec/Nexora";
const STORAGE = { language: "nexora-advanced-language", theme: "nexora-advanced-theme", version: "nexora-advanced-version" };

function safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
function safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* optional */ } }
function parseLocation() {
  const [pageId, sectionId] = location.hash.replace(/^#\/?/, "").split("/");
  return { pageId: pageById.has(pageId) ? pageId : "overview", sectionId: sectionId || null };
}
function navigate(pageId, sectionId = null) {
  const value = `#/${pageId}${sectionId ? `/${sectionId}` : ""}`;
  if (location.hash === value) dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = value;
}
function useHashRoute() {
  const [route, setRoute] = React.useState(parseLocation);
  React.useEffect(() => {
    const update = () => setRoute(parseLocation());
    addEventListener("hashchange", update);
    if (!location.hash) navigate("overview");
    return () => removeEventListener("hashchange", update);
  }, []);
  return route;
}
function useReleases() {
  const [state, setState] = React.useState({ releases: releaseFallback.releases || [], live: false, loading: true });
  React.useEffect(() => {
    const controller = new AbortController();
    fetch(`https://api.github.com/repos/${REPOSITORY}/releases?per_page=30`, { headers: { Accept: "application/vnd.github+json" }, signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(String(response.status)); return response.json(); })
      .then((releases) => setState(Array.isArray(releases) && releases.length ? { releases, live: true, loading: false } : (current) => ({ ...current, loading: false })))
      .catch((error) => { if (error.name !== "AbortError") setState((current) => ({ ...current, loading: false })); });
    return () => controller.abort();
  }, []);
  return state;
}
function ProductMark() {
  return <span className="product-mark" aria-hidden="true"><i /><i /><b /></span>;
}

function SearchDialog({ open, onClose, language, meta }) {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef(null);
  const index = React.useMemo(() => flattenSearch(language, meta), [language, meta]);
  const results = React.useMemo(() => {
    const terms = query.trim().toLocaleLowerCase(language === "ru" ? "ru" : "en").split(/\s+/).filter(Boolean);
    if (!terms.length) return index.slice(0, 9);
    return index.map((item) => ({ item, score: terms.filter((term) => item.haystack.includes(term)).length }))
      .filter(({ score }) => score).sort((a, b) => b.score - a.score).slice(0, 12).map(({ item }) => item);
  }, [index, language, query]);
  React.useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setTimeout(() => inputRef.current?.focus(), 20);
    const key = (event) => { if (event.key === "Escape") onClose(); };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [open, onClose]);
  return <AnimatePresence>{open ? (
    <motion.div className="dialog-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={onClose}>
      <motion.div className="search-dialog" role="dialog" aria-modal="true" initial={{ opacity: 0, y: -14, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8 }} onMouseDown={(event) => event.stopPropagation()}>
        <div className="search-input"><Search size={18} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={language === "ru" ? "Архитектура, API, MLS…" : "Architecture, API, MLS…"} /><kbd>ESC</kbd></div>
        <div className="search-results">{results.length ? results.map((result) => <button key={result.id} type="button" onClick={() => { navigate(result.id); onClose(); }}><FileCode2 size={17} /><span><strong>{result.title}</strong><small>{result.description}</small></span></button>) : <p>{language === "ru" ? "Совпадений нет." : "No matches."}</p>}</div>
      </motion.div>
    </motion.div>
  ) : null}</AnimatePresence>;
}

function TopBar({ language, setLanguage, theme, setTheme, version, setVersion, onSearch, onMenu }) {
  return <header className="topbar">
    <a className="brand" href="#/overview"><ProductMark /><span><strong>NEXORA</strong><small>ADVANCED DOCS</small></span></a>
    <button className="mobile-menu" type="button" onClick={onMenu} aria-label="Menu"><Menu /></button>
    <button className="search-trigger" type="button" onClick={onSearch}><Search size={17} /><span>{language === "ru" ? "Поиск по документации" : "Search documentation"}</span><kbd>⌘ K</kbd></button>
    <div className="top-actions">
      <label className="select-wrap"><span className="sr-only">Version</span><select value={version} onChange={(event) => setVersion(event.target.value)}>{versionLines.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}</select><ChevronDown size={14} /></label>
      <button className="icon-button" type="button" onClick={() => setLanguage(language === "ru" ? "en" : "ru")}><Languages size={17} /><span>{language.toUpperCase()}</span></button>
      <button className="icon-button" type="button" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label="Theme">{theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}</button>
      <a className="icon-button" href={`https://github.com/${REPOSITORY}`} target="_blank" rel="noreferrer"><Github size={18} /><span>GitHub</span></a>
    </div>
  </header>;
}

function Sidebar({ language, route, open, onClose, version, setVersion }) {
  return <aside className={`sidebar ${open ? "open" : ""}`}>
    <div className="sidebar-mobile-head"><strong>{language === "ru" ? "Навигация" : "Navigation"}</strong><button type="button" onClick={onClose}><X /></button></div>
    <label className="sidebar-version">{language === "ru" ? "Версия" : "Version"}<select value={version} onChange={(event) => setVersion(event.target.value)}>{versionLines.map((line) => <option key={line.id} value={line.id}>{line.label}</option>)}</select></label>
    <nav>{navigation.map((group) => <section className="nav-group" key={group.id}><h2>{localized(group.title, language)}</h2>{group.items.map((id) => {
      const page = pageById.get(id); const active = route.pageId === id;
      return <button type="button" key={id} className={active ? "active" : ""} aria-current={active ? "page" : undefined} onClick={() => { navigate(id); onClose(); }}><span>{localized(page.shortTitle || page.title, language)}</span>{active ? <CircleDot size={13} /> : <ChevronRight size={13} />}</button>;
    })}</section>)}</nav>
  </aside>;
}

function VersionBanner({ version, language }) {
  const text = {
    "3.3": { ru: "Current line: API v3/v4, schema 8, recovery, Pulse catalog и release consistency.", en: "Current line: API v3/v4, schema 8, recovery, Pulse catalog and release consistency." },
    "3.2": { ru: "Compatibility view: Trust/MLS, encrypted media и schema 8 hardening.", en: "Compatibility view: Trust/MLS, encrypted media and schema 8 hardening." },
    "3.1": { ru: "Signed baseline 3.1.2; Trust v4 claims относятся к 3.2+.", en: "Signed baseline 3.1.2; Trust v4 claims belong to 3.2+." },
  }[version][language];
  return <div className="version-banner"><ShieldCheck size={17} /><span>{text}</span></div>;
}
function TableOfContents({ page, language, activeSection }) {
  return <aside className="toc"><strong>{language === "ru" ? "На странице" : "On this page"}</strong>{(page.sections || []).map((section) => <a key={section.id} className={activeSection === section.id ? "active" : ""} href={`#/${page.id}/${section.id}`}>{localized(section.title, language)}</a>)}</aside>;
}
function ReferenceInventory({ pageId, language }) {
  if (!["api-overview", "api-v3", "api-v4", "socket-events"].includes(pageId)) return null;
  const eventsMode = pageId === "socket-events";
  const routes = reference.routes.filter((route) => pageId === "api-v4" ? route.group === "trust-v4" : pageId === "api-v3" ? route.group !== "trust-v4" : true);
  return <section className="reference-inventory">
    <div className="section-head"><div><span>GENERATED FROM SOURCE</span><h2>{eventsMode ? (language === "ru" ? "Event inventory" : "Event inventory") : (language === "ru" ? "HTTP route inventory" : "HTTP route inventory")}</h2></div><b>{eventsMode ? reference.events.length : routes.length}</b></div>
    <div className="table-scroll"><table><thead><tr>{eventsMode ? <><th>Direction</th><th>Event</th><th>Source</th></> : <><th>Method</th><th>Path</th><th>Group</th><th>Source</th></>}</tr></thead><tbody>{eventsMode ? reference.events.map((event, index) => <tr key={`${event.name}-${index}`}><td><code>{event.direction}</code></td><td><code>{event.name}</code></td><td><a href={`https://github.com/${REPOSITORY}/blob/main/${event.source}#L${event.line}`} target="_blank" rel="noreferrer">{event.source}:{event.line}</a></td></tr>) : routes.map((route, index) => <tr key={`${route.method}-${route.path}-${index}`}><td><code className={`method ${route.method.toLowerCase()}`}>{route.method}</code></td><td><code>{route.path}</code></td><td>{route.group}</td><td><a href={`https://github.com/${REPOSITORY}/blob/main/${route.source}#L${route.line}`} target="_blank" rel="noreferrer">{route.source}:{route.line}</a></td></tr>)}</tbody></table></div>
    <p className="muted">{reference.generatedFromSource ? (language === "ru" ? "Сформировано из текущего source tree." : "Generated from the current source tree.") : (language === "ru" ? "Fallback inventory; CI пересобирает полный список." : "Fallback inventory; CI rebuilds the complete list.")}</p>
  </section>;
}
function ReleasePanel({ language, releaseState }) {
  const releases = releaseState.releases.filter((item) => /^v?3\.[123]\./.test(item.tag_name || ""));
  return <section className="release-panel"><div className="section-head"><div><span>{releaseState.live ? "LIVE GITHUB DATA" : "REPOSITORY FALLBACK"}</span><h2>{language === "ru" ? "Релизы 3.1–3.3" : "Releases 3.1–3.3"}</h2></div>{releaseState.loading ? <i className="loading-dot" /> : <CheckCircle2 />}</div><div className="release-grid">{releases.map((release) => <article key={release.id || release.tag_name}><div><span className={`badge ${release.prerelease ? "pre" : "stable"}`}>{release.prerelease ? "PRERELEASE" : "STABLE"}</span><small>{release.published_at ? new Date(release.published_at).toLocaleDateString(language === "ru" ? "ru-RU" : "en-US") : "—"}</small></div><h3>{release.name || release.tag_name}</h3><p>{String(release.body || "").replace(/[#*_`>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 240) || "Release details"}</p><a href={release.html_url || `https://github.com/${REPOSITORY}/releases`} target="_blank" rel="noreferrer">{language === "ru" ? "Открыть релиз" : "Open release"} <ExternalLink size={14} /></a></article>)}</div></section>;
}

function PageArticle({ page, language, theme, version, meta, route, releaseState }) {
  const [activeSection, setActiveSection] = React.useState(route.sectionId || page.sections?.[0]?.id);
  const pageIndex = pages.findIndex((item) => item.id === page.id);
  const previous = pages[pageIndex - 1]; const next = pages[pageIndex + 1];
  React.useEffect(() => {
    document.title = `${localized(page.title, language)} · Nexora`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", localized(page.description, language));
    scrollTo({ top: 0, behavior: "auto" });
    if (route.sectionId) setTimeout(() => document.getElementById(route.sectionId)?.scrollIntoView({ block: "start" }), 30);
  }, [page, language, route.sectionId]);
  React.useEffect(() => {
    const observer = new IntersectionObserver((entries) => { const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]; if (visible) setActiveSection(visible.target.id); }, { rootMargin: "-18% 0px -66%", threshold: [.05, .2, .5] });
    (page.sections || []).map((section) => document.getElementById(section.id)).filter(Boolean).forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [page]);
  const group = navigation.find((item) => item.items.includes(page.id));
  return <><main className="article-grid" id="main-content"><article className="document">
    <div className="breadcrumbs"><button type="button" onClick={() => navigate("overview")}>{language === "ru" ? "Документация" : "Documentation"}</button><ChevronRight size={13} /><span>{localized(group?.title, language)}</span><ChevronRight size={13} /><strong>{localized(page.shortTitle || page.title, language)}</strong></div>
    <VersionBanner version={version} language={language} />
    <header className="document-header"><div className="document-kicker"><Zap size={15} /> NEXORA / {version === "3.3" ? CURRENT_VERSION : `${version}.x`}</div><h1>{renderTokens(localized(page.title, language), meta)}</h1><p>{renderTokens(localized(page.description, language), meta)}</p><div className="facts"><span><BookOpen size={15} /> {(page.sections || []).length} {language === "ru" ? "разделов" : "sections"}</span><span><FileCode2 size={15} /> {page.sourcePath || "portal source"}</span></div></header>
    {(page.sections || []).map((section) => <section className="document-section" id={section.id} key={section.id}><h2><a href={`#/${page.id}/${section.id}`}>#</a>{localized(section.title, language)}</h2>{(section.blocks || []).map((block, index) => <ContentBlock key={`${section.id}-${index}`} block={block} language={language} meta={meta} theme={theme} />)}</section>)}
    <ReferenceInventory pageId={page.id} language={language} />
    {page.id === "releases" ? <ReleasePanel language={language} releaseState={releaseState} /> : null}
    <SourceLinks page={page} language={language} />
    <nav className="pager">{previous ? <button type="button" onClick={() => navigate(previous.id)}><ArrowLeft /><span><small>{language === "ru" ? "Назад" : "Previous"}</small><strong>{localized(previous.shortTitle || previous.title, language)}</strong></span></button> : <span />}{next ? <button type="button" className="next" onClick={() => navigate(next.id)}><span><small>{language === "ru" ? "Далее" : "Next"}</small><strong>{localized(next.shortTitle || next.title, language)}</strong></span><ArrowRight /></button> : null}</nav>
  </article><TableOfContents page={page} language={language} activeSection={activeSection} /></main><footer><span>NEXORA ADVANCED DOCS · {CURRENT_VERSION}</span><span>{language === "ru" ? "Source + repository docs + historical kit" : "Source + repository docs + historical kit"}</span></footer></>;
}

export default function App() {
  const route = useHashRoute(); const page = pageById.get(route.pageId) || pageById.get("overview");
  const [language, setLanguageState] = React.useState(() => safeGet(STORAGE.language) === "en" ? "en" : "ru");
  const [theme, setThemeState] = React.useState(() => ["dark", "light"].includes(safeGet(STORAGE.theme)) ? safeGet(STORAGE.theme) : "dark");
  const [version, setVersionState] = React.useState(() => ["3.1", "3.2", "3.3"].includes(safeGet(STORAGE.version)) ? safeGet(STORAGE.version) : "3.3");
  const [searchOpen, setSearchOpen] = React.useState(false); const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const releaseState = useReleases(); const meta = React.useMemo(() => ({ currentVersion: CURRENT_VERSION }), []);
  const setLanguage = (value) => { setLanguageState(value); safeSet(STORAGE.language, value); };
  const setTheme = (value) => { setThemeState(value); safeSet(STORAGE.theme, value); };
  const setVersion = (value) => { setVersionState(value); safeSet(STORAGE.version, value); };
  React.useEffect(() => { document.documentElement.lang = language; document.documentElement.dataset.theme = theme; }, [language, theme]);
  React.useEffect(() => { const key = (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(true); } }; addEventListener("keydown", key); return () => removeEventListener("keydown", key); }, []);
  React.useEffect(() => setSidebarOpen(false), [route.pageId]);
  return <div className="app-shell"><a className="skip-link" href="#main-content">{language === "ru" ? "Перейти к содержимому" : "Skip to content"}</a><AetherField /><div className="background-grid" aria-hidden="true" /><TopBar language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme} version={version} setVersion={setVersion} onSearch={() => setSearchOpen(true)} onMenu={() => setSidebarOpen(true)} /><div className="layout"><Sidebar language={language} route={route} open={sidebarOpen} onClose={() => setSidebarOpen(false)} version={version} setVersion={setVersion} />{sidebarOpen ? <button className="mobile-scrim" type="button" aria-label="Close" onClick={() => setSidebarOpen(false)} /> : null}<PageArticle page={page} language={language} theme={theme} version={version} meta={meta} route={route} releaseState={releaseState} /></div><SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} language={language} meta={meta} /></div>;
}
