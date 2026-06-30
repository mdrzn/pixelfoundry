import type { ReactNode } from "react";

import type { Session } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = (await getSession()) as Session | null;

  if (!session || !session.user?.id) {
    redirect("/auth/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      credits: true,
      role: true,
    },
  });

  if (!user) {
    redirect("/auth/login");
  }

  return <DashboardSidebar user={user}>{children}</DashboardSidebar>;
}
