const SUPPORTED_MEDIA_EXTENSION = /\.(?:svg|png|webp)$/i;
const SAFE_SEGMENT = /^[a-z0-9._-]+$/i;
const UNSAFE_SVG = /<\s*(?:script|foreignObject|iframe|object|embed)\b|<!\s*(?:DOCTYPE|ENTITY)\b|\bon[a-z]+\s*=|\b(?:href|xlink:href|src)\s*=\s*["']?\s*(?:javascript:|data:|https?:|\/\/)|url\s*\(\s*["']?\s*(?:javascript:|data:|https?:|\/\/)|@import\b/i;

export function isSafeDocumentationMediaPath(value) {
  if (typeof value !== "string" || !value.startsWith("docs-media/") || !SUPPORTED_MEDIA_EXTENSION.test(value)) return false;
  if (value.includes("\\") || value.includes("?") || value.includes("#")) return false;

  const segments = value.split("/");
  if (segments.length < 2 || segments[0] !== "docs-media") return false;
  return segments.slice(1).every((segment) => Boolean(segment) && segment !== "." && segment !== ".." && SAFE_SEGMENT.test(segment));
}

export function hasUnsafeDocumentationSvgContent(value) {
  return typeof value !== "string" || !/<svg\b/i.test(value) || UNSAFE_SVG.test(value);
}
