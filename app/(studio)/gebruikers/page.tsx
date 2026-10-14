import { AssignmentForm } from "@/components/assignment-form";
import { UserForm } from "@/components/user-form";
import { requireRole } from "@/lib/auth";
import { assignedClientIds, db } from "@/lib/db";
import type { Role } from "@/lib/types";

const ROLE: Record<Role, string> = {
  admin: "Beheerder",
  marketeer: "Marketeer",
  klant: "Klant",
};

export default async function UsersPage() {
  await requireRole("admin");
  const clients = db().prepare("select id, name from clients order by name").all() as { id: string; name: string }[];
  const users = db().prepare("select id, name, email, role from users order by name").all() as {
    id: string;
    name: string;
    email: string;
    role: Role;
  }[];
  return (
    <main className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
      <section>
        <h1 className="text-3xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
          Gebruikers
        </h1>
        <p className="mt-2 text-sm text-[#585858]">
          Een marketeer ziet alleen de klanten die je hier aanvinkt. Een klant ziet alleen de eigen site.
        </p>
        <ul className="mt-4 space-y-3">
          {users.map((user) => {
            const assigned = assignedClientIds(user.id);
            return (
              <li key={user.id} className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-[#e4e4e4]">
                <span className="text-[#061122]">{user.name}</span>
                <span className="mt-1 block text-[#585858]">
                  {user.email} · {ROLE[user.role]}
                </span>
                {user.role === "admin" ? (
                  <p className="mt-2 text-[#585858]">Ziet alle klanten.</p>
                ) : (
                  <AssignmentForm
                    userId={user.id}
                    role={user.role === "klant" ? "klant" : "marketeer"}
                    clients={clients}
                    assigned={assigned}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <UserForm clients={clients} />
    </main>
  );
}
