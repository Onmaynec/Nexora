import meta from "./content-data/meta.json" with { type: "json" };
import start from "./content-data/start.json" with { type: "json" };
import architecture from "./content-data/architecture.json" with { type: "json" };
import product from "./content-data/product.json" with { type: "json" };
import security from "./content-data/security.json" with { type: "json" };
import referencePages from "./content-data/reference.json" with { type: "json" };
import operations from "./content-data/operations.json" with { type: "json" };
import development from "./content-data/development.json" with { type: "json" };
import releases from "./content-data/releases.json" with { type: "json" };

export const versionLines = meta.versionLines;
export const navigation = meta.navigation;
export const pages = [...start, ...architecture, ...product, ...security, ...referencePages, ...operations, ...development, ...releases];
export const pageById = new Map(pages.map((page) => [page.id, page]));

export function localized(value, language) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value[language] ?? value.ru ?? value.en ?? "";
}

export function renderTokens(value, metaValue) {
  return String(value ?? "").replaceAll("{{version}}", metaValue.currentVersion || "unknown");
}

export function flattenSearch(language, metaValue) {
  return pages.map((page) => {
    const sections = (page.sections || []).map((section) => localized(section.title, language)).join(" ");
    const body = (page.sections || []).flatMap((section) => section.blocks || []).map((block) => {
      if (block.text) return localized(block.text, language);
      if (block.items) return (block.items[language] || block.items.ru || []).join(" ");
      if (block.rows) return block.rows.flat().map((item) => localized(item, language)).join(" ");
      return block.value || "";
    }).join(" ");
    return {
      id: page.id,
      title: localized(page.title, language),
      description: localized(page.description, language),
      haystack: renderTokens([localized(page.title, language), localized(page.description, language), sections, body, ...(page.keywords || [])].join(" "), metaValue).toLocaleLowerCase(language === "ru" ? "ru" : "en"),
    };
  });
}
