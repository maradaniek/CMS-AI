"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, null);
  return (
    <main className="mx-auto flex min-h-full max-w-md flex-col justify-center px-4 py-16">
      <p className="text-sm font-medium text-[#f18500]">WaaS 2.0</p>
      <h1 className="mt-2 font-heading text-4xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
        Woeler CMS
      </h1>
      <p className="mt-3 text-sm leading-6 text-[#585858]">
        Vraag in gewone taal om tekst, een themablok, SEO, een case of een blog. CSS, het menu en verwijderen worden geweigerd.
      </p>
      <form action={action} className="mt-8 space-y-4 rounded-3xl bg-white p-6 ring-1 ring-[#e4e4e4]">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" autoComplete="username" required className="h-10" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Wachtwoord</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10" />
        </div>
        {state?.error ? <p className="text-sm text-[#d91515]">{state.error}</p> : null}
        <Button type="submit" disabled={pending} className="h-10 w-full">
          {pending ? "Bezig…" : "Inloggen"}
        </Button>
      </form>
    </main>
  );
}
