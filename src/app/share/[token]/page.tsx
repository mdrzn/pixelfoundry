import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AssetType, JobStatus, JobType } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { isShareTokenExpired, parseLibraryMetadata } from "@/lib/library";
import { prisma } from "@/lib/prisma";

function formatJobType(type: JobType) {
  switch (type) {
    case JobType.CREATE_IMAGE:
      return "Image generation";
    case JobType.EDIT_IMAGE:
      return "Image edit";
    case JobType.CREATE_VIDEO:
      return "Video generation";
    default:
      return type;
  }
}

function formatJobStatus(status: JobStatus) {
  switch (status) {
    case JobStatus.COMPLETED:
      return "Completed";
    case JobStatus.PROCESSING:
      return "Processing";
    case JobStatus.QUEUED:
      return "Queued";
    case JobStatus.FAILED:
      return "Failed";
    default:
      return status;
  }
}

export default async function SharedAssetPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const asset = await prisma.asset.findFirst({
    where: {
      metadata: {
        path: ["library", "shareToken"],
        equals: token,
      },
    },
    select: {
      id: true,
      title: true,
      url: true,
      thumbnail: true,
      type: true,
      metadata: true,
      createdAt: true,
      jobOutput: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          type: true,
          status: true,
          prompt: true,
          negativePrompt: true,
          createdAt: true,
          completedAt: true,
          user: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!asset || !asset.jobOutput.length) {
    notFound();
  }

  const { library } = parseLibraryMetadata(asset.metadata);
  if (isShareTokenExpired(library.shareCreatedAt)) {
    notFound();
  }

  const job = asset.jobOutput[0];

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-4 py-12">
      <div>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to PixelFoundry
        </Link>
      </div>
      <div className="grid gap-8 md:grid-cols-[3fr,2fr]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {asset.type === AssetType.IMAGE ? (
              <div className="relative aspect-square w-full bg-muted">
                <Image
                  src={asset.url}
                  alt={asset.title ?? "Shared asset"}
                  fill
                  unoptimized
                  className="object-contain"
                />
              </div>
            ) : (
              <video
                controls
                poster={asset.thumbnail ?? undefined}
                className="aspect-video w-full bg-black"
                src={asset.url}
              />
            )}
          </CardContent>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{formatJobType(job.type)}</Badge>
                <Badge variant="outline">{formatJobStatus(job.status)}</Badge>
              </div>
              <CardTitle className="text-xl">
                {asset.title ?? job.prompt.slice(0, 80) ?? "Shared asset"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              {job.prompt ? (
                <div>
                  <span className="font-semibold text-foreground">Prompt:</span>{" "}
                  {job.prompt}
                </div>
              ) : null}
              {job.negativePrompt ? (
                <div>
                  <span className="font-semibold text-foreground">Negative prompt:</span>{" "}
                  {job.negativePrompt}
                </div>
              ) : null}
              <div>
                <span className="font-semibold text-foreground">Created:</span>{" "}
                {formatDistanceToNow(job.createdAt, { addSuffix: true })}
              </div>
              {job.completedAt ? (
                <div>
                  <span className="font-semibold text-foreground">Completed:</span>{" "}
                  {formatDistanceToNow(job.completedAt, { addSuffix: true })}
                </div>
              ) : null}
              <div>
                <span className="font-semibold text-foreground">Shared by:</span>{" "}
                {job.user?.name ?? "PixelFoundry creator"}
              </div>
            </CardContent>
          </Card>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href={asset.url} download>
                Download
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="https://pixelfoundry.app">Try PixelFoundry</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
