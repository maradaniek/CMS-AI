"use client";

import { useActionState } from "react";
import { promptAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { PostKind } from "@/lib/types";

export function PromptBox({
  clientId,
  kind,
  postId,
}: {
  clientId: string;
  kind: PostKind | null;
  postId: number | null;
}) {
  const [state, action, pending] = useActionState(promptAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="kind" value={kind ?? ""} />
      <input type="hidden" name="postId" value={postId ?? ""} />
      <Textarea
        name="prompt"
        required
        placeholder="Bijvoorbeeld: Zet de hero-kop op Meer aanvragen. Of: Check de SEO, zoekwoord warmtepomp."
        className="min-h-28 bg-white"
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="text-sm text-[#585858]">
          Afbeelding
          <input name="image" type="file" accept="image/*" className="mt-1 block text-sm" />
        </label>
        <Button type="submit" disabled={pending} className="h-10 px-4">
          {pending ? "Bezig…" : "Uitvoeren"}
        </Button>
      </div>
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
    </form>
  );
}
