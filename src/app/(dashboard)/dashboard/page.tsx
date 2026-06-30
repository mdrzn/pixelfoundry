import Link from "next/link";
import { redirect } from "next/navigation";
import { JobStatus, JobType } from "@prisma/client";
import { formatDistanceToNow, startOfWeek } from "date-fns";

import { getRecentJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { DashboardPageContainer } from "@/components/layout/dashboard-sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export default async function DashboardOverviewPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  const [user, jobsThisWeek, statusGroup, recentJobs] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, credits: true },
    }),
    prisma.job.count({
      where: { userId: session.user.id, createdAt: { gte: weekStart } },
    }),
    prisma.job.groupBy({
      by: ["status"],
      where: { userId: session.user.id },
      _count: { _all: true },
    }),
    getRecentJobs(session.user.id, 5),
  ]);

  if (!user) {
    redirect("/auth/login");
  }

  const totalJobs = statusGroup.reduce((acc, item) => acc + item._count._all, 0);
  const completedJobs =
    statusGroup.find((entry) => entry.status === JobStatus.COMPLETED)?._count
      ._all ?? 0;

  const completionRate = totalJobs === 0 ? 0 : Math.round((completedJobs / totalJobs) * 100);

  const jobTypeLabel: Record<JobType, string> = {
    [JobType.CREATE_IMAGE]: "Create image",
    [JobType.EDIT_IMAGE]: "Edit image",
    [JobType.CREATE_VIDEO]: "Create video",
  };

  const metrics = [
    {
      label: "Credits remaining",
      value: user.credits,
      max: Math.max(user.credits, 1000),
    },
    {
      label: "Jobs this week",
      value: jobsThisWeek,
      max: 25,
    },
    {
      label: "Completion rate",
      value: completionRate,
      max: 100,
    },
  ];

  return (
    <DashboardPageContainer
      title={`Welcome back, ${user.name ?? "Creator"}`}
      description="Monitor activity, credits, and queued generations."
      action={
        <Button asChild>
          <Link href="/dashboard/create-image">New generation</Link>
        </Button>
      }
    >
      <div className="grid gap-6 md:grid-cols-3">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader>
              <CardTitle className="text-base font-medium">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-semibold">{metric.value}</div>
              <Progress
                value={Math.min(100, (metric.value / (metric.max || 1)) * 100)}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Recent activity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {recentJobs.length === 0 ? (
            <p>No jobs yet. Start by running your first generation.</p>
          ) : (
            recentJobs.map((job) => (
              <div
                key={job.id}
                className="flex flex-col gap-1 rounded-md border border-border/70 bg-muted/30 px-3 py-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {jobTypeLabel[job.type]}
                  </span>
                  <span>
                    {formatDistanceToNow(job.createdAt, { addSuffix: true })}
                  </span>
                </div>
                <p className="text-sm text-foreground line-clamp-1">
                  {job.prompt}
                </p>
                <span className="text-xs uppercase text-primary">
                  {job.status.toLowerCase()}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </DashboardPageContainer>
  );
}
