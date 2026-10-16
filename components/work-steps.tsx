"use client";

import { useActionState, useState } from "react";
import { bulkAction, resolveUrlAction, type UrlMatch } from "@/app/actions";
import { BlockPicker } from "@/components/block-picker";
import { PromptBox } from "@/components/prompt-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { isFaqLayout } from "@/lib/demo";
import type { Task } from "@/lib/planner";
import type { BlockDef } from "@/lib/types";

function remember(name: string, value: string) {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=2592000; SameSite=Lax`;
}

function Choice({
  selected,
  disabled,
  onPick,
  title,
  text,
}: {
  selected: boolean;
  disabled?: boolean;
  onPick: () => void;
  title: string;
  text?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={`rounded-2xl px-4 py-3 text-left text-sm ring-1 disabled:opacity-40 ${
        selected ? "bg-[#fff4e6] text-[#633100] ring-[#f18500]" : "bg-white text-[#061122] ring-[#e4e4e4]"
      }`}
    >
      <span className={`block ${text ? "font-medium" : ""}`}>{title}</span>
      {text ? <span className="mt-1 block text-[#585858]">{text}</span> : null}
    </button>
  );
}

const ACTIONS: { id: Task; label: string; needsPage: boolean; hint: string; image: boolean }[] = [
  { id: "seo", label: "SEO aanpassen", needsPage: true, image: false, hint: "SEO-titel: …. Meta-omschrijving: …. Focuswoord: …." },
  { id: "text", label: "Tekst wijzigen", needsPage: true, image: false, hint: "Zet de hero-kop op …. Tekst: …." },
  { id: "image", label: "Afbeelding wijzigen", needsPage: true, image: true, hint: "Vervang de afbeelding in de hero." },
  { id: "case", label: "Case toevoegen", needsPage: false, image: true, hint: "Titel: …. Tekst: …. Cijfers: 120% meer leads." },
  { id: "blog", label: "Blog toevoegen", needsPage: false, image: true, hint: "Titel: …. Tekst: …." },
  { id: "faq", label: "FAQ toevoegen", needsPage: true, image: false, hint: "Vraag: …\nAntwoord: …\n\nVraag: …\nAntwoord: …" },
  { id: "block", label: "Nieuw blok toevoegen", needsPage: true, image: false, hint: "" },
];

export function WorkSteps({
  clientId,
  blocks,
  messages,
  initialScope = "",
  initialBulk = "",
  initialTask = "",
}: {
  clientId: string;
  blocks: BlockDef[];
  messages: { role: string; body: string; created_at: number }[];
  initialScope?: "" | "site" | "page";
  initialBulk?: string;
  initialTask?: string;
}) {
  const [state, action, pending] = useActionState(resolveUrlAction, null);
  const [scope, setScope] = useState(initialScope);
  const match = state?.match ?? null;
  function pickScope(next: "site" | "page") {
    setScope(next);
    remember(`waas_scope_${clientId}`, next);
  }
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
          1. Wat wil je aanpassen?
        </h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice
            selected={scope === "site"}
            onPick={() => pickScope("site")}
            title="Bulk, de hele site"
            text="Dezelfde wijziging op alle gepubliceerde pagina’s, blogs en cases."
          />
          <Choice
            selected={scope === "page"}
            onPick={() => pickScope("page")}
            title="Eén pagina"
            text="Eerst de URL, daarna wat er op die pagina moet gebeuren."
          />
        </div>
      </section>

      <div className={scope === "page" ? "space-y-8" : "hidden"}>
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            2. URL
          </h2>
          <p className="mt-1 text-sm text-[#585858]">Plak de URL van de pagina op deze site.</p>
          <form action={action} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input type="hidden" name="clientId" value={clientId} />
            <Input name="url" required placeholder="https://klant.nl/pagina" className="h-10" />
            <Button type="submit" disabled={pending} className="h-10">
              {pending ? "Zoeken…" : "Volgende"}
            </Button>
          </form>
          {state?.error ? <p className="mt-3 text-sm text-[#d91515]">{state.error}</p> : null}
        </section>
        {match ? (
          <AfterUrl
            key={`${match.link}:${match.postId ?? ""}`}
            clientId={clientId}
            match={match}
            blocks={blocks}
            messages={messages}
            initialTask={initialTask}
          />
        ) : null}
      </div>
      <BulkSite clientId={clientId} initialBulk={initialBulk} open={scope === "site"} />
    </div>
  );
}

function AfterUrl({
  clientId,
  match,
  blocks,
  messages,
  initialTask,
}: {
  clientId: string;
  match: UrlMatch;
  blocks: BlockDef[];
  messages: { role: string; body: string; created_at: number }[];
  initialTask: string;
}) {
  const hasPage = Boolean(match.kind && match.postId);
  const [task, setTask] = useState(initialTask);
  function pickTask(next: string) {
    setTask(next);
    remember(`waas_task_${clientId}`, next);
  }
  const current = ACTIONS.find((item) => item.id === task);
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            3. Wat wil je doen?
          </h2>
          <p className="mt-1 text-sm text-[#585858]">
            Gevonden: {match.title}
            {match.link ? ` · ${match.link.replace(/^https?:\/\//, "")}` : ""}
          </p>
          {hasPage ? null : (
            <p className="mt-1 text-sm text-[#585858]">
              Dit is de site zelf. Voor SEO, tekst, een afbeelding, een FAQ of een nieuw blok plak je de URL van een pagina.
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((item) => {
            const disabled = item.needsPage && !hasPage;
            return (
              <Choice
                key={item.id}
                selected={task === item.id}
                disabled={disabled}
                onPick={() => pickTask(item.id)}
                title={item.label}
              />
            );
          })}
        </div>
      </section>

      {task === "block" && hasPage ? (
        <div>
          <BlockPicker blocks={blocks} clientId={clientId} kind={match.kind} postId={match.postId} />
          <MessageList messages={messages} />
        </div>
      ) : null}

      {current && current.id !== "block" ? (
        <section key={current.id} className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            4. Prompt
          </h2>
          <p className="mt-1 mb-3 text-sm text-[#585858]">
            {current.id === "faq"
              ? "Het thema heeft drie FAQ-blokken: faq, faqsimple en faqextensive. Plak hier een lijst vragen voor de URL hierboven."
              : `De prompt geldt voor ${current.label.toLowerCase()}.`}
          </p>
          <PromptBox
            clientId={clientId}
            kind={match.kind}
            postId={match.postId}
            task={current.id}
            placeholder={current.hint}
            showImage={current.image}
            faqLayouts={current.id === "faq" ? blocks.filter((block) => isFaqLayout(block.layout)) : []}
          />
          <MessageList messages={messages} />
        </section>
      ) : null}
    </div>
  );
}

const BULK = [
  { id: "text", label: "Tekst wijzigen", hint: "Vervang gratis kennismaking door adviesgesprek." },
  { id: "seo", label: "SEO aanpassen", hint: "Vervang het oude woord door het nieuwe." },
  { id: "style", label: "Aanspreekvorm", hint: "Zet de hele site op u. Of: Zet de hele site op je." },
] as const;

function BulkSite({ clientId, initialBulk, open }: { clientId: string; initialBulk: string; open: boolean }) {
  const [task, setTask] = useState(initialBulk);
  function pick(next: string) {
    setTask(next);
    remember(`waas_bulk_${clientId}`, next);
  }
  const current = BULK.find((item) => item.id === task);
  return (
    <div className={open ? "space-y-8" : "hidden"}>
      <section className="space-y-4">
        <h3 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
          2. Wat wil je doen?
        </h3>
        <div className="grid gap-2 sm:grid-cols-3">
          {BULK.map((item) => (
            <Choice key={item.id} selected={task === item.id} onPick={() => pick(item.id)} title={item.label} />
          ))}
        </div>
      </section>
      {current ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <h3 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            3. Prompt
          </h3>
          <p className="mt-1 mb-3 text-sm text-[#585858]">Dit geldt voor de hele site.</p>
          <BulkPrompt key={current.id} clientId={clientId} task={current.id} placeholder={current.hint} />
        </section>
      ) : null}
    </div>
  );
}

function BulkPrompt({ clientId, task, placeholder }: { clientId: string; task: string; placeholder: string }) {
  const [state, action, pending] = useActionState(bulkAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="task" value={task} />
      <Textarea name="prompt" required placeholder={placeholder} className="min-h-28 bg-white" />
      <Button type="submit" disabled={pending} className="h-10 px-4">
        {pending ? "Bezig…" : "Uitvoeren"}
      </Button>
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
      {state?.notice ? <p className="whitespace-pre-wrap text-sm text-[#061122]">{state.notice}</p> : null}
    </form>
  );
}

function MessageList({ messages }: { messages: { role: string; body: string; created_at: number }[] }) {
  if (!messages.length) return null;
  return (
    <ol className="mt-4 max-h-80 space-y-3 overflow-auto">
      {messages.map((message) => (
        <li key={message.created_at + message.body.slice(0, 12)} className={message.role === "user" ? "text-sm" : "rounded-2xl bg-[#f8f7f6] p-3 text-sm"}>
          <span className="mr-2 text-xs text-[#f18500]">{message.role === "user" ? "Jij" : "CMS"}</span>
          {message.body}
        </li>
      ))}
    </ol>
  );
}
