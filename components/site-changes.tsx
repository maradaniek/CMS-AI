"use client";

import { useActionState, useEffect, useState, type ReactNode } from "react";
import {
  addSharedBlockAction,
  bulkAction,
  createDraftAction,
  faqAction,
  inspectPageAction,
  replaceImageAction,
  replaceTextAction,
  seoFieldsAction,
} from "@/app/actions";
import { BlockPicker } from "@/components/block-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isFaqLayout } from "@/lib/demo";
import { snippetBlockReason } from "@/lib/place";
import type { BlockDef, PostKind } from "@/lib/types";

type TaskId = "blog" | "case" | "faq" | "seo" | "block" | "image" | "text";

const TASKS: { id: TaskId; label: string }[] = [
  { id: "blog", label: "Blog toevoegen" },
  { id: "case", label: "Case toevoegen" },
  { id: "faq", label: "FAQ toevoegen" },
  { id: "seo", label: "SEO aanpassen" },
  { id: "block", label: "Nieuw blok toevoegen" },
  { id: "image", label: "Afbeelding wijzigen" },
  { id: "text", label: "Tekst wijzigen" },
];

type Outline = {
  index: number;
  layout: string;
  label: string;
  preview: string;
  hasImage: boolean;
  hasText: boolean;
  shared: boolean;
};

type PageHit = {
  error: string;
  title: string;
  link: string;
  kind: PostKind | null;
  postId: number | null;
  blocks: Outline[];
};

function Choice({
  selected,
  onPick,
  title,
  text,
}: {
  selected: boolean;
  onPick: () => void;
  title: string;
  text?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={`rounded-2xl px-4 py-3 text-left text-sm ring-1 ${
        selected ? "bg-[#fff4e6] text-[#633100] ring-[#f18500]" : "bg-white text-[#061122] ring-[#e4e4e4]"
      }`}
    >
      <span className={`block ${text ? "font-medium" : ""}`}>{title}</span>
      {text ? <span className="mt-1 block text-[#585858]">{text}</span> : null}
    </button>
  );
}

function Notice({ state }: { state: { error?: string; notice?: string } | null }) {
  if (!state?.error && !state?.notice) return null;
  return (
    <div className="space-y-2">
      {state.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
      {state.notice ? <p className="whitespace-pre-wrap text-sm text-[#061122]">{state.notice}</p> : null}
    </div>
  );
}

function PageGate({ clientId, children }: { clientId: string; children: (page: PageHit) => ReactNode }) {
  const [state, action, pending] = useActionState(inspectPageAction, null);
  const ready = Boolean(state && !state.error && state.postId && state.kind);
  return (
    <div className="space-y-4">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="clientId" value={clientId} />
        <Input name="url" required placeholder="https://klant.nl/pagina" className="h-10" />
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? "Zoeken…" : "Pagina ophalen"}
        </Button>
      </form>
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
      {ready && state ? (
        <div className="space-y-4">
          <p className="text-sm text-[#585858]">
            Gevonden: {state.title}
            {state.link ? ` · ${state.link.replace(/^https?:\/\//, "")}` : ""}
          </p>
          {children(state)}
        </div>
      ) : null}
    </div>
  );
}

function DraftForm({ clientId, task }: { clientId: string; task: "blog" | "case" }) {
  const [state, action, pending] = useActionState(createDraftAction, null);
  const blog = task === "blog";
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="task" value={task} />
      <p className="text-sm text-[#585858]">
        {blog
          ? "Een blog is een nieuw bericht. Daar is geen pagina-URL voor nodig. Hij komt als concept klaar."
          : "Een case is een nieuw bericht. Daar is geen pagina-URL voor nodig. Hij komt als concept klaar."}
      </p>
      <Input name="title" required placeholder="Titel" className="h-10" />
      <Textarea name="text" placeholder="Tekst" className="min-h-28" />
      {blog ? null : <Input name="stats" placeholder="Cijfers, bijvoorbeeld 120% meer leads" className="h-10" />}
      <label className="block text-sm text-[#585858]">
        Afbeelding, mag leeg
        <input name="image" type="file" accept="image/*" className="mt-1 block text-sm" />
      </label>
      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? "Bezig…" : blog ? "Blog als concept" : "Case als concept"}
      </Button>
      <Notice state={state} />
    </form>
  );
}

function FaqFields({ layouts }: { layouts: BlockDef[] }) {
  const [rows, setRows] = useState([{ question: "", answer: "" }]);
  const choices = layouts.filter((block) => isFaqLayout(block.layout));
  return (
    <div className="space-y-3">
      <Input name="heading" placeholder="Kop, bijvoorbeeld Veelgestelde vragen" className="h-10" />
      {choices.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-sm text-[#585858]">Welk FAQ-blok</legend>
          {choices.map((item, index) => (
            <label key={item.layout} className="flex items-center gap-2 text-sm text-[#061122]">
              <input type="radio" name="faqLayout" value={item.layout} defaultChecked={index === 0} />
              {item.label}
              <span className="text-[#f18500]">{item.layout}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <input type="hidden" name="faqLayout" value="faqsimple" />
      )}
      <div className="space-y-3">
        {rows.map((row, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-2">
            <Input
              name="question"
              value={row.question}
              placeholder="Vraag"
              className="h-10"
              onChange={(event) =>
                setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, question: event.target.value } : item)))
              }
            />
            <Textarea
              name="answer"
              value={row.answer}
              placeholder="Antwoord"
              className="min-h-20"
              onChange={(event) =>
                setRows((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, answer: event.target.value } : item)))
              }
            />
          </div>
        ))}
      </div>
      <Button type="button" variant="outline" className="h-9" onClick={() => setRows((current) => [...current, { question: "", answer: "" }])}>
        Nog een vraag
      </Button>
    </div>
  );
}

function FaqForm({ clientId, blocks }: { clientId: string; blocks: BlockDef[] }) {
  const [many, setMany] = useState<"" | "yes" | "no">("");
  const [state, action, pending] = useActionState(faqAction, null);
  const [page, setPage] = useState<PageHit | null>(null);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[#585858]">Dezelfde FAQ’s op meerdere pagina’s?</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice selected={many === "yes"} onPick={() => setMany("yes")} title="Ja, meerdere pagina’s" text="Eén snippet, dezelfde vragen op elke URL." />
        <Choice selected={many === "no"} onPick={() => setMany("no")} title="Nee, één pagina" text="De FAQ komt direct op die pagina, zonder snippet." />
      </div>
      {many === "yes" ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="many" value="yes" />
          <p className="text-sm text-[#585858]">
            Plak de URL’s onder elkaar. Ik maak één snippet en zet die onderaan elke pagina, vlak boven de footer.
          </p>
          <Textarea name="urls" required placeholder={"https://klant.nl/warmtepompen\nhttps://klant.nl/service"} className="min-h-28" />
          <FaqFields layouts={blocks} />
          <Button type="submit" disabled={pending} className="h-10 px-4">
            {pending ? "Bezig…" : "FAQ toevoegen"}
          </Button>
          <Notice state={state} />
        </form>
      ) : null}
      {many === "no" ? (
        <div className="space-y-3">
          <PageLookup clientId={clientId} onPage={setPage} />
          {page ? (
            <form action={action} className="space-y-3">
              <input type="hidden" name="clientId" value={clientId} />
              <input type="hidden" name="many" value="no" />
              <input type="hidden" name="kind" value={page.kind ?? ""} />
              <input type="hidden" name="postId" value={page.postId ?? ""} />
              <FaqFields layouts={blocks} />
              <Button type="submit" disabled={pending} className="h-10 px-4">
                {pending ? "Bezig…" : "FAQ toevoegen"}
              </Button>
              <Notice state={state} />
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PageLookup({ clientId, onPage }: { clientId: string; onPage: (page: PageHit) => void }) {
  const [state, action, pending] = useActionState(inspectPageAction, null);
  useEffect(() => {
    if (state && !state.error && state.postId && state.kind) onPage(state);
  }, [state, onPage]);
  return (
    <div className="space-y-2">
      <form action={action} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="clientId" value={clientId} />
        <Input name="url" required placeholder="https://klant.nl/pagina" className="h-10" />
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? "Zoeken…" : "Pagina ophalen"}
        </Button>
      </form>
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
      {state && !state.error && state.title ? <p className="text-sm text-[#585858]">Gevonden: {state.title}</p> : null}
    </div>
  );
}

function SeoForm({ clientId }: { clientId: string }) {
  const [scope, setScope] = useState<"" | "bulk" | "page">("");
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice selected={scope === "bulk"} onPick={() => setScope("bulk")} title="In bulk" text="Dezelfde woorden op alle pagina’s vervangen." />
        <Choice selected={scope === "page"} onPick={() => setScope("page")} title="1 pagina" text="SEO-titel, meta-omschrijving en focuswoord van één URL." />
      </div>
      {scope === "bulk" ? <SeoBulk clientId={clientId} /> : null}
      {scope === "page" ? (
        <PageGate clientId={clientId}>
          {(page) => <SeoPage clientId={clientId} page={page} />}
        </PageGate>
      ) : null}
    </div>
  );
}

function SeoBulk({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(bulkAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="task" value="seo" />
      <p className="text-sm text-[#585858]">
        Dit vervangt een zin in de tekst van de pagina’s. De SEO-titel en meta-omschrijving zelf zet je per pagina.
      </p>
      <Textarea name="prompt" required placeholder="Vervang gratis kennismaking door adviesgesprek." className="min-h-24" />
      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? "Bezig…" : "Op alle pagina’s"}
      </Button>
      <Notice state={state} />
    </form>
  );
}

function SeoPage({ clientId, page }: { clientId: string; page: PageHit }) {
  const [state, action, pending] = useActionState(seoFieldsAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="kind" value={page.kind ?? ""} />
      <input type="hidden" name="postId" value={page.postId ?? ""} />
      <Input name="seoTitle" placeholder="SEO-titel" className="h-10" />
      <Textarea name="description" placeholder="Meta-omschrijving" className="min-h-24" />
      <Input name="keyword" placeholder="Focuswoord" className="h-10" />
      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? "Bezig…" : "SEO opslaan"}
      </Button>
      <Notice state={state} />
    </form>
  );
}

function BlockForm({ clientId, blocks }: { clientId: string; blocks: BlockDef[] }) {
  const [scope, setScope] = useState<"" | "bulk" | "page">("");
  const shareable = blocks.filter((block) => !snippetBlockReason(block.layout));
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <Choice
          selected={scope === "bulk"}
          onPick={() => setScope("bulk")}
          title="In bulk"
          text="Eén snippet, meteen onder de hero of meteen boven de footer."
        />
        <Choice selected={scope === "page"} onPick={() => setScope("page")} title="1 pagina" text="Zelf de plek kiezen, op deze URL." />
      </div>
      {scope === "bulk" ? (
        <div className="space-y-3">
          <p className="text-sm text-[#585858]">
            In bulk maak ik van het blok één snippet en zet die op elke gepubliceerde pagina. Dat kan voor een gewoon
            inhoudsblok, zoals tekst, voordelen of een citaat. Een hero niet: die is zelf de plek. Een snippet kan niet
            nog een snippet worden. Een overzicht van blogs of cases kan wel, maar toont dan overal dezelfde lijst. Wil
            je de plek per pagina bepalen, doe het dan per URL.
          </p>
          <BlockPicker
            blocks={shareable}
            clientId={clientId}
            kind={null}
            postId={null}
            requirePage={false}
            submitAction={addSharedBlockAction}
            title="Kies het blok voor de snippet"
            intro="Alleen blokken die als snippet op elke pagina kunnen."
            placeOptions={[
              { value: "under-hero", label: "Meteen onder de hero" },
              { value: "above-footer", label: "Meteen boven de footer" },
            ]}
          />
        </div>
      ) : null}
      {scope === "page" ? (
        <PageGate clientId={clientId}>
          {(page) => (
            <BlockPicker
              blocks={blocks}
              clientId={clientId}
              kind={page.kind}
              postId={page.postId}
              title="Kies het blok"
              intro="Dit blok komt alleen op deze pagina, niet als snippet."
              placeOptions={placeOptions(page.blocks)}
            />
          )}
        </PageGate>
      ) : null}
    </div>
  );
}

function placeOptions(blocks: Outline[]) {
  const options = [
    { value: "under-hero", label: "Meteen onder de hero" },
    { value: "above-footer", label: "Meteen boven de footer" },
  ];
  for (const block of blocks) {
    const preview = block.preview ? ` — ${block.preview}` : "";
    options.push({ value: `after:${block.index}`, label: `Na blok ${block.index + 1} · ${block.label}${preview}` });
  }
  return options;
}

function BlockList({
  blocks,
  mode,
  index,
  onPick,
}: {
  blocks: Outline[];
  mode: "image" | "text";
  index: number | null;
  onPick: (index: number) => void;
}) {
  if (!blocks.length) return <p className="text-sm text-[#585858]">Op deze pagina staan geen blokken.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-[#585858]">
        Je hoeft de themanaam niet te kennen. Kies het blok op het nummer, de gewone naam en de kop of de eerste zin.
      </p>
      {blocks.map((block) => {
        const reason = block.shared
          ? "Dit is een snippet. Tekst en beeld staan niet op deze pagina alleen."
          : mode === "image" && !block.hasImage
            ? "Dit blok heeft geen afbeelding."
            : mode === "text" && !block.hasText
              ? "Dit blok heeft geen tekst."
              : "";
        return (
          <button
            key={`${block.index}-${block.layout}`}
            type="button"
            disabled={Boolean(reason)}
            onClick={() => onPick(block.index)}
            className={`block w-full rounded-2xl px-4 py-3 text-left text-sm ring-1 disabled:opacity-50 ${
              index === block.index ? "bg-[#fff4e6] ring-[#f18500]" : "bg-white ring-[#e4e4e4]"
            }`}
          >
            <span className="font-medium text-[#061122]">
              {block.index + 1}. {block.label}
            </span>
            {block.preview ? <span className="mt-1 block text-[#585858]">{block.preview}</span> : null}
            {reason ? <span className="mt-1 block text-[#585858]">{reason}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

function TextForm({ clientId }: { clientId: string }) {
  return (
    <PageGate clientId={clientId}>
      {(page) => <TextOnPage clientId={clientId} page={page} />}
    </PageGate>
  );
}

function TextOnPage({ clientId, page }: { clientId: string; page: PageHit }) {
  const [index, setIndex] = useState<number | null>(null);
  const [state, action, pending] = useActionState(replaceTextAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="kind" value={page.kind ?? ""} />
      <input type="hidden" name="postId" value={page.postId ?? ""} />
      <input type="hidden" name="index" value={index ?? ""} />
      <BlockList blocks={page.blocks} mode="text" index={index} onPick={setIndex} />
      <Textarea name="from" required placeholder="Oude alinea of oude zin, zoals die op de pagina staat" className="min-h-24" />
      <Textarea name="to" required placeholder="Nieuwe zin" className="min-h-24" />
      <Button type="submit" disabled={pending || index === null} className="h-10 px-4">
        {pending ? "Bezig…" : "Tekst vervangen"}
      </Button>
      <Notice state={state} />
    </form>
  );
}

function ImageForm({ clientId }: { clientId: string }) {
  return (
    <PageGate clientId={clientId}>
      {(page) => <ImageOnPage clientId={clientId} page={page} />}
    </PageGate>
  );
}

function ImageOnPage({ clientId, page }: { clientId: string; page: PageHit }) {
  const [index, setIndex] = useState<number | null>(null);
  const [state, action, pending] = useActionState(replaceImageAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="kind" value={page.kind ?? ""} />
      <input type="hidden" name="postId" value={page.postId ?? ""} />
      <input type="hidden" name="index" value={index ?? ""} />
      <BlockList blocks={page.blocks} mode="image" index={index} onPick={setIndex} />
      <label className="block text-sm text-[#585858]">
        Nieuwe afbeelding
        <input name="image" type="file" accept="image/*" required className="mt-1 block text-sm" />
      </label>
      <Button type="submit" disabled={pending || index === null} className="h-10 px-4">
        {pending ? "Bezig…" : "Afbeelding vervangen"}
      </Button>
      <Notice state={state} />
    </form>
  );
}

export function SiteChanges({ clientId, blocks }: { clientId: string; blocks: BlockDef[] }) {
  const [task, setTask] = useState<TaskId | "">("");
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {TASKS.map((item) => (
          <Choice key={item.id} selected={task === item.id} onPick={() => setTask(item.id)} title={item.label} />
        ))}
      </div>
      {task === "blog" || task === "case" ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <DraftForm clientId={clientId} task={task} />
        </section>
      ) : null}
      {task === "faq" ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <FaqForm clientId={clientId} blocks={blocks} />
        </section>
      ) : null}
      {task === "seo" ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <SeoForm clientId={clientId} />
        </section>
      ) : null}
      {task === "block" ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <BlockForm clientId={clientId} blocks={blocks} />
        </section>
      ) : null}
      {task === "image" ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <ImageForm clientId={clientId} />
        </section>
      ) : null}
      {task === "text" ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <TextForm clientId={clientId} />
        </section>
      ) : null}
    </div>
  );
}
