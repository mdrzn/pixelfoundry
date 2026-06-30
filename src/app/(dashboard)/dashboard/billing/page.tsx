import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditReason } from "@prisma/client";
import { format, startOfDay } from "date-fns";

import { getCreditLedger } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import type { Session } from "next-auth";

import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const creditPacks = [
  {
    name: "Starter Boost",
    credits: 250,
    price: "$29",
    perks: ["Image + edit access", "Queue priority ×1.2", "Email support"],
  },
  {
    name: "Studio",
    credits: 800,
    price: "$79",
    perks: [
      "Everything in Starter",
      "Video synthesis access",
      "Webhook callbacks",
    ],
  },
  {
    name: "Agency",
    credits: 2500,
    price: "$199",
    perks: [
      "Priority GPU lane",
      "Custom style libraries",
      "Slack support",
    ],
  },
];

const reasonLabel: Record<CreditReason, string> = {
  [CreditReason.GRANT]: "Grant",
  [CreditReason.DEDUCT]: "Usage",
  [CreditReason.ADJUST]: "Adjustment",
  [CreditReason.REFUND]: "Refund",
};

export default async function BillingPage() {
  const session = (await getSession()) as Session | null;
  if (!session || !session.user?.id) {
    redirect("/auth/login");
  }

  const today = startOfDay(new Date());

  const [user, ledgerEntries, usageTodayAgg] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { credits: true },
    }),
    getCreditLedger(session.user.id, 25),
    prisma.creditLedger.aggregate({
      where: {
        userId: session.user.id,
        createdAt: { gte: today },
        delta: { lt: 0 },
      },
      _sum: { delta: true },
    }),
  ]);

  if (!user) {
    redirect("/auth/login");
  }

  const usageToday = Math.abs(usageTodayAgg._sum.delta ?? 0);

  return (
    <DashboardPageContainer
      title="Credits & billing"
      description="Review balance, recharge packs, and audit recent transactions."
      action={
        <Button asChild>
          <Link href="/dashboard/support">Open invoice portal</Link>
        </Button>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[1fr,320px]">
        <Card className="h-max">
          <CardHeader>
            <CardTitle>Current balance</CardTitle>
            <CardDescription>Balance updates in real time as jobs run.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-semibold">{user.credits}</span>
              <span className="text-sm text-muted-foreground">credits</span>
            </div>
            <Badge variant="secondary" className="text-xs">
              Usage {usageToday} credits today
            </Badge>
            <p className="text-sm text-muted-foreground">
              Credits reset monthly based on plan. Additional packs roll over for 90 days.
            </p>
            <Button className="w-full">Buy more credits</Button>
          </CardContent>
        </Card>
        <Card className="h-max">
          <CardHeader>
            <CardTitle>Upgrade plan</CardTitle>
            <CardDescription>
              Choose the pack that matches your current production needs.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {creditPacks.map((pack) => (
              <div
                key={pack.name}
                className="rounded-2xl border p-4 shadow-sm transition hover:border-primary"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold">{pack.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {pack.credits} credits
                    </p>
                  </div>
                  <span className="text-lg font-semibold">{pack.price}</span>
                </div>
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {pack.perks.map((perk) => (
                    <li key={perk}>• {perk}</li>
                  ))}
                </ul>
                <Button size="sm" className="mt-4 w-full">
                  Select
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
          <CardDescription>Job consumption and credit top-ups.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Detail</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledgerEntries.map((entry) => {
                const metadataDescription =
                  entry.metadata &&
                  typeof entry.metadata === "object" &&
                  "description" in entry.metadata
                    ? String((entry.metadata as { description?: unknown }).description ?? "")
                    : undefined;

                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.id}</TableCell>
                    <TableCell>{reasonLabel[entry.reason]}</TableCell>
                    <TableCell>
                      {entry.job
                        ? `Job ${entry.job.type.toLowerCase()} (${entry.job.id.slice(0, 6)})`
                        : metadataDescription || "Manual adjustment"}
                    </TableCell>
                    <TableCell>
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        Balance: {entry.balanceAfter}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(entry.createdAt, "PPpp")}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </DashboardPageContainer>
  );
}
