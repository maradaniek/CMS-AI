import { requireRole } from "@/lib/auth";
import { ClientForm } from "@/components/client-form";

export default async function NewClientPage() {
  await requireRole("admin");
  return (
    <main className="max-w-lg">
      <h1 className="text-3xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
        Klant toevoegen
      </h1>
      <p className="mt-2 text-sm leading-6 text-[#585858]">
        Alleen een beheerder doet dit. Het applicatiewachtwoord blijft in dit systeem en is daarna niet zichtbaar voor marketeers of klanten. De site zelf wordt niet aangemaakt of verwijderd.
      </p>
      <ClientForm />
    </main>
  );
}
