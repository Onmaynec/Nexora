const both = (ru, en) => ({ ru, en });

export const pages = [
  {
    id: 'reference', group: 'reference', icon: 'BookOpenCheck', title: both('Полный reference', 'Full reference'),
    description: both('Индекс исходников, документации и generated contracts.', 'Index of source, documentation, and generated contracts.'),
    body: both(
`# Полный reference

## Динамические разделы

- API Inventory — REST routes, request fields, statuses и error codes;
- Realtime Events — Socket.IO receive/emit references;
- Error Codes — стабильные machine-readable codes;
- Releases — GitHub Releases плюс local release-note fallback;
- Repository Documents — актуальные Markdown-документы current main;
- Documentation Kit — исторический комплект 0.3–1.0.

## Статические инженерные разделы

Портал содержит curated guides для установки, архитектуры, безопасности, эксплуатации, разработки и релизов. Curated content объясняет модель; generated inventory связывает её с исходниками.

## Принцип точности

Ни одна автоматически извлечённая схема не должна считаться более авторитетной, чем фактический server validator. Если static extraction не доказывает тип или constraint, OpenAPI оставляет поле без вымышленного типа и ведёт к source location.`,
`# Full reference

## Dynamic sections

- API Inventory — REST routes, request fields, statuses, and error codes;
- Realtime Events — Socket.IO receive/emit references;
- Error Codes — stable machine-readable codes;
- Releases — GitHub Releases with local release-note fallback;
- Repository Documents — current-main Markdown documents;
- Documentation Kit — historical 0.3–1.0 material.

## Curated engineering sections

The portal contains curated guides for installation, architecture, security, operations, development, and releases. Curated content explains the model; generated inventories bind it back to source.

## Accuracy rule

No generated schema is more authoritative than the actual server validator. When static extraction cannot prove a type or constraint, OpenAPI leaves it unspecified and links to the source location.`),
    special: 'reference',
  },
  {
    id: 'historical-kit', group: 'reference', icon: 'Archive', title: both('Documentation Kit 0.3–1.0', 'Documentation Kit 0.3–1.0'),
    description: both('Исторические документы из приложенного комплекта.', 'Historical material from the attached documentation kit.'),
    body: both(
`# Documentation Kit 0.3–1.0

Приложенный комплект зафиксирован на базе Nexora 0.3.0 и roadmap к 1.0.0. Он включён для сохранения проектного контекста: ранние модели Client/Server, roadmap 0.4–0.6 и объединённая спецификация 1.0.0.

> Этот раздел исторический. Названия файлов, схем, API и статус функций могут не соответствовать current main 3.3.1.

Используйте документы для анализа эволюции требований. Для реализации, эксплуатации и security decisions всегда проверяйте current repository docs, source и release notes.`,
`# Documentation Kit 0.3–1.0

The attached kit is based on Nexora 0.3.0 and a roadmap toward 1.0.0. It is preserved for project context: early Client/Server models, the 0.4–0.6 roadmap, and the consolidated 1.0.0 specification.

> This section is historical. File names, schemas, APIs, and feature status may not match current main 3.3.1.

Use the documents to study requirement evolution. For implementation, operations, and security decisions, always verify current repository documentation, source, and release notes.`),
    special: 'historical',
  }
];
