import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { UserForm } from "@/components/user-form";

export default async function UsersPage() {
  await requireRole("admin");
  const clients = db().prepare("select id, name from clients order by name").all() as { id: string; name: string }[];
  const users = db().prepare("select name, email, role from users order by name").all() as {
    name: string;
    email: string;
    role: string;
  }[];
  return (
    <main className="grid gap-8 lg:grid-cols-[1fr_1fr]">
      <section>
        <h1 className="text-3xl text-[#061122]" style={{ fontFamily: "Pliant, Manrope, sans-serif" }}>
          Gebruikers
        </h1>
        <ul className="mt-4 space-y-2">
          {users.map((user) => (
            <li key={user.email} className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-[#e4e4e4]">
              <span className="text-[#061122]">{user.name}</span>
              <span className="mt-1 block text-[#585858]">
                {user.email} · {user.role}
              </span>
            </li>
          ))}
        </ul>
      </section>
      <UserForm clients={clients} />
    </main>
  );
}
