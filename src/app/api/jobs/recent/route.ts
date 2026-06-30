import { NextResponse } from "next/server";
import { JobStatus, JobType } from "@prisma/client";

import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const jobType = url.searchParams.get("type");
  const limit = parseInt(url.searchParams.get("limit") || "24");

  const where = {
    userId: session.user.id,
    ...(jobType && { type: jobType as JobType }),
  };

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 50),
    include: {
      outputAsset: {
        select: {
          id: true,
          title: true,
          url: true,
          thumbnail: true,
          createdAt: true,
        },
      },
    },
  });

  const formatted = jobs.map((job) => ({
    id: job.id,
    type: job.type,
    status: job.status,
    prompt: job.prompt,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null,
    outputAsset: job.outputAsset
      ? {
          id: job.outputAsset.id,
          title: job.outputAsset.title,
          url: job.outputAsset.url,
          thumbnail: job.outputAsset.thumbnail ?? job.outputAsset.url,
          createdAt: job.outputAsset.createdAt.toISOString(),
        }
      : null,
  }));

  return NextResponse.json({ jobs: formatted });
}
