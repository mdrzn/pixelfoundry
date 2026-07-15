import Link from "next/link";
import { redirect } from "next/navigation";
import type { ElementType } from "react";
import { JobStatus, JobType } from "@prisma/client";
import { formatDistanceToNow, startOfWeek } from "date-fns";
import {
  ArrowRight,
  AudioLines,
  Boxes,
  Brush,
  Captions,
  Clapperboard,
  FileImage,
  FilmIcon,
  ImageIcon,
  Languages,
  LibraryIcon,
  Podcast,
  Sparkles,
  Subtitles,
  Video,
  Workflow,
} from "lucide-react";

import { getRecentJobs } from "@/lib/jobs";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

type Service = {
  name: string;
  href: string;
  description: string;
  icon: ElementType;
};

const serviceGroups: { label: string; services: Service[] }[] = [
  {
    label: "Create",
    services: [
      {
        name: "Create Image",
        href: "/dashboard/create-image",
        description: "Generate images from a text prompt.",
        icon: ImageIcon,
      },
      {
        name: "Edit Image",
        href: "/dashboard/edit-image",
        description: "Transform or extend an existing image.",
        icon: Brush,
      },
      {
        name: "Create Video",
        href: "/dashboard/create-video",
        description: "Synthesize motion from text or footage.",
        icon: FilmIcon,
      },
      {
        name: "Multi-Shot",
        href: "/dashboard/multi-shot",
        description: "Turn a story into a sequence of cinematic shots.",
        icon: Clapperboard,
      },
      {
        name: "Scene Builder",
        href: "/dashboard/scene-builder",
        description: "Compose keyframed scenes into one film.",
        icon: Boxes,
      },
    ],
  },
  {
    label: "Audio & Voice",
    services: [
      {
        name: "Voice-over",
        href: "/dashboard/voiceover",
        description: "Narrate a script with lifelike AI voices.",
        icon: AudioLines,
      },
      {
        name: "Podcast",
        href: "/dashboard/podcast",
        description: "Produce a multi-speaker episode.",
        icon: Podcast,
      },
      {
        name: "Shorts",
        href: "/dashboard/shorts",
        description: "Auto-generate captioned short videos.",
        icon: Sparkles,
      },
    ],
  },
  {
    label: "Translate & Text",
    services: [
      {
        name: "Translate Text",
        href: "/dashboard/translate-text",
        description: "Translate text into any language.",
        icon: Languages,
      },
      {
        name: "Transcribe",
        href: "/dashboard/transcribe",
        description: "Turn audio into accurate text.",
        icon: Captions,
      },
      {
        name: "Translate Image",
        href: "/dashboard/translate-image",
        description: "Translate the text inside an image.",
        icon: FileImage,
      },
      {
        name: "Subtitles",
        href: "/dashboard/subtitles",
        description: "Generate subtitles for a video.",
        icon: Subtitles,
      },
      {
        name: "Dubbing",
        href: "/dashboard/dubbing",
        description: "Dub a video into another language.",
        icon: Video,
      },
    ],
  },
  {
    label: "Workspace",
    services: [
      {
        name: "Canvas",
        href: "/dashboard/canvas",
        description: "Compose workflows on an infinite canvas.",
        icon: Workflow,
      },
      {
        name: "My Library",
        href: "/dashboard/library",
        description: "Browse, tag, and manage your assets.",
        icon: LibraryIcon,
      },
    ],
  },
];

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
    statusGroup.find((entry) => entry.status === JobStatus.COMPLETED)?._count._all ?? 0;
  const completionRate =
    totalJobs === 0 ? 0 : Math.round((completedJobs / totalJobs) * 100);

  const jobTypeLabel: Record<JobType, string> = {
    [JobType.CREATE_IMAGE]: "Create image",
    [JobType.EDIT_IMAGE]: "Edit image",
    [JobType.CREATE_VIDEO]: "Create video",
  };

  const firstName = user.name?.split(" ")[0] ?? "Creator";

  const stats = [
    { label: "Credits", value: user.credits.toLocaleString() },
    { label: "Jobs this week", value: jobsThisWeek.toLocaleString() },
    { label: "Completion", value: `${completionRate}%` },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl border bg-brand-wash p-6 sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          What do you want to create, {firstName}?
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Pick a tool to get started. Every studio runs on one shared credit
          wallet — no context switching, no extra logins.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border bg-card/70 px-4 py-2.5 backdrop-blur"
            >
              <div className="text-lg font-semibold leading-none">{stat.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Service launcher */}
      {serviceGroups.map((group) => (
        <section key={group.label} className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.services.map((service) => {
              const Icon = service.icon;
              return (
                <Link
                  key={service.href}
                  href={service.href}
                  className="group relative flex items-start gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/15 transition-colors group-hover:bg-brand group-hover:text-brand-foreground group-hover:ring-brand">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 space-y-1 pr-5">
                    <h3 className="font-medium leading-none">{service.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {service.description}
                    </p>
                  </div>
                  <ArrowRight className="absolute right-4 top-4 h-4 w-4 -translate-x-1 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0 group-hover:text-brand group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </section>
      ))}

      {/* Recent activity */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent activity
        </h2>
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          {recentJobs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No jobs yet. Pick a tool above to run your first generation.
            </p>
          ) : (
            <ul className="divide-y">
              {recentJobs.map((job) => (
                <li
                  key={job.id}
                  className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <span className="shrink-0 text-xs font-medium text-foreground">
                    {jobTypeLabel[job.type]}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {job.prompt}
                  </p>
                  <span className="shrink-0 text-[0.7rem] font-medium uppercase tracking-wide text-brand">
                    {job.status.toLowerCase()}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDistanceToNow(job.createdAt, { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
