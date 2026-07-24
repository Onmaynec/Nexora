import meta from "./content-data/meta.json" with { type: "json" };
import start from "./content-data/start.json" with { type: "json" };
import architecture from "./content-data/architecture.json" with { type: "json" };
import product from "./content-data/product.json" with { type: "json" };
import security from "./content-data/security.json" with { type: "json" };
import referencePages from "./content-data/reference.json" with { type: "json" };
import operations from "./content-data/operations.json" with { type: "json" };
import development from "./content-data/development.json" with { type: "json" };
import releases from "./content-data/releases.json" with { type: "json" };
import enhancementsStart from "./content-data/enhancements-start.json" with { type: "json" };
import enhancementsArchitecture from "./content-data/enhancements-architecture.json" with { type: "json" };
import enhancementsProduct from "./content-data/enhancements-product.json" with { type: "json" };
import enhancementsSecurity from "./content-data/enhancements-security.json" with { type: "json" };
import enhancementsReference from "./content-data/enhancements-reference.json" with { type: "json" };
import enhancementsOperations from "./content-data/enhancements-operations.json" with { type: "json" };
import enhancementsDevelopment from "./content-data/enhancements-development.json" with { type: "json" };
import enhancementsReleases from "./content-data/enhancements-releases.json" with { type: "json" };
import roadmapMeta from "./content-data/roadmap-meta.json" with { type: "json" };
import roadmapSections1 from "./content-data/roadmap-sections-1.json" with { type: "json" };
import roadmapSections2 from "./content-data/roadmap-sections-2.json" with { type: "json" };
import roadmapSections3 from "./content-data/roadmap-sections-3.json" with { type: "json" };
import roadmapSections4 from "./content-data/roadmap-sections-4.json" with { type: "json" };

const enhancements = Object.assign({}, enhancementsStart, enhancementsArchitecture, enhancementsProduct, enhancementsSecurity, enhancementsReference, enhancementsOperations, enhancementsDevelopment, enhancementsReleases);
const roadmapPages = [{ ...roadmapMeta, sections: [...roadmapSections1, ...roadmapSections2, ...roadmapSections3, ...roadmapSections4] }];

const basePages = [...start, ...architecture, ...product, ...security, ...referencePages, ...operations, ...development, ...releases];

function mergeEnhancement(page) {
  const enhancement = enhancements[page.id];
  if (!enhancement) return page;
  return {
    ...page,
    ...enhancement.page,
    keywords: [...new Set([...(page.keywords || []), ...(enhancement.keywords || [])])],
    sections: [...(page.sections || []), ...(enhancement.appendSections || [])],
  };
}

export const versionLines = meta.versionLines;
export const navigation = meta.navigation.map((group) => {
  if (group.id !== "releases") return group;
  const items = [...group.items];
  const anchor = Math.max(items.indexOf("versioning"), items.indexOf("releases"));
  if (!items.includes("roadmap")) items.splice(anchor + 1, 0, "roadmap");
  return { ...group, items };
});
const sourcePages = [...basePages.map(mergeEnhancement), ...roadmapPages];
export const contentSourcePages = sourcePages;
const RAW_PAGE = Symbol.for("nexora.advanced.raw-page");

function selectedVersion() {
  try {
    const value = globalThis.localStorage?.getItem("nexora-advanced-version");
    return ["3.1", "3.2", "3.3"].includes(value) ? value : "3.3";
  } catch {
    return "3.3";
  }
}

function versionAwarePage(sourcePage) {
  return new Proxy(sourcePage, {
    get(target, property, receiver) {
      if (property === RAW_PAGE) return target;
      if (property === "sections") return pageForVersion(target, selectedVersion()).sections;
      return Reflect.get(target, property, receiver);
    },
  });
}

export const pages = sourcePages.map(versionAwarePage);
export const pageById = new Map(pages.map((page) => [page.id, page]));

const PAGE_LINES = {
  "trust-mls": ["3.2", "3.3"],
  "api-v4": ["3.2", "3.3"],
  "pulse-cloud": ["3.3"],
};

const INCOMPATIBLE_TERMS = {
  "3.1": ["api v4", "trust/mls", "schema 8", "keypackage", "welcome recovery", "encrypted attachment", "pulse catalog"],
  "3.2": ["goal lifecycle 3.3.3", "purchase state 3.3.3"],
};

function lineNumber(value) {
  const [major, minor] = String(value || "0.0").split(".").map(Number);
  return major * 1000 + minor;
}

export function appliesToVersion(item, version) {
  if (!item) return true;
  if (Array.isArray(item.lines) && !item.lines.includes(version)) return false;
  if (item.since && lineNumber(version) < lineNumber(item.since)) return false;
  if (item.until && lineNumber(version) > lineNumber(item.until)) return false;
  return true;
}

function withPageDefaults(page) {
  const source = page?.[RAW_PAGE] || page;
  return PAGE_LINES[source?.id] ? { ...source, lines: source.lines || PAGE_LINES[source.id] } : source;
}

export function isPageAvailable(page, version = "3.3") {
  return appliesToVersion(withPageDefaults(page), version);
}

function hasIncompatibleLegacyClaim(block, version) {
  if (block.allowCompatibilityView) return false;
  const terms = INCOMPATIBLE_TERMS[version] || [];
  if (!terms.length) return false;
  const text = JSON.stringify(block).toLowerCase();
  return terms.some((term) => text.includes(term));
}

function unavailablePage(page, version) {
  return {
    ...page,
    sections: [{
      id: "version-applicability",
      title: {
        ru: "Применимость версии",
        en: "Version applicability",
      },
      blocks: [{
        type: "callout",
        kind: "warning",
        title: {
          ru: `Раздел недоступен для ${version}.x`,
          en: `This section is unavailable for ${version}.x`,
        },
        text: {
          ru: "Выбранная линия не содержит этот runtime/contract. Переключите версию; planned материал остаётся только в roadmap.",
          en: "The selected line does not contain this runtime or contract. Switch versions; planned material remains roadmap-only.",
        },
      }],
    }],
  };
}

export function pageForVersion(page, version = "3.3") {
  if (!page) return page;
  const pageWithDefaults = withPageDefaults(page);
  if (!appliesToVersion(pageWithDefaults, version)) return unavailablePage(pageWithDefaults, version);
  const sections = (pageWithDefaults.sections || [])
    .filter((section) => appliesToVersion(section, version))
    .map((section) => ({
      ...section,
      blocks: (section.blocks || []).filter((block) => appliesToVersion(block, version) && !hasIncompatibleLegacyClaim(block, version)),
    }))
    .filter((section) => section.blocks.length > 0);
  return { ...pageWithDefaults, sections };
}

export function pagesForVersion(version = "3.3") {
  return sourcePages
    .filter((page) => isPageAvailable(page, version))
    .map((page) => pageForVersion(page, version));
}

export function localized(value, language) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[language] ?? value.ru ?? value.en ?? "";
}

export function renderTokens(value, metaValue) {
  return String(value ?? "").replaceAll("{{version}}", metaValue.currentVersion || "unknown");
}

function collectBlockText(block, language) {
  const values = [];
  if (block.text) values.push(localized(block.text, language));
  if (block.title) values.push(localized(block.title, language));
  if (block.caption) values.push(localized(block.caption, language));
  if (block.alt) values.push(localized(block.alt, language));
  if (block.items) values.push(...(block.items[language] || block.items.ru || []));
  if (block.headers) values.push(...block.headers.map((item) => localized(item, language)));
  if (block.rows) values.push(...block.rows.flat().map((item) => localized(item, language)));
  if (block.value) values.push(block.value);
  return values.join(" ");
}

function buildSearchEntry(sourcePage, language, metaValue, version) {
  const page = pageForVersion(sourcePage, version);
  const sections = (page.sections || []).map((section) => localized(section.title, language)).join(" ");
  const body = (page.sections || []).flatMap((section) => section.blocks || []).map((block) => collectBlockText(block, language)).join(" ");
  return {
    id: page.id,
    title: localized(page.title, language),
    description: localized(page.description, language),
    haystack: renderTokens([localized(page.title, language), localized(page.description, language), sections, body, ...(page.keywords || [])].join(" "), metaValue).toLocaleLowerCase(language === "ru" ? "ru" : "en"),
  };
}

export function flattenSearch(language, metaValue, version = null) {
  const resolvedVersion = version || selectedVersion();
  return sourcePages
    .filter((page) => isPageAvailable(page, resolvedVersion))
    .map((page) => buildSearchEntry(page, language, metaValue, resolvedVersion));
}
