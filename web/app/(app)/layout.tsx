import { MobileHeader } from "@/components/shell/mobile-header";
import { MobileTabs } from "@/components/shell/mobile-tabs";
import { Sidebar } from "@/components/shell/sidebar";
import { fetchTransactions } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { needsAttention } from "@/lib/stats";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  const all = await fetchTransactions().catch(() => []);
  const reviewCount = all.filter(needsAttention).length;
  return (
    <>
      <Sidebar reviewCount={reviewCount} />
      <MobileHeader />
      <MobileTabs reviewCount={reviewCount} />
      <main className="min-h-screen px-4 pb-24 pt-4 md:ml-60 md:px-8 md:pb-10 md:pt-6">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </>
  );
}
