import { notFound } from "next/navigation";
import { refreshCatalogAction } from "@/app/actions";
import { SeoCheck } from "@/components/seo-check";
import { WorkSteps } from "@/components/work-steps";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { isDemo } from "@/lib/demo";
import { catalogFor, messagesFor } from "@/lib/content";
import { canAccess, clientById } from "@/lib/db";
import { WpError } from "@/lib/wp";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!(await canAccess(user, id))) notFound();
  const client = await clientById(id);
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
              {isDemo(client.id) ? (
                <p className="mt-2 max-w-xl text-sm text-[#585858]">
                  Oefen hier de stappen. Plak bijvoorbeeld https://demo.woeler.nl/diensten. Er gaat niets live op een echte site.
                </p>
              ) : null}
            </div>
        <form action={refreshCatalogAction}>
          <input type="hidden" name="clientId" value={id} />
          <Button type="submit" variant="outline" className="h-10">
            Blokken verversen
          </Button>
        </form>
      </div>

      {catalogError ? <p className="text-sm text-[#d91515]">{catalogError}</p> : null}
      <SeoCheck clientId={id} />
      <WorkSteps clientId={id} blocks={catalog} messages={await messagesFor(id)} />
    </main>
  );
}
