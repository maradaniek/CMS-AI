import { decrypt } from "@/lib/crypto";
import type { ClientRow } from "@/lib/db";
import { extractLayouts } from "@/lib/schema";
import type { BlockDef, ContentItem, PostKind } from "@/lib/types";

export class WpError extends Error {}

export function apiRoot(siteUrl: string) {
  const withProtocol = /^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`;
  const url = new URL(withProtocol);
  const path = url.pathname.replace(/\/wp\/?$/, "").replace(/\/$/, "");
  return `${url.origin}${path}/wp-json`;
}

function authHeader(client: ClientRow) {
  const password = decrypt(client.wp_app_password_enc);
  return `Basic ${Buffer.from(`${client.wp_username}:${password}`).toString("base64")}`;
}

export async function wp(client: ClientRow, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", authHeader(client));
  if (init.body && !headers.has("Content-Type") && typeof init.body === "string") {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${apiRoot(client.site_url)}${path}`, { ...init, headers, cache: "no-store" });
  const text = await response.text();
  let data: { message?: string; code?: string } | null = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text.slice(0, 180) };
    }
  }
  if (!response.ok) {
    const message = data?.message || data?.code || `WordPress antwoordde ${response.status}`;
    throw new WpError(String(message));
  }
  return data;
}

export async function testConnection(client: Pick<ClientRow, "site_url" | "wp_username" | "wp_app_password_enc">) {
  await wp(client as ClientRow, "/wp/v2/users/me?context=edit&_fields=id,name");
}

export async function fetchCatalog(client: ClientRow): Promise<BlockDef[]> {
  const response = await fetch(`${apiRoot(client.site_url)}/wp/v2/pages`, {
    method: "OPTIONS",
    headers: { Authorization: authHeader(client) },
    cache: "no-store",
  });
  if (!response.ok) throw new WpError("Het themaschema van deze site is niet bereikbaar.");
  const data = await response.json();
  const layouts = extractLayouts(data?.schema?.properties?.acf);
  if (!layouts.length) throw new WpError("Deze site levert geen WaaS 2.0-blokken.");
  return layouts;
}

export async function listContent(client: ClientRow, kind: PostKind): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (let page = 1; page <= 4; page += 1) {
    const batch = (await wp(
      client,
      `/wp/v2/${kind}?context=edit&status=publish,draft&per_page=50&page=${page}&orderby=modified&order=desc&_fields=id,slug,status,link,title`,
    )) as { id: number; slug: string; status: string; link: string; title: { raw?: string; rendered?: string } }[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    items.push(
      ...batch.map((item) => ({
        id: item.id,
        slug: item.slug,
        status: item.status,
        link: item.link,
        title: item.title?.raw || item.title?.rendered || item.slug,
      })),
    );
    if (batch.length < 50) break;
  }
  return items;
}

export async function getContent(client: ClientRow, kind: PostKind, id: number) {
  return wp(client, `/wp/v2/${kind}/${id}?context=edit&_fields=id,slug,status,link,title,acf`) as Promise<{
    id: number;
    slug: string;
    status: string;
    link: string;
    title: { raw?: string; rendered?: string };
    acf?: { content?: Record<string, unknown>[] };
  }>;
}

export async function saveContent(client: ClientRow, kind: PostKind, id: number, content: unknown) {
  return wp(client, `/wp/v2/${kind}/${id}`, {
    method: "POST",
    body: JSON.stringify({ acf: { content } }),
  });
}

export async function createContent(
  client: ClientRow,
  kind: PostKind,
  payload: Record<string, unknown>,
) {
  return wp(client, `/wp/v2/${kind}`, {
    method: "POST",
    body: JSON.stringify(payload),
  }) as Promise<{ id: number; link: string; status: string }>;
}

export async function uploadMedia(client: ClientRow, file: File, title: string, alt: string) {
  const bytes = Buffer.from(await file.arrayBuffer());
  const created = (await wp(client, "/wp/v2/media", {
    method: "POST",
    headers: {
      "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`,
      "Content-Type": file.type || "image/jpeg",
    },
    body: new Uint8Array(bytes),
  })) as { id: number };
  await wp(client, `/wp/v2/media/${created.id}`, {
    method: "POST",
    body: JSON.stringify({ title, alt_text: alt }),
  });
  return created.id;
}

export async function updateRankMath(
  client: ClientRow,
  id: number,
  meta: { rank_math_title?: string; rank_math_description?: string; rank_math_focus_keyword?: string },
) {
  await wp(client, "/rankmath/v1/updateMeta", {
    method: "POST",
    body: JSON.stringify({ objectType: "post", objectID: id, meta }),
  });
}

export async function readPublicSeo(link: string) {
  try {
    const response = await fetch(link, { cache: "no-store", headers: { "User-Agent": "WoelerCMS" } });
    if (!response.ok) return { title: "", description: "" };
    const html = await response.text();
    const title = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const description =
      html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ||
      html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)?.[1] ||
      "";
    return {
      title: decode(title).replace(/\s+-\s+[^-]+$/, "").trim(),
      description: decode(description).trim(),
    };
  } catch {
    return { title: "", description: "" };
  }
}

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
