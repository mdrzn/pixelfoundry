import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import type { ElementType } from "react";
import { JobStatus, JobType } from "@prisma/client";
import { formatDistanceToNow, startOfWeek, subWeeks } from "date-fns";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Boxes,
  Brush,
  Captions,
  Clapperboard,
  FileImage,
  FilmIcon,
  ImageIcon,
  Languages,
  LayoutGrid,
  LibraryIcon,
  Plus,
  Podcast,
  Sparkles,
  Subtitles,
  Target,
  TrendingUp,
  Video,
  Wallet,
  Workflow,
} from "lucide-react";

import { getRecentJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Soft per-tool tints — the colored icon tiles are what give the launcher its
// "2026" feel. Written as complete literal class strings so Tailwind emits them.
const TILES: Record<string, string> = {
  violet: "bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",
  indigo: "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  blue: "bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300",
  sky: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300",
  cyan: "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",
  fuchsia: "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300",
  pink: "bg-pink-100 text-pink-600 dark:bg-pink-500/15 dark:text-pink-300",
  rose: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300",
  teal: "bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-300",
  emerald: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  green: "bg-green-100 text-green-600 dark:bg-green-500/15 dark:text-green-300",
  amber: "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  orange: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-300",
};

type Service = {
  name: string;
  href: string;
  description: string;
  icon: ElementType;
  tile: keyof typeof TILES;
};

// Flat list in sidebar order (matches the launcher grid in the mockup).
const services: Service[] = [
  { name: "Create Image", href: "/dashboard/create-image", description: "Generate images from a text prompt.", icon: ImageIcon, tile: "violet" },
  { name: "Edit Image", href: "/dashboard/edit-image", description: "Transform or extend an existing image.", icon: Brush, tile: "indigo" },
  { name: "Create Video", href: "/dashboard/create-video", description: "Synthesize motion from text or images.", icon: FilmIcon, tile: "blue" },
  { name: "Multi-Shot", href: "/dashboard/multi-shot", description: "Turn a story into a sequence of shots.", icon: Clapperboard, tile: "sky" },
  { name: "Scene Builder", href: "/dashboard/scene-builder", description: "Compose keyframed scenes into one film.", icon: Boxes, tile: "cyan" },
  { name: "Voice-over", href: "/dashboard/voiceover", description: "Narrate a script with AI voices.", icon: AudioLines, tile: "fuchsia" },
  { name: "Podcast", href: "/dashboard/podcast", description: "Produce a multi-speaker episode.", icon: Podcast, tile: "pink" },
  { name: "Shorts", href: "/dashboard/shorts", description: "Auto-generate captioned shorts.", icon: Sparkles, tile: "rose" },
  { name: "Translate Text", href: "/dashboard/translate-text", description: "Translate text into any language.", icon: Languages, tile: "teal" },
  { name: "Transcribe", href: "/dashboard/transcribe", description: "Convert audio into accurate text.", icon: Captions, tile: "emerald" },
  { name: "Translate Image", href: "/dashboard/translate-image", description: "Translate text inside an image.", icon: FileImage, tile: "green" },
  { name: "Subtitles", href: "/dashboard/subtitles", description: "Generate subtitles for a video.", icon: Subtitles, tile: "amber" },
  { name: "Dubbing", href: "/dashboard/dubbing", description: "Dub a video into another language.", icon: Video, tile: "orange" },
  { name: "Canvas", href: "/dashboard/canvas", description: "Compose workflows on an infinite canvas.", icon: Workflow, tile: "violet" },
  { name: "My Library", href: "/dashboard/library", description: "Browse, tag, and manage your assets.", icon: LibraryIcon, tile: "slate" },
];

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

  const stats = [
    {
      label: "Available credits",
      value: user.credits.toLocaleString(),
      icon: Wallet,
      tile: "violet" as const,
      sub: null as string | null,
    },
    {
      label: "Jobs this week",
      value: jobsThisWeek.toLocaleString(),
      icon: TrendingUp,
      tile: "blue" as const,
      sub:
        jobsLastWeek > 0 || jobsThisWeek > 0
          ? `${jobsDelta >= 0 ? "▲" : "▼"} ${Math.abs(jobsDelta)} vs last week`
          : null,
    },
    {
      label: "Completion rate",
      value: `${completionRate}%`,
      icon: Target,
      tile: "emerald" as const,
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
                  TILES[stat.tile]
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
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Launch a tool</h2>
            <p className="text-sm text-muted-foreground">
              Jump into any studio to get started.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          {services.map((service) => {
            const Icon = service.icon;
            return (
              <Link
                key={service.href}
                href={service.href}
                className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
              >
                <div
                  className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg",
                    TILES[service.tile]
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h3 className="text-sm font-semibold leading-none">
                    {service.name}
                  </h3>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {service.description}
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
