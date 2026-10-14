"use client";

import { useActionState } from "react";
import { createClientAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ClientForm() {
  const [state, action, pending] = useActionState(createClientAction, null);
  return (
    <form action={action} className="mt-6 space-y-4 rounded-3xl bg-white p-6 ring-1 ring-[#e4e4e4]">
      <div className="space-y-2">
        <Label htmlFor="name">Naam</Label>
        <Input id="name" name="name" required className="h-10" placeholder="Kooistra Keukens" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="siteUrl">Site</Label>
        <Input id="siteUrl" name="siteUrl" required className="h-10" placeholder="https://kooistrakeukens.woelerwaas.nl" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="username">WordPress-gebruiker</Label>
        <Input id="username" name="username" required className="h-10" placeholder="admin" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="appPassword">Applicatiewachtwoord</Label>
        <Input id="appPassword" name="appPassword" type="password" required className="h-10" />
      </div>
      {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
      <Button type="submit" disabled={pending} className="h-10">
        {pending ? "Controleren…" : "Verbinding maken"}
      </Button>
    </form>
  );
}
