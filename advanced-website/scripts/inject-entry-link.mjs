import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const STYLE = `  <style id="advanced-docs-entry-style">
    html[lang="ru"] .advanced-docs-en { display: none; }
    html[lang="en"] .advanced-docs-ru { display: none; }
  </style>\n`;

const LINK = `          <a class="button button-secondary" href="advanced/" data-advanced-docs>
            <span class="advanced-docs-ru">Продвинутая документация</span>
            <span class="advanced-docs-en">Advanced documentation</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h9l3 3v13H6zM15 4v4h4M9 12h6M9 16h6"/></svg>
          </a>\n`;

export function injectAdvancedLink(html) {
  if (html.includes("data-advanced-docs")) return html;
  const headClose = html.indexOf("</head>");
  if (headClose < 0) throw new Error("website/index.html has no </head> marker.");
  let output = `${html.slice(0, headClose)}${STYLE}${html.slice(headClose)}`;
  const actionsStart = output.indexOf('<div class="hero-actions">');
  if (actionsStart < 0) throw new Error("website/index.html has no hero-actions block.");
  const actionsClose = output.indexOf("</div>", actionsStart);
  if (actionsClose < 0) throw new Error("website/index.html hero-actions block is not closed.");
  output = `${output.slice(0, actionsClose)}${LINK}${output.slice(actionsClose)}`;
  return output;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..", "..");
  const target = path.resolve(process.argv[2] || path.join(repoRoot, "website", "index.html"));
  const before = fs.readFileSync(target, "utf8");
  const after = injectAdvancedLink(before);
  fs.writeFileSync(target, after);
  console.log(after === before ? "Advanced documentation entry already present." : "Advanced documentation entry injected.");
}
