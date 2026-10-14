import type { SeoReport } from "@/lib/types";

export function SeoCard({ report }: { report: SeoReport }) {
  const tone =
    report.h1Status === "ok"
      ? "bg-[#eef8ee] text-[#1d6b24]"
      : report.h1Status === "multiple"
        ? "bg-[#fdecec] text-[#9d1212]"
        : "bg-[#fff4e6] text-[#633100]";
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-[#e4e4e4]">
      <p className={`inline-flex rounded-full px-3 py-1 text-sm ${tone}`}>{report.h1Message}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-[#585858]">H1</h3>
          {report.h1.length === 0 ? <p className="mt-1 text-sm">Geen</p> : null}
          <ul className="mt-1 space-y-1 text-sm">
            {report.h1.map((item) => (
              <li key={`${item.where}-${item.text}`}>{item.text}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-xs font-semibold tracking-wide text-[#585858]">H2</h3>
          {report.h2.length === 0 ? <p className="mt-1 text-sm">Geen H2</p> : null}
          <ul className="mt-1 space-y-1 text-sm">
            {report.h2.map((item) => (
              <li key={`${item.where}-${item.text}`}>{item.text}</li>
            ))}
          </ul>
        </div>
      </div>
      {report.keyword ? (
        <ul className="mt-4 space-y-1 text-sm">
          {report.checks.map((check) => (
            <li key={check.label} className={check.ok ? "text-[#1d6b24]" : "text-[#9d1212]"}>
              {check.label}. {check.detail}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#585858]">
          Nog geen focuswoord. Vraag: Check de SEO, zoekwoord warmtepomp.
        </p>
      )}
    </section>
  );
}
