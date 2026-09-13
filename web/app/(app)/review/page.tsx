import { ReviewDeck } from "@/components/review/review-deck";
import { fetchCategories, fetchTransactions } from "@/lib/api";
import { requireUser } from "@/lib/require-user";
import { needsAttention } from "@/lib/stats";

export default async function ReviewPage() {
  await requireUser();
  const [all, categories] = await Promise.all([fetchTransactions(), fetchCategories()]);
  const queue = all.filter(needsAttention).sort((a, b) => (a.date < b.date ? 1 : -1));
  const ordered = [...categories].sort((a, b) => b.transaction_count - a.transaction_count || a.name.localeCompare(b.name));
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review</h1>
        <p className="text-sm text-muted-foreground">Everything Qolar wasn&apos;t sure about. Press 1–9 to pick, S to skip, T for transfer.</p>
      </div>
      <ReviewDeck queue={queue} categories={ordered} />
    </div>
  );
}
