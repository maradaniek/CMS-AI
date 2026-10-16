"use client";

import { useActionState } from "react";
import { seoAuditAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function SeoCheck({ clientId }: { clientId: string }) {
  const [state, action, pending] = useActionState(seoAuditAction, null);
  const report = state?.report;

  return (
    <section className="rounded-3xl bg-white p-4 ring-1 ring-[#e4e4e4] sm:p-6">
      <form action={action} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            SEO-check
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[#585858]">
            Controleert H1, titel-tag en meta-omschrijving van alle gepubliceerde pagina’s, blogs en cases. Vul een focuswoord in om te zien of het in de titel-tag, de H1 en de tekst staat.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <input type="hidden" name="clientId" value={clientId} />
          <Input name="keyword" placeholder="Focuswoord, bijvoorbeeld warmtepomp" className="h-10 sm:w-72" />
          <Button type="submit" disabled={pending} className="h-10 px-4">
            {pending ? "Bezig…" : "SEO-check"}
          </Button>
        </div>
      </form>

      {state?.error ? <p className="mt-4 text-sm text-[#d91515]">{state.error}</p> : null}

      {report ? (
        <div className="mt-6 space-y-6">
          <p className="text-sm text-[#061122]">
            {report.checked} pagina’s gelezen
            {report.unread ? `, ${report.unread} niet bereikbaar` : ""}.
            {report.groups.length === 0 ? " Geen problemen op deze punten." : ` ${report.groups.reduce((sum, group) => sum + group.hits.length, 0)} aandachtspunten.`}
          </p>

          {report.keyword ? (
            <div>
              <h3 className="text-sm font-semibold text-[#061122]">Focuswoord “{report.keyword}”</h3>
              <ul className="mt-2 divide-y divide-[#e4e4e4]">
                {report.keywords.map((row) => (
                  <li key={row.link} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <a href={row.link} target="_blank" rel="noreferrer" className="text-sm text-[#061122] underline">
                      {row.name}
                    </a>
                    <p className="text-sm text-[#585858]">
                      Titel <Mark ok={row.inTitle} /> · H1 <Mark ok={row.inH1} /> · {row.count} keer in de tekst
                      {row.count > 0 ? `, ${row.perHundred.toFixed(1).replace(".", ",")} per 100 woorden` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.groups.map((group) => (
            <div key={group.title}>
              <h3 className="text-sm font-semibold text-[#061122]">
                {group.title} <span className="font-normal text-[#585858]">({group.hits.length})</span>
              </h3>
              <ul className="mt-2 space-y-2">
                {group.hits.map((hit) => (
                  <li key={`${group.title}-${hit.link}-${hit.detail}`} className="text-sm">
                    <a href={hit.link} target="_blank" rel="noreferrer" className="text-[#061122] underline">
                      {hit.name}
                    </a>
                    <span className="text-[#585858]"> · {hit.detail}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return <span className={ok ? "text-[#1d6b24]" : "text-[#9d1212]"}>{ok ? "ja" : "nee"}</span>;
}
