(() => {
  "use strict";

  const RELEASES_API = "https://api.github.com/repos/Onmaynec/Nexora/releases";
  const RELEASE_REQUEST_TIMEOUT_MS = 5000;
  const RELEASE_CACHE_KEY = "nexora-site-release-cache-v1";
  const originalFetch = window.fetch.bind(window);

  function resolveUrl(input) {
    try {
      const value = typeof input === "string" || input instanceof URL ? input : input?.url;
      return new URL(value, window.location.href);
    } catch {
      return null;
    }
  }

  function isBoundedGitHubRequest(url) {
    return url?.hostname === "api.github.com" || url?.hostname === "raw.githubusercontent.com";
  }

  function isReleaseRequest(url) {
    return Boolean(url && url.href.startsWith(RELEASES_API));
  }

  function sanitizeRelease(release) {
    return {
      tag_name: String(release?.tag_name || ""),
      prerelease: Boolean(release?.prerelease),
      html_url: String(release?.html_url || ""),
      published_at: String(release?.published_at || ""),
      zipball_url: String(release?.zipball_url || ""),
      assets: Array.isArray(release?.assets) ? release.assets.slice(0, 20).map((asset) => ({
        name: String(asset?.name || ""),
        browser_download_url: String(asset?.browser_download_url || ""),
        size: Number(asset?.size || 0),
      })) : [],
    };
  }

  function writeReleaseCache(releases) {
    if (!Array.isArray(releases) || !releases.length) return;
    try {
      const safe = releases.slice(0, 20).map(sanitizeRelease).filter((release) => release.tag_name);
      localStorage.setItem(RELEASE_CACHE_KEY, JSON.stringify(safe));
    } catch {
      // Storage may be unavailable in private/restricted contexts; static fallback remains authoritative.
    }
  }

  function readReleaseCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RELEASE_CACHE_KEY) || "null");
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch {
      return null;
    }
  }

  function fallbackReleases() {
    const cached = readReleaseCache();
    if (cached?.length) return cached;
    return Array.isArray(window.NexoraReleaseFallback) ? window.NexoraReleaseFallback : [];
  }

  function releaseFallbackResponse(reason) {
    return new Response(JSON.stringify(fallbackReleases()), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Nexora-Release-Source": reason,
      },
    });
  }

  window.fetch = async function resilientFetch(input, init = {}) {
    const url = resolveUrl(input);
    if (!isBoundedGitHubRequest(url)) return originalFetch(input, init);

    const controller = new AbortController();
    const upstreamSignal = init.signal || (typeof Request !== "undefined" && input instanceof Request ? input.signal : null);
    const abortFromUpstream = () => controller.abort();
    if (upstreamSignal?.aborted) controller.abort();
    else upstreamSignal?.addEventListener?.("abort", abortFromUpstream, { once: true });

    const timer = setTimeout(() => controller.abort(), RELEASE_REQUEST_TIMEOUT_MS);
    try {
      const response = await originalFetch(input, { ...init, signal: controller.signal });
      if (!isReleaseRequest(url)) return response;

      if (!response.ok) return releaseFallbackResponse(`http-${response.status}`);
      response.clone().json().then(writeReleaseCache).catch(() => {});
      return response;
    } catch (error) {
      if (isReleaseRequest(url) && fallbackReleases().length) {
        return releaseFallbackResponse(error?.name === "AbortError" ? "timeout" : "network-error");
      }
      throw error;
    } finally {
      clearTimeout(timer);
      upstreamSignal?.removeEventListener?.("abort", abortFromUpstream);
    }
  };
})();
