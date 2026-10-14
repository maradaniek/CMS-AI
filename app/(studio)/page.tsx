import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listClientsFor } from "@/lib/db";

export default async function HomePage() {
  const user = await requireUser();
  const clients = listClientsFor(user);
  return (
    <main>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#f18500]">WaaS 2.0</p>
          <h1 className="mt-1 text-3xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            Klanten
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#585858]">
            Elke site komt uit WoelerWaaS. Je werkt met prompts en met de blokken die het thema van die site echt heeft.
          </p>
        </div>
        {user.role === "admin" ? (
          <Link href="/klanten/nieuw" className="inline-flex h-10 items-center rounded-lg bg-[#f18500] px-4 text-sm font-medium text-white">
            Klant toevoegen
          </Link>
        ) : null}
      </div>
      {clients.length === 0 ? (
        <p className="mt-10 rounded-2xl bg-white p-6 text-sm ring-1 ring-[#e4e4e4]">
          {user.role === "admin"
            ? "Nog geen klant. Voeg een WaaS 2.0-site toe met het applicatiewachtwoord."
            : "Je bent nog aan geen klant gekoppeld. Vraag een beheerder om toegang."}
        </p>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {clients.map((client) => (
            <li key={client.id}>
              <Link href={`/klanten/${client.id}`} className="block rounded-2xl bg-white p-5 ring-1 ring-[#e4e4e4] hover:ring-[#f18500]">
                <p className="text-lg text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
                  {client.name}
                </p>
                <p className="mt-1 text-sm text-[#585858]">{client.site_url.replace(/^https?:\/\//, "")}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
