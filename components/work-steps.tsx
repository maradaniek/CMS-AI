"use client";

import { useActionState } from "react";
import { resolveUrlAction, type UrlMatch } from "@/app/actions";
import { BlockPicker } from "@/components/block-picker";
import { PromptBox } from "@/components/prompt-box";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isFaqLayout } from "@/lib/demo";
import type { Task } from "@/lib/planner";
import type { BlockDef } from "@/lib/types";

const PANEL: Record<string, string> = {
  seo: "hidden group-has-[input[value=seo]:checked]:block",
  text: "hidden group-has-[input[value=text]:checked]:block",
  image: "hidden group-has-[input[value=image]:checked]:block",
  case: "hidden group-has-[input[value=case]:checked]:block",
  blog: "hidden group-has-[input[value=blog]:checked]:block",
  faq: "hidden group-has-[input[value=faq]:checked]:block",
};

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
  const hasPage = Boolean(match.kind && match.postId);
  return (
    <div className="group space-y-8">
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
              Dit is de site zelf. Voor SEO, tekst, een afbeelding, een FAQ of een nieuw blok plak je de URL van een pagina.
            </p>
          )}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((item) => {
            const disabled = item.needsPage && !hasPage;
            return (
              <label
                key={item.id}
                className={`rounded-2xl bg-white px-4 py-3 text-left text-sm text-[#061122] ring-1 ring-[#e4e4e4] has-[:checked]:bg-[#fff4e6] has-[:checked]:text-[#633100] has-[:checked]:ring-[#f18500] has-[:disabled]:opacity-40`}
              >
                <input type="radio" name="task" value={item.id} disabled={disabled} className="sr-only" />
                {item.label}
              </label>
            );
          })}
        </div>
      </section>

      <div className="hidden group-has-[input[value=block]:checked]:block">
        {hasPage ? <BlockPicker blocks={blocks} clientId={clientId} kind={match.kind} postId={match.postId} /> : null}
        <MessageList messages={messages} />
      </div>

      {ACTIONS.filter((item) => item.id !== "block").map((item) => (
        <section key={item.id} className={`rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6 ${PANEL[item.id]}`}>
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            3. Prompt
          </h2>
          <p className="mt-1 mb-3 text-sm text-[#585858]">
            {item.id === "faq"
              ? "Het thema heeft drie FAQ-blokken: faq, faqsimple en faqextensive. Plak hier een lijst vragen voor de URL hierboven."
              : `De prompt geldt voor ${item.label.toLowerCase()}.`}
          </p>
          <PromptBox
            clientId={clientId}
            kind={match.kind}
            postId={match.postId}
            task={item.id}
            placeholder={item.hint}
            showImage={item.image}
            faqLayouts={item.id === "faq" ? blocks.filter((block) => isFaqLayout(block.layout)) : []}
          />
          <MessageList messages={messages} />
        </section>
      ))}
    </div>
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
