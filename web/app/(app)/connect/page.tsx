import { ConnectClient } from "@/components/connect-client";
import { fetchAccounts, fetchMe } from "@/lib/api";
import { requireUser } from "@/lib/require-user";

export default async function ConnectPage() {
  await requireUser();
  const [me, accounts] = await Promise.all([fetchMe(), fetchAccounts()]);
  return <ConnectClient me={me} accounts={accounts} />;
}
