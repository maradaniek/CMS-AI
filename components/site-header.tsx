import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { PublicUser } from "@/lib/types";

const ROLE: Record<PublicUser["role"], string> = {
  admin: "Beheerder",
  marketeer: "Marketeer",
  klant: "Klant",
};

export function SiteHeader({ user }: { user: PublicUser }) {
  return (
    <header className="border-b border-[#e4e4e4] bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Link href="/" className="font-heading text-xl text-[#061122]">
          Woeler CMS
        </Link>
        <nav className="flex flex-wrap items-center gap-2 text-sm">
          <Link href="/" className="rounded-full px-3 py-1.5 hover:bg-[#fff4e6]">
            Klanten
          </Link>
          {user.role === "admin" ? (
            <Link href="/gebruikers" className="rounded-full px-3 py-1.5 hover:bg-[#fff4e6]">
              Gebruikers
            </Link>
          ) : null}
          <Link href="/instellingen" className="rounded-full px-3 py-1.5 hover:bg-[#fff4e6]">
            Instellingen
          </Link>
          <span className="px-2 text-[#585858]">
            {user.name} · {ROLE[user.role]}
          </span>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" className="h-8">
              Uitloggen
            </Button>
          </form>
        </nav>
      </div>
    </header>
  );
}
