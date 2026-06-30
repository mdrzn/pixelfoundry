import { redirect } from "next/navigation";

import { getSession } from "@/lib/session";
import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";

import { ApiExplorer } from "./api-explorer-client";

export default async function ApiExplorerPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  return (
    <DashboardPageContainer
      title="API explorer"
      description="Inspect responses from the library API and generate request snippets."
    >
      <ApiExplorer />
    </DashboardPageContainer>
  );
}
