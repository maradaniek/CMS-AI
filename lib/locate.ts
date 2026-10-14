export function pageKey(value: string) {
  const raw = value.trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || !host.includes(".")) return null;
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "").toLowerCase() || "/";
    return { host, path };
  } catch {
    return null;
  }
}

export function samePage(left: { host: string; path: string }, right: { host: string; path: string }) {
  return left.host === right.host && left.path === right.path;
}

export function locateOnSite(
  siteUrl: string,
  input: string,
): { error: string } | { key: { host: string; path: string } } {
  const site = pageKey(siteUrl);
  if (!site) return { error: "Deze klant heeft geen geldige site-URL." as const };
  const raw = input.trim();
  if (!raw) return { error: "Vul een URL in." as const };
  const absolute = raw.startsWith("/") ? `https://${site.host}${raw}` : raw;
  const target = pageKey(absolute);
  if (!target) return { error: "Dit is geen geldige URL." as const };
  if (target.host !== site.host) return { error: "Deze URL hoort bij een andere site." as const };
  return { key: target };
}
