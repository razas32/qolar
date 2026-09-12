import { toast } from "sonner";
import { setCategory } from "@/lib/client-api";

type Args = { transactionId: string; category: string; merchant: string; siblings: number; onApplied: () => void };

/** After a single edit: offer to relabel the merchant's other transactions.
 *  Dismissal (or 8s) means "just this one". */
export function askApplyToMerchant({ transactionId, category, merchant, siblings, onApplied }: Args) {
  if (siblings <= 0) return;
  toast(`Apply ${category} to ${siblings} other ${merchant}?`, {
    duration: 8000,
    action: {
      label: "Yes",
      onClick: async () => {
        try {
          const r = await setCategory(transactionId, category, true);
          toast.success(`Updated ${r.applied} more from ${merchant}`);
          onApplied();
        } catch {
          toast.error("Couldn't apply to merchant");
        }
      },
    },
    cancel: { label: "Just this one", onClick: () => {} },
  });
}
