import { NextRequest, NextResponse } from "next/server";
import { JobStatus, JobType, Prisma } from "@prisma/client";

import { mapJobToLibraryAsset } from "@/lib/library";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const MAX_LIMIT = 200;

function parseLimit(value: string | null) {
  if (!value) return 50;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return 50;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function parseJobTypeFilter(value: string | null) {
  if (!value) return undefined;
  switch (value.toLowerCase()) {
    case "image":
      return [JobType.CREATE_IMAGE];
    case "edit":
      return [JobType.EDIT_IMAGE];
    case "video":
      return [JobType.CREATE_VIDEO];
    default:
      return undefined;
  }
}

function parseJobStatusFilter(value: string | null) {
  if (!value) return undefined;
  const upper = value.toUpperCase();
  if (upper in JobStatus) {
    return upper as JobStatus;
  }
  if (upper === "FAILED") return JobStatus.FAILED;
  return undefined;
}

function buildWhere(
  userId: string,
  params: URLSearchParams,
): Prisma.JobWhereInput {
  const where: Prisma.JobWhereInput = {
    userId,
  };

  const typeFilter = parseJobTypeFilter(params.get("type"));
  if (typeFilter) {
    where.type = { in: typeFilter };
  }

  const statusFilter = parseJobStatusFilter(params.get("status"));
  if (statusFilter) {
    where.status = statusFilter;
  }

  const searchTerm = params.get("search");
  if (searchTerm && searchTerm.trim().length > 0) {
    where.OR = [
      { prompt: { contains: searchTerm, mode: "insensitive" } },
      { title: { contains: searchTerm, mode: "insensitive" } },
      { id: searchTerm },
    ];
  }

  return where;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const limit = parseLimit(params.get("limit"));
  const where = buildWhere(session.user.id, params);

  const jobs = await prisma.job.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      outputAsset: true,
    },
    take: limit,
  });

  const assets = jobs.map(mapJobToLibraryAsset);

  return NextResponse.json({
    data: assets,
    count: assets.length,
  });
}
