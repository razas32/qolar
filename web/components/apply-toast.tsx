"use client";

import { toast } from "sonner";
import { setCategory } from "@/lib/client-api";

type Args = {
  transactionId: string;
  category: string;
  merchant: string;
  siblings: number;
  merchantKey: string;
  onApplied: () => void;
};

/** After a single edit: offer to remember the merchant, relabeling its other
 *  transactions when there are any. Dismissal (or 8s) means "just this one". */
export function askApplyToMerchant({ transactionId, category, merchant, siblings, merchantKey, onApplied }: Args) {
  if (merchantKey === "") return;
  const message = siblings > 0 ? `Apply ${category} to ${siblings} other ${merchant}?` : `Remember ${merchant} as ${category}?`;
  toast(message, {
    duration: 8000,
    action: {
      label: "Yes",
      onClick: async () => {
        try {
          const r = await setCategory(transactionId, category, true);
          toast.success(r.applied > 0 ? `Updated ${r.applied} more from ${merchant}` : `Remembered ${merchant}`);
          onApplied();
        } catch {
          toast.error("Couldn't apply to merchant");
        }
      },
    },
    cancel: { label: "Just this one", onClick: () => {} },
  });
}
