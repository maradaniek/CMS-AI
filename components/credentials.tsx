"use client";

import { useState } from "react";
import { revealCredentials } from "@/app/actions";
import { Button } from "@/components/ui/button";

export function Credentials({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState<{ username: string; appPassword: string; siteUrl: string } | null>(null);

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e4e4e4]">
      <p className="text-sm text-[#585858]">API-gegevens zijn alleen voor beheerders.</p>
      <Button
        type="button"
        variant="outline"
        className="mt-3 h-10"
        onClick={async () => {
          if (open) {
            setOpen(false);
            setSecret(null);
            return;
          }
          const value = await revealCredentials(clientId);
          setSecret(value);
          setOpen(true);
        }}
      >
        {open ? "Verberg" : "API-gegevens tonen"}
      </Button>
      {open && secret ? (
        <dl className="mt-3 space-y-1 text-sm">
          <div>
            <dt className="text-[#585858]">Site</dt>
            <dd>{secret.siteUrl}</dd>
          </div>
          <div>
            <dt className="text-[#585858]">Gebruiker</dt>
            <dd>{secret.username}</dd>
          </div>
          <div>
            <dt className="text-[#585858]">Applicatiewachtwoord</dt>
            <dd className="break-all">{secret.appPassword}</dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
