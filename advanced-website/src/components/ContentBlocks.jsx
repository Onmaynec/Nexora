import React from "react";
import { Check, Clipboard, ExternalLink, Info, ShieldAlert, Terminal, TriangleAlert } from "lucide-react";
import { localized, renderTokens } from "../content.mjs";

function localizeCell(value, language, meta) {
  return renderTokens(localized(value, language), meta);
}

export function CodeBlock({ block, language }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(block.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <figure className="code-block">
      <figcaption>
        <span><Terminal size={15} /> {block.title ? localized(block.title, language) : block.language}</span>
        <button type="button" onClick={copy} aria-label={language === "ru" ? "Копировать код" : "Copy code"}>
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied ? (language === "ru" ? "Скопировано" : "Copied") : (language === "ru" ? "Копировать" : "Copy")}
        </button>
      </figcaption>
      <pre><code className={`language-${block.language}`}>{block.value}</code></pre>
    </figure>
  );
}

function Callout({ block, language, meta }) {
  const icons = {
    warning: TriangleAlert,
    danger: ShieldAlert,
    info: Info,
    success: Check,
  };
  const Icon = icons[block.kind] || Info;
  return (
    <aside className={`callout callout-${block.kind || "info"}`}>
      <Icon size={19} aria-hidden="true" />
      <div>
        <strong>{localizeCell(block.title, language, meta)}</strong>
        <p>{localizeCell(block.text, language, meta)}</p>
      </div>
    </aside>
  );
}

function DataTable({ block, language, meta }) {
  return (
    <div className="table-scroll" tabIndex="0">
      <table>
        <thead>
          <tr>{block.headers.map((header, index) => <th key={index}>{localizeCell(header, language, meta)}</th>)}</tr>
        </thead>
        <tbody>
          {block.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{localizeCell(cell, language, meta)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MermaidDiagram({ block, language, theme }) {
  const containerRef = React.useRef(null);
  const [fallback, setFallback] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const render = async () => {
      const mermaid = window.mermaid;
      if (!containerRef.current || !mermaid) {
        setFallback(true);
        return;
      }
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "light" ? "neutral" : "dark",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        });
        const id = `nexora-mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg } = await mermaid.render(id, block.value);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
          setFallback(false);
        }
      } catch {
        if (!cancelled) setFallback(true);
      }
    };
    render();
    return () => { cancelled = true; };
  }, [block.value, theme]);

  return (
    <figure className="diagram-card">
      <div ref={containerRef} className="mermaid-output">
        {fallback ? <pre>{block.value}</pre> : null}
      </div>
      <figcaption>{localized(block.caption, language)}</figcaption>
    </figure>
  );
}

export function ContentBlock({ block, language, meta, theme }) {
  switch (block.type) {
    case "paragraph":
      return <p>{localizeCell(block.text, language, meta)}</p>;
    case "bullets":
      return <ul>{(block.items[language] || block.items.ru || []).map((item, index) => <li key={index}>{renderTokens(item, meta)}</li>)}</ul>;
    case "steps":
      return <ol className="steps-list">{(block.items[language] || block.items.ru || []).map((item, index) => <li key={index}><span>{index + 1}</span><p>{renderTokens(item, meta)}</p></li>)}</ol>;
    case "code":
      return <CodeBlock block={block} language={language} />;
    case "callout":
      return <Callout block={block} language={language} meta={meta} />;
    case "table":
      return <DataTable block={block} language={language} meta={meta} />;
    case "mermaid":
      return <MermaidDiagram block={block} language={language} theme={theme} />;
    default:
      return null;
  }
}

export function SourceLinks({ page, language }) {
  const editUrl = page.sourcePath
    ? `https://github.com/Onmaynec/Nexora/edit/main/${page.sourcePath}`
    : "https://github.com/Onmaynec/Nexora/tree/main/advanced-website";
  const issueTitle = encodeURIComponent(`[Advanced docs] ${localized(page.title, language)}`);
  const issueBody = encodeURIComponent(`Page: ${window.location.href}\n\nDescribe the documentation problem or proposed improvement:`);
  return (
    <div className="source-links">
      <a href={editUrl} target="_blank" rel="noreferrer">{language === "ru" ? "Изменить на GitHub" : "Edit on GitHub"} <ExternalLink size={14} /></a>
      <a href={`https://github.com/Onmaynec/Nexora/issues/new?title=${issueTitle}&body=${issueBody}`} target="_blank" rel="noreferrer">{language === "ru" ? "Сообщить об ошибке" : "Report an issue"} <ExternalLink size={14} /></a>
    </div>
  );
}
