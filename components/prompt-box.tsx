"use client";

import { useActionState } from "react";
import { promptAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Task } from "@/lib/planner";
import type { PostKind } from "@/lib/types";

export function PromptBox({
  clientId,
  kind,
  postId,
  task,
  placeholder,
  showImage,
}: {
  clientId: string;
  kind: PostKind | null;
  postId: number | null;
  task: Task;
  placeholder: string;
  showImage: boolean;
}) {
  const [state, action, pending] = useActionState(promptAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <input type="hidden" name="kind" value={kind ?? ""} />
      <input type="hidden" name="postId" value={postId ?? ""} />
      <input type="hidden" name="task" value={task} />
      <Textarea name="prompt" required placeholder={placeholder} className="min-h-28 bg-white" />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {showImage ? (
          <label className="text-sm text-[#585858]">
            Afbeelding
            <input name="image" type="file" accept="image/*" required={task === "image"} className="mt-1 block text-sm" />
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending} className="h-10 px-4">
          {pending ? "Bezig…" : "Uitvoeren"}
        </Button>
      </div>
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
    </form>
  );
}
