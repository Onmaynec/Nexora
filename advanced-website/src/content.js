import { pages as getting_startedPages } from './content/pages-getting-started.js';
import { pages as architecturePages } from './content/pages-architecture.js';
import { pages as securityPages } from './content/pages-security.js';
import { pages as apiPages } from './content/pages-api.js';
import { pages as operationsPages } from './content/pages-operations.js';
import { pages as contributePages } from './content/pages-contribute.js';
import { pages as referencePages } from './content/pages-reference.js';

export const ui = {
  ru: {
    docs: 'Продвинутая документация', search: 'Поиск', searchHint: 'Поиск по документации',
    version: 'Версия', theme: 'Тема', openMenu: 'Открыть навигацию', closeMenu: 'Закрыть навигацию',
    onThisPage: 'На этой странице', previous: 'Назад', next: 'Далее', edit: 'Изменить на GitHub',
    issue: 'Сообщить об ошибке', source: 'Источник', copied: 'Скопировано', noResults: 'Ничего не найдено',
    historical: 'Выбрана историческая линия. Общие страницы описывают current main; точные изменения смотрите в release notes.',
    current: 'Текущая версия', repositoryData: 'Данные из репозитория', liveReleases: 'GitHub Releases',
    fallbackReleases: 'Локальные release notes', loading: 'Загрузка…', generated: 'Сформировано из исходного кода',
  },
  en: {
    docs: 'Advanced documentation', search: 'Search', searchHint: 'Search documentation',
    version: 'Version', theme: 'Theme', openMenu: 'Open navigation', closeMenu: 'Close navigation',
    onThisPage: 'On this page', previous: 'Previous', next: 'Next', edit: 'Edit on GitHub',
    issue: 'Report an issue', source: 'Source', copied: 'Copied', noResults: 'No results found',
    historical: 'A historical line is selected. General pages describe current main; use release notes for exact version changes.',
    current: 'Current version', repositoryData: 'Repository data', liveReleases: 'GitHub Releases',
    fallbackReleases: 'Local release notes', loading: 'Loading…', generated: 'Generated from source code',
  },
};

const both = (ru, en) => ({ ru, en });

export const groups = [
  { id: 'getting-started', title: both('Начало работы', 'Getting started') },
  { id: 'architecture', title: both('Архитектура', 'Architecture') },
  { id: 'security', title: both('Безопасность', 'Security') },
  { id: 'api', title: both('API и realtime', 'API and realtime') },
  { id: 'operations', title: both('Эксплуатация', 'Operations') },
  { id: 'contribute', title: both('Разработка', 'Contributing') },
  { id: 'reference', title: both('Справочник', 'Reference') },
];

export const pages = [
  ...getting_startedPages,
  ...architecturePages,
  ...securityPages,
  ...apiPages,
  ...operationsPages,
  ...contributePages,
  ...referencePages,
];
