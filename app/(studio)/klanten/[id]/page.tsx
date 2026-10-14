import { notFound } from "next/navigation";
import { refreshCatalogAction } from "@/app/actions";
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

      {catalogError ? <p className="text-sm text-[#d91515]">{catalogError}</p> : null}
      <WorkSteps clientId={id} blocks={catalog} messages={messagesFor(id)} />
    </main>
  );
}
