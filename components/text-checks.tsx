"use client";

import { useActionState, type ReactNode } from "react";
import { spellingAuditAction, styleAuditAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { AddressAudit, SpellAudit, TextHit } from "@/lib/text-audit";

export function SpellingCheck({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(spellingAuditAction, null);
  return (
    <CheckCard
      title="Spellingcheck"
      text="Woorden die niet in de Nederlandse spelling staan, met een voorstel als dat er is."
      action={action}
      clientId={clientId}
      pending={pending}
      label="Spellingcheck"
      error={state?.error}
    >
      {state?.report ? <SpellResult report={state.report} /> : null}
    </CheckCard>
  );
}

export function StyleCheck({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(styleAuditAction, null);
  return (
    <CheckCard
      title="Stijlcheck (u/je)"
      text="je, jij, jou en jouw tegenover u en uw. Op één pagina en tussen pagina’s."
      action={action}
      clientId={clientId}
      pending={pending}
      label="Stijlcheck"
      error={state?.error}
    >
      {state?.report ? <StyleResult report={state.report} /> : null}
    </CheckCard>
  );
}

function CheckCard({
  title,
  text,
  action,
  clientId,
  pending,
  label,
  error,
  children,
}: {
  title: string;
  text: string;
  action: (formData: FormData) => void | Promise<void>;
  clientId: string;
  pending: boolean;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex h-full flex-col rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
      <form action={action} className="flex flex-col gap-3">
        <div>
          <h3 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            {title}
          </h3>
          <p className="mt-1 text-sm text-[#585858]">{text}</p>
        </div>
        <input type="hidden" name="clientId" value={clientId} />
        <Button type="submit" disabled={pending} className="h-10 px-4">
          {pending ? "Bezig…" : label}
        </Button>
      </form>
      {error ? <p className="mt-4 text-sm text-[#d91515]">{error}</p> : null}
      {children}
    </section>
  );
}

function SpellResult({ report }: { report: SpellAudit }) {
  return (
    <div className="mt-4 max-h-96 space-y-3 overflow-auto text-sm">
      <p>
        {report.checked} pagina’s gelezen. {report.hits.length === 0 ? "Geen spelfouten gevonden." : `${report.hits.length} pagina’s met een onbekend woord.`}
      </p>
      <HitList hits={report.hits} />
    </div>
  );
}

function StyleResult({ report }: { report: AddressAudit }) {
  const consistent = report.mixed.length === 0 && (report.informal.length === 0 || report.formal.length === 0);
  const form = report.informal.length > 0 ? "je/jouw" : "u/uw";
  return (
    <div className="mt-4 max-h-96 space-y-3 overflow-auto text-sm">
      <p>
        {report.checked} pagina’s gelezen.
        {consistent && report.informal.length + report.formal.length > 0 ? ` De aanspreekvorm is ${form}.` : ""}
        {report.informal.length > 0 && report.formal.length > 0
          ? ` ${report.informal.length} pagina’s gebruiken je, ${report.formal.length} gebruiken u.`
          : ""}
        {report.mixed.length > 0 ? ` ${report.mixed.length} pagina’s mengen beide.` : ""}
      </p>
      {report.mixed.length > 0 ? (
        <div>
          <h4 className="font-semibold text-[#061122]">Wisselt op dezelfde pagina</h4>
          <HitList hits={report.mixed} />
        </div>
      ) : null}
      {report.informal.length > 0 && report.formal.length > 0 ? (
        <>
          <div>
            <h4 className="font-semibold text-[#061122]">je / jouw</h4>
            <HitList hits={report.informal} />
          </div>
          <div>
            <h4 className="font-semibold text-[#061122]">u / uw</h4>
            <HitList hits={report.formal} />
          </div>
        </>
      ) : null}
    </div>
  );
}

function HitList({ hits }: { hits: TextHit[] }) {
  if (!hits.length) return null;
  return (
    <ul className="mt-2 space-y-2">
      {hits.map((hit) => (
        <li key={`${hit.link}-${hit.detail}`}>
          <a href={hit.link} target="_blank" rel="noreferrer" className="text-[#061122] underline">
            {hit.name}
          </a>
          <span className="text-[#585858]"> · {hit.detail}</span>
        </li>
      ))}
    </ul>
  );
}
