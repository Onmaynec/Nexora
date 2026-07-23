import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, '..');
const repoRoot = path.resolve(siteRoot, '..');
const generatedDir = path.join(siteRoot, 'src', 'generated');
const outputFile = path.join(generatedDir, 'repository-content.js');
const openApiFile = path.join(siteRoot, 'public', 'openapi.json');
const allowedExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const sourceRoots = ['server', 'cloud', 'shared', 'client', 'electron', 'scripts'];

const normalizePath = (value) => value.split(path.sep).join('/');
const readText = async (file) => fs.readFile(file, 'utf8');

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir) {
  if (!(await exists(dir))) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const output = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.git')) continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute));
    else output.push(absolute);
  }
  return output;
}

function lineAt(content, offset) {
  return content.slice(0, offset).split('\n').length;
}

function nearby(content, offset, radius = 900) {
  return content.slice(Math.max(0, offset - radius), Math.min(content.length, offset + radius));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
}

function collectRegex(content, pattern, group = 1) {
  return unique([...content.matchAll(pattern)].map((match) => match[group]));
}

function routeBlock(content, offset) {
  const rest = content.slice(offset);
  const next = rest.slice(1).search(/\n\s*(?:app|router|api|server)\s*\.\s*(?:get|post|put|patch|delete)\s*\(/i);
  const size = next >= 0 ? Math.min(next + 1, 12_000) : Math.min(rest.length, 12_000);
  return rest.slice(0, size);
}

export function inferAuth(route, context, protectedPrefixes = []) {
  const sample = context.toLowerCase();
  const methodProtected = protectedPrefixes.some((prefix) => route === prefix || route.startsWith(`${prefix}/`));
  if (/health|readiness|liveness|\.well-known|oauth\/authorize|oauth\/token/.test(route)) return 'public or protocol-specific';
  if (/login|register|bootstrap|invite\/resolve/.test(route) && !/logout|sessions/.test(route)) return 'public with validation/rate limits';
  if (/requireowner|owneronly|assertowner/.test(sample)) return 'room owner';
  if (/requiremoderator|moderatoronly|canmoderate|roompermission/.test(sample)) return 'room permission';
  if (/requireadmin|serveradmin|adminonly/.test(sample)) return 'server administrator';
  if (/csrf/.test(sample)) return 'authenticated session + CSRF on mutations';
  if (/requiresession|requireauth|authrequired|sessionuser|authenticated/.test(sample) || methodProtected) return 'authenticated session; mutation guards may require CSRF';
  return 'server-enforced; inspect source guard';
}

function extractRequestContract(route, block) {
  const params = unique([
    ...[...route.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((match) => match[1]),
    ...collectRegex(block, /request\.params(?:\?\.|\.)([A-Za-z_][A-Za-z0-9_]*)/g),
  ]);
  const query = collectRegex(block, /request\.query(?:\?\.|\.)([A-Za-z_][A-Za-z0-9_]*)/g);
  const body = collectRegex(block, /request\.body(?:\?\.|\.)([A-Za-z_][A-Za-z0-9_]*)/g);
  const headers = collectRegex(block, /request\.headers\s*\[\s*['"]([^'"]+)['"]\s*\]/g);
  return { params, query, body, headers };
}

function extractResponseContract(block) {
  const statuses = unique([
    ...collectRegex(block, /response\.status\(\s*(\d{3})\s*\)/g).map(Number),
    ...(responseHasJson(block) ? [200] : []),
  ]).sort((a, b) => a - b);
  const keys = [];
  for (const match of block.matchAll(/response(?:\.status\(\s*\d{3}\s*\))?\.json\(\s*\{([\s\S]{0,900}?)\}\s*\)/g)) {
    for (const keyMatch of match[1].matchAll(/(?:^|,)\s*(?:\.\.\.[A-Za-z_$][\w$]*\s*,\s*)?([A-Za-z_$][\w$]*)\s*(?::|,|$)/gm)) keys.push(keyMatch[1]);
  }
  return { statuses, keys: unique(keys) };
}

function responseHasJson(block) {
  return /response(?:\.status\([^)]*\))?\.json\s*\(/.test(block);
}

function extractErrorCodes(block) {
  const patterns = [
    /\b(?:code|errorCode)\s*:\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
    /\b(?:fail|error|problem)\s*\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
    /\bnew\s+[A-Za-z_$][\w$]*Error\s*\([\s\S]{0,260}?,\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  ];
  return unique(patterns.flatMap((pattern) => collectRegex(block, pattern)));
}

export function collectMatches(content, file) {
  const routes = [];
  const sockets = [];
  const errors = [];
  const relative = normalizePath(path.relative(repoRoot, file));
  const protectedPrefixes = collectRegex(
    content,
    /\bapp\.use\(\s*(['"])(\/[^'"]+)\1[\s\S]{0,420}?\bauthRequired\b/g,
    2,
  );
  const routePatterns = [
    /\b(?:app|router|api|server)\s*\.\s*(get|post|put|patch|delete)\s*\(\s*(['"`])([^'"`]+)\2/gim,
    /\bregister(?:Json|Api)?Route\s*\(\s*(['"`])(GET|POST|PUT|PATCH|DELETE)\1\s*,\s*(['"`])([^'"`]+)\3/gim,
    /\broute\s*\(\s*(['"`])([^'"`]+)\1\s*\)\s*\.\s*(get|post|put|patch|delete)\s*\(/gim,
  ];

  for (const [patternIndex, pattern] of routePatterns.entries()) {
    for (const match of content.matchAll(pattern)) {
      let method;
      let route;
      if (patternIndex === 0) {
        method = match[1].toUpperCase();
        route = match[3];
      } else if (patternIndex === 1) {
        method = match[2].toUpperCase();
        route = match[4];
      } else {
        method = match[3].toUpperCase();
        route = match[2];
      }
      if (!route.startsWith('/')) continue;
      const offset = match.index ?? 0;
      const block = routeBlock(content, offset);
      routes.push({
        method,
        path: route,
        auth: inferAuth(route, `${nearby(content, offset)}\n${block.slice(0, 2200)}`, protectedPrefixes),
        request: extractRequestContract(route, block),
        response: extractResponseContract(block),
        errors: extractErrorCodes(block),
        source: relative,
        line: lineAt(content, offset),
      });
    }
  }

  const socketPatterns = [
    { direction: null, pattern: /\b(?:socket|io|client|namespace|nsp)\s*(?:\.\s*to\([^)]*\))?(?:\.\s*broadcast)?\s*\.\s*(on|emit)\s*\(\s*(['"`])([^'"`]+)\2/gim, directionGroup: 1, eventGroup: 3 },
    { direction: 'emit', pattern: /\bemit(?:User|Conversation|Room|Event|To[A-Za-z0-9_$]*)\s*\(\s*[^,]+,\s*(['"`])([^'"`]+)\1/gim, eventGroup: 2 },
  ];
  for (const config of socketPatterns) {
    for (const match of content.matchAll(config.pattern)) {
      const event = match[config.eventGroup];
      if (!event || event.startsWith('/') || event.length > 120 || /\s/.test(event)) continue;
      const rawDirection = config.direction ?? match[config.directionGroup];
      sockets.push({
        direction: String(rawDirection).toLowerCase() === 'on' ? 'receive' : 'emit',
        event,
        source: relative,
        line: lineAt(content, match.index ?? 0),
      });
    }
  }

  const errorPatterns = [
    /\b(?:code|errorCode)\s*:\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
    /\b(?:fail|error|problem)\s*\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
    /\bnew\s+[A-Za-z_$][\w$]*Error\s*\([\s\S]{0,260}?,\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g,
  ];
  for (const pattern of errorPatterns) {
    for (const match of content.matchAll(pattern)) {
      errors.push({ code: match[1], source: relative, line: lineAt(content, match.index ?? 0) });
    }
  }

  return { routes, sockets, errors };
}

function dedupe(items, key) {
  const seen = new Set();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

async function readMarkdownPage(file, kind = 'repository') {
  const content = await readText(file);
  const relative = normalizePath(path.relative(repoRoot, file));
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, '.md');
  return { id: relative.toLowerCase().replace(/[^a-z0-9а-яё]+/giu, '-').replace(/^-|-$/g, ''), title, source: relative, kind, content };
}

function schemaFromFields(fields) {
  if (!fields.length) return undefined;
  return {
    type: 'object',
    additionalProperties: true,
    properties: Object.fromEntries(fields.map((field) => [field, {
      description: 'Field detected from server source. Consult the linked validator for its exact type and constraints.',
    }])),
  };
}

function openApiFromRoutes(routes, version) {
  const paths = {};
  for (const route of routes) {
    const openPath = route.path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');
    paths[openPath] ??= {};
    const parameters = [
      ...route.request.params.map((name) => ({ name, in: 'path', required: true, schema: { type: 'string' } })),
      ...route.request.query.map((name) => ({ name, in: 'query', required: false, schema: {} })),
      ...route.request.headers.filter((name) => !['cookie', 'content-type'].includes(name.toLowerCase())).map((name) => ({ name, in: 'header', required: false, schema: {} })),
    ];
    const responses = Object.fromEntries((route.response.statuses.length ? route.response.statuses : [200]).map((status) => [String(status), {
      description: status >= 400 ? 'Error response defined by the server implementation.' : 'Response defined by the server implementation.',
      content: route.response.keys.length ? { 'application/json': { schema: schemaFromFields(route.response.keys) } } : undefined,
    }]));
    paths[openPath][route.method.toLowerCase()] = {
      operationId: `${route.method.toLowerCase()}_${openPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
      summary: `${route.method} ${route.path}`,
      description: `Generated from ${route.source}:${route.line}. Authorization inference: ${route.auth}. Exact validation remains authoritative in source.`,
      tags: [route.source.split('/')[0] || 'api'],
      parameters,
      requestBody: route.request.body.length ? {
        required: false,
        content: { 'application/json': { schema: schemaFromFields(route.request.body) } },
      } : undefined,
      responses,
      'x-nexora-source': `${route.source}:${route.line}`,
      'x-nexora-auth-inference': route.auth,
      'x-nexora-error-codes': route.errors,
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Nexora generated API inventory',
      version,
      description: 'Build-time inventory extracted from Nexora server source. It intentionally avoids inventing field types; source validators remain authoritative.',
    },
    servers: [{ url: '/', description: 'Current Nexora deployment' }],
    paths,
  };
}

async function main() {
  const rootPackagePath = path.join(repoRoot, 'package.json');
  const rootPackage = await exists(rootPackagePath)
    ? JSON.parse(await readText(rootPackagePath))
    : { version: '3.3.1', engines: { node: '>=22.16.0' } };

  const sourceFiles = [];
  for (const root of sourceRoots) {
    for (const file of await walk(path.join(repoRoot, root))) {
      if (allowedExtensions.has(path.extname(file))) sourceFiles.push(file);
    }
  }

  const collected = { routes: [], sockets: [], errors: [] };
  for (const file of sourceFiles) {
    let content;
    try {
      content = await readText(file);
    } catch {
      continue;
    }
    const matches = collectMatches(content, file);
    collected.routes.push(...matches.routes);
    collected.sockets.push(...matches.sockets);
    collected.errors.push(...matches.errors);
  }

  const routes = dedupe(collected.routes, (item) => `${item.method}:${item.path}:${item.source}:${item.line}`)
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const sockets = dedupe(collected.sockets, (item) => `${item.direction}:${item.event}:${item.source}:${item.line}`)
    .sort((a, b) => a.event.localeCompare(b.event));
  const errors = dedupe(collected.errors, (item) => item.code)
    .sort((a, b) => a.code.localeCompare(b.code));

  const repositoryDocs = [];
  const explicitDocs = [
    'README.md',
    'PROJECT_INDEX.md',
    'docs/ARCHITECTURE.md',
    'docs/SECURITY_MODEL.md',
    'docs/GITHUB_RELEASE.md',
    'docs/RELEASE_CHECKLIST.md',
    'docs/ADVANCED_DOCUMENTATION.md',
  ];
  for (const relative of explicitDocs) {
    const file = path.join(repoRoot, relative);
    if (await exists(file)) repositoryDocs.push(await readMarkdownPage(file));
  }

  const docsDir = path.join(repoRoot, 'docs');
  if (await exists(docsDir)) {
    for (const file of (await walk(docsDir)).filter((candidate) => candidate.endsWith('.md')).sort()) {
      const relative = normalizePath(path.relative(repoRoot, file));
      if (repositoryDocs.some((doc) => doc.source === relative)) continue;
      repositoryDocs.push(await readMarkdownPage(file));
    }
  }

  const releaseNotes = [];
  for (const file of (await fs.readdir(repoRoot).catch(() => [])).filter((name) => /^RELEASE_NOTES_3\.[123]\./.test(name) && name.endsWith('.md')).sort().reverse()) {
    const page = await readMarkdownPage(path.join(repoRoot, file), 'release');
    const version = file.match(/RELEASE_NOTES_(3\.[0-9]+\.[0-9]+)/)?.[1] ?? file;
    releaseNotes.push({ ...page, version });
  }

  const kitDocs = [];
  const contentDir = path.join(siteRoot, 'content');
  for (const file of (await walk(contentDir)).filter((candidate) => candidate.endsWith('.md') || candidate.endsWith('.md.gz.b64')).sort()) {
    const encoded = await readText(file);
    const compressed = file.endsWith('.md.gz.b64');
    const content = compressed ? gunzipSync(Buffer.from(encoded.trim(), 'base64')).toString('utf8') : encoded;
    const baseName = path.basename(file).replace(/\.md(?:\.gz\.b64)?$/, '');
    kitDocs.push({
      id: `kit-${baseName}`,
      title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, '.md'),
      source: normalizePath(path.relative(repoRoot, file)),
      kind: 'documentation-kit',
      content,
    });
  }

  const openApi = openApiFromRoutes(routes, rootPackage.version);
  const payload = {
    currentVersion: rootPackage.version,
    nodeRequirement: rootPackage.engines?.node ?? '>=22.16.0',
    generatedFrom: 'repository source, Markdown documentation and attached Documentation Kit',
    generatedAt: new Date().toISOString(),
    routes,
    sockets,
    errors,
    repositoryDocs,
    releaseNotes,
    kitDocs,
    openApiPath: 'openapi.json',
  };

  await fs.mkdir(generatedDir, { recursive: true });
  await fs.mkdir(path.dirname(openApiFile), { recursive: true });
  await fs.writeFile(outputFile, `// Generated by advanced-website/scripts/generate-content.mjs\nexport const generated = ${JSON.stringify(payload, null, 2)};\n`, 'utf8');
  await fs.writeFile(openApiFile, `${JSON.stringify(openApi, null, 2)}\n`, 'utf8');
  console.log(`Generated ${normalizePath(path.relative(repoRoot, outputFile))}: ${routes.length} routes, ${sockets.length} socket references, ${errors.length} error codes, ${repositoryDocs.length} repository docs, ${releaseNotes.length} release notes.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
