import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
const repoRoot = path.resolve(siteRoot, '..');
const requiredFiles = [
  'index.html', 'vite.config.mjs', 'package.json', 'README.md',
  'src/main.jsx', 'src/App.jsx', 'src/content.js', 'src/styles.css',
  'scripts/generate-content.mjs', 'scripts/validate.mjs',
];

const failures = [];
const fail = (message) => failures.push(message);
for (const relative of requiredFiles) {
  try { await fs.access(path.join(siteRoot, relative)); } catch { fail(`Missing ${relative}`); }
}

const generatedResult = spawnSync(process.execPath, [path.join(siteRoot, 'scripts', 'generate-content.mjs')], { cwd: repoRoot, encoding: 'utf8' });
if (generatedResult.status !== 0) fail(`Content generation failed: ${generatedResult.stderr || generatedResult.stdout}`);

const { pages, groups } = await import(`${pathToFileURL(path.join(siteRoot, 'src', 'content.js')).href}?v=${Date.now()}`);
const { generated } = await import(`${pathToFileURL(path.join(siteRoot, 'src', 'generated', 'repository-content.js')).href}?v=${Date.now()}`);
const pageIds = new Set();
for (const page of pages) {
  if (!page.id || pageIds.has(page.id)) fail(`Duplicate or missing page id: ${page.id}`);
  pageIds.add(page.id);
  if (!groups.some((group) => group.id === page.group)) fail(`Unknown group for ${page.id}: ${page.group}`);
  for (const language of ['ru', 'en']) {
    if (!page.title?.[language] || !page.description?.[language] || !page.body?.[language]) fail(`Missing ${language} content for ${page.id}`);
  }
}
if (pages.length < 24) fail(`Expected at least 24 curated pages, found ${pages.length}`);
if (generated.kitDocs.length !== 5) fail(`Expected 5 Documentation Kit documents, found ${generated.kitDocs.length}`);

const rootPackage = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8').catch(() => '{"version":"3.3.1"}'));
if (generated.currentVersion !== rootPackage.version) fail(`Generated version ${generated.currentVersion} does not match package ${rootPackage.version}`);
const hasRepositorySource = await fs.access(path.join(repoRoot, 'server')).then(() => true).catch(() => false);
if (hasRepositorySource && generated.routes.length === 0) fail('Full repository build found no REST routes; extractor likely regressed.');
if (hasRepositorySource && generated.sockets.length === 0) fail('Full repository build found no realtime references; extractor likely regressed.');
if (hasRepositorySource && generated.errors.length === 0) fail('Full repository build found no stable error codes; extractor likely regressed.');
if (hasRepositorySource && generated.repositoryDocs.length < 2) fail('Full repository build imported fewer than two repository documents.');
if (hasRepositorySource && generated.releaseNotes.length === 0) fail('Full repository build imported no 3.1–3.3 release notes.');

const openApiPath = path.join(siteRoot, 'public', 'openapi.json');
const openApi = JSON.parse(await fs.readFile(openApiPath, 'utf8').catch(() => '{}'));
if (openApi.openapi !== '3.1.0') fail('Generated OpenAPI document is missing or not version 3.1.0.');
if (hasRepositorySource && Object.keys(openApi.paths || {}).length === 0) fail('Full repository build generated an empty OpenAPI path inventory.');
if (generated.routes.some((route) => !route.request || !route.response || !Array.isArray(route.errors))) fail('A generated route is missing request/response/error contract metadata.');

const appSource = await fs.readFile(path.join(siteRoot, 'src', 'App.jsx'), 'utf8');
const cssSource = await fs.readFile(path.join(siteRoot, 'src', 'styles.css'), 'utf8');
const viteSource = await fs.readFile(path.join(siteRoot, 'vite.config.mjs'), 'utf8');
for (const marker of ['Ctrl K', 'aria-modal="true"', 'prefers-reduced-motion', 'data-mermaid', 'VERSION_LINES', 'RELEASES_API', 'OpenAPI 3.1', 'Swagger UI']) {
  if (!`${appSource}\n${cssSource}`.includes(marker)) fail(`Required portal marker missing: ${marker}`);
}
if (!viteSource.includes("base: '/Nexora/advanced/'")) fail('Vite base path must be /Nexora/advanced/.');
if (!cssSource.includes('@media (max-width: 820px)')) fail('Responsive mobile layout is missing.');
if (/\beval\s*\(/.test(appSource)) fail('Unsafe eval usage detected.');

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Advanced documentation validation passed: ${pages.length} pages, ${generated.routes.length} routes, ${generated.sockets.length} socket references, ${generated.errors.length} error codes, ${generated.repositoryDocs.length} current docs, ${generated.releaseNotes.length} local release notes, ${generated.kitDocs.length} historical docs.`);
