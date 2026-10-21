import { AdminNav } from "@/components/admin/admin-nav";
import { requireAdmin } from "@/lib/data/session";

export const metadata = { title: { default: "Admin", template: "%s · BSL Connect admin" } };

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const [row] = await admin.db.query<{ n: number }>("select count(*)::int as n from public.reports where status in ('open', 'in_review')");
  const count = row?.n ?? 0;
  return (
    <div className="min-h-dvh bg-ivory-100">
      <AdminNav email={admin.email} openReports={count ?? 0} isStudent={admin.status.role === "student"} />
      <main className="mx-auto max-w-7xl px-4 py-8 pb-[calc(2rem+var(--safe-bottom))] sm:px-6">{children}</main>
    </div>
  );
}
