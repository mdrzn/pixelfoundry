import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { JobStatus, JobType } from "@prisma/client";
import { formatDistanceToNow, startOfWeek, subWeeks } from "date-fns";
import {
  ArrowRight,
  ArrowUpRight,
  ImageIcon,
  LayoutGrid,
  Plus,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";

import { getRecentJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TOOLS, tileClass, type ToolColor } from "@/lib/tool-registry";

export default async function DashboardOverviewPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const lastWeekStart = subWeeks(weekStart, 1);

  const [user, jobsThisWeek, jobsLastWeek, statusGroup, recentJobs] =
    await Promise.all([
      prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, name: true, credits: true },
      }),
      prisma.job.count({
        where: { userId: session.user.id, createdAt: { gte: weekStart } },
      }),
      prisma.job.count({
        where: {
          userId: session.user.id,
          createdAt: { gte: lastWeekStart, lt: weekStart },
        },
      }),
      prisma.job.groupBy({
        by: ["status"],
        where: { userId: session.user.id },
        _count: { _all: true },
      }),
      getRecentJobs(session.user.id, 8),
    ]);

  if (!user) {
    redirect("/auth/login");
  }

  const totalJobs = statusGroup.reduce((acc, item) => acc + item._count._all, 0);
  const completedJobs =
    statusGroup.find((entry) => entry.status === JobStatus.COMPLETED)?._count._all ?? 0;
  const completionRate =
    totalJobs === 0 ? 0 : Math.round((completedJobs / totalJobs) * 100);

  const jobsDelta = jobsThisWeek - jobsLastWeek;

  const firstName = user.name?.split(" ")[0] ?? "Creator";

  const jobTypeLabel: Record<JobType, string> = {
    [JobType.CREATE_IMAGE]: "Image",
    [JobType.EDIT_IMAGE]: "Image",
    [JobType.CREATE_VIDEO]: "Video",
  };

  const stats: {
    label: string;
    value: string;
    icon: typeof Wallet;
    tile: ToolColor;
    sub: string | null;
  }[] = [
    {
      label: "Available credits",
      value: user.credits.toLocaleString(),
      icon: Wallet,
      tile: "violet",
      sub: null,
    },
    {
      label: "Jobs this week",
      value: jobsThisWeek.toLocaleString(),
      icon: TrendingUp,
      tile: "blue",
      sub:
        jobsLastWeek > 0 || jobsThisWeek > 0
          ? `${jobsDelta >= 0 ? "▲" : "▼"} ${Math.abs(jobsDelta)} vs last week`
          : null,
    },
    {
      label: "Completion rate",
      value: `${completionRate}%`,
      icon: Target,
      tile: "emerald",
      sub: totalJobs > 0 ? `${completedJobs}/${totalJobs} jobs` : null,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="pointer-events-none absolute inset-0 bg-brand-wash opacity-70" />
        <div className="relative flex items-center justify-between gap-6">
          <div className="max-w-xl">
            <p className="text-sm font-medium text-muted-foreground">
              Welcome back, {firstName} 👋
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              Create anything.{" "}
              <span className="bg-gradient-to-r from-brand to-brand-2 bg-clip-text text-transparent">
                Stunningly.
              </span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Your all-in-one AI creative studio for image, video, audio, and
              language tools — one wallet, one workspace.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link href="/dashboard/create-image">
                  <Plus className="mr-2 h-4 w-4" />
                  New generation
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="#launch">
                  <LayoutGrid className="mr-2 h-4 w-4" />
                  Explore tools
                </a>
              </Button>
            </div>
          </div>

          {/* Decorative glass motif */}
          <div
            className="pointer-events-none relative hidden h-44 w-60 shrink-0 lg:block"
            aria-hidden
          >
            <div className="absolute inset-4 rounded-3xl bg-gradient-to-br from-brand/40 to-brand-2/40 blur-2xl" />
            <div className="absolute left-8 top-6 h-32 w-44 rotate-6 rounded-3xl border border-white/40 bg-gradient-to-br from-brand/50 to-brand-2/40 shadow-xl backdrop-blur-md" />
            <div className="absolute left-12 top-10 flex h-28 w-40 -rotate-3 items-center justify-center rounded-3xl border border-white/50 bg-white/30 shadow-lg backdrop-blur-md">
              <Sparkles className="h-12 w-12 text-white drop-shadow-md" />
            </div>
          </div>
        </div>
      </section>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm"
            >
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                  tileClass(stat.tile)
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-2xl font-semibold leading-tight">{stat.value}</p>
                {stat.sub ? (
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* Tool launcher */}
      <section id="launch" className="flex flex-col gap-4 scroll-mt-20">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Launch a tool</h2>
          <p className="text-sm text-muted-foreground">
            Jump into any studio to get started.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    tileClass(tool.color)
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-semibold leading-none">{tool.name}</h3>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {tool.description}
                  </p>
                </div>
                <ArrowRight className="absolute right-3 top-3 h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:text-brand group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* Recent generations */}
      <section className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Recent generations
            </h2>
            <p className="text-sm text-muted-foreground">
              Your latest image &amp; video creations.
            </p>
          </div>
          <Link
            href="/dashboard/library"
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            View all
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {recentJobs.length === 0 ? (
          <div className="rounded-xl border bg-card p-10 text-center shadow-sm">
            <p className="text-sm text-muted-foreground">
              No generations yet. Pick a tool above to create your first one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {recentJobs.map((job) => {
              const asset = job.outputAsset;
              return (
                <Link
                  key={job.id}
                  href="/dashboard/library"
                  className="group overflow-hidden rounded-xl border bg-card shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-muted">
                    {asset ? (
                      <Image
                        src={asset.thumbnail || asset.url}
                        alt={job.title ?? job.prompt.slice(0, 40)}
                        fill
                        unoptimized
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-white backdrop-blur">
                      {jobTypeLabel[job.type]}
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">
                      {job.title ?? job.prompt}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDistanceToNow(job.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
