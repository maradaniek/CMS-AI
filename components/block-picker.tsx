"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { addBlockAction } from "@/app/actions";
import { BlockPreview } from "@/components/block-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { BlockDef, PostKind } from "@/lib/types";

export function BlockPicker({
  blocks,
  clientId,
  kind,
  postId,
}: {
  blocks: BlockDef[];
  clientId: string;
  kind: PostKind | null;
  postId: number | null;
}) {
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<string | null>(null);
  const [state, action, pending] = useActionState(addBlockAction, null);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return blocks;
    return blocks.filter((block) => `${block.label} ${block.layout}`.toLowerCase().includes(needle));
  }, [blocks, query]);
  const selected = blocks.find((block) => block.layout === layout) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-heading text-2xl text-[#061122]">3. Kies het blok</h2>
          <p className="mt-1 max-w-xl text-sm text-[#585858]">
            {blocks.length} blokken uit het thema. De oranje naam is de themanaam, zoals hero of image_text.
          </p>
        </div>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Zoek op naam, bijvoorbeeld hero"
          className="h-10 sm:max-w-xs"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((block) => (
          <button
            key={block.layout}
            type="button"
            onClick={() => setLayout(block.layout)}
            className="text-left"
          >
            <BlockPreview block={block} active={block.layout === layout} />
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-[#585858]">Geen blok met die naam. Zoek op de themanaam, zoals hero of image_text.</p>
      ) : null}
      {selected ? (
        <form action={action} className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-[#e4e4e4]">
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="layout" value={selected.layout} />
          <input type="hidden" name="kind" value={kind ?? ""} />
          <input type="hidden" name="postId" value={postId ?? ""} />
          <p className="text-sm text-[#061122]">
            Gekozen: {selected.label}. Ik herken dit blok als <span className="font-medium text-[#f18500]">{selected.layout}</span>.
            Vul daarna de prompt voor dit blok.
          </p>
          {selected.slots.heading ? (
            <Input name="heading" placeholder="Kop" className="h-10" />
          ) : (
            <input type="hidden" name="heading" value="" />
          )}
          {selected.slots.text || selected.slots.quote ? (
            <Textarea name="text" placeholder={selected.slots.quote ? "Citaat" : "Tekst"} className="min-h-24" />
          ) : (
            <input type="hidden" name="text" value="" />
          )}
          {selected.slots.image ? (
            <Input name="image" type="file" accept="image/*" className="h-10" />
          ) : null}
          {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
          {state && "notice" in state && state.notice ? (
            <p className="whitespace-pre-wrap text-sm text-[#061122]">{state.notice}</p>
          ) : null}
          <Button type="submit" disabled={pending || !kind || !postId} className="h-10 px-4">
            {pending ? "Bezig…" : kind && postId ? `${selected.label} toevoegen` : "Kies eerst een pagina"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
