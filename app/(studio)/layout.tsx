import { requireUser } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-full">
      <SiteHeader user={user} />
      <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
    </div>
  );
}
