"use client";

import { useActionState } from "react";
import { createUserAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function UserForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState(createUserAction, null);
  return (
    <form action={action} className="space-y-4 rounded-3xl bg-white p-6 ring-1 ring-[#e4e4e4]">
      <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
        Iemand uitnodigen
      </h2>
      <div className="space-y-2">
        <Label htmlFor="name">Naam</Label>
        <Input id="name" name="name" required className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" name="email" type="email" required className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Wachtwoord</Label>
        <Input id="password" name="password" type="password" required minLength={8} className="h-10" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="role">Rol</Label>
        <select id="role" name="role" className="h-10 w-full rounded-lg border border-[#e4e4e4] bg-white px-3 text-sm">
          <option value="marketeer">Marketeer</option>
          <option value="klant">Klant</option>
          <option value="admin">Beheerder</option>
        </select>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm text-[#585858]">Klanten</legend>
        {clients.length === 0 ? <p className="text-sm text-[#585858]">Nog geen klanten om te koppelen.</p> : null}
        {clients.map((client) => (
          <label key={client.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="clients" value={client.id} />
            {client.name}
          </label>
        ))}
      </fieldset>
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
      {state?.error === "" ? <p className="text-sm text-[#1d6b24]">Gebruiker aangemaakt.</p> : null}
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? "Bezig…" : "Gebruiker aanmaken"}
      </Button>
    </form>
  );
}
