"use client";

import { useActionState, useState } from "react";
import { resolveUrlAction, type UrlMatch } from "@/app/actions";
import { BlockPicker } from "@/components/block-picker";
import { PromptBox } from "@/components/prompt-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Task } from "@/lib/planner";
import type { BlockDef } from "@/lib/types";

const ACTIONS: { id: Task; label: string; needsPage: boolean; hint: string; image: boolean }[] = [
  { id: "seo", label: "SEO aanpassen", needsPage: true, image: false, hint: "SEO-titel: …. Meta-omschrijving: …. Focuswoord: …." },
  { id: "text", label: "Tekst wijzigen", needsPage: true, image: false, hint: "Zet de hero-kop op …. Tekst: …." },
  { id: "image", label: "Afbeelding wijzigen", needsPage: true, image: true, hint: "Vervang de afbeelding in de hero." },
  { id: "case", label: "Case toevoegen", needsPage: false, image: true, hint: "Titel: …. Tekst: …. Cijfers: 120% meer leads." },
  { id: "blog", label: "Blog toevoegen", needsPage: false, image: true, hint: "Titel: …. Tekst: …." },
  { id: "block", label: "Nieuw blok toevoegen", needsPage: true, image: false, hint: "" },
];

export function WorkSteps({
  clientId,
  blocks,
  messages,
}: {
  clientId: string;
  blocks: BlockDef[];
  messages: { role: string; body: string; created_at: number }[];
}) {
  const [state, action, pending] = useActionState(resolveUrlAction, null);
  const match = state?.match ?? null;
  return (
    <div className="space-y-8">
      <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
        <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
          1. URL
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
      {match ? <AfterUrl key={`${match.link}:${match.postId ?? ""}`} clientId={clientId} match={match} blocks={blocks} messages={messages} /> : null}
    </div>
  );
}

function AfterUrl({
  clientId,
  match,
  blocks,
  messages,
}: {
  clientId: string;
  match: UrlMatch;
  blocks: BlockDef[];
  messages: { role: string; body: string; created_at: number }[];
}) {
  const [task, setTask] = useState<Task | null>(null);
  const chosen = ACTIONS.find((item) => item.id === task) ?? null;
  const hasPage = Boolean(match.kind && match.postId);
  return (
    <>
      <section className="space-y-4">
        <div>
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            2. Wat wil je doen?
          </h2>
          <p className="mt-1 text-sm text-[#585858]">
            Gevonden: {match.title}
            {match.link ? ` · ${match.link.replace(/^https?:\/\//, "")}` : ""}
          </p>
          {hasPage ? null : (
            <p className="mt-1 text-sm text-[#585858]">
              Dit is de site zelf. Voor SEO, tekst, een afbeelding of een nieuw blok plak je de URL van een pagina.
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((item) => {
            const disabled = item.needsPage && !hasPage;
            const on = task === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={disabled}
                onClick={() => setTask(item.id)}
                className={`rounded-2xl px-4 py-3 text-left text-sm ring-1 ${on ? "bg-[#fff4e6] text-[#633100] ring-[#f18500]" : "bg-white text-[#061122] ring-[#e4e4e4]"} disabled:opacity-40`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {chosen?.id === "block" && hasPage ? (
        <BlockPicker blocks={blocks} clientId={clientId} kind={match.kind} postId={match.postId} />
      ) : null}

      {chosen && chosen.id !== "block" ? (
        <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            3. Prompt
          </h2>
          <p className="mt-1 mb-3 text-sm text-[#585858]">De prompt geldt voor {chosen.label.toLowerCase()}.</p>
          <PromptBox
            clientId={clientId}
            kind={match.kind}
            postId={match.postId}
            task={chosen.id}
            placeholder={chosen.hint}
            showImage={chosen.image}
          />
          <MessageList messages={messages} />
        </section>
      ) : null}

      {chosen?.id === "block" ? <MessageList messages={messages} /> : null}
    </>
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
