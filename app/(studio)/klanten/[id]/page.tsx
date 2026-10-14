import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteClientAction, refreshCatalogAction } from "@/app/actions";
import { BlockPicker } from "@/components/block-picker";
import { BlockPreview } from "@/components/block-preview";
import { Credentials } from "@/components/credentials";
import { PromptBox } from "@/components/prompt-box";
import { SeoCard } from "@/components/seo-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { blocksOf, catalogFor, messagesFor, reportFor } from "@/lib/content";
import { canAccess, clientById } from "@/lib/db";
import type { ContentItem, PostKind } from "@/lib/types";
import { listContent, WpError } from "@/lib/wp";

const KINDS: { kind: PostKind; label: string }[] = [
  { kind: "pages", label: "Pagina's" },
  { kind: "cases", label: "Cases" },
  { kind: "posts", label: "Blogs" },
];

export default async function ClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; id?: string; fout?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  if (!canAccess(user, id)) notFound();
  const client = clientById(id);
  if (!client) notFound();

  let catalogError = "";
  let catalog: Awaited<ReturnType<typeof catalogFor>> = [];
  try {
    catalog = await catalogFor(client);
  } catch (error) {
    catalogError = error instanceof WpError ? error.message : "De blokken van deze site zijn niet opgehaald.";
  }

  const lists = await Promise.all(
    KINDS.map(async (item) => {
      try {
        return { ...item, items: await listContent(client, item.kind), error: "" };
      } catch (error) {
        return {
          ...item,
          items: [] as ContentItem[],
          error: error instanceof WpError ? error.message : "Niet geladen",
        };
      }
    }),
  );

  const kind: PostKind | null = query.type === "pages" || query.type === "cases" || query.type === "posts" ? query.type : null;
  const postId = Number(query.id || 0) || null;
  let pageError = "";
  let pageBlocks: ReturnType<typeof blocksOf> = [];
  let report = null as Awaited<ReturnType<typeof reportFor>> | null;
  let pageTitle = "";
  if (kind && postId) {
    try {
      report = await reportFor(client, catalog, kind, postId);
      const post = await (await import("@/lib/wp")).getContent(client, kind, postId);
      pageTitle = post.title?.raw || post.title?.rendered || "";
      pageBlocks = blocksOf(post.acf?.content, catalog);
    } catch (error) {
      pageError = error instanceof WpError ? error.message : "Deze pagina is niet geladen.";
    }
  }
  const messages = messagesFor(id);

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#f18500]">{client.site_url.replace(/^https?:\/\//, "")}</p>
          <h1 className="mt-1 text-3xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            {client.name}
          </h1>
        </div>
        <form action={refreshCatalogAction}>
          <input type="hidden" name="clientId" value={id} />
          <Button type="submit" variant="outline" className="h-10">
            Blokken verversen
          </Button>
        </form>
      </div>

      <ul className="grid gap-2 text-sm sm:grid-cols-3">
        <li className="rounded-2xl bg-white p-3 ring-1 ring-[#e4e4e4]">Alleen thema en ACF-velden</li>
        <li className="rounded-2xl bg-white p-3 ring-1 ring-[#e4e4e4]">Geen CSS</li>
        <li className="rounded-2xl bg-white p-3 ring-1 ring-[#e4e4e4]">Geen pagina, menu of site verwijderen</li>
      </ul>

      {user.role === "admin" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <Credentials clientId={id} />
          <form action={deleteClientAction} className="rounded-2xl bg-white p-4 ring-1 ring-[#e4e4e4]">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-[#585858]">
              Haalt de klant uit dit CMS. De website zelf blijft staan.
            </p>
            <div className="mt-3 flex gap-2">
              <input name="confirm" placeholder="typ weg" className="h-10 rounded-lg border border-[#e4e4e4] px-3 text-sm" />
              <Button type="submit" variant="outline" className="h-10">
                Uit het systeem halen
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-5">
          {lists.map((list) => (
            <div key={list.kind}>
              <h2 className="text-xs font-semibold tracking-wide text-[#585858]">{list.label}</h2>
              {list.error ? <p className="mt-1 text-xs text-[#d91515]">{list.error}</p> : null}
              <ul className="mt-2 space-y-1">
                {list.items.slice(0, 12).map((item) => {
                  const active = kind === list.kind && postId === item.id;
                  return (
                    <li key={item.id}>
                      <Link
                        href={`/klanten/${id}?type=${list.kind}&id=${item.id}`}
                        className={`block rounded-xl px-2 py-1.5 text-sm ${active ? "bg-[#fff4e6] text-[#633100]" : "hover:bg-white"}`}
                      >
                        {item.title}
                        {item.status === "draft" ? " · concept" : ""}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </aside>

        <div className="space-y-8">
          {catalogError ? <p className="text-sm text-[#d91515]">{catalogError}</p> : null}
          {pageError ? <p className="text-sm text-[#d91515]">{pageError}</p> : null}
          {report ? (
            <section className="space-y-3">
              <h2 className="text-2xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
                {pageTitle}
              </h2>
              <SeoCard report={report} />
              <div className="grid gap-3 sm:grid-cols-2">
                {pageBlocks.map((block) =>
                  block.def ? (
                    <BlockPreview key={block.index} block={block.def} heading={block.heading} text={block.text} />
                  ) : (
                    <p key={block.index} className="rounded-2xl bg-white p-4 text-sm ring-1 ring-[#e4e4e4]">
                      {block.label} staat op de pagina, maar niet in het huidige themaschema.
                    </p>
                  ),
                )}
              </div>
            </section>
          ) : (
            <p className="text-sm text-[#585858]">Kies links een pagina, case of blog. Dan zie je de H1, de H2&apos;s en de blokken die erop staan.</p>
          )}

          <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4]">
            <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
              Prompt
            </h2>
            <p className="mt-1 mb-3 text-sm text-[#585858]">
              {kind && postId ? "Deze prompt geldt voor de gekozen pagina." : "Zonder pagina kun je een case of blog starten."}
            </p>
            <PromptBox clientId={id} kind={kind} postId={postId} />
            <ol className="mt-4 max-h-80 space-y-3 overflow-auto">
              {messages.map((message) => (
                <li key={message.created_at + message.body.slice(0, 12)} className={message.role === "user" ? "text-sm" : "rounded-2xl bg-[#f8f7f6] p-3 text-sm"}>
                  <span className="mr-2 text-xs text-[#f18500]">{message.role === "user" ? "Jij" : "CMS"}</span>
                  {message.body}
                </li>
              ))}
            </ol>
          </section>

          <BlockPicker blocks={catalog} clientId={id} kind={kind} postId={postId} />
        </div>
      </div>
    </main>
  );
}
