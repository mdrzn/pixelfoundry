import { redirect } from "next/navigation";

import { SettingsForm } from "@/app/(dashboard)/dashboard/settings/settings-form";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true },
  });

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <DashboardPageContainer
      title="Workspace settings"
      description="Control authentication, webhook destinations, and notification preferences."
    >
      <SettingsForm defaultName={user.name ?? ""} email={user.email} />
    </DashboardPageContainer>
  );
}
