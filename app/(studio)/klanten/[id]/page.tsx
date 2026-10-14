import { notFound } from "next/navigation";
import { deleteClientAction, refreshCatalogAction } from "@/app/actions";
import { Credentials } from "@/components/credentials";
import { WorkSteps } from "@/components/work-steps";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { catalogFor, messagesFor } from "@/lib/content";
import { canAccess, clientById } from "@/lib/db";
import { WpError } from "@/lib/wp";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!canAccess(user, id)) notFound();
  const client = clientById(id);
  if (!client) notFound();

  let catalogError = "";
  let catalog: Awaited<ReturnType<typeof catalogFor>> = [];
  try {
    catalog = await catalogFor(client);
  } catch (error) {
    catalogError = error instanceof WpError ? error.message : "De blokken van deze site zijn niet opgehaald.";
  }

  return (
    <main className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#f18500]">{client.site_url.replace(/^https?:\/\//, "")}</p>
          <h1 className="mt-1 text-3xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
            {client.name}
          </h1>
        </div>
        <form action={refreshCatalogAction}>
          <input type="hidden" name="clientId" value={id} />
          <Button type="submit" variant="outline" className="h-10">
            Blokken verversen
          </Button>
        </form>
      </div>

      {user.role === "admin" ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <Credentials clientId={id} />
          <form action={deleteClientAction} className="rounded-2xl bg-white p-4 ring-1 ring-[#e4e4e4]">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-[#585858]">Haalt de klant uit dit CMS. De website zelf blijft staan.</p>
            <div className="mt-3 flex gap-2">
              <input name="confirm" placeholder="typ weg" className="h-10 rounded-lg border border-[#e4e4e4] px-3 text-sm" />
              <Button type="submit" variant="outline" className="h-10">
                Uit het systeem halen
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {catalogError ? <p className="text-sm text-[#d91515]">{catalogError}</p> : null}
      <WorkSteps clientId={id} blocks={catalog} messages={messagesFor(id)} />
    </main>
  );
}
