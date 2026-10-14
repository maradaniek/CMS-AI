"use client";

import { useActionState } from "react";
import { assignClientsAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function AssignmentForm({
  userId,
  role,
  clients,
  assigned,
}: {
  userId: string;
  role: "marketeer" | "klant";
  clients: { id: string; name: string }[];
  assigned: string[];
}) {
  const [state, action, pending] = useActionState(assignClientsAction, null);
  const single = role === "klant";
  return (
    <form action={action} className="mt-3 space-y-2">
      <input type="hidden" name="userId" value={userId} />
      <p className="text-xs text-[#585858]">{single ? "Eigen site" : "Klanten in beheer"}</p>
      {clients.length === 0 ? <p className="text-sm text-[#585858]">Nog geen klanten om te koppelen.</p> : null}
      {single ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="clients" value="" defaultChecked={assigned.length === 0} />
          Geen site
        </label>
      ) : null}
      {clients.map((client) => (
        <label key={client.id} className="flex items-center gap-2 text-sm">
          <input
            type={single ? "radio" : "checkbox"}
            name="clients"
            value={client.id}
            defaultChecked={assigned.includes(client.id)}
          />
          {client.name}
        </label>
      ))}
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
      {state && state.error === "" ? <p className="text-sm text-[#1d6b24]">Opgeslagen.</p> : null}
      <Button type="submit" disabled={pending} variant="outline" className="h-9">
        {pending ? "Bezig…" : "Opslaan"}
      </Button>
    </form>
  );
}
